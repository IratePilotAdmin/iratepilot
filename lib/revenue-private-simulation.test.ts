import { describe, expect, it } from "vitest";
import { buildPrivateRevenueSimulation } from "./revenue-private-simulation";

describe("private Red Roof revenue simulation", () => {
  it("produces reproducible room demand and recommendations without guest or booking records", () => {
    const result = buildPrivateRevenueSimulation(new Date("2026-10-01T12:00:00Z"));
    expect(result).toMatchObject({ simulated: true, readOnly: true, days: 30, inputRows: 60 });
    expect(result.recommendations[0].stay_date).toBe("2026-10-01");
    expect(result.recommendations.some(row => row.recommendedRate !== row.currentRate)).toBe(true);
    expect(result.report.forecastRevenue).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/guest|passport|reservation|payment/i);
    expect(buildPrivateRevenueSimulation(new Date("2026-10-01T12:00:00Z"))).toEqual(result);
  });
});
