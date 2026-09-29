import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION =
  "flight-consumer-live-duffel-offer-reference-encryption-v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const resultSchema = z.object({
  version: z.literal(
    FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION,
  ),
  ciphertext: z.string().max(4_096).regex(
    /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4073}$/,
  ),
  plaintextReferenceSha256: sha256Schema,
  keyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
  aadSha256: sha256Schema,
  ciphertextSha256: sha256Schema,
  recordHmacSha256: sha256Schema,
}).strict();

export type FlightConsumerLiveDuffelOfferReferenceEncryptionPort = Readonly<{
  version:
    typeof FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION;
  algorithm: "AES-256-GCM";
  ivBytes: 12;
  authTagBytes: 16;
  keyVersion: string;
  logsPlaintext: false;
  persistsPlaintext: false;
  decryptImplemented: false;
  encryptOfferReference: (input: Readonly<{
    plaintextReference: string;
    plaintextReferenceSha256: string;
    localOfferId: string;
    sourceId: string;
    sourceOfferEvidenceSha256: string;
    admissionReceiptSha256: string;
    subjectSha256: string;
    requestSha256: string;
    projectionSha256: string;
    offerExpiresAt: string;
    keyVersion: string;
  }>) => Promise<unknown>;
}>;

export class FlightConsumerLiveDuffelOfferReferenceEncryptionError
  extends Error {
  constructor() {
    super("The Production Duffel offer reference encryption result was refused.");
    this.name = "FlightConsumerLiveDuffelOfferReferenceEncryptionError";
  }
}

function equalSha256(left: string, right: string) {
  return sha256Schema.safeParse(left).success
    && sha256Schema.safeParse(right).success
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function requireFlightConsumerLiveDuffelOfferReferenceEncryptionPort(
  port: FlightConsumerLiveDuffelOfferReferenceEncryptionPort,
) {
  if (
    port === null
    || typeof port !== "object"
    || port.version
      !== FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION
    || port.algorithm !== "AES-256-GCM"
    || port.ivBytes !== 12
    || port.authTagBytes !== 16
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(port.keyVersion)
    || port.logsPlaintext !== false
    || port.persistsPlaintext !== false
    || port.decryptImplemented !== false
    || typeof port.encryptOfferReference !== "function"
  ) {
    throw new FlightConsumerLiveDuffelOfferReferenceEncryptionError();
  }
  return port;
}

export function acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(
  value: unknown,
  expected: Readonly<{
    plaintextReferenceSha256: string;
    keyVersion: string;
    admissionReceiptSha256: string;
    subjectSha256: string;
    requestSha256: string;
    localOfferId: string;
    sourceId: string;
    sourceOfferEvidenceSha256: string;
    projectionSha256: string;
    offerExpiresAt: string;
  }>,
) {
  const accepted = resultSchema.safeParse(value);
  const offerExpiryMicroseconds = new Date(expected.offerExpiresAt)
    .toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
  const expectedAadSha256 = createHash("sha256").update(
    "iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1\0"
      + [
        expected.admissionReceiptSha256,
        expected.subjectSha256,
        expected.requestSha256,
        expected.localOfferId,
        expected.sourceId,
        expected.sourceOfferEvidenceSha256,
        expected.projectionSha256,
        offerExpiryMicroseconds,
        expected.keyVersion,
      ].join(":"),
    "utf8",
  ).digest("hex");
  const expectedCiphertextSha256 = accepted.success
    ? createHash("sha256").update(
      "iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1\0"
        + accepted.data.ciphertext,
      "utf8",
    ).digest("hex")
    : "";
  if (
    !accepted.success
    || !equalSha256(
      accepted.data.plaintextReferenceSha256,
      expected.plaintextReferenceSha256,
    )
    || accepted.data.keyVersion !== expected.keyVersion
    || !equalSha256(accepted.data.aadSha256, expectedAadSha256)
    || !equalSha256(accepted.data.ciphertextSha256, expectedCiphertextSha256)
    || new Set([
      accepted.data.plaintextReferenceSha256,
      accepted.data.aadSha256,
      accepted.data.ciphertextSha256,
      accepted.data.recordHmacSha256,
    ]).size !== 4
  ) {
    throw new FlightConsumerLiveDuffelOfferReferenceEncryptionError();
  }
  return Object.freeze(accepted.data);
}
