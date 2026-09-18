import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202609070158_iratepilot_pms_scoped_source_claim_identity.sql", import.meta.url),
  "utf8",
);

describe("native PMS scoped claim identity repair", () => {
  it("validates extracted scalar values and preserves the configured scope boundary", () => {
    expect(migration).toContain("connection_value := item->>'connection_id'");
    expect(migration).toContain("property_value := item->>'property_id'");
    expect(migration).toContain("JOIN permitted allowed");
    expect(migration).toContain("c.delivery_enabled");
    expect(migration).toContain("c.environment='sandbox'");
    expect(migration).toContain("FOR UPDATE OF o SKIP LOCKED");
    expect(migration).toContain("TO service_role");
  });
});
