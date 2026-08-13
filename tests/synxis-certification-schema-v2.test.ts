import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSynxisCertificationPacket,
  verifySynxisCertificationPacket,
} from "../lib/integrations/synxis-certification-packet";

const migration = readFileSync(
  new URL("../supabase/migrations/202608130044_synxis_certification_packet_schema_v2.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608130044_synxis_certification_packet_schema_v2.rollback.sql", import.meta.url),
  "utf8",
);
const adminRoute = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/route.ts", import.meta.url),
  "utf8",
);
const exportRoute = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/route.ts", import.meta.url),
  "utf8",
);

const base = {
  generatedAt: "2026-08-13T23:30:00.000Z",
  readiness: {
    id: "sabre-synxis" as const,
    category: "crs" as const,
    status: "certification_required" as const,
    missingEnvironmentKeys: [],
    invalidEnvironmentKeys: [],
    liveTrafficAllowed: false,
  },
  evidence: {}, evidenceHistory: [], evidenceHistoryTotal: 0,
  requestReceipts: [], requestReceiptsTotal: 0,
};

describe("SynXis certification packet schema 2", () => {
  it("uses schema 2 only for receipt-bound packets and keeps legacy schema 1", () => {
    const receiptId = "123e4567-e89b-42d3-a456-426614174000";
    const current = buildSynxisCertificationPacket({ ...base, issuanceReceiptId: receiptId });
    const legacy = buildSynxisCertificationPacket(base);
    expect(current.schemaVersion).toBe(2);
    expect(verifySynxisCertificationPacket(current)).toMatchObject({ valid: true, schemaVersion: 2 });
    expect(legacy.schemaVersion).toBe(1);
    expect(verifySynxisCertificationPacket(legacy)).toMatchObject({ valid: true, schemaVersion: 1 });
  });

  it("requires a receipt ID for schema 2", () => {
    const legacy = buildSynxisCertificationPacket(base) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    expect(verifySynxisCertificationPacket(legacy).reason).toBe("invalid_packet");
  });

  it("migrates the immutable ledger and fails closed until migration 044", () => {
    expect(migration).toContain("schema_version in (1, 2)");
    expect(migration).toContain("receipt_binding_required boolean not null default false");
    expect(migration).toContain("schema_version = 2 and receipt_binding_required");
    expect(rollback).toContain("Refusing rollback: SynXis schema-2 certification packet receipts exist");
    expect(exportRoute).toContain("receipt_binding_required: true");
    expect(exportRoute).toContain("Apply SynXis migrations through 044");
    expect(adminRoute).toContain('result.error?.code === "42703"');
  });
});
