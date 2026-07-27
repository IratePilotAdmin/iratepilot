import { describe, expect, it } from "vitest";
import { buildRateRecommendation, parseRevenueCsv } from "./revenue";

describe("Revenue AI CSV and recommendations", () => {
  it("parses required revenue fields", () => {
    const rows = parseRevenueCsv("property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate,competitor_rate,event_name\np1,r1,2026-08-14,10,9,189,220,Concert");
    expect(rows[0]).toMatchObject({ room_id: "r1", rooms_sold: 9, current_rate: 189, event_name: "Concert" });
  });
  it("raises rates for high demand and an event", () => {
    const recommendation = buildRateRecommendation({ property_id: "p1", room_id: "r1", stay_date: "2026-08-14", rooms_available: 10, rooms_sold: 9, current_rate: 189, competitor_rate: 220, last_year_occupancy: 75, event_name: "Concert" });
    expect(recommendation.recommendedRate).toBeGreaterThan(189);
    expect(recommendation.reason).toContain("Manager approval");
  });
});
