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

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const refundIdSchema = z.string().regex(/^re_[A-Za-z0-9]{8,127}$/);
const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

const bindingSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  paymentId: uuidSchema,
  attemptId: uuidSchema,
  paymentIntentReferenceSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  keyVersion: keyVersionSchema,
}).strict();

const envelopeSchema = z.object({
  k: keyVersionSchema,
  i: base64UrlSchema.length(16),
  c: base64UrlSchema.min(16).max(1_024),
  t: base64UrlSchema.length(22),
  a: sha256Schema,
  m: sha256Schema,
}).strict();

const payloadSchema = z.object({
  version: z.literal("flight-consumer-preview-stripe-refund-reference-v1"),
  refundId: refundIdSchema,
}).strict();

export type FlightConsumerPreviewStripeRefundReferenceBinding = z.infer<typeof bindingSchema>;

const keyringBrand = Symbol("flight-consumer-preview-stripe-refund-reference-keyring");

export type FlightConsumerPreviewStripeRefundReferenceKeyring = Readonly<{
  version: "flight-consumer-preview-stripe-refund-reference-keyring-v1";
  keyVersion: string;
  [keyringBrand]: true;
}>;

type KeyMaterial = Readonly<{ encryptionKey: Buffer; hmacKey: Buffer }>;
const keyMaterialByKeyring = new WeakMap<
  FlightConsumerPreviewStripeRefundReferenceKeyring,
  KeyMaterial
>();

export class FlightConsumerPreviewStripeRefundReferenceError extends Error {
  constructor() {
    super("Flight Consumer Preview refund reference is unavailable.");
    this.name = "FlightConsumerPreviewStripeRefundReferenceError";
  }
}

function decode(value: unknown, exactBytes?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length === 0 || decoded.toString("base64url") !== value) return null;
    if (exactBytes !== undefined && decoded.length !== exactBytes) return null;
    return decoded;
  } catch {
    return null;
  }
}

function equalDigest(left: string, right: string) {
  return /^[0-9a-f]{64}$/.test(left)
    && /^[0-9a-f]{64}$/.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function materialFor(keyring: FlightConsumerPreviewStripeRefundReferenceKeyring) {
  const material = keyMaterialByKeyring.get(keyring);
  if (!material) throw new FlightConsumerPreviewStripeRefundReferenceError();
  return material;
}

function associatedData(binding: FlightConsumerPreviewStripeRefundReferenceBinding) {
  return Buffer.from(canonicalFlightJson({
    version: "flight-consumer-preview-stripe-refund-reference-aad-v1",
    environment: "preview",
    processor: "stripe",
    objectType: "refund",
    ...binding,
  } as unknown as FlightCanonicalJsonValue), "utf8");
}

function refundDigest(refundId: string) {
  return createHash("sha256")
    .update("flight-consumer-preview-stripe-refund-reference-digest-v1")
    .update("\0")
    .update(refundId, "utf8")
    .digest("hex");
}

function refundMac(material: KeyMaterial, aad: Buffer, plaintext: Buffer) {
  return createHmac("sha256", material.hmacKey)
    .update("flight-consumer-preview-stripe-refund-reference-record-v1")
    .update("\0")
    .update(aad)
    .update("\0")
    .update(plaintext)
    .digest("hex");
}

export function createFlightConsumerPreviewStripeRefundReferenceKeyring(input: Readonly<{
  keyVersion: string;
  encryptionKeyBase64Url: string;
  hmacKeyBase64Url: string;
}>): FlightConsumerPreviewStripeRefundReferenceKeyring {
  const version = keyVersionSchema.safeParse(input.keyVersion);
  const encryptionKey = decode(input.encryptionKeyBase64Url, 32);
  const hmacKey = decode(input.hmacKeyBase64Url, 32);
  if (
    !version.success
    || encryptionKey === null
    || hmacKey === null
    || timingSafeEqual(encryptionKey, hmacKey)
  ) {
    encryptionKey?.fill(0);
    hmacKey?.fill(0);
    throw new FlightConsumerPreviewStripeRefundReferenceError();
  }
  const keyring = Object.freeze({
    version: "flight-consumer-preview-stripe-refund-reference-keyring-v1" as const,
    keyVersion: version.data,
    [keyringBrand]: true as const,
  });
  keyMaterialByKeyring.set(keyring, Object.freeze({ encryptionKey, hmacKey }));
  return keyring;
}

export function readFlightConsumerPreviewStripeRefundReferenceKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.VERCEL_ENV !== "preview" || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true") {
    throw new FlightConsumerPreviewStripeRefundReferenceError();
  }
  return createFlightConsumerPreviewStripeRefundReferenceKeyring({
    keyVersion: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION ?? "",
    encryptionKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL ?? "",
    hmacKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL ?? "",
  });
}

