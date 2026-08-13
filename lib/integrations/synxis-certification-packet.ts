import { createHash, timingSafeEqual } from "node:crypto";
import type { SynxisReadiness } from "../../services/hotel-suppliers/synxis";

export type SynxisCertificationPacketInput = {
  generatedAt: string;
  issuanceReceiptId?: string;
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
    ...(input.issuanceReceiptId ? { issuance: { receiptId: input.issuanceReceiptId } } : {}),
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

export type SynxisCertificationPacketVerification = {
  valid: boolean;
  reason: "verified" | "invalid_packet" | "unsupported_schema" | "checksum_mismatch";
  schemaVersion: number | null;
  generatedAt: string | null;
  checksum: string | null;
  issuanceReceiptId: string | null;
};

function invalidPacket(): SynxisCertificationPacketVerification {
  return {
    valid: false,
    reason: "invalid_packet",
    schemaVersion: null,
    generatedAt: null,
    checksum: null,
    issuanceReceiptId: null,
  };
}

export function verifySynxisCertificationPacket(
  value: unknown,
): SynxisCertificationPacketVerification {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidPacket();

  const packet = value as Record<string, unknown>;
  const integrity = packet.integrity;
  if (!integrity || typeof integrity !== "object" || Array.isArray(integrity)) {
    return invalidPacket();
  }

  const integrityRecord = integrity as Record<string, unknown>;
  const checksum = integrityRecord.checksum;
  const schemaVersion = packet.schemaVersion;
  const generatedAt = packet.generatedAt;
  const provider = packet.provider;
  const issuance = packet.issuance;
  const issuanceReceiptId = issuance === undefined
    ? null
    : issuance && typeof issuance === "object" && !Array.isArray(issuance)
      ? (issuance as Record<string, unknown>).receiptId
      : undefined;
  if (
    integrityRecord.algorithm !== "sha256"
    || typeof checksum !== "string"
    || !/^[a-f0-9]{64}$/.test(checksum)
    || typeof schemaVersion !== "number"
    || typeof generatedAt !== "string"
    || !provider
    || typeof provider !== "object"
    || Array.isArray(provider)
    || (provider as Record<string, unknown>).id !== "sabre-synxis"
    || (issuanceReceiptId !== null
      && (typeof issuanceReceiptId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(issuanceReceiptId)))
  ) return invalidPacket();

  if (schemaVersion !== 1) {
    return {
      valid: false,
      reason: "unsupported_schema",
      schemaVersion,
      generatedAt,
      checksum,
      issuanceReceiptId: typeof issuanceReceiptId === "string" ? issuanceReceiptId : null,
    };
  }

  const { integrity: _integrity, ...payload } = packet;
  void _integrity;
  const expected = createHash("sha256").update(JSON.stringify(payload), "utf8").digest();
  const actual = Buffer.from(checksum, "hex");
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  return {
    valid,
    reason: valid ? "verified" : "checksum_mismatch",
    schemaVersion,
    generatedAt,
    checksum,
    issuanceReceiptId: typeof issuanceReceiptId === "string" ? issuanceReceiptId : null,
  };
}
