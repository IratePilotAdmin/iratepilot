import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerTeamAccessActionSchema } from "../lib/validation";

const migration = readFileSync("supabase/migrations/202608130048_partner_team_access_lifecycle.sql", "utf8");
const route = readFileSync("app/api/partner/team/access/route.ts", "utf8");
const component = readFileSync("components/dashboard/partner-team-invitations.tsx", "utf8");

describe("partner-team access lifecycle", () => {
  it("validates only invitation revocation and member deactivation", () => {
    expect(partnerTeamAccessActionSchema.safeParse({
      action: "revoke_invitation",
      invitationId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(true);
    expect(partnerTeamAccessActionSchema.safeParse({
      action: "disable_member",
      memberId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(true);
    expect(partnerTeamAccessActionSchema.safeParse({
      action: "enable_live_traffic",
      memberId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(false);
  });

  it("requires the approved owner in both API and database functions", () => {
    expect(route).toContain('requireRole(["partner"])');
    expect(route).toContain('.eq("owner_id", auth.user.id)');
    expect(route).toContain("Only the approved partner owner can revoke team access.");
    expect(migration.match(/partners\.owner_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("partners.status = 'approved'");
  });

  it("locks records, retains them, and disables access immediately", () => {
    expect(migration).toContain("for update of partner_team_invitations");
    expect(migration).toContain("for update of partner_team_members");
    expect(migration).toContain("set status = 'revoked'");
    expect(migration).toContain("set status = 'disabled'");
    expect(migration).toContain("can_manage_integrations = false");
    expect(migration).not.toMatch(/delete from public\.partner_team_(invitations|members)/);
  });

  it("writes immutable audit events without authenticated mutation rights", () => {
    expect(migration).toContain("partner_team_access_events");
    expect(migration).toContain("'invitation_revoked'");
    expect(migration).toContain("'member_disabled'");
    expect(migration).toContain("revoke all on table public.partner_team_access_events from anon, authenticated");
    expect(migration).toContain("grant select on table public.partner_team_access_events to authenticated");
    expect(migration).not.toContain("grant insert");
  });

  it("shows owner controls and preserves history", () => {
    expect(component).toContain("/api/partner/team/access");
    expect(component).toContain("Revoke");
    expect(component).toContain("Disable access");
    expect(component).toContain("No invitation or membership record is deleted.");
    expect(route).toContain("list_own_partner_team_members");
  });
});
