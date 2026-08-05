import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trips = readFileSync(new URL("../components/bookings/customer-trips.tsx", import.meta.url), "utf8");
const confirmation = readFileSync(new URL("../app/booking-confirmation/page.tsx", import.meta.url), "utf8");
const support = readFileSync(new URL("../app/account/support/page.tsx", import.meta.url), "utf8");
const messageCenter = readFileSync(new URL("../components/bookings/booking-message-center.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../app/api/bookings/messages/route.ts", import.meta.url), "utf8");

describe("trip to property-message handoff", () => {
  it("links every customer trip to its booking-scoped conversation", () => {
    expect(trips).toContain('href={`/account/support?booking=${encodeURIComponent(trip.id)}`}');
    expect(trips).toContain("Message property");
  });

  it("links the customer-scoped confirmation record to the same conversation", () => {
    expect(confirmation).toContain('.select("id,confirmation_code');
    expect(confirmation).toContain('.eq("customer_id", user.id)');
    expect(confirmation).toContain('href={`/account/support?booking=${encodeURIComponent(booking.id)}`}');
  });

  it("preselects only a booking returned by the customer authorized inbox", () => {
    expect(support).toContain('initialBookingId={booking}');
    expect(messageCenter).toContain("authorizedSelection || ordered[0]?.id");
    expect(inbox).toContain('.eq("customer_id", auth.user.id)');
  });
});
