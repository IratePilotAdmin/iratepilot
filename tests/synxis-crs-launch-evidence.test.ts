import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608130040_synxis_crs_launch_evidence.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608130040_synxis_crs_launch_evidence.rollback.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/route.ts", import.meta.url),
  "utf8",
);
const auditMigration = readFileSync(
  new URL("../supabase/migrations/202608130041_synxis_crs_evidence_audit.sql", import.meta.url),
  "utf8",
);
const auditRollback = readFileSync(
  new URL("../supabase/rollbacks/202608130041_synxis_crs_evidence_audit.rollback.sql", import.meta.url),
  "utf8",
);

describe("SynXis CRS launch evidence persistence", () => {
  it("enforces every certification gate in order at the database layer", () => {
    expect(migration).toContain("provider_id = 'sabre-synxis'");
    expect(migration).toContain("not certification_environment_approved or vendor_approved");
    expect(migration).toContain("not property_mapped or (vendor_approved and certification_environment_approved)");
    expect(migration).toContain("not sandbox_validated or (vendor_approved and certification_environment_approved and property_mapped)");
    expect(migration).toContain("not production_smoke_validated or sandbox_validated");
    expect(migration).toContain("not live_enabled or production_smoke_validated");
    expect(migration).toContain("synxis_live_requires_activation_details");
  });

  it("keeps the evidence private and refuses to erase recorded audit evidence", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.synxis_crs_launch_evidence from public, anon, authenticated");
    expect(rollback).toContain("Refusing rollback: SynXis CRS launch evidence exists");
    expect(rollback).toContain("or live_enabled");
    expect(rollback).toContain("vendor_approval_reference");
  });

  it("exposes an admin-only, uncached evidence endpoint", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain('from("synxis_crs_launch_evidence")');
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("updated_by: auth.user.id");
    expect(route).toContain("buildSynxisReadiness(process.env, evidence)");
  });

  it("blocks activation until verified evidence is complete", () => {
    expect(route).toContain("Vendor approval is required before certification-environment approval.");
    expect(route).toContain("Vendor and certification-environment approval are required before property mapping.");
    expect(route).toContain("Property mapping is required before sandbox validation.");
    expect(route).toContain("Sandbox validation is required before the production smoke test.");
    expect(route).toContain("The production smoke test must pass before live traffic is enabled.");
    expect(route).toContain("ENABLE SABRE SYNXIS LIVE TRAFFIC");
    expect(route).toContain("Production configuration must be complete and valid before live traffic is enabled.");
    expect(route).toContain("isVerifiedActivationDetail");
    expect(route).toContain("Apply SynXis CRS launch-evidence migration 040");
  });

  it("never reads or returns connector secrets directly", () => {
    expect(route).not.toContain("CRS_SYNXIS_USERNAME");
    expect(route).not.toContain("CRS_SYNXIS_PASSWORD");
  });

  it("records immutable audit snapshots from a database trigger", () => {
    expect(auditMigration).toContain("create table if not exists public.synxis_crs_evidence_audit");
    expect(auditMigration).toContain("after insert or update on public.synxis_crs_launch_evidence");
    expect(auditMigration).toContain("to_jsonb(new) - 'updated_by' - 'updated_at'");
    expect(auditMigration).toContain("before update or delete on public.synxis_crs_evidence_audit");
    expect(auditMigration).toContain("SynXis CRS evidence audit events are immutable");
    expect(auditMigration).toContain("actor_name text not null");
    expect(auditMigration).toContain("coalesce(v_actor_name, 'Administrator')");
    expect(auditMigration).not.toContain("actor_id uuid references");
    expect(auditMigration).toContain("revoke all on table public.synxis_crs_evidence_audit from public, anon, authenticated");
  });

  it("refuses to roll back recorded certification history", () => {
    expect(auditRollback).toContain("Refusing rollback: SynXis CRS evidence audit history exists");
    expect(auditRollback).toContain("exists (select 1 from public.synxis_crs_evidence_audit)");
  });

  it("returns recent audit history without making the evidence endpoint unavailable before migration 041", () => {
    expect(route).toContain('from("synxis_crs_evidence_audit")');
    expect(route).toContain("Promise.all([");
    expect(route).toContain('result.error?.code === "42P01"');
    expect(route).toContain("historyAvailable");
    expect(route).toContain("auditLimit = 25");
  });
});
