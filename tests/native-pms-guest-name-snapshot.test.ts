import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(path.join(process.cwd(), "supabase/migrations/20260923120000_iratepilot_pms_guest_name_snapshot.sql"), "utf8");

describe("native PMS guest-name snapshot", () => {
  it("shares only a bounded display name with the property PMS connector", () => {
    expect(migration).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public");
    expect(migration).toContain("length(btrim(p.full_name)) BETWEEN 1 AND 200");
    expect(migration).toContain("WHERE p.id=b.customer_id");
    expect(migration).not.toMatch(/p\.(?:phone|email|stripe_customer_id|membership_tier|reward_points)/i);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.irp_pms_booking_payload(public.bookings) FROM PUBLIC,anon,authenticated");
  });
});
