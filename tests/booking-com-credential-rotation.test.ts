import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { encryptBookingComCredentials, decryptBookingComCredentials } from "../services/hotel-channels/booking-com/credentials";
import { runBookingComCredentialRotation } from "../lib/booking-com-credential-rotation";

const accountId = "e3bb11c9-a74e-4e23-9f3e-74073f0e8311";
const leaseToken = "bd4cf12a-5a72-4b8f-8183-2936756107de";
const oldKey = Buffer.alloc(32, 4).toString("base64");
const nextKey = Buffer.alloc(32, 9).toString("base64");

afterEach(() => vi.unstubAllEnvs());

function setup() {
  vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", oldKey);
  const originalEnvelope = encryptBookingComCredentials({
    vaultId: accountId,
    environment: "test",
    credentials: { clientId: "rotation-client", clientSecret: "rotation-secret" },
  });
  const item = {
    id: accountId,
    credentials_ciphertext: originalEnvelope.ciphertext,
    credentials_initialization_vector: originalEnvelope.initializationVector,
    credentials_authentication_tag: originalEnvelope.authenticationTag,
    credentials_key_version: originalEnvelope.keyVersion,
    lease_token: leaseToken,
  };
  const calls = { commits: 0, releases: 0 };
  let saved: typeof originalEnvelope | null = null;
  return {
    item,
    calls,
    saved: () => saved,
    store: {
      async claim() { return [item]; },
      async commit(_item: typeof item, envelope: typeof originalEnvelope) { calls.commits += 1; saved = envelope; return true; },
      async release() { calls.releases += 1; return true; },
    },
  };
}

describe("Booking.com encrypted credential rotation worker", () => {
  it("claims and re-encrypts one test account under the active key without returning plaintext", async () => {
    const state = setup();
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V2", nextKey);
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "2");
    const result = await runBookingComCredentialRotation({ targetKeyVersion: 2, limit: 5 }, { store: state.store as never });
    expect(result).toEqual({ claimed: 1, rotated: 1, stale: 0, failed: 0 });
    expect(state.calls).toEqual({ commits: 1, releases: 0 });
    expect(state.saved()?.keyVersion).toBe(2);
    expect(JSON.stringify(state.saved())).not.toContain("rotation-secret");
    expect(decryptBookingComCredentials({ vaultId: accountId, environment: "test", envelope: state.saved()! }))
      .toEqual({ clientId: "rotation-client", clientSecret: "rotation-secret" });
  });

  it("releases a claimed row when its source key is unavailable and reports only a safe failure count", async () => {
    const state = setup();
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", "");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V1", "");
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY_V2", nextKey);
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION", "2");
    const result = await runBookingComCredentialRotation({ targetKeyVersion: 2, limit: 5 }, { store: state.store as never });
    expect(result).toEqual({ claimed: 1, rotated: 0, stale: 0, failed: 1 });
    expect(state.calls).toEqual({ commits: 0, releases: 1 });
  });

  it("rejects batches outside the database-enforced limit", async () => {
    await expect(runBookingComCredentialRotation({ targetKeyVersion: 2, limit: 26 }, { store: {} as never }))
      .rejects.toThrow("booking_com_credential_rotation_configuration_invalid");
  });
});
