import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FlightConsumerPiiIntegrityError,
  FlightConsumerPiiKeyringUnavailableError,
  createFlightConsumerPiiKeyring,
  createFlightConsumerPiiRecordRef,
  decryptFlightConsumerPii,
  encryptFlightConsumerPii,
  readFlightConsumerPreviewPiiKeyring,
  type FlightConsumerPiiContext,
  type FlightConsumerPiiEnvelope,
} from "../lib/flights/consumer-preview/pii-crypto.server";

const encryptionKey = Buffer.alloc(32, 11).toString("base64url");
const hmacKey = Buffer.alloc(32, 22).toString("base64url");
const keyring = createFlightConsumerPiiKeyring({
  keyVersion: "preview-v1",
  encryptionKeyBase64Url: encryptionKey,
  hmacKeyBase64Url: hmacKey,
});
const context = Object.freeze({
  customerId: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  securePiiRecordRef: `fp_${"R".repeat(32)}`,
  executionScopeSha256: "a".repeat(64),
}) satisfies FlightConsumerPiiContext;
const passenger = Object.freeze({
  title: "ms",
  gender: "f",
  givenName: "Synthetic",
  familyName: "Traveler",
  bornOn: "1990-01-01",
  email: "flight.preview.synthetic@example.test",
  phoneNumber: "+13125550123",
});

function flipBase64Url(value: string) {
  const bytes = Buffer.from(value, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

describe("Flight Consumer Preview PII cryptography", () => {
  it("round-trips one strict passenger without plaintext in the stored envelope", () => {
    const envelope = encryptFlightConsumerPii({ passenger, context, keyring });
    expect(decryptFlightConsumerPii({ envelope, context, keyring })).toEqual(passenger);
    expect(envelope).toMatchObject({
      version: "flight-consumer-pii-envelope-v1",
      algorithm: "aes-256-gcm",
      keyVersion: "preview-v1",
      aadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      piiHmacSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const stored = JSON.stringify(envelope);
    for (const plaintext of [
      passenger.givenName,
      passenger.familyName,
      passenger.bornOn,
      passenger.email,
      passenger.phoneNumber,
    ]) {
      expect(stored).not.toContain(plaintext);
    }
    expect(stored).not.toContain(context.customerId);
    expect(stored).not.toContain(context.orderId);
  });

  it("uses a fresh IV while keeping the keyed record digest stable for exact bound input", () => {
    const first = encryptFlightConsumerPii({ passenger, context, keyring });
    const second = encryptFlightConsumerPii({ passenger, context, keyring });
    expect(first.ivBase64Url).not.toBe(second.ivBase64Url);
    expect(first.ciphertextBase64Url).not.toBe(second.ciphertextBase64Url);
    expect(first.piiHmacSha256).toBe(second.piiHmacSha256);
    expect(first.aadSha256).toBe(second.aadSha256);
  });

  it("rejects ciphertext, tag, digest, metadata, and AAD tampering with one generic error", () => {
    const envelope = encryptFlightConsumerPii({ passenger, context, keyring });
    const tampered: FlightConsumerPiiEnvelope[] = [
      { ...envelope, ciphertextBase64Url: flipBase64Url(envelope.ciphertextBase64Url) },
      { ...envelope, authTagBase64Url: flipBase64Url(envelope.authTagBase64Url) },
      { ...envelope, piiHmacSha256: "f".repeat(64) },
      { ...envelope, aadSha256: "e".repeat(64) },
      { ...envelope, keyVersion: "preview-v2" },
    ];
    for (const candidate of tampered) {
      expect(() => decryptFlightConsumerPii({ envelope: candidate, context, keyring }))
        .toThrow(FlightConsumerPiiIntegrityError);
    }
    expect(() => decryptFlightConsumerPii({
      envelope,
      context: { ...context, orderId: "33333333-3333-4333-8333-333333333333" },
      keyring,
    })).toThrow(FlightConsumerPiiIntegrityError);
  });

  it("rejects the wrong encryption key and the wrong HMAC key", () => {
    const envelope = encryptFlightConsumerPii({ passenger, context, keyring });
    const wrongEncryption = createFlightConsumerPiiKeyring({
      keyVersion: "preview-v1",
      encryptionKeyBase64Url: Buffer.alloc(32, 33).toString("base64url"),
      hmacKeyBase64Url: hmacKey,
    });
    const wrongHmac = createFlightConsumerPiiKeyring({
      keyVersion: "preview-v1",
      encryptionKeyBase64Url: encryptionKey,
      hmacKeyBase64Url: Buffer.alloc(32, 44).toString("base64url"),
    });
    expect(() => decryptFlightConsumerPii({ envelope, context, keyring: wrongEncryption }))
      .toThrow(FlightConsumerPiiIntegrityError);
    expect(() => decryptFlightConsumerPii({ envelope, context, keyring: wrongHmac }))
      .toThrow(FlightConsumerPiiIntegrityError);
  });

  it("rejects unknown passenger fields before encryption", () => {
    expect(() => encryptFlightConsumerPii({
      passenger: { ...passenger, passportNumber: "must-never-enter-this-record" },
      context,
      keyring,
    })).toThrow();
  });

  it("loads distinct 256-bit keys only inside the explicitly enabled Preview environment", () => {
    const env = {
      VERCEL_ENV: "preview",
      FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
      FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION: "preview-v1",
      FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: encryptionKey,
      FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: hmacKey,
    };
    expect(readFlightConsumerPreviewPiiKeyring(env)).toMatchObject({
      version: "flight-consumer-pii-keyring-v1",
      keyVersion: "preview-v1",
    });
    for (const invalid of [
      { ...env, VERCEL_ENV: "production" },
      { ...env, FLIGHT_CONSUMER_PREVIEW_ENABLED: "false" },
      { ...env, FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: "short" },
      { ...env, FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: encryptionKey },
    ]) {
      expect(() => readFlightConsumerPreviewPiiKeyring(invalid))
        .toThrow(FlightConsumerPiiKeyringUnavailableError);
    }
  });

  it("generates opaque DB-compatible record references", () => {
    const first = createFlightConsumerPiiRecordRef();
    const second = createFlightConsumerPiiRecordRef();
    expect(first).toMatch(/^fp_[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^fp_[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });
});
