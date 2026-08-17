import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608170063_traveler_membership_value.sql", import.meta.url),
  "utf8",
);

describe("traveler membership value migration", () => {
  it("removes the traveler fee and applies active-tier discounts to paid bookings", () => {
    expect(migration).toContain("v_service_fee := 0");
    expect(migration).toContain("when v_tier = 'basic' then 0.05");
    expect(migration).toContain("when v_tier = 'business' then 0.10");
    expect(migration).toContain("v_subtotal := round(v_inventory_subtotal * (1 - v_discount_rate), 2)");
  });

  it("awards double Basic points and triple Business points in both confirmation paths", () => {
    expect(migration.match(/when v_tier = 'basic' then floor\(v_(?:booking\.)?subtotal\)::integer \* 2/g)).toHaveLength(2);
    expect(migration.match(/when v_tier = 'business' then floor\(v_(?:booking\.)?subtotal\)::integer \* 3/g)).toHaveLength(2);
  });

  it("preserves the secured function grants", () => {
    expect(migration).toContain("grant execute on function public.review_booking(uuid, text, text) to authenticated");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("keeps the configured 14% partner commission unchanged", () => {
    expect(migration.match(/round\(v_(?:booking\.)?subtotal \* 0\.14, 2\)/g)).toHaveLength(2);
  });
});
