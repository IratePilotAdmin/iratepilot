import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reconciliation = readFileSync(
  new URL("../supabase/production_reconcile_pre_039.sql", import.meta.url), "utf8",
).toLowerCase();
const preflight = readFileSync(
  new URL("../supabase/production_reconcile_pre_039_preflight.sql", import.meta.url), "utf8",
).toLowerCase();
const verification = readFileSync(
  new URL("../supabase/production_reconcile_pre_039_verify.sql", import.meta.url), "utf8",
).toLowerCase();

describe("production pre-039 reconciliation", () => {
  it("restores every contract identified by the catalog audit", () => {
    for (const contract of [
      "update_own_profile", "is_approved_marketplace_property", "is_approved_marketplace_room",
      "enforce_approved_partner_booking", "enforce_partner_before_property_activation",
      "one_open_booking_per_stay", "bookings_stripe_payment_intent_id_key",
      "one_pending_partner_application_per_email", "admins can view partner applications",
      "rooms_max_guests_bounds", "rooms_base_rate_bounds", "inventory_available_units_bounds",
      "inventory_rate_bounds", "partner_applications_status_check",
    ]) {
      expect(reconciliation).toContain(contract);
      expect(preflight).toContain(contract);
      expect(verification).toContain(contract);
    }
  });

  it("is atomic, bounded, and fails before mutating conflicting production data", () => {
    expect(reconciliation).toContain("begin;");
    expect(reconciliation).toContain("commit;");
    expect(reconciliation).toContain("set local lock_timeout = '5s'");
    expect(reconciliation).toContain("set local statement_timeout = '60s'");
    expect(reconciliation).toContain("resolve duplicate open bookings before reconciliation");
    expect(reconciliation).toContain("review active properties without an approved partner before reconciliation");
    expect(reconciliation).not.toContain("update public.properties\nset active = false");
  });

  it("keeps the preflight read-only and privacy-limited", () => {
    expect(preflight).toContain("ready_to_apply");
    expect(preflight).toContain("blocking_rows");
    for (const statement of ["insert", "update", "delete", "alter", "drop", "create", "truncate", "grant", "revoke"]) {
      expect(preflight).not.toMatch(new RegExp(`^\\s*${statement}\\b`, "m"));
      expect(verification).not.toMatch(new RegExp(`^\\s*${statement}\\b`, "m"));
    }
    expect(verification).toContain("ready_for_history_repair");
    expect(verification).toContain("legacy_admin_manage_policy_removed");
    expect(verification).toContain("profile_update_policy_removed");
  });
});
