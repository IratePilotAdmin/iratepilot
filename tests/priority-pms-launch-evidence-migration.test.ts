import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608090034_priority_pms_launch_evidence.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608090034_priority_pms_launch_evidence.rollback.sql", import.meta.url),
  "utf8",
);

describe("priority PMS launch evidence migration", () => {
  it("allows only priority providers and enforces launch-gate order", () => {
    for (const provider of ["oracle-opera", "hilton-pep", "hilton-onq", "marriott-fosse", "marriott-fs-pms", "hotelkey"]) {
      expect(migration).toContain(`'${provider}'`);
    }
    expect(migration).toContain("not property_mapped or vendor_approved");
    expect(migration).toContain("not sandbox_validated or (vendor_approved and property_mapped)");
  });

  it("keeps evidence service-role only and provides a data-safe rollback", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.priority_pms_launch_evidence from anon, authenticated");
    expect(rollback).toContain("Refusing rollback: priority_pms_launch_evidence contains data");
  });
});
