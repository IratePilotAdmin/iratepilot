import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020007_inventory_bounds.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("inventory bounds migration", () => {
  it.each([
    "rooms_max_guests_bounds",
    "rooms_base_rate_bounds",
    "inventory_available_units_bounds",
    "inventory_rate_bounds",
  ])("adds the %s check without requiring historical rows to pass immediately", (constraint) => {
    expect(migration).toContain(`add constraint ${constraint}`);
    expect(migration.match(new RegExp(`add constraint ${constraint}[\\s\\S]*?not valid`, "g"))).toHaveLength(1);
  });
});
