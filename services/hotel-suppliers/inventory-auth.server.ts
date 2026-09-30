import "server-only";
import { createHash } from "node:crypto";

type TimestampedCredentials = {
  apiKey: string;
  timestampSeconds: number;
};

const unsafeHeaderCharacterPattern = /[\u0000-\u001f\u007f]/;

function requireCredential(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 4096
    || unsafeHeaderCharacterPattern.test(normalized)) {
    throw new Error("Supplier authentication configuration is invalid.");
  }
  return normalized;
}

function requireTimestamp(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Supplier authentication timestamp is invalid.");
  }
  return String(value);
}

export function buildHotelbedsAuthHeaders(input: TimestampedCredentials & {
  secret: string;
}) {
  const apiKey = requireCredential(input.apiKey);
  const secret = requireCredential(input.secret);
  const timestamp = requireTimestamp(input.timestampSeconds);
  // Hotelbeds requires SHA-256(apiKey + secret + timestamp) for request signing,
  // not password storage. A password KDF or HMAC would violate its protocol.
  const signature = createHash("sha256") // lgtm[js/insufficient-password-hash]
    .update(`${apiKey}${secret}${timestamp}`, "utf8")
    .digest("hex");

  return {
    "Api-key": apiKey,
    "X-Signature": signature,
  } as const;
}

export function buildRatehawkAuthorization(input: {
  keyId: string;
  apiKey: string;
}) {
  const keyId = requireCredential(input.keyId);
  const apiKey = requireCredential(input.apiKey);
  if (keyId.includes(":")) {
    throw new Error("Supplier authentication configuration is invalid.");
  }
  return `Basic ${Buffer.from(`${keyId}:${apiKey}`, "utf8").toString("base64")}`;
}

export function buildExpediaRapidAuthorization(input: TimestampedCredentials & {
  sharedSecret: string;
}) {
  const apiKey = requireCredential(input.apiKey);
  const sharedSecret = requireCredential(input.sharedSecret);
  const timestamp = requireTimestamp(input.timestampSeconds);
  // Expedia Rapid requires SHA-512(apiKey + sharedSecret + timestamp) for
  // request signing, not password storage. A password KDF or HMAC is invalid.
  const signature = createHash("sha512") // lgtm[js/insufficient-password-hash]
    .update(`${apiKey}${sharedSecret}${timestamp}`, "utf8")
    .digest("hex");

  return `EAN APIKey=${apiKey},Signature=${signature},timestamp=${timestamp}`;
}
