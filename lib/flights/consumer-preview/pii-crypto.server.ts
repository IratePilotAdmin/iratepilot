import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

import {
  flightConsumerPreviewPassengerSchema,
  type FlightConsumerPreviewPassenger,
} from "./schemas";

export const FLIGHT_CONSUMER_PII_ENVELOPE_VERSION = "flight-consumer-pii-envelope-v1" as const;
export const FLIGHT_CONSUMER_PII_PAYLOAD_VERSION = "flight-consumer-passenger-v1" as const;
export const FLIGHT_CONSUMER_PII_AAD_VERSION = "flight-consumer-pii-aad-v1" as const;
export const FLIGHT_CONSUMER_PII_MAX_PLAINTEXT_BYTES = 4_096 as const;

const algorithm = "aes-256-gcm" as const;
const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const securePiiRecordRefSchema = z.string().regex(/^fp_[A-Za-z0-9_-]{16,200}$/);
const canonicalBase64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

const flightConsumerPiiContextSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  securePiiRecordRef: securePiiRecordRefSchema,
  executionScopeSha256: sha256Schema,
}).strict();

export type FlightConsumerPiiContext = z.infer<typeof flightConsumerPiiContextSchema>;

export const flightConsumerPiiEnvelopeSchema = z.object({
  version: z.literal(FLIGHT_CONSUMER_PII_ENVELOPE_VERSION),
  algorithm: z.literal(algorithm),
  keyVersion: keyVersionSchema,
  ivBase64Url: canonicalBase64UrlSchema.max(32),
  ciphertextBase64Url: canonicalBase64UrlSchema.max(6_000),
  authTagBase64Url: canonicalBase64UrlSchema.max(32),
  aadSha256: sha256Schema,
  piiHmacSha256: sha256Schema,
}).strict();

export type FlightConsumerPiiEnvelope = z.infer<typeof flightConsumerPiiEnvelopeSchema>;

const encryptedPayloadSchema = z.object({
  version: z.literal(FLIGHT_CONSUMER_PII_PAYLOAD_VERSION),
  passenger: flightConsumerPreviewPassengerSchema,
}).strict();

const keyringBrand = Symbol("flight-consumer-preview-pii-keyring");

export type FlightConsumerPiiKeyring = Readonly<{
  version: "flight-consumer-pii-keyring-v1";
  keyVersion: string;
  [keyringBrand]: true;
}>;

type KeyMaterial = Readonly<{
  encryptionKey: Buffer;
  hmacKey: Buffer;
}>;

const keyMaterialByKeyring = new WeakMap<FlightConsumerPiiKeyring, KeyMaterial>();

export class FlightConsumerPiiKeyringUnavailableError extends Error {
  constructor() {
    super("Flight Consumer Preview PII keyring is unavailable.");
    this.name = "FlightConsumerPiiKeyringUnavailableError";
  }
}

export class FlightConsumerPiiIntegrityError extends Error {
  constructor() {
    super("Flight Consumer Preview PII envelope failed integrity verification.");
    this.name = "FlightConsumerPiiIntegrityError";
  }
}

type FlightConsumerPreviewPiiEnvironment = Readonly<Record<string, string | undefined>>;

function decodeCanonicalBase64Url(value: unknown, expectedBytes?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length === 0 || decoded.toString("base64url") !== value) return null;
    if (expectedBytes !== undefined && decoded.length !== expectedBytes) return null;
    return decoded;
  } catch {
    return null;
  }
}

