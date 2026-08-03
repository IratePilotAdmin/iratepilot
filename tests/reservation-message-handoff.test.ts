import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reservations = readFileSync(new URL("../components/bookings/partner-reservations.tsx", import.meta.url), "utf8");
const messageCenter = readFileSync(new URL("../components/bookings/booking-message-center.tsx", import.meta.url), "utf8");
const partnerPage = readFileSync(new URL("../app/partner/messages/page.tsx", import.meta.url), "utf8");
const inboxRoute = readFileSync(new URL("../app/api/partner/messages/route.ts", import.meta.url), "utf8");

describe("reservation to guest-message handoff", () => {
  it("links each reservation to its booking-scoped conversation", () => {
    expect(reservations).toContain('href={`/partner/messages?booking=${encodeURIComponent(item.id)}`}');
    expect(reservations).toContain("Message traveler");
  });

  it("passes the requested booking into the shared message center", () => {
    expect(partnerPage).toContain('searchParams: Promise<{ booking?: string }>');
    expect(partnerPage).toContain('initialBookingId={booking}');
    expect(messageCenter).toContain('initialBookingId = ""');
  });

  it("selects a requested thread only from the authorized inbox response", () => {
    expect(messageCenter).toContain("body.data?.find((booking: InboxBooking) => booking.id === initialBookingId)?.id");
    expect(messageCenter).toContain("authorizedSelection || body.data?.[0]?.id");
    expect(inboxRoute).toContain('.eq("partner_id", partner.id)');
    expect(inboxRoute).toContain('partner.status !== "approved"');
  });
});
