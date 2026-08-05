import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminMarketplaceOverview, type AdminOverviewBooking, type AdminOverviewFinancial } from "../lib/admin/marketplace-overview";

const route = readFileSync(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

describe("live admin marketplace overview", () => {
  it("authorizes admins before service-role marketplace queries", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    expect(route).toContain("Promise.all([");
    expect(route).toContain("financialsTruncated");
  });

  it("excludes void accounting and builds commission history", () => {
    const booking: AdminOverviewBooking = { id: "booking-1", confirmation_code: "IRP-1", check_in: "2026-08-10", check_out: "2026-08-12", total: 500, status: "confirmed", created_at: "2026-08-01T00:00:00Z", properties: { name: "Pilot Hotel" }, profiles: { full_name: "Guest" } };
    const financials: AdminOverviewFinancial[] = [
      { gross_room_revenue: 500, partner_commission: 50, partner_net: 450, status: "eligible", created_at: "2026-08-01T00:00:00Z" },
      { gross_room_revenue: 200, partner_commission: 20, partner_net: 180, status: "void", created_at: "2026-08-01T00:00:00Z" },
    ];
    const overview = buildAdminMarketplaceOverview({ publishedProperties: 2, pendingBookings: 3, confirmedBookings: 4, pendingPartners: 1, openSupport: 5 }, [booking], financials, new Date("2026-08-15T00:00:00Z"));
    expect(overview.summary.grossRoomRevenue).toBe(500);
    expect(overview.summary.commission).toBe(50);
    expect(overview.summary.partnerLiability).toBe(450);
    expect(overview.monthlyCommission.at(-1)).toMatchObject({ key: "2026-08", value: 50 });
  });

  it("removes the hard-coded admin dashboard data", () => {
    expect(page).toContain("<AdminOverview />");
    expect(page).not.toContain("adminStats");
    expect(page).not.toContain("StatCard");
    expect(page).not.toContain("RecentBookings");
  });
});