function equalHexDigest(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function requireKeyMaterial(keyring: FlightConsumerPiiKeyring) {
  const material = keyMaterialByKeyring.get(keyring);
  if (!material) throw new FlightConsumerPiiKeyringUnavailableError();
  return material;
}

export function createFlightConsumerPiiKeyring(input: Readonly<{
  keyVersion: string;
  encryptionKeyBase64Url: string;
  hmacKeyBase64Url: string;
}>): FlightConsumerPiiKeyring {
  const parsedVersion = keyVersionSchema.safeParse(input.keyVersion);
  const encryptionKey = decodeCanonicalBase64Url(input.encryptionKeyBase64Url, 32);
  const hmacKey = decodeCanonicalBase64Url(input.hmacKeyBase64Url, 32);
  if (
    !parsedVersion.success
    || encryptionKey === null
    || hmacKey === null
    || timingSafeEqual(encryptionKey, hmacKey)
  ) {
    encryptionKey?.fill(0);
    hmacKey?.fill(0);
    throw new FlightConsumerPiiKeyringUnavailableError();
  }

  const keyring = Object.freeze({
    version: "flight-consumer-pii-keyring-v1" as const,
    keyVersion: parsedVersion.data,
    [keyringBrand]: true as const,
  });
  keyMaterialByKeyring.set(keyring, { encryptionKey, hmacKey });
  return keyring;
}

/** Reads only Preview-scoped key material and never exposes it on the keyring handle. */
export function readFlightConsumerPreviewPiiKeyring(
  env: FlightConsumerPreviewPiiEnvironment = process.env,
): FlightConsumerPiiKeyring {
  if (env.VERCEL_ENV !== "preview" || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true") {
    throw new FlightConsumerPiiKeyringUnavailableError();
  }
  return createFlightConsumerPiiKeyring({
    keyVersion: env.FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION ?? "",
    encryptionKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL ?? "",
    hmacKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL ?? "",
  });
}

export function createFlightConsumerPiiRecordRef() {
  return `fp_${randomBytes(24).toString("base64url")}`;
}

function serializeAssociatedData(context: FlightConsumerPiiContext) {
  const parsed = flightConsumerPiiContextSchema.parse(context);
  return Buffer.from(JSON.stringify({
    version: FLIGHT_CONSUMER_PII_AAD_VERSION,
    environment: "preview",
    schemaVersion: FLIGHT_CONSUMER_PII_PAYLOAD_VERSION,
    customerId: parsed.customerId,
    orderId: parsed.orderId,
    securePiiRecordRef: parsed.securePiiRecordRef,
    executionScopeSha256: parsed.executionScopeSha256,
  }), "utf8");
}

function serializePassenger(passenger: unknown) {
  const parsed = flightConsumerPreviewPassengerSchema.parse(passenger);
  const payload = {
    version: FLIGHT_CONSUMER_PII_PAYLOAD_VERSION,
    passenger: {
      title: parsed.title,
      gender: parsed.gender,
      givenName: parsed.givenName,
      familyName: parsed.familyName,
      bornOn: parsed.bornOn,
      email: parsed.email,
      phoneNumber: parsed.phoneNumber,
    },
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8");
  if (encoded.length === 0 || encoded.length > FLIGHT_CONSUMER_PII_MAX_PLAINTEXT_BYTES) {
    encoded.fill(0);
    throw new Error("Flight Consumer Preview passenger payload exceeds the encrypted record limit.");
  }
  return encoded;
}

function hmacPassenger(material: KeyMaterial, associatedData: Buffer, plaintext: Buffer) {
  return createHmac("sha256", material.hmacKey)
    .update("flight-consumer-pii-record-v1")
    .update("\0")
    .update(associatedData)
    .update("\0")
    .update(plaintext)
    .digest("hex");
}

export function encryptFlightConsumerPii(input: Readonly<{
  passenger: unknown;
  context: FlightConsumerPiiContext;
  keyring: FlightConsumerPiiKeyring;
}>): FlightConsumerPiiEnvelope {
  const material = requireKeyMaterial(input.keyring);
  const associatedData = serializeAssociatedData(input.context);
  const plaintext = serializePassenger(input.passenger);
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv(algorithm, material.encryptionKey, iv, { authTagLength: 16 });
    cipher.setAAD(associatedData, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const envelope = flightConsumerPiiEnvelopeSchema.parse({
      version: FLIGHT_CONSUMER_PII_ENVELOPE_VERSION,
      algorithm,
      keyVersion: input.keyring.keyVersion,
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: authTag.toString("base64url"),
      aadSha256: createHash("sha256").update(associatedData).digest("hex"),
      piiHmacSha256: hmacPassenger(material, associatedData, plaintext),
    });
    ciphertext.fill(0);
    authTag.fill(0);
    return Object.freeze(envelope);
  } finally {
    associatedData.fill(0);
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function decryptFlightConsumerPii(input: Readonly<{
  envelope: unknown;
  context: FlightConsumerPiiContext;
  keyring: FlightConsumerPiiKeyring;
}>): Readonly<FlightConsumerPreviewPassenger> {
  const material = requireKeyMaterial(input.keyring);
  const envelopeResult = flightConsumerPiiEnvelopeSchema.safeParse(input.envelope);
  if (!envelopeResult.success || envelopeResult.data.keyVersion !== input.keyring.keyVersion) {
    throw new FlightConsumerPiiIntegrityError();
  }

  let associatedData: Buffer;
  try {
    associatedData = serializeAssociatedData(input.context);
  } catch {
    throw new FlightConsumerPiiIntegrityError();
  }
  const envelope = envelopeResult.data;
  const iv = decodeCanonicalBase64Url(envelope.ivBase64Url, 12);
  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertextBase64Url);
  const authTag = decodeCanonicalBase64Url(envelope.authTagBase64Url, 16);
  let plaintext: Buffer | null = null;

  try {
    const expectedAadSha256 = createHash("sha256").update(associatedData).digest("hex");
    if (
      iv === null
      || ciphertext === null
      || authTag === null
      || ciphertext.length > FLIGHT_CONSUMER_PII_MAX_PLAINTEXT_BYTES
      || !equalHexDigest(envelope.aadSha256, expectedAadSha256)
    ) throw new FlightConsumerPiiIntegrityError();

    try {
      const decipher = createDecipheriv(algorithm, material.encryptionKey, iv, { authTagLength: 16 });
      decipher.setAAD(associatedData, { plaintextLength: ciphertext.length });
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new FlightConsumerPiiIntegrityError();
    }
    if (
      plaintext.length === 0
      || plaintext.length > FLIGHT_CONSUMER_PII_MAX_PLAINTEXT_BYTES
      || !equalHexDigest(envelope.piiHmacSha256, hmacPassenger(material, associatedData, plaintext))
    ) throw new FlightConsumerPiiIntegrityError();

    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      const payload = encryptedPayloadSchema.parse(JSON.parse(decoded) as unknown);
      return Object.freeze({ ...payload.passenger });
    } catch {
      throw new FlightConsumerPiiIntegrityError();
    }
  } finally {
    associatedData.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    authTag?.fill(0);
    plaintext?.fill(0);
  }
}
