import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

describe("SynXis certification issuance monitor", () => {
  it("loads a bounded, non-secret receipt history in parallel", () => {
    expect(route).toContain("exportReceiptLimit = 25");
    expect(route).toContain('from("synxis_certification_export_receipts")');
    expect(route).toContain("loadExportReceipts(admin)");
    expect(route).toContain("Promise.all([");
    expect(route).toContain(".limit(exportReceiptLimit)");
    expect(route).toContain('select("id,schema_version,checksum,packet_generated_at,evidence_event_count,request_receipt_count,exporter_name,exported_at,receipt_binding_required")');
    expect(route).not.toContain("evidence_snapshot");
  });

  it("reports migration 043 availability without breaking earlier readiness", () => {
    expect(route).toContain('result.error?.code === "42P01"');
    expect(route).toContain("exportReceiptLedgerAvailable");
    expect(route).toContain("exports.available");
    expect(dashboard).toContain("Issuance ledger:");
    expect(dashboard).toContain("data.exportReceiptLedgerAvailable");
    expect(dashboard).toContain("Apply migrations 043–044");
  });

  it("shows the latest non-secret issuance receipts and gates download availability", () => {
    expect(dashboard).toContain("Certification packet issuance");
    expect(dashboard).toContain("data.exportReceipts.map");
    expect(dashboard).toContain("receipt.checksum.slice(0, 12)");
    expect(dashboard).toContain("latest 25 non-secret issuance receipts");
    expect(dashboard).toContain("data.requestJournalAvailable && data.exportReceiptLedgerAvailable");
  });
});
