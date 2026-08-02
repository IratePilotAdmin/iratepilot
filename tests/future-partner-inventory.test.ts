import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getInventoryDateRangeError, getUpcomingInventory } from "../lib/inventory-dates";

const route = readFileSync(new URL("../app/api/partner/rates/route.ts", import.meta.url), "utf8");
const manager = readFileSync(new URL("../components/dashboard/rates-inventory-manager.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/202608020021_enforce_future_partner_inventory.sql", import.meta.url),
  "utf8",
);

describe("future partner inventory", () => {
  it("rejects past and oversized date ranges while allowing 366 inclusive dates", () => {
    expect(getInventoryDateRangeError("2026-07-31", "2026-08-02", "2026-08-01"))
      .toBe("Inventory start date cannot be in the past.");
    expect(getInventoryDateRangeError("2026-08-01", "2027-08-01", "2026-08-01")).toBeNull();
    expect(getInventoryDateRangeError("2026-08-01", "2027-08-02", "2026-08-01"))
      .toBe("Inventory ranges must be between 1 and 366 days.");
  });

  it("shows only the next upcoming inventory row", () => {
    expect(getUpcomingInventory([
      { stay_date: "2026-07-31", rate: 100 },
      { stay_date: "2026-08-03", rate: 130 },
      { stay_date: "2026-08-01", rate: 110 },
    ], "2026-08-01")).toEqual([
      { stay_date: "2026-08-01", rate: 110 },
      { stay_date: "2026-08-03", rate: 130 },
    ]);
  });

  it("enforces future dates across the API, form, and direct partner writes", () => {
    expect(route).toContain("getInventoryDateRangeError");
    expect(route).toContain("getUpcomingInventory(room.inventory)");
    expect(manager).toContain("min={today}");
    expect(migration).toContain("inventory.stay_date >= current_date");
    expect(migration).toContain("partners.status = 'approved'");
  });
});
