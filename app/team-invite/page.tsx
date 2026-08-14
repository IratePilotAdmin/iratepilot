import { PartnerTeamInvitationAcceptance } from "@/components/forms/partner-team-invitation-acceptance";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TeamInvitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const invitationId = typeof params.invitation === "string" ? params.invitation : null;
  return <main className="flex min-h-screen items-center justify-center p-6">
    <PartnerTeamInvitationAcceptance invitationId={invitationId} />
  </main>;
}
