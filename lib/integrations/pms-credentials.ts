import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export type EncryptedPmsCredentials = {
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: number;
};

function encryptionKey() {
  const encoded = process.env.PMS_CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error("PMS credential encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("PMS credential encryption key must be 32 bytes.");
  return key;
}

export function encryptPmsCredentials(
  credentials: Record<string, string>,
): EncryptedPmsCredentials {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptPmsCredentials(
  encrypted: EncryptedPmsCredentials,
): Record<string, string> {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(encrypted.initializationVector, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored PMS credentials are invalid.");
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
