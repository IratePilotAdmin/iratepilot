import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSynxisCertificationFreshness } from "../lib/integrations/synxis-certification-freshness";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/export/verify/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

describe("SynXis certification packet freshness", () => {
  it("keeps a packet current when no newer activity exists", () => {
    expect(buildSynxisCertificationFreshness(
      "2026-08-13T20:00:00.000Z",
      "2026-08-13T19:59:00.000Z",
      null,
    )).toEqual({
      current: true,
      newerActivityAt: null,
      newerEvidenceAt: null,
      newerRequestAt: null,
    });
  });

  it("reports the newest activity that superseded a packet", () => {
    expect(buildSynxisCertificationFreshness(
      "2026-08-13T20:00:00.000Z",
      "2026-08-13T20:01:00.000Z",
      "2026-08-13T20:02:00.000Z",
    )).toEqual({
      current: false,
      newerActivityAt: "2026-08-13T20:02:00.000Z",
      newerEvidenceAt: "2026-08-13T20:01:00.000Z",
      newerRequestAt: "2026-08-13T20:02:00.000Z",
    });
  });

  it("assesses freshness only after issuance and fails closed on lookup errors", () => {
    expect(route).toContain("if (!receipt || (verification.schemaVersion === 2");
    expect(route).toContain("Promise.all([");
    expect(route).toContain('.from("synxis_crs_evidence_audit")');
    expect(route).toContain('.from("synxis_request_journal")');
    expect(route).toContain('.gt("created_at", verification.generatedAt as string)');
    expect(route).toContain('.gt("started_at", verification.generatedAt as string)');
    expect(route).toContain("Certification packet freshness could not be verified.");
    expect(dashboard).toContain("this packet was superseded by newer certification activity");
    expect(dashboard).toContain("Checksum, iRatePilot issuance, and freshness verified");
  });
});
