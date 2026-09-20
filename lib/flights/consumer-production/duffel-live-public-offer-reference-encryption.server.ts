import "server-only";

import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  type BinaryLike,
} from "node:crypto";

import { canonicalFlightJson } from "../runtime-safety";
import {
  FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION,
  type FlightConsumerLiveDuffelOfferReferenceEncryptionPort,
} from "./public-offer-reference-encryption-port.server";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED =
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY =
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY_BASE64URL" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY =
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY_BASE64URL" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION =
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION" as const;

const aadDomain =
  "iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1";
const ciphertextDomain =
  "iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1";
const hmacDomain =
  "iratepilot:flight-consumer-production:duffel-offer-reference-record-hmac:v1";
const canonicalBase64Url = /^[A-Za-z0-9_-]+$/;

export class FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError
  extends Error {
  constructor() {
    super("Production Duffel offer-reference encryption is unavailable.");
    this.name =
      "FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError";
  }
}

function decodeKey(value: string | undefined) {
  if (value === undefined || !canonicalBase64Url.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) return null;
  return decoded;
}

function digest(value: BinaryLike) {
  return createHash("sha256").update(value).digest("hex");
}

function expiryMicroseconds(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error();
  return parsed.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

export function createFlightConsumerProductionDuffelOfferReferenceEncryption(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Readonly<{ randomIv?: () => Buffer }> = {},
): FlightConsumerLiveDuffelOfferReferenceEncryptionPort {
  try {
    if (env[FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED]
      !== "true") throw new Error();
    const encryptionKey = decodeKey(
      env[FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY],
    );
    const hmacKey = decodeKey(
      env[FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY],
    );
    const keyVersion =
      env[FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION];
    if (encryptionKey === null || hmacKey === null
      || encryptionKey.equals(hmacKey)
      || keyVersion === undefined
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(keyVersion)) throw new Error();
    const randomIv = dependencies.randomIv ?? (() => randomBytes(12));
    return Object.freeze({
      version: FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION,
      algorithm: "AES-256-GCM" as const,
      ivBytes: 12 as const,
      authTagBytes: 16 as const,
      keyVersion,
      logsPlaintext: false as const,
      persistsPlaintext: false as const,
      decryptImplemented: false as const,
      async encryptOfferReference(input) {
        try {
          if (input.keyVersion !== keyVersion
            || !/^off_[A-Za-z0-9]{8,252}$/.test(input.plaintextReference)
            || digest(
              "iratepilot:flight-consumer-production:duffel-live:offer-id:v1\0"
                + input.plaintextReference,
            ) !== input.plaintextReferenceSha256) {
            throw new Error();
          }
          const aad = Buffer.from(`${aadDomain}\0${[
            input.admissionReceiptSha256,
            input.subjectSha256,
            input.requestSha256,
            input.localOfferId,
            input.sourceId,
            input.sourceOfferEvidenceSha256,
            input.projectionSha256,
            expiryMicroseconds(input.offerExpiresAt),
            keyVersion,
          ].join(":")}`, "utf8");
          const iv = randomIv();
          if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error();
          const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv, {
            authTagLength: 16,
          });
          cipher.setAAD(aad);
          const encrypted = Buffer.concat([
            cipher.update(input.plaintextReference, "utf8"),
            cipher.final(),
          ]);
          const tag = cipher.getAuthTag();
          const payload = canonicalFlightJson({
            algorithm: "A256GCM",
            authTagBase64Url: tag.toString("base64url"),
            ciphertextBase64Url: encrypted.toString("base64url"),
            ivBase64Url: iv.toString("base64url"),
            keyVersion,
            version: 1,
          });
          const ciphertext = `enc:v1:${Buffer.from(payload, "utf8").toString("base64url")}`;
          const recordHmacSha256 = createHmac("sha256", hmacKey)
            .update(hmacDomain, "utf8").update("\0", "utf8")
            .update(ciphertext, "utf8").update("\0", "utf8")
            .update(aad).update("\0", "utf8")
            .update(input.plaintextReference, "utf8").update("\0", "utf8")
            .update(keyVersion, "utf8").digest("hex");
          return Object.freeze({
            version: FLIGHT_CONSUMER_LIVE_DUFFEL_OFFER_REFERENCE_ENCRYPTION_VERSION,
            ciphertext,
            plaintextReferenceSha256: input.plaintextReferenceSha256,
            keyVersion,
            aadSha256: digest(aad),
            ciphertextSha256: digest(`${ciphertextDomain}\0${ciphertext}`),
            recordHmacSha256,
          });
        } catch {
          throw new FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError();
        }
      },
    });
  } catch {
    throw new FlightConsumerProductionPublicOfferReferenceEncryptionUnavailableError();
  }
}
