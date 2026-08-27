import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult,
} from "../lib/flights/consumer-production/public-offer-reference-encryption-port.server";

const digest = (character: string) => character.repeat(64);
const expected = {
  plaintextReferenceSha256: digest("1"), keyVersion: "kms-v7",
  admissionReceiptSha256: digest("2"), subjectSha256: digest("3"),
  requestSha256: digest("4"), localOfferId: "00000000-0000-4000-8000-000000000001",
  sourceId: "00000000-0000-4000-8000-000000000002",
  sourceOfferEvidenceSha256: digest("5"), projectionSha256: digest("6"),
  offerExpiresAt: "2026-08-27T13:00:00.123Z",
};
const ciphertext = "enc:v7:abcdefghijklmnop";
const aad = createHash("sha256").update(
  "iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1\0"
  + [expected.admissionReceiptSha256, expected.subjectSha256,
    expected.requestSha256, expected.localOfferId, expected.sourceId,
    expected.sourceOfferEvidenceSha256, expected.projectionSha256,
    "2026-08-27T13:00:00.123000Z", expected.keyVersion].join(":"),
).digest("hex");
const ciphertextSha = createHash("sha256").update(
  "iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1\0"
  + ciphertext,
).digest("hex");

describe("Duffel offer-reference encryption boundary", () => {
  it("locally verifies key version, AAD, ciphertext hash, and domain separation", () => {
    const value = {
      version: "flight-consumer-live-duffel-offer-reference-encryption-v1",
      ciphertext, plaintextReferenceSha256: expected.plaintextReferenceSha256,
      keyVersion: expected.keyVersion, aadSha256: aad,
      ciphertextSha256: ciphertextSha, recordHmacSha256: digest("f"),
    };
    expect(acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(value, expected))
      .toMatchObject(value);
    expect(() => acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(
      { ...value, keyVersion: "kms-v8" }, expected,
    )).toThrow();
    expect(() => acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(
      { ...value, aadSha256: digest("e") }, expected,
    )).toThrow();
  });
});
