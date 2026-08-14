import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preflight = readFileSync(
  new URL("../supabase/production_preflight.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("production database preflight", () => {
  it("checks the final pilot migration objects", () => {
    expect(preflight).toContain("public.booking_messages");
    expect(preflight).toContain("public.send_booking_message(uuid,text)");
    expect(preflight).toContain("public.cancel_unpaid_confirmed_booking(uuid,text)");
  });

  it("inventories every SynXis migration boundary from 039 through 048", () => {
    for (const object of [
      "public.integration_rate_limit_slots",
      "public.reserve_synxis_rate_limit_slot(text,integer)",
      "public.synxis_crs_launch_evidence",
      "public.synxis_crs_evidence_audit",
      "public.synxis_request_journal",
      "public.synxis_certification_export_receipts",
      "receipt_binding_required",
      "public.property_synxis_onboarding_requests",
      "public.partner_team_members",
      "public.resolve_partner_integration_access()",
      "public.partner_team_invitations",
      "public.accept_partner_team_invitation(uuid)",
      "public.partner_team_access_events",
      "public.revoke_own_partner_team_invitation(uuid)",
      "public.disable_own_partner_team_member(uuid)",
    ]) {
      expect(preflight).toContain(object);
    }
  });

  it("remains read-only", () => {
    for (const statement of [
      "insert ", "update ", "delete ", "alter ", "drop ", "create ",
      "truncate ", "grant ", "revoke ",
    ]) {
      expect(preflight).not.toContain(statement);
    }
  });
});
