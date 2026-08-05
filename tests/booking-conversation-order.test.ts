import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getConversationActivityAt, orderBookingConversations } from "../lib/bookings/conversation-inbox";

const center = readFileSync(new URL("../components/bookings/booking-message-center.tsx", import.meta.url), "utf8");

describe("booking conversation activity order", () => {
  it("surfaces a recent reply on an older booking", () => {
    const ordered = orderBookingConversations([
      { id: "new-booking", created_at: "2026-08-03T12:00:00Z", latestMessage: null },
      { id: "active-older-booking", created_at: "2026-07-01T12:00:00Z", latestMessage: { created_at: "2026-08-04T12:00:00Z" } },
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["active-older-booking", "new-booking"]);
  });

  it("uses booking creation as activity for conversations without messages", () => {
    const item = { id: "new", created_at: "2026-08-03T12:00:00Z", latestMessage: null };
    expect(getConversationActivityAt(item)).toBe(item.created_at);
    expect(orderBookingConversations([
      item,
      { id: "old", created_at: "2026-08-01T12:00:00Z", latestMessage: null },
    ]).map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("orders the shared inbox and labels its activity timestamps", () => {
    expect(center).toContain("orderBookingConversations<InboxBooking>");
    expect(center).toContain("getConversationActivityAt(booking)");
    expect(center).toContain('booking.latestMessage ? "Latest message" : "Booking created"');
  });
});
