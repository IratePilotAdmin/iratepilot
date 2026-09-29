import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTransactionalEmailWorkerOrigin } from "@/lib/email/worker-origin";

type QueueEmailInput = {
  recipientEmail: string;
  subject: string;
  templateName: string;
  templateData?: Record<string, unknown>;
};

export async function queueTransactionalEmail(input: QueueEmailInput) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("email_outbox")
    .insert({
      recipient_email: input.recipientEmail,
      subject: input.subject,
      template_name: input.templateName,
      template_data: input.templateData ?? {},
      status: "pending",
      scheduled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to queue transactional email: ${error.message}`);
  }

  return data;
}

export async function wakeTransactionalEmailWorker(requestOrigin?: string) {
  const cronSecret = process.env.CRON_SECRET;
  const workerOrigin = resolveTransactionalEmailWorkerOrigin(process.env, requestOrigin);
  if (!cronSecret || !workerOrigin) return false;

  try {
    const response = await fetch(`${workerOrigin}/api/email/process`, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    console.error("Transactional email worker wake-up failed", error);
    return false;
  }
}
