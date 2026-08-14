import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

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

function batchSize() {
  const parsed = Number.parseInt(process.env.EMAIL_WORKER_BATCH_SIZE || "10", 10);
  return Number.isFinite(parsed) ? Math.min(25, Math.max(1, parsed)) : 10;
}

async function processTransactionalEmail(request: Request) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: "Email worker authentication is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !from) {
    return NextResponse.json({ success: false, error: "Email environment variables are missing." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resend = new Resend(resendApiKey);
  const summary = { processed: 0, sent: 0, suppressed: 0, failed: 0, deadLettered: 0 };

  for (let index = 0; index < batchSize(); index += 1) {
    const { data, error: claimError } = await supabase.rpc("claim_transactional_email_job");
    if (claimError) {
      await reportOperationalError("email_worker_claim_failed", claimError, { processed: summary.processed });
      return NextResponse.json({ success: false, error: "Email queue claim failed.", summary }, { status: 500 });
    }
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) break;
    summary.processed += 1;

    try {
      const normalizedRecipient = String(job.recipient_email).trim().toLowerCase();
      const suppression = await supabase.from("email_suppressions")
        .select("reason")
        .eq("recipient_email", normalizedRecipient)
        .maybeSingle();
      if (suppression.error) throw suppression.error;
      if (suppression.data) {
        const skipped = await supabase.from("email_outbox").update({
          status: "suppressed",
          delivery_status: "suppressed",
          delivery_detail: `Recipient suppressed: ${suppression.data.reason}`,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        if (skipped.error) throw skipped.error;
        summary.suppressed += 1;
        continue;
      }

      const templateData = job.template_data ?? {};
      const recipientName = job.recipient_name || templateData.recipient_name || "Traveler";
      const message = templateData.message || "You have a new update from iRatePilot.";
      const actionUrl = templateData.action_url || "https://www.iratepilot.com/account/trips";
      const { data: email, error: resendError } = await resend.emails.send({
        from,
        to: [job.recipient_email],
        subject: job.subject,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;color:#101828">
            <h1 style="font-family:Georgia,serif">iRatePilot</h1>
            <p>Hello ${escapeHtml(recipientName)},</p>
            <p>${escapeHtml(message)}</p>
            <p style="margin-top:28px"><a href="${escapeHtml(actionUrl)}" style="background:#000;color:#fff;padding:12px 20px;text-decoration:none">View details</a></p>
            <p style="margin-top:32px;color:#667085;font-size:13px">iRatePilot Group, LLC</p>
          </div>
        `,
      }, {
        headers: { "Idempotency-Key": `email-outbox-${job.id}` },
      });
      if (resendError) throw new Error(resendError.message);

      const sent = await supabase.from("email_outbox").update({
        status: "sent",
        delivery_status: "sent",
        resend_email_id: email?.id ?? null,
        last_error: null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (sent.error) throw sent.error;
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email processing failed.";
      const attempts = Number(job.attempts || 1);
      const deadLettered = attempts >= 5;
      const retryDelayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
      const failed = await supabase.from("email_outbox").update({
        status: deadLettered ? "dead_letter" : "failed",
        last_error: message.slice(0, 500),
        scheduled_at: new Date(Date.now() + retryDelayMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("status", "processing");
      if (failed.error) await reportOperationalError("email_worker_failure_persistence_failed", failed.error, { jobId: job.id });
      summary.failed += 1;
      if (deadLettered) summary.deadLettered += 1;
      await reportOperationalError("email_worker_job_failed", error, { jobId: job.id, attempts, deadLettered });
    }
  }

  logOperationalEvent(summary.failed ? "warning" : "info", "email_worker_batch_completed", {
    ...summary,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ success: true, summary });
}

export async function GET(request: Request) {
  return processTransactionalEmail(request);
}

export async function POST(request: Request) {
  return processTransactionalEmail(request);
}
