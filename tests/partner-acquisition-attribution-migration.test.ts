import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/hotel-migrations/202609160142_partner_acquisition_attribution.sql", import.meta.url),
  "utf8",
);

describe("partner acquisition attribution migration", () => {
  it("allows only bounded campaign labels inside private registration JSON", () => {
    expect(migration).toContain("'source','medium','campaign','content'");
    expect(migration).toContain("then 64 else 128");
    expect(migration).toContain("~ '[[:cntrl:]]'");
    expect(migration).toContain("v_value = '{}'::jsonb");
  });

  it("does not add approval, publication, inventory, or booking mutations", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.properties/i);
    expect(migration).not.toMatch(/update\s+public\.properties/i);
    expect(migration).not.toMatch(/partner_applications[\s\S]+approved/i);
    expect(migration).not.toMatch(/active\s*=\s*true/i);
  });
});
