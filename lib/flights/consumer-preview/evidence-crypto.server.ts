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

import { canonicalFlightJson, type FlightCanonicalJsonValue } from "../runtime-safety";

const evidenceKeyringBrand = Symbol("flight-consumer-preview-evidence-keyring");
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const stableTokenSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
const maximumPlaintextBytes = 1_500_000;

export const flightConsumerOfferEvidenceContextSchema = z.object({
  customerId: uuidSchema,
  searchId: uuidSchema,
  localOfferId: stableTokenSchema,
  executionScopeSha256: sha256Schema,
  stage: z.enum(["initial", "refreshed"]),
  predecessorReceiptDigest: sha256Schema.nullable(),
}).strict();

export type FlightConsumerOfferEvidenceContext = z.infer<typeof flightConsumerOfferEvidenceContextSchema>;

export const flightConsumerOfferEvidenceEnvelopeSchema = z.object({
  version: z.literal("flight-consumer-offer-evidence-envelope-v1"),
  algorithm: z.literal("aes-256-gcm"),
  keyVersion: keyVersionSchema,
  ivBase64Url: base64UrlSchema.max(32),
  ciphertextBase64Url: base64UrlSchema.max(2_100_000),
  authTagBase64Url: base64UrlSchema.max(32),
  aadSha256: sha256Schema,
  recordHmacSha256: sha256Schema,
  receiptSha256: sha256Schema,
}).strict();

export type FlightConsumerOfferEvidenceEnvelope = z.infer<typeof flightConsumerOfferEvidenceEnvelopeSchema>;

export const flightConsumerOrderResponseEvidenceContextSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  attemptId: uuidSchema,
  executionScopeSha256: sha256Schema,
}).strict();

export type FlightConsumerOrderResponseEvidenceContext = z.infer<
  typeof flightConsumerOrderResponseEvidenceContextSchema
>;

export const flightConsumerOrderRecoveryEvidenceContextSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  attemptId: uuidSchema,
  ledgerId: uuidSchema,
  executionScopeSha256: sha256Schema,
  recoveryRequestSha256: sha256Schema,
  recoveryAuthorityReceiptSha256: sha256Schema,
}).strict();

export type FlightConsumerOrderRecoveryEvidenceContext = z.infer<
  typeof flightConsumerOrderRecoveryEvidenceContextSchema
>;

export const flightConsumerOrderResponseEvidenceEnvelopeSchema = z.object({
  keyVersion: keyVersionSchema,
  ivBase64Url: base64UrlSchema.max(32),
  ciphertextBase64Url: base64UrlSchema.max(1_500_000),
  authTagBase64Url: base64UrlSchema.max(32),
  aadSha256: sha256Schema,
  ciphertextSha256: sha256Schema,
  receiptSha256: sha256Schema,
}).strict();

export type FlightConsumerOfferEvidenceKeyring = Readonly<{
  version: "flight-consumer-offer-evidence-keyring-v1";
  keyVersion: string;
  [evidenceKeyringBrand]: true;
}>;

type KeyMaterial = Readonly<{ encryptionKey: Buffer; hmacKey: Buffer }>;
const keyMaterial = new WeakMap<FlightConsumerOfferEvidenceKeyring, KeyMaterial>();

export class FlightConsumerOfferEvidenceIntegrityError extends Error {
  constructor() {
    super("Flight Consumer Preview offer evidence failed integrity verification.");
    this.name = "FlightConsumerOfferEvidenceIntegrityError";
  }
}

function decode(value: unknown, exactBytes?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const buffer = Buffer.from(value, "base64url");
    if (buffer.length === 0 || buffer.toString("base64url") !== value) return null;
    if (exactBytes !== undefined && buffer.length !== exactBytes) return null;
    return buffer;
  } catch {
    return null;
  }
}

function equalDigest(left: string, right: string) {
  return /^[0-9a-f]{64}$/.test(left)
    && /^[0-9a-f]{64}$/.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function materialFor(keyring: FlightConsumerOfferEvidenceKeyring) {
  const material = keyMaterial.get(keyring);
  if (!material) throw new FlightConsumerOfferEvidenceIntegrityError();
  return material;
}

export function createFlightConsumerOfferEvidenceKeyring(input: Readonly<{
  keyVersion: string;
  encryptionKeyBase64Url: string;
  hmacKeyBase64Url: string;
}>): FlightConsumerOfferEvidenceKeyring {
  const version = keyVersionSchema.safeParse(input.keyVersion);
  const encryptionKey = decode(input.encryptionKeyBase64Url, 32);
  const hmacKey = decode(input.hmacKeyBase64Url, 32);
  if (!version.success || encryptionKey === null || hmacKey === null || timingSafeEqual(encryptionKey, hmacKey)) {
    encryptionKey?.fill(0);
    hmacKey?.fill(0);
    throw new FlightConsumerOfferEvidenceIntegrityError();
  }
  const keyring = Object.freeze({
    version: "flight-consumer-offer-evidence-keyring-v1" as const,
    keyVersion: version.data,
    [evidenceKeyringBrand]: true as const,
  });
  keyMaterial.set(keyring, { encryptionKey, hmacKey });
  return keyring;
}

export function readFlightConsumerPreviewOfferEvidenceKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.VERCEL_ENV !== "preview" || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true") {
    throw new FlightConsumerOfferEvidenceIntegrityError();
  }
  return createFlightConsumerOfferEvidenceKeyring({
    keyVersion: env.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION ?? "",
    encryptionKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL ?? "",
    hmacKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL ?? "",
  });
}

