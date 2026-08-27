import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDuffelOfferReferenceEncryption,
  FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError,
} from "../lib/flights/consumer-production/duffel-live-public-offer-reference-encryption.server";
import {
  acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult,
} from "../lib/flights/consumer-production/public-offer-reference-encryption-port.server";
import {
  deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256,
  projectFlightConsumerProductionDuffelPublicOffers,
} from "../lib/flights/consumer-production/duffel-live-public-offer-projection.server";

const encryptionKey = Buffer.alloc(32, 1).toString("base64url");
const hmacKey = Buffer.alloc(32, 2).toString("base64url");
const env = {
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY_BASE64URL:
    encryptionKey,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY_BASE64URL: hmacKey,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION: "kms-v1",
};
const input = {
  plaintextReference: "off_12345678",
  plaintextReferenceSha256: createHash("sha256").update(
    "iratepilot:flight-consumer-production:duffel-live:offer-id:v1\0off_12345678",
  ).digest("hex"),
  admissionReceiptSha256: "a".repeat(64), subjectSha256: "b".repeat(64),
  requestSha256: "c".repeat(64),
  localOfferId: "00000000-0000-4000-8000-000000000001",
  sourceId: "00000000-0000-4000-8000-000000000002",
  sourceOfferEvidenceSha256: "d".repeat(64), projectionSha256: "e".repeat(64),
  offerExpiresAt: "2026-08-27T13:00:00.123Z", keyVersion: "kms-v1",
};

