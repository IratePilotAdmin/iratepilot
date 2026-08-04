import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPartnerAnalytics, type PartnerAnalyticsBooking } from "../lib/partner/analytics";

const route = readFileSync(new URL("../app/api/partner/analytics/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/partner/analytics/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

describe("partner portfolio analytics", () => {
  it("scopes analytics to an approved partner and discloses query limits", () => {
    expect(route).toContain('requireRole(["partner", "admin"])');
    expect(route).toContain('partner.status !== "approved"');
    expect(route.indexOf('partner.status !== "approved"')).toBeLessThan(route.indexOf("Promise.all(["));
    expect(route).toContain('.eq("properties.partner_id", partner.id)');
    expect(route).toContain('.eq("partner_id", partner.id)');
    expect(route).toContain("dataTruncated");
    expect(route).toContain("ROW_LIMIT");
  });

  it("aggregates demand, status, finance, and property rankings deterministically", () => {
    const bookings: PartnerAnalyticsBooking[] = [
      { id: "b1", property_id: "p1", status: "confirmed", total: 500, created_at: "2026-08-01T00:00:00Z" },
      { id: "b2", property_id: "p1", status: "pending", total: 400, created_at: "2026-08-02T00:00:00Z" },
      { id: "b3", property_id: "p2", status: "cancelled", total: 300, created_at: "2026-07-01T00:00:00Z" },
    ];
    const analytics = buildPartnerAnalytics(
      [{ id: "p1", name: "Pilot Hotel", active: true }, { id: "p2", name: "Lake Inn", active: false }],
      bookings,
      [{ booking_id: "b1", partner_net: 450, status: "eligible" }, { booking_id: "b3", partner_net: 270, status: "void" }],
      new Date("2026-08-15T00:00:00Z"),
    );
    expect(analytics.monthlyPerformance).toHaveLength(12);
    expect(analytics.monthlyPerformance.at(-1)).toMatchObject({ key: "2026-08", requests: 2, confirmed: 1, partnerNet: 450 });
    expect(analytics.summary).toMatchObject({ properties: 2, requests: 3, confirmed: 1, partnerNet: 450 });
    expect(analytics.statusMix.find((item) => item.status === "cancelled")?.count).toBe(1);
    expect(analytics.propertyPerformance[0]).toMatchObject({ id: "p1", requests: 2, confirmed: 1, bookedValue: 500, partnerNet: 450 });
  });

  it("replaces the placeholder and exposes analytics in partner navigation", () => {
    expect(page).toContain("<PartnerAnalytics />");
    expect(page).not.toContain("ready for database and supplier integration");
    expect(navigation).toContain('{ href: "/partner/analytics", label: "Analytics" }');
  });
});
