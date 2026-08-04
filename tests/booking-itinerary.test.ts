import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBookingCalendarEvent } from "../lib/bookings/calendar";

const trips = readFileSync(new URL("../components/bookings/customer-trips.tsx", import.meta.url), "utf8");
const confirmation = readFileSync(new URL("../app/booking-confirmation/page.tsx", import.meta.url), "utf8");

describe("customer booking itineraries", () => {
  it("builds a standards-compatible all-day calendar event", () => {
    const calendar = buildBookingCalendarEvent({
      confirmationCode: "IRP-TEST-123",
      propertyName: "Harbor, Hotel",
      roomName: "King; Suite",
      city: "Miami Beach",
      country: "US",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      guests: 2,
    }, new Date("2026-08-02T12:34:56.000Z"));

    expect(calendar).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(calendar).toContain("DTSTART;VALUE=DATE:20260910");
    expect(calendar).toContain("DTEND;VALUE=DATE:20260913");
    expect(calendar).toContain("DTSTAMP:20260802T123456Z");
    expect(calendar).toContain("SUMMARY:iRatePilot stay at Harbor\\, Hotel");
    expect(calendar).toContain("Room: King\\; Suite");
    expect(calendar).toContain("URL:https://www.iratepilot.com/booking-confirmation?code=IRP-TEST-123");
    expect(calendar).toContain("END:VCALENDAR\r\n");
  });

  it("offers secure confirmation links and calendar downloads in Trips", () => {
    expect(trips).toContain("View confirmation");
    expect(trips).toContain("encodeURIComponent(trip.confirmation_code)");
    expect(trips).toMatch(/trip\.status\s*===\s*"confirmed"\s*&&\s*<TripCalendarButton/);
  });

  it("offers calendar export immediately after a confirmed booking", () => {
    expect(confirmation).toContain('booking.status === "confirmed" && <TripCalendarButton');
    expect(confirmation).toContain("propertyName: booking.properties?.name");
  });
});
