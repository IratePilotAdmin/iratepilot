import { createHash } from "node:crypto";
import type { SynxisReadiness } from "../../services/hotel-suppliers/synxis";

export type SynxisCertificationPacketInput = {
  generatedAt: string;
  readiness: SynxisReadiness;
  evidence: Record<string, boolean | string>;
  evidenceHistory: Array<Record<string, unknown>>;
  evidenceHistoryTotal: number;
  requestReceipts: Array<Record<string, unknown>>;
  requestReceiptsTotal: number;
};

export function buildSynxisCertificationPacket(input: SynxisCertificationPacketInput) {
  const payload = {
    schemaVersion: 1,
    provider: {
      id: "sabre-synxis",
      name: "Sabre SynXis Central Reservation System",
      category: "crs",
    },
    generatedAt: input.generatedAt,
    readiness: input.readiness,
    evidence: input.evidence,
    evidenceHistory: {
      total: input.evidenceHistoryTotal,
      included: input.evidenceHistory.length,
      truncated: input.evidenceHistoryTotal > input.evidenceHistory.length,
      events: input.evidenceHistory,
    },
    requestJournal: {
      total: input.requestReceiptsTotal,
      included: input.requestReceipts.length,
      truncated: input.requestReceiptsTotal > input.requestReceipts.length,
      receipts: input.requestReceipts,
    },
    privacy: {
      secretValuesIntentionallyIncluded: false,
      sourcePolicy: "Certification evidence fields must contain non-secret references only.",
      excluded: [
        "environment variable values",
        "usernames and passwords",
        "API keys and access tokens",
        "SOAP request and response bodies",
      ],
    },
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      checksum,
      covers: "UTF-8 compact JSON of this packet without the integrity field",
    },
  };
}
