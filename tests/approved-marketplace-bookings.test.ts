import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketplace = readFileSync(
  new URL("../lib/data/marketplace.ts", import.meta.url),
  "utf8",
);
const bookingRoute = readFileSync(
  new URL("../app/api/bookings/route.ts", import.meta.url),
  "utf8",
);
const checkoutRoute = readFileSync(
  new URL("../app/api/stripe/checkout/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020018_enforce_approved_marketplace_bookings.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);

describe("approved partner marketplace bookings", () => {
  it("filters discovery and both booking entry points by approved partner status", () => {
    expect(marketplace).toContain('partners!inner(status)');
    expect(marketplace.match(/\.eq\("partners\.status", "approved"\)/g)).toHaveLength(2);
    expect(bookingRoute).toContain('.eq("properties.partners.status", "approved")');
    expect(checkoutRoute).toContain('.eq("properties.partners.status", "approved")');
  });

  it("limits direct marketplace reads to active inventory from approved partners", () => {
    expect(migration).toContain('create policy "Public can view active properties"');
    expect(migration).toContain('create policy "Public can view active rooms"');
    expect(migration).toContain('create policy "Public can view inventory"');
    expect(migration).toContain("partners.status = 'approved'");
  });

  it("rejects service-role booking inserts that bypass row-level security", () => {
    expect(migration).toContain("function public.enforce_approved_partner_booking");
    expect(migration).toContain("before insert or update of property_id, room_id");
    expect(migration).toContain("Bookings require an active room from an approved partner");
  });

  it("keeps the bootstrap schema aligned with the migration", () => {
    expect(schema).toContain("function public.is_approved_marketplace_property");
    expect(schema).toContain("function public.is_approved_marketplace_room");
    expect(schema).toContain("trigger enforce_approved_partner_booking");
  });
});
