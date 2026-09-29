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

const referenceKeyringBrand = Symbol("flight-consumer-preview-reference-keyring");
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const flightConsumerPreviewReferenceKinds = [
  "stripe_payment_intent",
  "duffel_offer",
  "duffel_order",
  "duffel_passenger",
  "duffel_ticket",
] as const;

export const flightConsumerPreviewReferenceContextSchema = z.object({
  kind: z.enum(flightConsumerPreviewReferenceKinds),
  customerId: z.string().uuid(),
  resourceId: z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/),
  executionScopeSha256: sha256Schema,
}).strict();

export type FlightConsumerPreviewReferenceContext = z.infer<
  typeof flightConsumerPreviewReferenceContextSchema
>;

const compactEnvelopeSchema = z.object({
  k: keyVersionSchema,
  i: base64UrlSchema.length(16),
  c: base64UrlSchema.max(1_024),
  t: base64UrlSchema.length(22),
  a: sha256Schema,
  m: sha256Schema,
}).strict();

export type FlightConsumerPreviewReferenceKeyring = Readonly<{
  version: "flight-consumer-reference-keyring-v1";
  keyVersion: string;
  [referenceKeyringBrand]: true;
}>;

type KeyMaterial = Readonly<{ encryptionKey: Buffer; hmacKey: Buffer }>;
const keyMaterial = new WeakMap<FlightConsumerPreviewReferenceKeyring, KeyMaterial>();

export class FlightConsumerPreviewReferenceIntegrityError extends Error {
  constructor() {
    super("Flight Consumer Preview reference failed integrity verification.");
    this.name = "FlightConsumerPreviewReferenceIntegrityError";
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

function isValidReferenceValue(
  kind: FlightConsumerPreviewReferenceContext["kind"],
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  return kind === "duffel_ticket"
    ? /^[A-Za-z0-9-]{1,64}$/.test(value)
    : /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(value);
}

function materialFor(keyring: FlightConsumerPreviewReferenceKeyring) {
  const material = keyMaterial.get(keyring);
  if (!material) throw new FlightConsumerPreviewReferenceIntegrityError();
  return material;
}

export function createFlightConsumerPreviewReferenceKeyring(input: Readonly<{
  keyVersion: string;
  encryptionKeyBase64Url: string;
  hmacKeyBase64Url: string;
}>): FlightConsumerPreviewReferenceKeyring {
  const version = keyVersionSchema.safeParse(input.keyVersion);
  const encryptionKey = decode(input.encryptionKeyBase64Url, 32);
  const hmacKey = decode(input.hmacKeyBase64Url, 32);
  if (!version.success || encryptionKey === null || hmacKey === null || timingSafeEqual(encryptionKey, hmacKey)) {
    encryptionKey?.fill(0);
    hmacKey?.fill(0);
    throw new FlightConsumerPreviewReferenceIntegrityError();
  }
  const keyring = Object.freeze({
    version: "flight-consumer-reference-keyring-v1" as const,
    keyVersion: version.data,
    [referenceKeyringBrand]: true as const,
  });
  keyMaterial.set(keyring, Object.freeze({ encryptionKey, hmacKey }));
  return keyring;
}

export function readFlightConsumerPreviewReferenceKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.VERCEL_ENV !== "preview" || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true") {
    throw new FlightConsumerPreviewReferenceIntegrityError();
  }
  return createFlightConsumerPreviewReferenceKeyring({
    keyVersion: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION ?? "",
    encryptionKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL ?? "",
    hmacKeyBase64Url: env.FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL ?? "",
  });
}

function associatedData(context: FlightConsumerPreviewReferenceContext) {
  return Buffer.from(canonicalFlightJson({
    version: "flight-consumer-reference-aad-v1",
    environment: "preview",
    ...flightConsumerPreviewReferenceContextSchema.parse(context),
  } as unknown as FlightCanonicalJsonValue), "utf8");
}

export function sha256FlightConsumerPreviewReference(input: Readonly<{
  kind: FlightConsumerPreviewReferenceContext["kind"];
  value: string;
}>) {
  const kind = z.enum(flightConsumerPreviewReferenceKinds).safeParse(input.kind);
  if (
    !kind.success
    || !isValidReferenceValue(kind.data, input.value)
  ) throw new FlightConsumerPreviewReferenceIntegrityError();
  return createHash("sha256")
    .update("flight-consumer-reference-digest-v1")
    .update("\0")
    .update(kind.data)
    .update("\0")
    .update(input.value, "utf8")
    .digest("hex");
}

function referenceMac(material: KeyMaterial, aad: Buffer, plaintext: Buffer) {
  return createHmac("sha256", material.hmacKey)
    .update("flight-consumer-reference-record-v1")
    .update("\0")
    .update(aad)
    .update("\0")
    .update(plaintext)
    .digest("hex");
}

