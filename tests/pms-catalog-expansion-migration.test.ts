import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202610140165_expand_pms_catalog.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("PMS catalog expansion migration", () => {
  it("adds each new provider without changing table access policies", () => {
    expect(migration).toContain("property_pms_connections_provider_id_check");
    expect(migration).toContain("'thinkreservations'");
    expect(migration).toContain("'siteminder'");
    expect(migration).toContain("'roomraccoon'");
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("drop policy");
  });
});
