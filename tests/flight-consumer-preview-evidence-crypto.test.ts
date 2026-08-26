import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  FlightConsumerOfferEvidenceIntegrityError,
  createFlightConsumerOfferEvidenceKeyring,
  decryptFlightConsumerOrderRecoveryEvidence,
  decryptFlightConsumerOrderResponseEvidence,
  decryptFlightConsumerOfferEvidence,
  encryptFlightConsumerOrderRecoveryEvidence,
  encryptFlightConsumerOrderResponseEvidence,
  encryptFlightConsumerOfferEvidence,
  type FlightConsumerOfferEvidenceContext,
} from "../lib/flights/consumer-preview/evidence-crypto.server";

const keyring = createFlightConsumerOfferEvidenceKeyring({
  keyVersion: "preview-evidence-v1",
  encryptionKeyBase64Url: Buffer.alloc(32, 31).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 47).toString("base64url"),
});

describe("Flight Consumer Preview encrypted order-response evidence", () => {
  const responseContext = Object.freeze({
    customerId: context.customerId,
    orderId: "33333333-3333-4333-8333-333333333333",
    attemptId: "44444444-4444-4444-8444-444444444444",
    executionScopeSha256: context.executionScopeSha256,
  });
  const response = Buffer.from('{"data":{"id":"ord_test_recovery"}}', "utf8");
  const providerResponseSha256 = createHash("sha256").update(response).digest("hex");

  it("round-trips a bound raw provider response and rejects tampering", () => {
    const envelope = encryptFlightConsumerOrderResponseEvidence({
      rawBody: response,
      providerResponseSha256,
      context: responseContext,
      keyring,
    });
    const recovered = decryptFlightConsumerOrderResponseEvidence({
      envelope,
      providerResponseSha256,
      context: responseContext,
      keyring,
    });
    expect(recovered.equals(response)).toBe(true);
    recovered.fill(0);
    expect(() => decryptFlightConsumerOrderResponseEvidence({
      envelope: { ...envelope, ciphertextBase64Url: flip(envelope.ciphertextBase64Url) },
      providerResponseSha256,
      context: responseContext,
      keyring,
    })).toThrow(FlightConsumerOfferEvidenceIntegrityError);
  });
});
const context = Object.freeze({
  customerId: "11111111-1111-4111-8111-111111111111",
  searchId: "22222222-2222-4222-8222-222222222222",
  localOfferId: "offer_preview_00000001",
  executionScopeSha256: "a".repeat(64),
  stage: "initial",
  predecessorReceiptDigest: null,
}) satisfies FlightConsumerOfferEvidenceContext;
const recordDigest = "b".repeat(64);
const record = Object.freeze({
  version: "duffel-durable-offer-evidence-record-v1",
  providerOfferId: "off_TEST_ONLY_NOT_FOR_LOGGING",
  rawBodyBase64: Buffer.from('{"test":"provider evidence"}', "utf8").toString("base64"),
  recordDigest,
});

function flip(value: string) {
  const bytes = Buffer.from(value, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

describe("Flight Consumer Preview encrypted offer evidence", () => {
  it("round-trips exact synthetic evidence without plaintext in the envelope", () => {
    const envelope = encryptFlightConsumerOfferEvidence({ record, recordDigest, context, keyring });
    expect(decryptFlightConsumerOfferEvidence({ envelope, recordDigest, context, keyring })).toEqual(record);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(record.providerOfferId);
    expect(serialized).not.toContain(record.rawBodyBase64);
    expect(envelope.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses random IVs but one stable authenticated receipt for exact evidence", () => {
    const first = encryptFlightConsumerOfferEvidence({ record, recordDigest, context, keyring });
    const second = encryptFlightConsumerOfferEvidence({ record, recordDigest, context, keyring });
    expect(first.ivBase64Url).not.toBe(second.ivBase64Url);
    expect(first.ciphertextBase64Url).not.toBe(second.ciphertextBase64Url);
    expect(first.receiptSha256).toBe(second.receiptSha256);
    expect(first.recordHmacSha256).toBe(second.recordHmacSha256);
  });

  it("rejects ciphertext, context, digest, and receipt tampering", () => {
    const envelope = encryptFlightConsumerOfferEvidence({ record, recordDigest, context, keyring });
    const cases = [
      { envelope: { ...envelope, ciphertextBase64Url: flip(envelope.ciphertextBase64Url) }, recordDigest, context },
      { envelope, recordDigest: "c".repeat(64), context },
      { envelope, recordDigest, context: { ...context, searchId: "33333333-3333-4333-8333-333333333333" } },
      { envelope: { ...envelope, receiptSha256: "d".repeat(64) }, recordDigest, context },
    ];
    for (const item of cases) {
      expect(() => decryptFlightConsumerOfferEvidence({ ...item, keyring })).toThrow(FlightConsumerOfferEvidenceIntegrityError);
    }
  });
});

describe("Flight Consumer Preview encrypted async order-recovery evidence", () => {
  const recoveryContext = Object.freeze({
    customerId: context.customerId,
    orderId: "33333333-3333-4333-8333-333333333333",
    attemptId: "44444444-4444-4444-8444-444444444444",
    ledgerId: "55555555-5555-4555-8555-555555555555",
    executionScopeSha256: context.executionScopeSha256,
    recoveryRequestSha256: "c".repeat(64),
    recoveryAuthorityReceiptSha256: "d".repeat(64),
  });
  const response = Buffer.from('{"data":{"id":"ord_test_async_recovery"}}', "utf8");
  const providerResponseSha256 = createHash("sha256").update(response).digest("hex");

  it("round-trips only under its exact webhook-ledger recovery authority", () => {
    const envelope = encryptFlightConsumerOrderRecoveryEvidence({
      rawBody: response,
      providerResponseSha256,
      context: recoveryContext,
      keyring,
    });
    const recovered = decryptFlightConsumerOrderRecoveryEvidence({
      envelope,
      providerResponseSha256,
      context: recoveryContext,
      keyring,
    });
    expect(recovered.equals(response)).toBe(true);
    recovered.fill(0);
    expect(() => decryptFlightConsumerOrderRecoveryEvidence({
      envelope,
      providerResponseSha256,
      context: {
        ...recoveryContext,
        ledgerId: "66666666-6666-4666-8666-666666666666",
      },
      keyring,
    })).toThrow(FlightConsumerOfferEvidenceIntegrityError);
    expect(() => decryptFlightConsumerOrderResponseEvidence({
      envelope,
      providerResponseSha256,
      context: {
        customerId: recoveryContext.customerId,
        orderId: recoveryContext.orderId,
        attemptId: recoveryContext.attemptId,
        executionScopeSha256: recoveryContext.executionScopeSha256,
      },
      keyring,
    })).toThrow(FlightConsumerOfferEvidenceIntegrityError);
  });
});
