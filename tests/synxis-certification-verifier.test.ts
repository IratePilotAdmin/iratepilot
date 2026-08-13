import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSynxisCertificationPacket,
  verifySynxisCertificationPacket,
} from "../lib/integrations/synxis-certification-packet";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/verify/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

function packet() {
  return buildSynxisCertificationPacket({
    generatedAt: "2026-08-13T22:00:00.000Z",
    readiness: {
      id: "sabre-synxis",
      category: "crs",
      status: "certification_required",
      missingEnvironmentKeys: [],
      invalidEnvironmentKeys: [],
      liveTrafficAllowed: false,
    },
    evidence: { vendorApproved: true },
    evidenceHistory: [],
    evidenceHistoryTotal: 0,
    requestReceipts: [],
    requestReceiptsTotal: 0,
  });
}

describe("SynXis certification packet verifier", () => {
  it("verifies an unchanged packet", () => {
    expect(verifySynxisCertificationPacket(packet())).toMatchObject({
      valid: true,
      reason: "verified",
      schemaVersion: 1,
    });
  });

  it("detects changed evidence", () => {
    const changed = packet();
    changed.evidence.vendorApproved = false;
    expect(verifySynxisCertificationPacket(changed)).toMatchObject({
      valid: false,
      reason: "checksum_mismatch",
    });
  });

  it("rejects foreign and unsupported packets", () => {
    const foreign = packet() as unknown as Record<string, unknown>;
    foreign.provider = { id: "another-provider" };
    expect(verifySynxisCertificationPacket(foreign).reason).toBe("invalid_packet");

    const unsupported = packet() as unknown as Record<string, unknown>;
    unsupported.schemaVersion = 3;
    expect(verifySynxisCertificationPacket(unsupported).reason).toBe("unsupported_schema");
  });

  it("keeps verification admin-only, bounded, and uncached", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("maximumPacketBytes = 2 * 1024 * 1024");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(dashboard).toContain("Verify checksum");
    expect(dashboard).toContain("Checksum, iRatePilot issuance, and freshness verified");
    expect(dashboard).toContain("no iRatePilot issuance receipt was found");
  });
});
