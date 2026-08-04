import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeSellableInventory } from "../lib/inventory-dates";

const manager = readFileSync(new URL("../components/dashboard/rates-inventory-manager.tsx", import.meta.url), "utf8");

describe("guided partner inventory setup", () => {
  it("summarizes only future inventory that customers can actually book", () => {
    expect(summarizeSellableInventory([
      { stay_date: "2026-08-01", available_units: 4, rate: 250 },
      { stay_date: "2026-08-03", available_units: 0, rate: 275 },
      { stay_date: "2026-08-04", available_units: 2, rate: 300 },
      { stay_date: "2026-07-31", available_units: 9, rate: 100 },
    ], "2026-08-01")).toEqual({
      sellableDates: 2,
      totalUnits: 6,
      startDate: "2026-08-01",
      endDate: "2026-08-04",
      minRate: 250,
      maxRate: 300,
    });
  });

  it("returns an explicit empty coverage summary", () => {
    expect(summarizeSellableInventory([
      { stay_date: "2026-08-01", available_units: 0, rate: 250 },
    ], "2026-08-01")).toEqual({
      sellableDates: 0,
      totalUnits: 0,
      startDate: null,
      endDate: null,
      minRate: null,
      maxRate: null,
    });
  });

  it("hands a newly created room directly into the inventory form", () => {
    expect(manager).toContain("setInventoryRoomId(body.data.id)");
    expect(manager).toContain("Add future inventory for this room next.");
    expect(manager).toContain('value={inventoryRoomId}');
    expect(manager).toContain('defaultValue={inventoryRoom?.base_rate}');
    expect(manager).toContain("sellable nights");
    expect(manager).toContain("No sellable future inventory");
  });
});
