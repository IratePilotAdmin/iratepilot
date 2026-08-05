import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020023_expire_stale_booking_requests.sql", import.meta.url),
  "utf8",
);
const reviewRoute = readFileSync(
  new URL("../app/api/partner/reservations/[id]/route.ts", import.meta.url),
  "utf8",
);

describe("stale booking request decisions", () => {
  it("expires late approvals before inventory can be locked or decremented", () => {
    const expiryCheck = migration.indexOf("v_booking.check_in <= current_date");
    const inventoryLock = migration.indexOf("perform 1 from public.inventory");

    expect(expiryCheck).toBeGreaterThan(-1);
    expect(expiryCheck).toBeLessThan(inventoryLock);
    expect(migration).toContain("Booking request expired before partner approval");
    expect(migration).toContain("return v_booking;");
  });

  it("notifies the traveler and reports expiration to the reviewer", () => {
    expect(migration).toContain("'Booking request expired'");
    expect(migration).toContain("No payment was collected");
    expect(reviewRoute).toContain('reviewed?.status === "confirmed"');
    expect(reviewRoute).toContain("Request expired because check-in has already begun. No inventory was held.");
  });
});
