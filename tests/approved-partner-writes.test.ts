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
const delegatedMigration = readFileSync(
  new URL("../supabase/migrations/202608150054_partner_team_hotel_management.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020014_enforce_approved_partner_writes.sql", import.meta.url),
  "utf8",
);

describe("approved partner write access", () => {
  it("requires resolved approved hotel access before hotel submission or editing", () => {
    expect(propertyRoute).toContain("resolvePartnerHotelAccess(auth, requestedPartnerId)");
    expect(propertyEditRoute).toContain("resolvePartnerHotelAccess(auth, requestedPartnerId)");
    expect(propertyRoute).toContain("resolved.access.partnerId");
    expect(propertyEditRoute).toContain("resolved.access.partnerId");
  });

  it("scopes room and inventory management to the resolved partner", () => {
    expect(ratesRoute.match(/resolvePartnerHotelAccess\(auth, requestedPartnerId\)/g)).toHaveLength(2);
    expect(ratesRoute).toContain('.eq("partner_id", partnerId)');
    expect(ratesRoute).toContain('.eq("properties.partner_id", partnerId)');
  });

  it("enforces approved status in direct database writes", () => {
    expect(migration).toContain('create policy "Partners can update own properties"');
    expect(migration).toContain('create policy "Partners can manage own rooms"');
    expect(migration).toContain('create policy "Partners can manage own inventory"');
    expect(migration.match(/partners\.status = 'approved'/g)).toHaveLength(6);
    expect(delegatedMigration).toContain("public.can_manage_partner_hotels");
    expect(delegatedMigration).toContain("active = false");
    expect(delegatedMigration).toContain("inventory.stay_date >= current_date");
  });
});
