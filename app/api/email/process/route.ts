import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  getSafeEmailActionUrl,
  isAuthorizedCronRequest,
} from "@/lib/email/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EMAILS_PER_RUN = 25;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function processEmail(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "Email processor is not configured." },
      { status: 503 },
    );
  }

  if (!isAuthorizedCronRequest(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return NextResponse.json(
      { success: false, error: "Email processor is not configured." },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const resend = new Resend(resendApiKey);

  let sent = 0;
  let failed = 0;

  for (let index = 0; index < MAX_EMAILS_PER_RUN; index += 1) {
    const { data, error: claimError } = await supabase.rpc(
      "claim_email_outbox_job",
    );

    if (claimError) {
      console.error("Unable to claim an email outbox job", claimError);
      return NextResponse.json(
        {
          success: false,
          sent,
          failed,
          error: "Unable to claim an email job.",
        },
        { status: 500 },
      );
    }

    const job = Array.isArray(data) ? data[0] : data;
    if (!job) break;

    try {
      const templateData = job.template_data ?? {};
      const recipientName = templateData.recipient_name || "Traveler";
      const message =
        templateData.message || "You have a new update from iRatePilot.";
      const actionUrl = getSafeEmailActionUrl(templateData.action_url);

      const { data: email, error: resendError } = await resend.emails.send(
        {
          from: fromEmail,
          to: [job.recipient_email],
          subject: job.subject,
          ...(process.env.EMAIL_REPLY_TO
            ? { replyTo: process.env.EMAIL_REPLY_TO }
            : {}),
          html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;color:#101828">
            <h1 style="font-family:Georgia,serif">iRatePilot</h1>
            <p>Hello ${escapeHtml(recipientName)},</p>
            <p>${escapeHtml(message)}</p>
            <p style="margin-top:28px">
              <a href="${escapeHtml(actionUrl)}"
                 style="background:#000;color:#fff;padding:12px 20px;text-decoration:none">
                View details
              </a>
            </p>
            <p style="margin-top:32px;color:#667085;font-size:13px">
              iRatePilot Group, LLC
            </p>
          </div>
        `,
        },
        { idempotencyKey: `email-outbox/${job.id}` },
      );

      if (resendError) throw new Error(resendError.message);

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("email_outbox")
        .update({
          status: "sent",
          resend_email_id: email?.id ?? null,
          last_error: null,
          processed_at: now,
          updated_at: now,
        })
        .eq("id", job.id);

      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email processing failed.";
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      console.error("Email outbox job failed", { jobId: job.id, error: message });
      await supabase
        .from("email_outbox")
        .update({
          status: "failed",
          last_error: message,
          scheduled_at: retryAt,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
    }
  }

  return NextResponse.json(
    {
      success: failed === 0,
      processed: sent + failed,
      sent,
      failed,
      message:
        sent + failed === 0 ? "No pending email jobs." : "Email run complete.",
    },
    { status: failed === 0 ? 200 : 500 },
  );
}

export async function GET(request: Request) {
  return processEmail(request);
}

export async function POST(request: Request) {
  return processEmail(request);
}
