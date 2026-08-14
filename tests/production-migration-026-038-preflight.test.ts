import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preflight = readFileSync(
  new URL("../supabase/production_migration_026_038_preflight.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("production migration 026 through 038 preflight", () => {
  it("contains an explicit marker for every migration", () => {
    for (let migration = 26; migration <= 38; migration += 1) {
      expect(preflight).toContain(`'0${migration}'`);
    }
  });

  it("checks the schema and function boundary without writing", () => {
    expect(preflight).toContain("complete_approved_booking_test_payment");
    expect(preflight).toContain("stripe_payment_mode");
    expect(preflight).toContain("finalize_booking_refund");
    expect(preflight).toContain("then ''cancelled''");
    expect(preflight).toContain("property_pms_connections");
    expect(preflight).toContain("priority_pms_launch_evidence_provider_id_check");
    for (const statement of [
      "insert ", "update ", "delete ", "alter ", "drop ", "create ",
      "truncate ", "grant ", "revoke ",
    ]) {
      expect(preflight).not.toContain(statement);
    }
  });
});
