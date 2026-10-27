import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202610270174_ratehawk_sandbox_prebook_evidence.sql",
  "utf8",
);

describe("RateHawk prebook evidence migration", () => {
  it("adds constrained prebook evidence without adding secret or raw-response fields", () => {
    expect(migration).toContain("validation_kind in ('hotel_search', 'hotel_prebook')");
    expect(migration).toContain("add column price_changed boolean");
    expect(migration).toContain("validation_kind = 'hotel_prebook' and price_changed is not null");
    expect(migration).not.toMatch(/api_key|secret_value|credential_value|raw_response|response_body/i);
  });
});
