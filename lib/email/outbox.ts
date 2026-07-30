import { createAdminClient } from "@/lib/supabase/admin";

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