import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/hotel-migrations/202609170144_partner_application_review_evidence.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/hotel-rollbacks/202609170144_partner_application_review_evidence.rollback.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const verifier = readFileSync(
  new URL("../scripts/verify-partner-application-review-evidence.mjs", import.meta.url),
  "utf8",
);

describe("partner application review evidence", () => {
  it("records every decision in private append-only evidence", () => {
    expect(migration).toContain("create table if not exists public.partner_application_review_evidence");
    expect(migration).toContain("reviewer_id uuid not null references public.profiles(id)");
    expect(migration).toContain("inactive_draft_scope_confirmed boolean not null default false");
    expect(migration).toContain("before update or delete on public.partner_application_review_evidence");
    expect(migration).toContain("Partner application review evidence is append-only");
    expect(migration).toContain("revoke all on public.partner_application_review_evidence");
    expect(migration).toContain('profiles.role = \'admin\'');
  });

  it("requires every approval check and preserves the inactive-draft provisioning transaction", () => {
    expect(migration).toContain("p_legal_business_verified is distinct from true");
    expect(migration).toContain("p_representative_authority_verified is distinct from true");
    expect(migration).toContain("p_content_rights_verified is distinct from true");
    expect(migration).toContain("p_commercial_terms_acknowledgement_verified is distinct from true");
    expect(migration).toContain("p_inactive_draft_scope_confirmed is distinct from true");
    expect(migration).toContain("from public.review_partner_application(p_application_id, p_status)");
    expect(migration).toContain("revoke all on function public.review_partner_application(uuid, text)");
    expect(migration).toContain("insert into public.partner_application_review_evidence");
  });

  it("refuses to erase evidence and keeps bootstrap schema parity", () => {
    expect(rollback).toContain("Refusing rollback: partner application review evidence exists");
    expect(schema).toContain("p_inactive_draft_scope_confirmed boolean");
    expect(schema).toContain("inactive_draft_scope_confirmed boolean not null default false");
  });

  it("ships a local PostgreSQL-compatible behavioral verifier", () => {
    expect(verifier).toContain("Partner application review evidence PGlite verification passed.");
    expect(verifier).toContain('error.code === "42501"');
    expect(verifier).toContain('error.code === "P0001"');
    expect(verifier).toContain('error.code === "55000"');
  });
});
