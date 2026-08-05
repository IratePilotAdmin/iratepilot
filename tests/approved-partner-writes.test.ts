import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const propertyRoute = readFileSync(
  new URL("../app/api/partner/properties/route.ts", import.meta.url),
  "utf8",
);
const propertyEditRoute = readFileSync(
  new URL("../app/api/partner/properties/[id]/route.ts", import.meta.url),
  "utf8",
);
const ratesRoute = readFileSync(
  new URL("../app/api/partner/rates/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020014_enforce_approved_partner_writes.sql", import.meta.url),
  "utf8",
);

describe("approved partner write access", () => {
  it("requires an approved partner record before hotel submission or editing", () => {
    expect(propertyRoute).toContain('.select("id,status")');
    expect(propertyRoute).toContain('partner.status !== "approved"');
    expect(propertyEditRoute).toContain('partner.status !== "approved"');
  });

  it("requires approved status for room and inventory management", () => {
    expect(ratesRoute).toContain('.select("id,status")');
    expect(ratesRoute.match(/partner\.status !== "approved"/g)).toHaveLength(2);
  });

  it("enforces approved status in direct database writes", () => {
    expect(migration).toContain('create policy "Partners can update own properties"');
    expect(migration).toContain('create policy "Partners can manage own rooms"');
    expect(migration).toContain('create policy "Partners can manage own inventory"');
    expect(migration.match(/partners\.status = 'approved'/g)).toHaveLength(6);
  });
});
