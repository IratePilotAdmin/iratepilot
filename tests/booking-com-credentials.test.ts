import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decryptBookingComCredentials, encryptBookingComCredentials, reencryptBookingComCredentials } from "../services/hotel-channels/booking-com/credentials";

const vaultId = "e3bb11c9-a74e-4e23-9f3e-74073f0e8311";
const otherVaultId = "bd4cf12a-5a72-4b8f-8183-2936756107de";
const key = Buffer.alloc(32, 4).toString("base64");
const token = `${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}`;

afterEach(() => vi.unstubAllEnvs());

describe("Booking.com machine-account credential envelope", () => {
  it("encrypts test credentials and a cached token with account/environment-bound authenticated data", () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const credentials = {
      clientId: "machine-client-id",
      clientSecret: "machine-client-secret",
      accessToken: token,
      accessTokenExpiresAt: 1_800_000_000_000,
    };
    const envelope = encryptBookingComCredentials({ vaultId, environment: "test", credentials });
    expect(JSON.stringify(envelope)).not.toContain(credentials.clientSecret);
    expect(JSON.stringify(envelope)).not.toContain(token);
    expect(envelope.keyVersion).toBe(1);
    expect(decryptBookingComCredentials({ vaultId, environment: "test", envelope })).toEqual(credentials);
    expect(() => decryptBookingComCredentials({ vaultId: otherVaultId, environment: "test", envelope }))
      .toThrow("booking_com_credential_envelope_invalid");
  });

  it("supports storing credentials before any access token has been issued", () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const credentials = { clientId: "machine-client-id", clientSecret: "machine-client-secret" };
    const envelope = encryptBookingComCredentials({ vaultId, environment: "test", credentials });
    expect(decryptBookingComCredentials({ vaultId, environment: "test", envelope })).toEqual(credentials);
  });

  it("fails closed for missing keys, invalid accounts, and production environments", () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", "");
    expect(() => encryptBookingComCredentials({
      vaultId, environment: "test", credentials: { clientId: "client", clientSecret: "secret" },
    })).toThrow("booking_com_credential_encryption_unavailable");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    expect(() => encryptBookingComCredentials({
      vaultId: "not-a-uuid", environment: "test", credentials: { clientId: "client", clientSecret: "secret" },
    })).toThrow("booking_com_credentials_invalid");
    expect(() => encryptBookingComCredentials({
      vaultId, environment: "production" as "test", credentials: { clientId: "client", clientSecret: "secret" },
    })).toThrow("booking_com_credentials_invalid");
    expect(() => encryptBookingComCredentials({
      vaultId, environment: "test", credentials: { clientId: "client", clientSecret: "secret", accessToken: token },
    })).toThrow("booking_com_credentials_invalid");
  });

  it("rejects tampered ciphertext and a wrong encryption key without returning plaintext", () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const envelope = encryptBookingComCredentials({
      vaultId, environment: "test", credentials: { clientId: "client", clientSecret: "secret" },
    });
    const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
    expect(() => decryptBookingComCredentials({ vaultId, environment: "test", envelope: tampered }))
      .toThrow("booking_com_credential_envelope_invalid");
    expect(() => decryptBookingComCredentials({ vaultId, environment: "test", envelope, encodedKey: Buffer.alloc(32, 5).toString("base64") }))
      .toThrow("booking_com_credential_envelope_invalid");
  });

  it("reads version-1 envelopes during rotation and re-encrypts them under the active version-2 key", () => {
    const nextKey = Buffer.alloc(32, 9).toString("base64");
    const credentials = { clientId: "rotation-client", clientSecret: "rotation-secret" };
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const oldEnvelope = encryptBookingComCredentials({ vaultId, environment: "test", credentials });
    expect(oldEnvelope.keyVersion).toBe(1);

    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V2", nextKey);
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "2");
    expect(decryptBookingComCredentials({ vaultId, environment: "test", envelope: oldEnvelope })).toEqual(credentials);
    const rotated = reencryptBookingComCredentials({ vaultId, environment: "test", envelope: oldEnvelope });
    expect(rotated.keyVersion).toBe(2);
    expect(JSON.stringify(rotated)).not.toContain(credentials.clientSecret);
    expect(decryptBookingComCredentials({ vaultId, environment: "test", envelope: rotated })).toEqual(credentials);

    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", "");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V1", key);
    expect(decryptBookingComCredentials({ vaultId, environment: "test", envelope: oldEnvelope }))
      .toEqual(credentials);
  });

  it("fails closed for unsupported active versions or missing active key material", () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "3");
    expect(() => encryptBookingComCredentials({
      vaultId, environment: "test", credentials: { clientId: "client", clientSecret: "secret" },
    })).toThrow("booking_com_credential_encryption_unavailable");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "2");
    expect(() => encryptBookingComCredentials({
      vaultId, environment: "test", credentials: { clientId: "client", clientSecret: "secret" },
    })).toThrow("booking_com_credential_encryption_unavailable");
  });
});
