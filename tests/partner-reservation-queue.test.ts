import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPartnerReservationQueue } from "../lib/partner/reservation-queue";

const route = readFileSync(new URL("../app/api/partner/reservations/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/bookings/partner-reservations.tsx", import.meta.url), "utf8");

const reservation = (id: string, status: string, checkIn: string, createdAt: string) => ({
  id, status, check_in: checkIn, created_at: createdAt,
});

describe("partner reservation queue", () => {
  it("prioritizes pending requests by nearest check-in before other records", () => {
    const queue = buildPartnerReservationQueue([
      reservation("confirmed", "confirmed", "2026-08-04", "2026-08-03T12:00:00Z"),
      reservation("pending-later", "pending", "2026-08-20", "2026-08-03T14:00:00Z"),
      reservation("cancelled", "cancelled", "2026-08-01", "2026-08-03T15:00:00Z"),
      reservation("pending-next", "pending", "2026-08-05", "2026-08-02T12:00:00Z"),
    ]);
    expect(queue.ordered.map((item) => item.id)).toEqual(["pending-next", "pending-later", "confirmed", "cancelled"]);
    expect(queue.summary).toEqual({ total: 4, pending: 2, confirmed: 1, closed: 1 });
  });

  it("keeps closed records ordered newest first", () => {
    const queue = buildPartnerReservationQueue([
      reservation("older", "rejected", "2026-08-01", "2026-08-01T12:00:00Z"),
      reservation("newer", "cancelled", "2026-08-01", "2026-08-03T12:00:00Z"),
    ]);
    expect(queue.ordered.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("bounds the API response and exposes queue summaries and filters", () => {
    expect(route).toContain('.limit(500)');
    expect(route).toContain('limited: (data || []).length === 500');
    expect(page).toContain("Pending requests are prioritized by nearest check-in.");
    expect(page).toContain('value="closed"');
    expect(page).toContain("queue.summary.pending");
    expect(page).toContain("visibleItems.map");
  });
});
