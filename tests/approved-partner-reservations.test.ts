import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listRoute = readFileSync(
  new URL("../app/api/partner/reservations/route.ts", import.meta.url),
  "utf8",
);
const reviewRoute = readFileSync(
  new URL("../app/api/partner/reservations/[id]/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020015_enforce_approved_partner_reservations.sql", import.meta.url),
  "utf8",
);

describe("approved partner reservation access", () => {
  it("checks approved status before listing or reviewing reservations", () => {
    expect(listRoute).toContain('.select("id,status")');
    expect(listRoute).toContain('partner.status !== "approved"');
    expect(reviewRoute).toContain('.select("id,status")');
    expect(reviewRoute).toContain('partner.status !== "approved"');
    expect(reviewRoute.indexOf('partner.status !== "approved"'))
      .toBeLessThan(reviewRoute.indexOf('auth.supabase.rpc("review_booking"'));
  });

  it("limits direct reservation reads to approved property owners", () => {
    expect(migration).toContain('create policy "Partners can view own property bookings"');
    expect(migration).toContain('create policy "Partners can view own booking history"');
    expect(migration.match(/partners\.status = 'approved'/g)).toHaveLength(2);
  });

  it("enforces approved ownership inside the security-definer review function", () => {
    expect(migration).toContain("create or replace function public.review_booking");
    expect(migration).toContain("pa.status = 'approved'");
    expect(migration).toContain("grant execute on function public.review_booking");
  });
});
