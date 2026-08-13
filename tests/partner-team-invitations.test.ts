import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  partnerTeamInvitationAcceptanceSchema,
  partnerTeamInvitationSchema,
} from "../lib/validation";

const migration = readFileSync("supabase/migrations/202608130047_partner_team_invitations.sql", "utf8");
const ownerRoute = readFileSync("app/api/partner/team/invitations/route.ts", "utf8");
const acceptRoute = readFileSync("app/api/partner/team/invitations/accept/route.ts", "utf8");
const email = readFileSync("lib/email/partner-team-invitation.ts", "utf8");
const acceptance = readFileSync("components/forms/partner-team-invitation-acceptance.tsx", "utf8");

describe("partner-team manager invitations", () => {
  it("validates only scoped manager roles and normalized email", () => {
    for (const memberRole of ["general_manager", "revenue_manager", "sales_manager"]) {
      expect(partnerTeamInvitationSchema.safeParse({
        email: "Manager@Hotel.com",
        memberRole,
      })).toMatchObject({ success: true });
    }
    expect(partnerTeamInvitationSchema.safeParse({
      email: "manager@example.com",
      memberRole: "admin",
    }).success).toBe(false);
    expect(partnerTeamInvitationAcceptanceSchema.safeParse({
      invitationId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(true);
  });

  it("lets only the approved partner owner create invitations", () => {
    expect(ownerRoute).toContain('requireRole(["partner"])');
    expect(ownerRoute).toContain('.eq("owner_id", auth.user.id)');
    expect(ownerRoute).toContain('status === "approved"');
    expect(ownerRoute).toContain("Only the approved partner owner can invite");
    expect(migration).toContain('create policy "Partner owners create team invitations"');
    expect(migration).toContain("partners.owner_id = auth.uid()");
  });

  it("uses email-bound atomic acceptance without bearer tokens", () => {
    expect(migration).toContain("No bearer token or credential is stored");
    expect(migration).not.toMatch(/token_hash|token_digest|secret_token/);
    expect(migration).toContain("for update");
    expect(migration).toContain("auth.jwt() ->> 'email'");
    expect(migration).toContain("Invitation email does not match the signed-in account");
    expect(migration).toContain("expires_at <= now()");
    expect(migration).toContain("on conflict (partner_id, user_id) do update");
    expect(migration).toContain("status = 'accepted'");
    expect(acceptRoute).toContain("supabase.auth.getUser()");
    expect(acceptRoute).toContain("accept_partner_team_invitation");
    expect(migration).toContain("expire_own_partner_team_invitations()");
    expect(migration).toContain("get diagnostics v_count = row_count");
    expect(ownerRoute).toContain("expireInvitations(auth)");
  });

  it("queues a deduplicated durable email and never calls Resend directly", () => {
    expect(email).toContain("queueTransactionalEmail");
    expect(email).toContain("wakeTransactionalEmailWorker");
    expect(email).toContain("partner-team-invitation:");
    expect(email).toContain('.contains("template_data", { dedupe_key: dedupeKey })');
    expect(email).not.toContain("new Resend");
    expect(ownerRoute).toContain("queuePartnerTeamInvitation");
    expect(ownerRoute).toContain("saved but its email could not be queued");
  });

  it("preserves login and registration return paths for acceptance", () => {
    expect(acceptance).toContain("/api/auth/session");
    expect(acceptance).toContain("/login?next=");
    expect(acceptance).toContain("/register?next=");
    expect(acceptance).toContain("exact email address");
    expect(acceptance).toContain("Invitation links are not bearer credentials");
  });
});
