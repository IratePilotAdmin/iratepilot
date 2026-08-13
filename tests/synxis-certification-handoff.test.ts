import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessSynxisCertificationHandoff } from "../lib/integrations/synxis-certification-handoff";

const completePacket = {
  evidenceHistory: { truncated: false },
  requestJournal: { truncated: false },
};

describe("SynXis certification handoff eligibility", () => {
  it("allows only a current, issued, complete schema-2 packet", () => {
    expect(assessSynxisCertificationHandoff({
      packet: completePacket,
      checksumValid: true,
      schemaVersion: 2,
      issuanceRecorded: true,
      freshness: { assessed: true, current: true },
    })).toEqual({ eligible: true, blockers: [] });
  });

  it("reports every blocker without treating validity as eligibility", () => {
    expect(assessSynxisCertificationHandoff({
      packet: {
        evidenceHistory: { truncated: true },
        requestJournal: { truncated: true },
      },
      checksumValid: true,
      schemaVersion: 1,
      issuanceRecorded: false,
      freshness: { assessed: true, current: false },
    })).toEqual({
      eligible: false,
      blockers: [
        "legacy_schema",
        "issuance_unverified",
        "superseded",
        "evidence_history_incomplete",
        "request_journal_incomplete",
      ],
    });
  });

  it("fails closed for invalid packet sections and exposes the decision in admin UI", () => {
    expect(assessSynxisCertificationHandoff({
      packet: {},
      checksumValid: true,
      schemaVersion: 2,
      issuanceRecorded: true,
      freshness: { assessed: true, current: true },
    })).toMatchObject({ eligible: false, blockers: ["packet_sections_invalid"] });

    const route = readFileSync("app/api/admin/integrations/crs/synxis/export/verify/route.ts", "utf8");
    const dashboard = readFileSync("components/dashboard/synxis-crs-readiness.tsx", "utf8");
    expect(route).toContain("assessSynxisCertificationHandoff");
    expect(dashboard).toContain("Handoff eligible:");
    expect(dashboard).toContain("Not handoff eligible:");
    expect(dashboard).toContain("Check handoff eligibility");
  });
});
