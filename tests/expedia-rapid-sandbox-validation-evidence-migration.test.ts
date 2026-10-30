import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202610300176_expedia_rapid_sandbox_validation.sql", import.meta.url),
  "utf8",
);

describe("Expedia Rapid sandbox validation evidence migration", () => {
  it("extends the safe evidence ledger without weakening its other constraints", () => {
    expect(migration).toContain("drop constraint inventory_supplier_validation_evidence_supplier_id_check");
    expect(migration).toContain("supplier_id in ('ratehawk', 'expedia-rapid')");
    expect(migration).not.toMatch(/grant\s+.*authenticated/i);
    expect(migration).not.toMatch(/add\s+column[^;]*(api.?key|shared.?secret|raw.?response)/i);
  });
});
