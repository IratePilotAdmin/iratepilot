export type SynxisCertificationHandoffBlocker =
  | "integrity_unverified"
  | "legacy_schema"
  | "issuance_unverified"
  | "freshness_unverified"
  | "superseded"
  | "readiness_unverified"
  | "packet_sections_invalid"
  | "evidence_history_incomplete"
  | "request_journal_incomplete";

export type SynxisCertificationHandoffAssessment = {
  eligible: boolean;
  blockers: SynxisCertificationHandoffBlocker[];
};

type AssessmentInput = {
  packet: unknown;
  checksumValid: boolean;
  schemaVersion: number | null;
  issuanceRecorded: boolean;
  freshness: { assessed: boolean; current?: boolean };
};

function truncatedState(packet: unknown, section: "evidenceHistory" | "requestJournal") {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const value = (packet as Record<string, unknown>)[section];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const truncated = (value as Record<string, unknown>).truncated;
  return typeof truncated === "boolean" ? truncated : null;
}

function hasVerifiedCertificationReadiness(packet: unknown) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return false;
  const readiness = (packet as Record<string, unknown>).readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return false;
  const value = readiness as Record<string, unknown>;
  const status = value.status;
  return value.id === "sabre-synxis"
    && value.category === "crs"
    && Array.isArray(value.missingEnvironmentKeys)
    && value.missingEnvironmentKeys.length === 0
    && Array.isArray(value.invalidEnvironmentKeys)
    && value.invalidEnvironmentKeys.length === 0
    && (status === "activation_required" || status === "live")
    && value.liveTrafficAllowed === (status === "live");
}

export function assessSynxisCertificationHandoff(
  input: AssessmentInput,
): SynxisCertificationHandoffAssessment {
  const blockers: SynxisCertificationHandoffBlocker[] = [];
  if (!input.checksumValid) blockers.push("integrity_unverified");
  if (input.schemaVersion !== 2) blockers.push("legacy_schema");
  if (!input.issuanceRecorded) blockers.push("issuance_unverified");
  if (!input.freshness.assessed) blockers.push("freshness_unverified");
  else if (input.freshness.current !== true) blockers.push("superseded");

  if (input.checksumValid) {
    if (!hasVerifiedCertificationReadiness(input.packet)) {
      blockers.push("readiness_unverified");
    }
    const evidenceHistoryTruncated = truncatedState(input.packet, "evidenceHistory");
    const requestJournalTruncated = truncatedState(input.packet, "requestJournal");
    if (evidenceHistoryTruncated === null || requestJournalTruncated === null) {
      blockers.push("packet_sections_invalid");
    } else {
      if (evidenceHistoryTruncated) blockers.push("evidence_history_incomplete");
      if (requestJournalTruncated) blockers.push("request_journal_incomplete");
    }
  }

  return { eligible: blockers.length === 0, blockers };
}
