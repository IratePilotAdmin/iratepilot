import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/202608100037_pilot_hotel_pms_mapping.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../supabase/rollbacks/202608100037_pilot_hotel_pms_mapping.rollback.sql", import.meta.url), "utf8");

describe("pilot-hotel PMS mapping migration", () => {
  it("adds bounded, non-secret authorization and mapping fields", () => {
    for (const field of ["hotel_authorized", "room_type_mapping", "rate_plan_mapping", "tax_fee_mapping", "cancellation_policy_mapping"]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("property_pms_connections_mapping_length");
    expect(migration).toContain("<= 4000");
  });

  it("refuses to remove populated pilot onboarding data", () => {
    expect(rollback).toContain("Refusing rollback: pilot-hotel PMS authorization or mapping data exists");
    expect(rollback).toContain("drop column if exists hotel_authorized");
  });
});

