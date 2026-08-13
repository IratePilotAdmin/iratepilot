import { queueTransactionalEmail, wakeTransactionalEmailWorker } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

export async function queuePartnerTeamInvitation(input: {
  invitationId: string;
  recipientEmail: string;
  partnerName: string;
  memberRole: string;
}) {
  const admin = createAdminClient();
  const dedupeKey = `partner-team-invitation:${input.invitationId}`;
  const existing = await admin.from("email_outbox")
    .select("id")
    .contains("template_data", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com").replace(/\/$/, "");
  const role = input.memberRole.replaceAll("_", " ");
  const job = await queueTransactionalEmail({
    recipientEmail: input.recipientEmail,
    subject: `Join ${input.partnerName} on iRatePilot`,
    templateName: "partner_team_invitation",
    templateData: {
      dedupe_key: dedupeKey,
      recipient_name: "Hotel team member",
      message: `${input.partnerName} invited you to join iRatePilot as ${role} with integration-only access.`,
      action_url: `${baseUrl}/team-invite?invitation=${encodeURIComponent(input.invitationId)}`,
    },
  });
  await wakeTransactionalEmailWorker();
  return job;
}
