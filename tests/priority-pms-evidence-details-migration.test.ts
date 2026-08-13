import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608100036_priority_pms_evidence_details.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608100036_priority_pms_evidence_details.rollback.sql", import.meta.url),
  "utf8",
);

describe("priority PMS activation evidence details migration", () => {
  it("adds only non-secret audit metadata with bounded lengths", () => {
    expect(migration).toContain("vendor_approval_reference text");
    expect(migration).toContain("approved_environment text");
    expect(migration).toContain("property_code text");
    expect(migration).toContain("support_contact text");
    expect(migration).toContain("verification_notes text");
    expect(migration).toContain("priority_pms_launch_evidence_details_length");
    expect(migration).not.toContain("client_secret");
    expect(migration).not.toContain("api_key");
  });

  it("refuses to erase recorded vendor evidence", () => {
    expect(rollback).toContain("Refusing rollback: priority PMS activation evidence details exist");
    expect(rollback).toContain("nullif(trim(vendor_approval_reference), '') is not null");
    expect(rollback).toContain("drop constraint if exists priority_pms_launch_evidence_details_length");
    expect(rollback).toContain("drop column if exists verification_notes");
  });
});
