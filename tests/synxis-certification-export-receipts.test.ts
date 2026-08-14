import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608130043_synxis_certification_export_receipts.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608130043_synxis_certification_export_receipts.rollback.sql", import.meta.url),
  "utf8",
);
const exportRoute = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/route.ts", import.meta.url),
  "utf8",
);
const verifyRoute = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/verify/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

describe("SynXis certification export receipts", () => {
  it("creates an immutable, private, non-secret issuance ledger", () => {
    expect(migration).toContain("synxis_certification_export_receipts");
    expect(migration).toContain("default gen_random_uuid()");
    expect(migration).not.toContain("uuid_generate_v4()");
    expect(migration).toContain("checksum text not null unique");
    expect(migration).toContain("packet bodies and credentials are prohibited");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.synxis_certification_export_receipts from public, anon, authenticated");
    expect(migration).toContain("SynXis certification export receipts are immutable");
    expect(rollback).toContain("Refusing rollback: SynXis certification export receipts exist");
  });

  it("records issuance before returning the packet and fails closed without migration 043", () => {
    const insertAt = exportRoute.indexOf('.from("synxis_certification_export_receipts").insert');
    const responseAt = exportRoute.indexOf("return new Response");
    expect(insertAt).toBeGreaterThan(0);
    expect(responseAt).toBeGreaterThan(insertAt);
    expect(exportRoute).toContain("packet.integrity.checksum");
    expect(exportRoute).toContain("auth.user.id");
    expect(exportRoute).toContain("Apply SynXis migrations through 044");
    expect(exportRoute).not.toContain("evidence_snapshot");
  });

  it("reports issuance only after a valid checksum and a matching receipt", () => {
    expect(verifyRoute).toContain("if (!verification.valid || !verification.checksum)");
    expect(verifyRoute).toContain('.eq("checksum", verification.checksum)');
    expect(verifyRoute).toContain("recorded: true");
    expect(verifyRoute).toContain("exportedBy: receipt.exporter_name");
    expect(verifyRoute).toContain("freshness: { assessed: true, ...freshness }");
    expect(verifyRoute).toContain("Apply SynXis migrations through 044");
    expect(dashboard).toContain("Checksum, iRatePilot issuance, and freshness verified");
    expect(dashboard).toContain("no iRatePilot issuance receipt was found");
    expect(dashboard).toContain("migrations 040–044");
  });
});
