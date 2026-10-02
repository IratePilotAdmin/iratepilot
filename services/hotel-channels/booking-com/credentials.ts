import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SUPPORTED_KEY_VERSIONS = [1, 2] as const;
type CredentialKeyVersion = typeof SUPPORTED_KEY_VERSIONS[number];
const VAULT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type BookingComAccountCredentials = {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
};

export type BookingComCredentialEnvelope = {
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: number;
};

function keyMaterial(encoded: string | undefined) {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error("booking_com_credential_encryption_unavailable");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("booking_com_credential_encryption_unavailable");
  return key;
}

function activeKeyVersion(): CredentialKeyVersion {
  const configured = process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION;
  if (configured === undefined || configured === "") return 1;
  if (configured === "1" || configured === "2") return Number(configured) as CredentialKeyVersion;
  throw new Error("booking_com_credential_encryption_unavailable");
}

function keyForVersion(version: CredentialKeyVersion) {
  const encoded = version === 1
    ? process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V1 || process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY
    : process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V2;
  return keyMaterial(encoded);
}

function associatedData(vaultId: string, environment: "test", keyVersion: CredentialKeyVersion) {
  // Keep version-1 AAD byte-for-byte stable so existing envelopes remain readable.
  const purpose = keyVersion === 1
    ? "irp-booking-com-machine-account-v1"
    : "irp-booking-com-machine-account-key-v2";
  return Buffer.from([purpose, vaultId, environment].join("\u0000"), "utf8");
}

function validCredentials(value: BookingComAccountCredentials) {
  return !!value && typeof value === "object"
    && Object.keys(value).every((key) => ["clientId", "clientSecret", "accessToken", "accessTokenExpiresAt"].includes(key))
    && typeof value.clientId === "string" && value.clientId.length >= 1 && value.clientId.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value.clientId)
    && typeof value.clientSecret === "string" && value.clientSecret.length >= 1 && value.clientSecret.length <= 4096
    && !/[\u0000-\u001f\u007f]/.test(value.clientSecret)
    && ((value.accessToken === undefined && value.accessTokenExpiresAt === undefined)
      || (typeof value.accessToken === "string" && value.accessToken.length <= 8192 && JWT.test(value.accessToken)
        && Number.isSafeInteger(value.accessTokenExpiresAt) && value.accessTokenExpiresAt! > 0));
}

export function encryptBookingComCredentials(input: {
  vaultId: string;
  environment: "test";
  credentials: BookingComAccountCredentials;
}): BookingComCredentialEnvelope {
  if (!input || !VAULT_ID.test(input.vaultId) || input.environment !== "test" || !validCredentials(input.credentials)) {
    throw new Error("booking_com_credentials_invalid");
  }
  const plaintext = Buffer.from(JSON.stringify(input.credentials), "utf8");
  if (plaintext.byteLength > 16_000) throw new Error("booking_com_credentials_too_large");
  const keyVersion = activeKeyVersion();
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyForVersion(keyVersion), initializationVector);
  cipher.setAAD(associatedData(input.vaultId, input.environment, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptBookingComCredentials(input: {
  vaultId: string;
  environment: "test";
  envelope: BookingComCredentialEnvelope;
  encodedKey?: string;
}): BookingComAccountCredentials {
  const envelope = input?.envelope;
  if (!input || !VAULT_ID.test(input.vaultId) || input.environment !== "test"
    || !envelope || !SUPPORTED_KEY_VERSIONS.includes(envelope.keyVersion as CredentialKeyVersion)
    || typeof envelope.ciphertext !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)
    || envelope.ciphertext.length > 22_000
    || typeof envelope.initializationVector !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(envelope.initializationVector)
    || typeof envelope.authenticationTag !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(envelope.authenticationTag)) {
    throw new Error("booking_com_credential_envelope_invalid");
  }
  try {
    const keyVersion = envelope.keyVersion as CredentialKeyVersion;
    const decipher = createDecipheriv(ALGORITHM,
      input.encodedKey ? keyMaterial(input.encodedKey) : keyForVersion(keyVersion),
      Buffer.from(envelope.initializationVector, "base64"));
    decipher.setAAD(associatedData(input.vaultId, input.environment, keyVersion));
    decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !validCredentials(parsed as BookingComAccountCredentials)) {
      throw new Error("invalid");
    }
    return parsed as BookingComAccountCredentials;
  } catch {
    throw new Error("booking_com_credential_envelope_invalid");
  }
}

/** Re-encrypts one envelope using the configured active key without exposing plaintext to callers. */
export function reencryptBookingComCredentials(input: {
  vaultId: string;
  environment: "test";
  envelope: BookingComCredentialEnvelope;
}): BookingComCredentialEnvelope {
  const credentials = decryptBookingComCredentials(input);
  return encryptBookingComCredentials({ vaultId: input.vaultId, environment: input.environment, credentials });
}
