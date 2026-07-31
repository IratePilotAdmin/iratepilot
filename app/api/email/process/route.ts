import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return NextResponse.json(
      { success: false, error: "Email environment variables are missing." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const resend = new Resend(resendApiKey);

  const { data, error: claimError } = await supabase.rpc(
    "claim_transactional_email_job",
  );

  if (claimError) {
    return NextResponse.json(
      { success: false, error: claimError.message },
      { status: 500 },
    );
  }

  const job = Array.isArray(data) ? data[0] : data;

  if (!job) {
    return NextResponse.json({
      success: true,
      processed: false,
      message: "No pending email jobs.",
    });
  }

  try {
    const templateData = job.template_data ?? {};
    const recipientName =
      job.recipient_name || templateData.recipient_name || "Traveler";
    const message =
      templateData.message || "You have a new update from iRatePilot.";
    const actionUrl =
      templateData.action_url || "https://www.iratepilot.com/account/trips";

    const { data: email, error: resendError } = await resend.emails.send({
      from: "iRatePilot <team@mail.iratepilot.com>",
      to: [job.recipient_email],
      subject: job.subject,
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
    });

    if (resendError) {
      throw new Error(resendError.message);
    }

    const { error: updateError } = await supabase
      .from("transactional_email_jobs")
      .update({
        status: "sent",
        provider_message_id: email?.id ?? null,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      processed: true,
      jobId: job.id,
      messageId: email?.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email processing failed.";

    await supabase
      .from("transactional_email_jobs")
      .update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json(
      { success: false, jobId: job.id, error: message },
      { status: 500 },
    );
  }
}