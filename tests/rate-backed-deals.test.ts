import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRateBackedDeals, type DealInventoryRow } from "../lib/deals";

const publicRoute = readFileSync(new URL("../app/api/deals/route.ts", import.meta.url), "utf8");
const partnerRoute = readFileSync(new URL("../app/api/partner/promotions/route.ts", import.meta.url), "utf8");
const dealsPage = readFileSync(new URL("../app/deals/page.tsx", import.meta.url), "utf8");
const promotionsPage = readFileSync(new URL("../app/partner/promotions/page.tsx", import.meta.url), "utf8");

const row = (rate: number, stayDate: string, availableUnits = 1): DealInventoryRow => ({
  stay_date: stayDate, available_units: availableUnits, rate,
  rooms: { id: "r1", name: "Deluxe", base_rate: 200, properties: { slug: "pilot", name: "Pilot Hotel", city: "Austin", country: "US", image_url: null, active: true, star_rating: 5 } },
});

describe("inventory-rate-backed marketplace deals", () => {
  it("only promotes sellable rates at least five percent below room base rate", () => {
    const deals = buildRateBackedDeals([row(190, "2026-09-01"), row(180, "2026-09-02"), row(150, "2026-09-03", 0), row(200, "2026-09-04")]);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ roomId: "r1", dealRate: 180, baseRate: 200, discountPercent: 10, discountedNights: 2, stayDate: "2026-09-02" });
  });

  it("ranks the strongest verified room offer and keeps rates numeric", () => {
    const second = row(120, "2026-09-05");
    second.rooms = { ...second.rooms!, id: "r2", base_rate: "200" };
    const deals = buildRateBackedDeals([row(180, "2026-09-02"), second]);
    expect(deals.map((deal) => deal.roomId)).toEqual(["r2", "r1"]);
    expect(deals[0].savings).toBe(80);
  });

  it("limits public deals to approved published inventory and partner data to its owner", () => {
    expect(publicRoute).toContain('.eq("rooms.properties.active", true)');
    expect(publicRoute).toContain('.eq("rooms.properties.partners.status", "approved")');
    expect(publicRoute).toContain('.gt("available_units", 0)');
    expect(publicRoute).toContain("INVENTORY_LIMIT");
    expect(partnerRoute).toContain('partner.status !== "approved"');
    expect(partnerRoute).toContain('.eq("rooms.properties.partner_id", partner.id)');
  });

  it("replaces both unsupported promotion claims with rate-backed interfaces", () => {
    expect(dealsPage).toContain("<DealsGrid />");
    expect(dealsPage).not.toContain("Save up to 20%");
    expect(promotionsPage).toContain("<PartnerPromotions />");
    expect(promotionsPage).not.toContain("ready for database and supplier integration");
  });
});
