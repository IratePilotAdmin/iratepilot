import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSynxisCertificationPacket,
  verifySynxisCertificationPacket,
} from "../lib/integrations/synxis-certification-packet";

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

function input() {
  return {
    generatedAt: "2026-08-13T23:00:00.000Z",
    readiness: {
      id: "sabre-synxis" as const,
      category: "crs" as const,
      status: "certification_required" as const,
      missingEnvironmentKeys: [],
      invalidEnvironmentKeys: [],
      liveTrafficAllowed: false,
    },
    evidence: {},
    evidenceHistory: [],
    evidenceHistoryTotal: 0,
    requestReceipts: [],
    requestReceiptsTotal: 0,
  };
}

describe("SynXis certification receipt correlation", () => {
  it("covers an issuance receipt UUID with the packet checksum", () => {
    const receiptId = "123e4567-e89b-42d3-a456-426614174000";
    const packet = buildSynxisCertificationPacket({ ...input(), issuanceReceiptId: receiptId });
    const { integrity, ...payload } = packet;
    expect(packet.issuance?.receiptId).toBe(receiptId);
    expect(integrity.checksum).toBe(
      createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
    );
    expect(verifySynxisCertificationPacket(packet)).toMatchObject({
      valid: true,
      issuanceReceiptId: receiptId,
    });
  });

  it("retains legacy schema-1 packet compatibility and rejects malformed receipt IDs", () => {
    expect(verifySynxisCertificationPacket(buildSynxisCertificationPacket(input())))
      .toMatchObject({ valid: true, issuanceReceiptId: null });
    const malformed = buildSynxisCertificationPacket({ ...input(), issuanceReceiptId: "not-a-uuid" });
    expect(verifySynxisCertificationPacket(malformed).reason).toBe("invalid_packet");
  });

  it("writes the generated ID and requires ID plus checksum for new packet lookup", () => {
    expect(exportRoute).toContain('import { randomUUID } from "node:crypto"');
    expect(exportRoute).toContain("const issuanceReceiptId = randomUUID()");
    expect(exportRoute).toContain("issuanceReceiptId,");
    expect(exportRoute).toContain("id: issuanceReceiptId");
    expect(verifyRoute).toContain('receiptQuery.eq("id", verification.issuanceReceiptId)');
    expect(verifyRoute).toContain('.eq("checksum", verification.checksum)');
    expect(verifyRoute).toContain('matchedBy: verification.issuanceReceiptId ? "receipt_id_and_checksum" : "legacy_checksum"');
    expect(dashboard).toContain("receipt.id.slice(0, 8)");
  });
});
