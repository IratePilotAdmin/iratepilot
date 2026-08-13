import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSynxisCertificationPacket } from "../lib/integrations/synxis-certification-packet";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

describe("SynXis certification packet", () => {
  it("builds a checksummed, explicitly non-secret handoff", () => {
    const packet = buildSynxisCertificationPacket({
      generatedAt: "2026-08-13T21:00:00.000Z",
      readiness: {
        id: "sabre-synxis",
        category: "crs",
        status: "certification_required",
        missingEnvironmentKeys: ["CRS_SYNXIS_HOTEL_ID"],
        invalidEnvironmentKeys: [],
        liveTrafficAllowed: false,
      },
      evidence: { vendorApproved: true, verificationNotes: "Partner case SAB-1" },
      evidenceHistory: [{ id: "event-1", event_type: "evidence_updated" }],
      evidenceHistoryTotal: 1,
      requestReceipts: [{ request_id: "IRP-CERT-1", status: "succeeded" }],
      requestReceiptsTotal: 1,
    });
    const { integrity, ...payload } = packet;
    expect(integrity.checksum).toBe(
      createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
    );
    expect(packet.privacy.secretValuesIntentionallyIncluded).toBe(false);
    expect(JSON.stringify(packet)).not.toContain("property-password");
    expect(JSON.stringify(packet)).not.toContain("<OTA_HotelRateAmountNotifRQ");
  });

  it("marks bounded sections as truncated", () => {
    const packet = buildSynxisCertificationPacket({
      generatedAt: "2026-08-13T21:00:00.000Z",
      readiness: { id: "sabre-synxis", category: "crs", status: "configuration_required", missingEnvironmentKeys: [], invalidEnvironmentKeys: [], liveTrafficAllowed: false },
      evidence: {}, evidenceHistory: [], evidenceHistoryTotal: 2,
      requestReceipts: [], requestReceiptsTotal: 3,
    });
    expect(packet.evidenceHistory.truncated).toBe(true);
    expect(packet.requestJournal.truncated).toBe(true);
  });

  it("requires an admin and exports only bounded non-secret columns", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("Promise.all([");
    expect(route).toContain("exportLimit = 1_000");
    expect(route).toContain('Content-Disposition');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("CRS_SYNXIS_PASSWORD");
    expect(route).not.toContain("evidence_snapshot");
  });

  it("offers the export only when all persistence migrations are available", () => {
    expect(dashboard).toContain("Download certification packet");
    expect(dashboard).toContain('href="/api/admin/integrations/crs/synxis/export"');
    expect(dashboard).toContain("migrations 040–044");
  });
});
