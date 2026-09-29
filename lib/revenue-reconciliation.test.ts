import { describe, expect, it } from "vitest";
import { reconcileRevenueRows } from "./revenue-reconciliation";

const inventory = [
  { room_id: "king", stay_date: "2026-10-01", available_units: 3, rate: "100.00" },
  { room_id: "king", stay_date: "2026-10-02", available_units: 2, rate: "120.00" },
];
const inputs = [
  { room_id: "king", stay_date: "2026-10-01", rooms_available: 10, rooms_sold: 7, current_rate: 100, source: "csv" },
  { room_id: "king", stay_date: "2026-10-02", rooms_available: 10, rooms_sold: 8, current_rate: 120, source: "csv" },
];

describe("read-only OTA inventory and revenue data comparison", () => {
  it("labels an exact row comparison as indicative rather than verified", () => {
    expect(reconcileRevenueRows(inventory, inputs)).toMatchObject({
      status: "indicative_match", matchedDates: 2, rateDifferences: 0,
      indicativeAvailabilityDifferences: 0, inputSources: ["csv"],
    });
  });

  it("reports missing dates and distinct rate and remaining-unit differences", () => {
    const result = reconcileRevenueRows(
      [inventory[0], { ...inventory[1], rate: 130, available_units: 1 }, { ...inventory[1], stay_date: "2026-10-03" }],
      [inputs[0], inputs[1], { ...inputs[0], stay_date: "2026-10-04" }],
    );
    expect(result).toMatchObject({
      status: "differences", matchedDates: 2, missingInventoryDates: 1,
      missingImportedDates: 1, rateDifferences: 1, indicativeAvailabilityDifferences: 1,
    });
    expect(result.examples.map(row => row.issue)).toContain("CSV and OTA rates differ");
  });

  it("does not infer occupancy when no revenue inputs exist", () => {
    expect(reconcileRevenueRows(inventory, [])).toMatchObject({
      status: "no_revenue_inputs", revenueRows: 0, missingImportedDates: 2,
    });
  });
});
