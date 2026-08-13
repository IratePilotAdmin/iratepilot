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
    expect(route).toContain("isVerifiedActivationDetail");
    expect(route).toContain("Apply SynXis CRS launch-evidence migration 040");
  });

  it("never reads or returns connector secrets directly", () => {
    expect(route).not.toContain("CRS_SYNXIS_USERNAME");
    expect(route).not.toContain("CRS_SYNXIS_PASSWORD");
  });
});
