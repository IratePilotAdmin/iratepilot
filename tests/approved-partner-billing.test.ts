import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "../app/api/partner/finance/route.ts",
  "../app/api/partner/subscription/route.ts",
  "../app/api/partner/subscription/checkout/route.ts",
  "../app/api/partner/connect/route.ts",
  "../app/api/partner/connect/onboarding/route.ts",
  "../app/api/partner/connect/dashboard/route.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const migration = readFileSync(
  new URL("../supabase/migrations/202608020017_enforce_approved_partner_billing.sql", import.meta.url),
  "utf8",
);

describe("approved partner billing access", () => {
  it("checks approved status across finance, subscription, and Connect routes", () => {
    for (const route of routeFiles) {
      expect(route).toContain("status");
      expect(route).toContain('!== "approved"');
    }
  });

  it("limits direct financial and payout reads to approved partners", () => {
    expect(migration).toContain('create policy "Partners can view own booking financials"');
    expect(migration).toContain('create policy "Partners can view own payouts"');
    expect(migration.match(/partners\.status = 'approved'/g)).toHaveLength(2);
  });
});
