import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020002_active_membership_benefits.sql", import.meta.url),
  "utf8",
);

describe("active membership benefits migration", () => {
  it("requires active status for both booking completion paths", () => {
    const eligibilityChecks = migration.match(/membership_status = 'active'/g) || [];
    expect(eligibilityChecks).toHaveLength(2);
    expect(migration).toContain("create or replace function public.review_booking");
    expect(migration).toContain("create or replace function public.complete_paid_test_booking");
  });
});