export function encryptFlightConsumerPreviewReference(input: Readonly<{
  value: string;
  context: FlightConsumerPreviewReferenceContext;
  keyring: FlightConsumerPreviewReferenceKeyring;
}>) {
  const context = flightConsumerPreviewReferenceContextSchema.parse(input.context);
  if (!isValidReferenceValue(context.kind, input.value)) {
    throw new FlightConsumerPreviewReferenceIntegrityError();
  }
  const material = materialFor(input.keyring);
  const aad = associatedData(context);
  const plaintext = Buffer.from(canonicalFlightJson({
    version: "flight-consumer-reference-payload-v1",
    kind: context.kind,
    value: input.value,
  }), "utf8");
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
    cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const envelope = compactEnvelopeSchema.parse({
      k: input.keyring.keyVersion,
      i: iv.toString("base64url"),
      c: ciphertext.toString("base64url"),
      t: authTag.toString("base64url"),
      a: createHash("sha256").update(aad).digest("hex"),
      m: referenceMac(material, aad, plaintext),
    });
    const ciphertextValue = `enc:v1:${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}`;
    if (ciphertextValue.length > 4_080) throw new FlightConsumerPreviewReferenceIntegrityError();
    return Object.freeze({
      ciphertext: ciphertextValue,
      referenceSha256: sha256FlightConsumerPreviewReference({
        kind: context.kind,
        value: input.value,
      }),
      authorityReceiptSha256: envelope.m,
      keyVersion: input.keyring.keyVersion,
    });
  } finally {
    aad.fill(0);
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function decryptFlightConsumerPreviewReference(input: Readonly<{
  ciphertext: string;
  expectedReferenceSha256: string;
  context: FlightConsumerPreviewReferenceContext;
  keyring: FlightConsumerPreviewReferenceKeyring;
}>) {
  const encoded = /^enc:v1:([A-Za-z0-9_-]{16,4073})$/.exec(input.ciphertext)?.[1];
  if (!encoded || !sha256Schema.safeParse(input.expectedReferenceSha256).success) {
    throw new FlightConsumerPreviewReferenceIntegrityError();
  }
  const context = flightConsumerPreviewReferenceContextSchema.parse(input.context);
  const material = materialFor(input.keyring);
  const aad = associatedData(context);
  let iv: Buffer | null = null;
  let ciphertext: Buffer | null = null;
  let authTag: Buffer | null = null;
  let plaintext: Buffer | null = null;
  try {
    let parsedJson: unknown;
    try {
      const packed = Buffer.from(encoded, "base64url");
      if (packed.toString("base64url") !== encoded) throw new Error();
      parsedJson = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packed)) as unknown;
      packed.fill(0);
    } catch {
      throw new FlightConsumerPreviewReferenceIntegrityError();
    }
    const parsed = compactEnvelopeSchema.safeParse(parsedJson);
    if (!parsed.success || parsed.data.k !== input.keyring.keyVersion) {
      throw new FlightConsumerPreviewReferenceIntegrityError();
    }
    iv = decode(parsed.data.i, 12);
    ciphertext = decode(parsed.data.c);
    authTag = decode(parsed.data.t, 16);
    if (
      iv === null || ciphertext === null || authTag === null
      || !equalDigest(parsed.data.a, createHash("sha256").update(aad).digest("hex"))
    ) throw new FlightConsumerPreviewReferenceIntegrityError();
    try {
      const decipher = createDecipheriv("aes-256-gcm", material.encryptionKey, iv, { authTagLength: 16 });
      decipher.setAAD(aad, { plaintextLength: ciphertext.length });
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new FlightConsumerPreviewReferenceIntegrityError();
    }
    if (!equalDigest(parsed.data.m, referenceMac(material, aad, plaintext))) {
      throw new FlightConsumerPreviewReferenceIntegrityError();
    }
    const payload = z.object({
      version: z.literal("flight-consumer-reference-payload-v1"),
      kind: z.literal(context.kind),
      value: z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    }).strict().parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown);
    if (
      !isValidReferenceValue(context.kind, payload.value)
      || !equalDigest(sha256FlightConsumerPreviewReference({
      kind: context.kind,
      value: payload.value,
      }), input.expectedReferenceSha256)
    ) {
      throw new FlightConsumerPreviewReferenceIntegrityError();
    }
    return payload.value;
  } catch (error) {
    if (error instanceof FlightConsumerPreviewReferenceIntegrityError) throw error;
    throw new FlightConsumerPreviewReferenceIntegrityError();
  } finally {
    aad.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    authTag?.fill(0);
    plaintext?.fill(0);
  }
}
