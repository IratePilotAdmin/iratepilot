import { describe, expect, it } from "vitest";
import { summarizeRevenueInputs } from "./revenue-report";

describe("daily hotel revenue report", () => {
  it("weights ADR by rooms sold across room types", () => {
    const report = summarizeRevenueInputs([
      { rooms_available: 10, rooms_sold: 9, current_rate: 100 },
      { rooms_available: 10, rooms_sold: 1, current_rate: 300 },
    ]);
    expect(report).toEqual({ averageOccupancy: 50, averageRate: 120, forecastRevenue: 1200 });
  });

  it("reports zero ADR when no rooms were sold", () => {
    expect(summarizeRevenueInputs([{ rooms_available: 10, rooms_sold: 0, current_rate: 100 }]))
      .toEqual({ averageOccupancy: 0, averageRate: 0, forecastRevenue: 0 });
  });

  it("rejects values that would make the report misleading", () => {
    expect(() => summarizeRevenueInputs([{ rooms_available: 1, rooms_sold: 2, current_rate: 100 }])).toThrow();
    expect(() => summarizeRevenueInputs([{ rooms_available: 1, rooms_sold: 1, current_rate: "invalid" }])).toThrow();
  });
});
