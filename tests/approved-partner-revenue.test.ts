import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "../app/api/revenue/route.ts",
  "../app/api/revenue/recommendation/route.ts",
  "../app/api/revenue/recommendations/[id]/route.ts",
  "../app/api/revenue/upload/route.ts",
  "../app/api/revenue/reports/route.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const migration = readFileSync(
  new URL("../supabase/migrations/202608020016_enforce_approved_partner_revenue.sql", import.meta.url),
  "utf8",
);

describe("approved partner revenue access", () => {
  it("checks approved partner status across every revenue API surface", () => {
    for (const route of routeFiles) {
      expect(route).toContain("status");
      expect(route).toContain("approved");
    }
  });

  it("limits direct revenue data access to approved property owners", () => {
    expect(migration).toContain('create policy "Partners can manage own revenue inputs"');
    expect(migration).toContain('create policy "Partners can manage own revenue recommendations"');
    expect(migration).toContain('create policy "Partners can view own revenue audit"');
    expect(migration).toContain('create policy "Partners can create own revenue audit"');
    expect(migration).toContain('create policy "Partners can manage own revenue reports"');
    expect(migration.match(/partners\.status = 'approved'/g)).toHaveLength(8);
  });

  it("enforces approved ownership before a recommendation can change inventory", () => {
    expect(migration).toContain("create or replace function public.review_revenue_recommendation");
    expect(migration).toContain("pa.status = 'approved'");
    expect(migration.indexOf("pa.status = 'approved'"))
      .toBeLessThan(migration.indexOf("update public.inventory"));
  });
});
