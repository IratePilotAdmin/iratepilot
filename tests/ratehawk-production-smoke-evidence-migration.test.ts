import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../supabase/migrations/202611010181_ratehawk_production_smoke_evidence.sql",
  import.meta.url,
), "utf8");

describe("RateHawk production smoke evidence migration", () => {
  it("permits only the read-only production smoke evidence kind in production", () => {
    expect(migration).toContain("environment in ('sandbox', 'production')");
    expect(migration).toContain("validation_kind in ('hotel_search', 'hotel_prebook', 'production_smoke')");
    expect(migration).toContain("environment = 'production' and validation_kind = 'production_smoke'");
    expect(migration).toContain("configuration_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(/grant .*authenticated|grant .*anon/i);
  });
});