describe("Production Duffel offer-reference encryption adapter", () => {
  it("matches a deterministic AES-256-GCM and HMAC-SHA256 vector", async () => {
    const adapter = createFlightConsumerProductionDuffelOfferReferenceEncryption(
      env,
      { randomIv: () => Buffer.from([...Array(12).keys()]) },
    );
    const result = await adapter.encryptOfferReference(input);
    expect(result).toEqual({
      version: "flight-consumer-live-duffel-offer-reference-encryption-v1",
      ciphertext: "enc:v1:eyJhbGdvcml0aG0iOiJBMjU2R0NNIiwiYXV0aFRhZ0Jhc2U2NFVybCI6IjA5QkxFLWF0Szl1cjFBRzdzVjFFNmciLCJjaXBoZXJ0ZXh0QmFzZTY0VXJsIjoiMU1EemVSSE1OVTNMWE5EOCIsIml2QmFzZTY0VXJsIjoiQUFFQ0F3UUZCZ2NJQ1FvTCIsImtleVZlcnNpb24iOiJrbXMtdjEiLCJ2ZXJzaW9uIjoxfQ",
      plaintextReferenceSha256: input.plaintextReferenceSha256,
      keyVersion: "kms-v1",
      aadSha256: "50af597cd4b94f25f99fa171d67592c28ad0a0452e6927ac7ef4307b38ddb80b",
      ciphertextSha256: "5a8b41e0872a6869e7887dc79b2cabb9c2aada65ad5118c8114871d43676f618",
      recordHmacSha256: "8c8d662c66f74968d220739462e53fab3e9d65c9692d984d875d8929e00af8eb",
    });
    expect(acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(
      result,
      { ...input, keyVersion: "kms-v1" },
    )).toEqual(result);
    const payload = JSON.parse(Buffer.from(
      (result as { ciphertext: string }).ciphertext.split(":")[2]!,
      "base64url",
    ).toString("utf8"));
    expect(Object.keys(payload)).toEqual([
      "algorithm", "authTagBase64Url", "ciphertextBase64Url", "ivBase64Url",
      "keyVersion", "version",
    ]);
  });

  it("is default-off and rejects malformed, equal, or non-canonical key material", () => {
    for (const invalid of [
      {},
      { ...env, FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED: "false" },
      { ...env, FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY_BASE64URL: "not+base64" },
      { ...env, FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY_BASE64URL: encryptionKey },
      { ...env, FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION: "bad key" },
    ]) expect(() => createFlightConsumerProductionDuffelOfferReferenceEncryption(invalid))
      .toThrow(FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError);
  });

  it("rejects a wrong fixed IV size and plaintext digest without leaking plaintext", async () => {
    const badIv = createFlightConsumerProductionDuffelOfferReferenceEncryption(
      env, { randomIv: () => Buffer.alloc(11) },
    );
    await expect(badIv.encryptOfferReference(input)).rejects.toThrow(
      "Production Duffel offer-reference encryption is unavailable.",
    );
    const adapter = createFlightConsumerProductionDuffelOfferReferenceEncryption(env);
    await expect(adapter.encryptOfferReference({
      ...input, plaintextReferenceSha256: "f".repeat(64),
    })).rejects.toThrow("Production Duffel offer-reference encryption is unavailable.");
  });

  it("integrates with the Gate 116 projector using the domain-separated Gate 105 ID", async () => {
    const search = { adults: 1, cabin: "economy" as const,
      departureDate: "2026-09-10", destination: "LHR", origin: "ORD",
      returnDate: null };
    const binding = {
      admissionExecutionScopeSha256: "1".repeat(64), policySha256: "2".repeat(64),
      admissionPolicySha256: "3".repeat(64), cohortSha256: "4".repeat(64),
      subjectSha256: "5".repeat(64),
    };
    const requestSha256 =
      deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256({
        executionScopeSha256: binding.admissionExecutionScopeSha256,
        policySha256: binding.policySha256,
        admissionPolicySha256: binding.admissionPolicySha256,
        cohortSha256: binding.cohortSha256,
        subjectSha256: binding.subjectSha256,
        search,
      });
    const raw = new TextEncoder().encode(JSON.stringify({ data: {
      id: "orq_12345678", live_mode: true, offers: [{
        id: "off_12345678", live_mode: true, partial: false,
        total_amount: "120.00", total_currency: "USD",
        base_amount: "100.00", base_currency: "USD",
        tax_amount: "20.00", tax_currency: "USD",
        expires_at: "2026-08-27T14:00:00.000Z",
        passenger_identity_documents_required: false,
        payment_requirements: { requires_instant_payment: true },
        owner: { name: "Example Air", iata_code: "EA" },
        passengers: [{ type: "adult" }],
        conditions: {
          change_before_departure: { allowed: true, penalty_amount: "50.00",
            penalty_currency: "USD" },
          refund_before_departure: { allowed: true, penalty_amount: "70.00",
            penalty_currency: "USD" },
        },
        slices: [{ origin: { iata_code: "ORD" },
          destination: { iata_code: "LHR" }, segments: [{
            marketing_carrier: { name: "Example Air", iata_code: "EA" },
            operating_carrier: { name: "Example Air", iata_code: "EA" },
            marketing_carrier_flight_number: "123",
            origin: { iata_code: "ORD", time_zone: "America/Chicago" },
            destination: { iata_code: "LHR", time_zone: "Europe/London" },
            departing_at: "2026-09-10T10:00:00",
            arriving_at: "2026-09-10T22:00:00", duration: "PT08H00M",
            passengers: [{ cabin_class: "economy" }],
          }] }],
      }] }, meta: {} }));
    const adapter = createFlightConsumerProductionDuffelOfferReferenceEncryption(
      env, { randomIv: () => Buffer.from([...Array(12).keys()]) },
    );
    const result = await projectFlightConsumerProductionDuffelPublicOffers({
      admissionId: "00000000-0000-4000-8000-000000000001", ...binding,
      idempotencySha256: "6".repeat(64), requestSha256,
      admissionReceiptSha256: "7".repeat(64),
      sourceShoppingAttemptId: "00000000-0000-4000-8000-000000000002",
      sourceShoppingExecutionScopeSha256: "8".repeat(64),
      sourceResponseSha256: createHash("sha256").update(raw).digest("hex"),
      search, rawBody: raw, observedAt: "2026-08-27T12:00:00.000Z",
      sources: [{ sourceId: "00000000-0000-4000-8000-000000000003",
        offerIdSha256: input.plaintextReferenceSha256,
        sourceOfferEvidenceSha256: "9".repeat(64),
        expiresAt: "2026-08-27T14:00:00.000Z" }],
      encryption: adapter,
      newLocalOfferId: () => "00000000-0000-4000-8000-000000000004",
    });
    expect(result.projected).toHaveLength(1);
    expect(result.projected[0]?.encryptedReference.ciphertext)
      .toMatch(/^enc:v1:[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(result.safeBatch)).not.toContain("off_12345678");

    const mixedPayload = JSON.parse(new TextDecoder().decode(raw));
    const validOffer = mixedPayload.data.offers[0];
    mixedPayload.data.offers = [
      { ...validOffer, conditions: {
        ...validOffer.conditions, change_before_departure: null,
      } },
      { ...validOffer, id: "off_87654321" },
    ];
    const mixedRaw = new TextEncoder().encode(JSON.stringify(mixedPayload));
    const mixed = await projectFlightConsumerProductionDuffelPublicOffers({
      admissionId: "00000000-0000-4000-8000-000000000001", ...binding,
      idempotencySha256: "6".repeat(64), requestSha256,
      admissionReceiptSha256: "7".repeat(64),
      sourceShoppingAttemptId: "00000000-0000-4000-8000-000000000002",
      sourceShoppingExecutionScopeSha256: "8".repeat(64),
      sourceResponseSha256: createHash("sha256").update(mixedRaw).digest("hex"),
      search, rawBody: mixedRaw, observedAt: "2026-08-27T12:00:00.000Z",
      sources: ["off_12345678", "off_87654321"].map((id, index) => ({
        sourceId: `00000000-0000-4000-8000-00000000000${index + 3}`,
        offerIdSha256: createHash("sha256").update(
          `iratepilot:flight-consumer-production:duffel-live:offer-id:v1\0${id}`,
        ).digest("hex"),
        sourceOfferEvidenceSha256: index === 0 ? "9".repeat(64) : "a".repeat(64),
        expiresAt: "2026-08-27T14:00:00.000Z",
      })),
      encryption: adapter,
      newLocalOfferId: () => "00000000-0000-4000-8000-000000000004",
    });
    expect(mixed.projected).toHaveLength(1);
    expect(mixed.refused).toEqual([expect.objectContaining({
      refusalCode: "unsupported_contract",
    })]);
  });
});
