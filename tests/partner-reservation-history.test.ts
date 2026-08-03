import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/partner/reservations/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/bookings/partner-reservations.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../supabase/migrations/202608020015_enforce_approved_partner_reservations.sql", import.meta.url), "utf8");

describe("partner reservation history", () => {
  it("loads status history and cancellation context with each owned reservation", () => {
    expect(route).toContain("cancellation_reason");
    expect(route).toContain("booking_status_history(status,note,created_at)");
    expect(route).toContain('.in("property_id", ids)');
  });

  it("renders shared human-readable history and cancellation context", () => {
    expect(page).toContain("<TripStatusTimeline entries={item.booking_status_history || []} />");
    expect(page).toContain("getBookingStatusLabel(item.status)");
    expect(page).toContain("Cancellation context");
    expect(page).toContain("item.cancellation_reason");
  });

  it("relies on the existing approved-owner history policy", () => {
    const historyPolicy = policy.slice(
      policy.indexOf('create policy "Partners can view own booking history"'),
      policy.indexOf("create or replace function public.review_booking"),
    );
    expect(historyPolicy).toContain("partners.id = properties.partner_id");
    expect(historyPolicy).toContain("partners.owner_id = auth.uid()");
    expect(historyPolicy).toContain("partners.status = 'approved'");
  });
});