function associatedData(context: FlightConsumerOfferEvidenceContext) {
  return Buffer.from(canonicalFlightJson({
    version: "flight-consumer-offer-evidence-aad-v1",
    environment: "preview",
    ...flightConsumerOfferEvidenceContextSchema.parse(context),
  }), "utf8");
}

function recordMac(material: KeyMaterial, aad: Buffer, plaintext: Buffer) {
  return createHmac("sha256", material.hmacKey)
    .update("flight-consumer-offer-evidence-record-v1")
    .update("\0")
    .update(aad)
    .update("\0")
    .update(plaintext)
    .digest("hex");
}

function receiptMac(material: KeyMaterial, context: FlightConsumerOfferEvidenceContext, recordDigest: string) {
  return createHmac("sha256", material.hmacKey)
    .update("flight-consumer-offer-evidence-receipt-v1")
    .update("\0")
    .update(canonicalFlightJson({ context, recordDigest } as unknown as FlightCanonicalJsonValue))
    .digest("hex");
}

export function encryptFlightConsumerOfferEvidence(input: Readonly<{
  record: Readonly<Record<string, unknown>>;
  recordDigest: string;
  context: FlightConsumerOfferEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>): FlightConsumerOfferEvidenceEnvelope {
  if (!/^[0-9a-f]{64}$/.test(input.recordDigest)) throw new FlightConsumerOfferEvidenceIntegrityError();
  const material = materialFor(input.keyring);
  const aad = associatedData(input.context);
  const plaintext = Buffer.from(canonicalFlightJson(input.record as unknown as FlightCanonicalJsonValue), "utf8");
  const iv = randomBytes(12);
  try {
    if (plaintext.length === 0 || plaintext.length > maximumPlaintextBytes) throw new FlightConsumerOfferEvidenceIntegrityError();
    const cipher = createCipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
    cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = flightConsumerOfferEvidenceEnvelopeSchema.parse({
      version: "flight-consumer-offer-evidence-envelope-v1",
      algorithm: "aes-256-gcm",
      keyVersion: input.keyring.keyVersion,
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: tag.toString("base64url"),
      aadSha256: createHash("sha256").update(aad).digest("hex"),
      recordHmacSha256: recordMac(material, aad, plaintext),
      receiptSha256: receiptMac(material, input.context, input.recordDigest),
    });
    ciphertext.fill(0);
    tag.fill(0);
    return Object.freeze(envelope);
  } finally {
    aad.fill(0);
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function decryptFlightConsumerOfferEvidence(input: Readonly<{
  envelope: unknown;
  recordDigest: string;
  context: FlightConsumerOfferEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>): Readonly<Record<string, unknown>> {
  const parsed = flightConsumerOfferEvidenceEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success || parsed.data.keyVersion !== input.keyring.keyVersion || !/^[0-9a-f]{64}$/.test(input.recordDigest)) {
    throw new FlightConsumerOfferEvidenceIntegrityError();
  }
  const material = materialFor(input.keyring);
  const aad = associatedData(input.context);
  const iv = decode(parsed.data.ivBase64Url, 12);
  const ciphertext = decode(parsed.data.ciphertextBase64Url);
  const tag = decode(parsed.data.authTagBase64Url, 16);
  let plaintext: Buffer | null = null;
  try {
    if (
      iv === null || ciphertext === null || tag === null
      || ciphertext.length > maximumPlaintextBytes
      || !equalDigest(parsed.data.aadSha256, createHash("sha256").update(aad).digest("hex"))
      || !equalDigest(parsed.data.receiptSha256, receiptMac(material, input.context, input.recordDigest))
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    try {
      const decipher = createDecipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
      decipher.setAAD(aad, { plaintextLength: ciphertext.length });
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    if (
      plaintext.length === 0 || plaintext.length > maximumPlaintextBytes
      || !equalDigest(parsed.data.recordHmacSha256, recordMac(material, aad, plaintext))
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    const value = JSON.parse(decoded) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    return Object.freeze(structuredClone(value as Record<string, unknown>));
  } catch (error) {
    if (error instanceof FlightConsumerOfferEvidenceIntegrityError) throw error;
    throw new FlightConsumerOfferEvidenceIntegrityError();
  } finally {
    aad.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    tag?.fill(0);
    plaintext?.fill(0);
  }
}

function orderResponseAssociatedData(context: FlightConsumerOrderResponseEvidenceContext) {
  return Buffer.from(canonicalFlightJson({
    version: "flight-consumer-order-response-evidence-aad-v1",
    environment: "preview",
    ...flightConsumerOrderResponseEvidenceContextSchema.parse(context),
  }), "utf8");
}

export function encryptFlightConsumerOrderResponseEvidence(input: Readonly<{
  rawBody: Uint8Array;
  providerResponseSha256: string;
  context: FlightConsumerOrderResponseEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>) {
  if (!sha256Schema.safeParse(input.providerResponseSha256).success) {
    throw new FlightConsumerOfferEvidenceIntegrityError();
  }
  const material = materialFor(input.keyring);
  const aad = orderResponseAssociatedData(input.context);
  const plaintext = Buffer.from(input.rawBody);
  const iv = randomBytes(12);
  try {
    if (
      plaintext.length === 0
      || plaintext.length > 1_048_576
      || createHash("sha256").update(plaintext).digest("hex") !== input.providerResponseSha256
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    const cipher = createCipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
    cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const aadSha256 = createHash("sha256").update(aad).digest("hex");
    const ciphertextSha256 = createHash("sha256").update(ciphertext).digest("hex");
    const receiptSha256 = createHmac("sha256", material.hmacKey)
      .update("flight-consumer-order-response-evidence-receipt-v1")
      .update("\0")
      .update(aad)
      .update("\0")
      .update(input.providerResponseSha256, "utf8")
      .update("\0")
      .update(ciphertextSha256, "utf8")
      .digest("hex");
    const result = Object.freeze({
      keyVersion: input.keyring.keyVersion,
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: authTag.toString("base64url"),
      aadSha256,
      ciphertextSha256,
      receiptSha256,
    });
    ciphertext.fill(0);
    authTag.fill(0);
    return result;
  } finally {
    aad.fill(0);
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function decryptFlightConsumerOrderResponseEvidence(input: Readonly<{
  envelope: unknown;
  providerResponseSha256: string;
  context: FlightConsumerOrderResponseEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>) {
  const parsed = flightConsumerOrderResponseEvidenceEnvelopeSchema.safeParse(input.envelope);
  if (
    !parsed.success
    || parsed.data.keyVersion !== input.keyring.keyVersion
    || !sha256Schema.safeParse(input.providerResponseSha256).success
  ) throw new FlightConsumerOfferEvidenceIntegrityError();
  const material = materialFor(input.keyring);
  const aad = orderResponseAssociatedData(input.context);
  const iv = decode(parsed.data.ivBase64Url, 12);
  const ciphertext = decode(parsed.data.ciphertextBase64Url);
  const authTag = decode(parsed.data.authTagBase64Url, 16);
  let plaintext: Buffer | null = null;
  try {
    if (
      iv === null || ciphertext === null || authTag === null
      || ciphertext.length === 0 || ciphertext.length > 1_048_576
      || !equalDigest(parsed.data.aadSha256, createHash("sha256").update(aad).digest("hex"))
      || !equalDigest(parsed.data.ciphertextSha256, createHash("sha256").update(ciphertext).digest("hex"))
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    const expectedReceipt = createHmac("sha256", material.hmacKey)
      .update("flight-consumer-order-response-evidence-receipt-v1")
      .update("\0")
      .update(aad)
      .update("\0")
      .update(input.providerResponseSha256, "utf8")
      .update("\0")
      .update(parsed.data.ciphertextSha256, "utf8")
      .digest("hex");
    if (!equalDigest(parsed.data.receiptSha256, expectedReceipt)) {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", material.encryptionKey, iv, {
        authTagLength: 16,
      });
      decipher.setAAD(aad, { plaintextLength: ciphertext.length });
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    if (
      plaintext.length === 0 || plaintext.length > 1_048_576
      || !equalDigest(
        input.providerResponseSha256,
        createHash("sha256").update(plaintext).digest("hex"),
      )
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    return Buffer.from(plaintext);
  } catch (error) {
    if (error instanceof FlightConsumerOfferEvidenceIntegrityError) throw error;
    throw new FlightConsumerOfferEvidenceIntegrityError();
  } finally {
    aad.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    authTag?.fill(0);
    plaintext?.fill(0);
  }
}

function orderRecoveryAssociatedData(context: FlightConsumerOrderRecoveryEvidenceContext) {
  return Buffer.from(canonicalFlightJson({
    version: "flight-consumer-order-recovery-evidence-aad-v1",
    environment: "preview",
    ...flightConsumerOrderRecoveryEvidenceContextSchema.parse(context),
  }), "utf8");
}

/**
 * Encrypts an authenticated Duffel GET-order recovery body in a distinct
 * cryptographic domain bound to the exact webhook ledger and recovery
 * authority. It must never be substituted for the original create response.
 */
export function encryptFlightConsumerOrderRecoveryEvidence(input: Readonly<{
  rawBody: Uint8Array;
  providerResponseSha256: string;
  context: FlightConsumerOrderRecoveryEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>) {
  if (!sha256Schema.safeParse(input.providerResponseSha256).success) {
    throw new FlightConsumerOfferEvidenceIntegrityError();
  }
  const material = materialFor(input.keyring);
  const aad = orderRecoveryAssociatedData(input.context);
  const plaintext = Buffer.from(input.rawBody);
  const iv = randomBytes(12);
  try {
    if (
      plaintext.length === 0
      || plaintext.length > 1_048_576
      || createHash("sha256").update(plaintext).digest("hex") !== input.providerResponseSha256
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    const cipher = createCipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
    cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const aadSha256 = createHash("sha256").update(aad).digest("hex");
    const ciphertextSha256 = createHash("sha256").update(ciphertext).digest("hex");
    const receiptSha256 = createHmac("sha256", material.hmacKey)
      .update("flight-consumer-order-recovery-evidence-receipt-v1")
      .update("\0")
      .update(aad)
      .update("\0")
      .update(input.providerResponseSha256, "utf8")
      .update("\0")
      .update(ciphertextSha256, "utf8")
      .digest("hex");
    const result = Object.freeze({
      keyVersion: input.keyring.keyVersion,
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: authTag.toString("base64url"),
      aadSha256,
      ciphertextSha256,
      receiptSha256,
    });
    ciphertext.fill(0);
    authTag.fill(0);
    return result;
  } finally {
    aad.fill(0);
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function decryptFlightConsumerOrderRecoveryEvidence(input: Readonly<{
  envelope: unknown;
  providerResponseSha256: string;
  context: FlightConsumerOrderRecoveryEvidenceContext;
  keyring: FlightConsumerOfferEvidenceKeyring;
}>) {
  const parsed = flightConsumerOrderResponseEvidenceEnvelopeSchema.safeParse(input.envelope);
  if (
    !parsed.success
    || parsed.data.keyVersion !== input.keyring.keyVersion
    || !sha256Schema.safeParse(input.providerResponseSha256).success
  ) throw new FlightConsumerOfferEvidenceIntegrityError();
  const material = materialFor(input.keyring);
  const aad = orderRecoveryAssociatedData(input.context);
  const iv = decode(parsed.data.ivBase64Url, 12);
  const ciphertext = decode(parsed.data.ciphertextBase64Url);
  const authTag = decode(parsed.data.authTagBase64Url, 16);
  let plaintext: Buffer | null = null;
  try {
    if (
      iv === null || ciphertext === null || authTag === null
      || ciphertext.length === 0 || ciphertext.length > 1_048_576
      || !equalDigest(parsed.data.aadSha256, createHash("sha256").update(aad).digest("hex"))
      || !equalDigest(parsed.data.ciphertextSha256, createHash("sha256").update(ciphertext).digest("hex"))
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    const expectedReceipt = createHmac("sha256", material.hmacKey)
      .update("flight-consumer-order-recovery-evidence-receipt-v1")
      .update("\0")
      .update(aad)
      .update("\0")
      .update(input.providerResponseSha256, "utf8")
      .update("\0")
      .update(parsed.data.ciphertextSha256, "utf8")
      .digest("hex");
    if (!equalDigest(parsed.data.receiptSha256, expectedReceipt)) {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", material.encryptionKey, iv, {
        authTagLength: 16,
      });
      decipher.setAAD(aad, { plaintextLength: ciphertext.length });
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new FlightConsumerOfferEvidenceIntegrityError();
    }
    if (
      plaintext.length === 0 || plaintext.length > 1_048_576
      || !equalDigest(
        input.providerResponseSha256,
        createHash("sha256").update(plaintext).digest("hex"),
      )
    ) throw new FlightConsumerOfferEvidenceIntegrityError();
    return Buffer.from(plaintext);
  } catch (error) {
    if (error instanceof FlightConsumerOfferEvidenceIntegrityError) throw error;
    throw new FlightConsumerOfferEvidenceIntegrityError();
  } finally {
    aad.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    authTag?.fill(0);
    plaintext?.fill(0);
  }
}
