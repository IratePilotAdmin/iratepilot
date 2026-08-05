import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatBookingHistoryTimestamp,
  getBookingStatusLabel,
  sortBookingStatusHistory,
} from "../lib/bookings/status-history";

const trips = readFileSync(new URL("../components/bookings/customer-trips.tsx", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../components/bookings/trip-status-timeline.tsx", import.meta.url), "utf8");
const bookingsRoute = readFileSync(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");

describe("customer trip history", () => {
  it("orders status transitions without mutating API data", () => {
    const entries = [
      { status: "confirmed", created_at: "2026-08-02T12:00:00Z" },
      { status: "pending", created_at: "2026-08-01T12:00:00Z" },
    ];
    const result = sortBookingStatusHistory(entries);

    expect(result.map((entry) => entry.status)).toEqual(["pending", "confirmed"]);
    expect(entries.map((entry) => entry.status)).toEqual(["confirmed", "pending"]);
  });

  it("uses deterministic customer-facing labels and UTC timestamps", () => {
    expect(getBookingStatusLabel("pending")).toBe("Booking requested");
    expect(getBookingStatusLabel("refunded")).toBe("Payment refunded");
    expect(formatBookingHistoryTimestamp("2026-08-02T23:49:00Z")).toBe("Aug 2, 2026, 11:49 PM UTC");
  });

  it("renders owned history and cancellation details without payment identifiers", () => {
    expect(bookingsRoute).toContain("booking_status_history(status,note,created_at)");
    expect(trips).toContain("<TripStatusTimeline");
    expect(trips).toContain("Refund recorded:");
    expect(timeline).toContain("Status history (");
    expect(trips).not.toContain("stripe_refund_id");
  });
});
