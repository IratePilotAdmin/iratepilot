import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPartnerOverview, type PartnerOverviewBooking, type PartnerOverviewFinancial } from "../lib/partner/overview";

const route = readFileSync(new URL("../app/api/partner/overview/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/partner/dashboard/page.tsx", import.meta.url), "utf8");

describe("live partner overview", () => {
  it("requires an approved partner before portfolio queries", () => {
    expect(route).toContain('requireRole(["partner", "admin"])');
    expect(route).toContain('partner.status !== "approved"');
    expect(route.indexOf('partner.status !== "approved"')).toBeLessThan(route.indexOf("Promise.all(["));
    expect(route).toContain('.eq("partner_id", partner.id)');
    expect(route).toContain("financialsTruncated");
    expect(route).toContain('{ count: "exact" }');
  });

  it("excludes void finance and builds a deterministic six-month trend", () => {
    const booking: PartnerOverviewBooking = { id: "booking-1", confirmation_code: "IRP-1", check_in: "2026-08-10", check_out: "2026-08-12", total: 500, status: "confirmed", created_at: "2026-08-01T00:00:00Z", properties: { name: "Pilot Hotel" }, profiles: { full_name: "Guest" } };
    const financials: PartnerOverviewFinancial[] = [
      { booking_id: booking.id, gross_room_revenue: 500, partner_net: 450, status: "eligible", created_at: "2026-08-01T00:00:00Z" },
      { booking_id: "void", gross_room_revenue: 200, partner_net: 180, status: "void", created_at: "2026-08-01T00:00:00Z" },
    ];
    const overview = buildPartnerOverview({ properties: 2, publishedProperties: 1, pendingBookings: 3, confirmedBookings: 4 }, [booking], financials, new Date("2026-08-15T00:00:00Z"));
    expect(overview.summary.partnerNet).toBe(450);
    expect(overview.summary.grossRoomRevenue).toBe(500);
    expect(overview.monthlyNet).toHaveLength(6);
    expect(overview.monthlyNet.at(-1)).toMatchObject({ key: "2026-08", value: 450 });
    expect(overview.recentBookings[0].partner_net).toBe(450);
  });

  it("removes hard-coded partner identity and demo dashboard data", () => {
    expect(page).toContain("<PartnerOverview />");
    expect(page).not.toContain("Hiren");
    expect(page).not.toContain("partnerStats");
    expect(page).not.toContain("RevenueChart");
    expect(page).not.toContain("RecentBookings");
  });
});
