import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202610300179_expedia_b2c_evidence_ledger.sql"),
  "utf8",
).toLowerCase();

describe("Expedia B2C evidence ledger migration", () => {
  it("creates an append-only, service-only RLS ledger", () => {
    expect(migration).toContain("create table public.expedia_b2c_site_review_receipts");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.expedia_b2c_site_review_receipts");
    expect(migration).toContain("grant select, insert on table public.expedia_b2c_site_review_receipts");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain("grant delete");
    expect(migration).not.toContain("create policy");
  });

  it("requires evidence for verified decisions and notes for exceptions", () => {
    expect(migration).toContain("decision in ('verified', 'not_applicable', 'pending')");
    expect(migration).toContain("decision = 'verified' and evidence_reference is not null");
    expect(migration).toContain("decision in ('not_applicable', 'pending') and verification_notes is not null");
  });
});
