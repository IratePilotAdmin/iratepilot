import { describe, expect, it } from "vitest";
import { buildRateRecommendation, type RevenueCsvRow } from "../lib/revenue";

function row(overrides: Partial<RevenueCsvRow> = {}): RevenueCsvRow {
  return {
    property_id: "property",
    room_id: "room",
    stay_date: "2026-10-15",
    rooms_available: 10,
    rooms_sold: 5,
    current_rate: 100,
    competitor_rate: null,
    last_year_occupancy: null,
    event_name: null,
    ...overrides,
  };
}

describe("hotel revenue rate recommendations", () => {
  it("uses the prior-year zero occupancy instead of treating it as missing", () => {
    expect(buildRateRecommendation(row({
      rooms_sold: 8,
      last_year_occupancy: 0,
    }))).toMatchObject({ occupancyForecast: 40 });
  });

  it("respects the low-demand, normal, high-demand, and full-demand thresholds", () => {
    expect(buildRateRecommendation(row({ rooms_sold: 3 })).recommendedRate).toBe(92);
    expect(buildRateRecommendation(row({ rooms_sold: 5 })).recommendedRate).toBe(100);
    expect(buildRateRecommendation(row({ rooms_sold: 7 })).recommendedRate).toBe(108);
    expect(buildRateRecommendation(row({ rooms_sold: 9 })).recommendedRate).toBe(115);
  });

  it("combines market and event signals and explains them in the recommendation", () => {
    expect(buildRateRecommendation(row({
      rooms_sold: 8,
      competitor_rate: 120,
      event_name: "Local concert",
    }))).toMatchObject({
      recommendedRate: 118,
      reason: "Based on 80% booking occupancy, competitors are priced higher, demand event: Local concert. Manager approval is required.",
    });
  });

  it("does not predict more unsold-room impact when inventory is fully occupied", () => {
    expect(buildRateRecommendation(row({ rooms_sold: 10 })).estimatedRevenueImpact).toBe(0);
  });
});