export function encryptFlightConsumerPreviewStripeRefundReference(input: Readonly<{
  refundId: string;
  binding: FlightConsumerPreviewStripeRefundReferenceBinding;
  keyring: FlightConsumerPreviewStripeRefundReferenceKeyring;
}>) {
  try {
    const refundId = refundIdSchema.parse(input.refundId);
    const binding = bindingSchema.parse(structuredClone(input.binding));
    if (binding.keyVersion !== input.keyring.keyVersion) throw new Error();
    const material = materialFor(input.keyring);
    const aad = associatedData(binding);
    const plaintext = Buffer.from(canonicalFlightJson({
      version: "flight-consumer-preview-stripe-refund-reference-v1",
      refundId,
    }), "utf8");
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv("aes-256-gcm", material.encryptionKey, iv, {
        authTagLength: 16,
      });
      cipher.setAAD(aad, { plaintextLength: plaintext.length });
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      try {
        const envelope = envelopeSchema.parse({
          k: input.keyring.keyVersion,
          i: iv.toString("base64url"),
          c: ciphertext.toString("base64url"),
          t: authTag.toString("base64url"),
          a: createHash("sha256").update(aad).digest("hex"),
          m: refundMac(material, aad, plaintext),
        });
        const protectedReference = `enc:v1:${Buffer.from(
          JSON.stringify(envelope),
          "utf8",
        ).toString("base64url")}`;
        if (protectedReference.length > 4_080) throw new Error();
        return Object.freeze({
          ciphertext: protectedReference,
          referenceSha256: refundDigest(refundId),
        });
      } finally {
        ciphertext.fill(0);
        authTag.fill(0);
      }
    } finally {
      aad.fill(0);
      plaintext.fill(0);
      iv.fill(0);
    }
  } catch (error) {
    if (error instanceof FlightConsumerPreviewStripeRefundReferenceError) throw error;
    throw new FlightConsumerPreviewStripeRefundReferenceError();
  }
}

export function decryptFlightConsumerPreviewStripeRefundReference(input: Readonly<{
  ciphertext: string;
  expectedReferenceSha256: string;
  binding: FlightConsumerPreviewStripeRefundReferenceBinding;
  keyring: FlightConsumerPreviewStripeRefundReferenceKeyring;
}>) {
  const encoded = /^enc:v1:([A-Za-z0-9_-]{16,4073})$/.exec(input.ciphertext)?.[1];
  let aad: Buffer | null = null;
  let iv: Buffer | null = null;
  let ciphertext: Buffer | null = null;
  let authTag: Buffer | null = null;
  let plaintext: Buffer | null = null;
  try {
    if (!encoded || !sha256Schema.safeParse(input.expectedReferenceSha256).success) {
      throw new Error();
    }
    const binding = bindingSchema.parse(structuredClone(input.binding));
    if (binding.keyVersion !== input.keyring.keyVersion) throw new Error();
    const material = materialFor(input.keyring);
    aad = associatedData(binding);
    const packed = Buffer.from(encoded, "base64url");
    let rawEnvelope: unknown;
    try {
      if (packed.toString("base64url") !== encoded) throw new Error();
      rawEnvelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packed)) as unknown;
    } finally {
      packed.fill(0);
    }
    const envelope = envelopeSchema.parse(rawEnvelope);
    if (envelope.k !== input.keyring.keyVersion) throw new Error();
    iv = decode(envelope.i, 12);
    ciphertext = decode(envelope.c);
    authTag = decode(envelope.t, 16);
    if (
      iv === null
      || ciphertext === null
      || authTag === null
      || !equalDigest(envelope.a, createHash("sha256").update(aad).digest("hex"))
    ) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", material.encryptionKey, iv, {
      authTagLength: 16,
    });
    decipher.setAAD(aad, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (!equalDigest(envelope.m, refundMac(material, aad, plaintext))) throw new Error();
    const payload = payloadSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown,
    );
    if (!equalDigest(refundDigest(payload.refundId), input.expectedReferenceSha256)) {
      throw new Error();
    }
    return payload.refundId;
  } catch {
    throw new FlightConsumerPreviewStripeRefundReferenceError();
  } finally {
    aad?.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    authTag?.fill(0);
    plaintext?.fill(0);
  }
}
