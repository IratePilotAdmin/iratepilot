import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decryptBookingComCredentials } from "../services/hotel-channels/booking-com/credentials";
import {
  parseBookingComOnboardingInput,
  provisionBookingComTestConnection,
  type BookingComOnboardingStore,
} from "../services/hotel-channels/booking-com/onboarding";

const propertyId = "bd4cf12a-5a72-4b8f-8183-2936756107de";
const accountId = "e3bb11c9-a74e-4e23-9f3e-74073f0e8311";
const key = Buffer.alloc(32, 4).toString("base64");
const valid = {
  propertyId,
  providerPropertyId: "booking-property-123",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};

afterEach(() => vi.unstubAllEnvs());

describe("Booking.com test-account onboarding", () => {
  it("accepts only the bounded test-account fields", () => {
    expect(parseBookingComOnboardingInput(valid)).toEqual(valid);
    expect(parseBookingComOnboardingInput({ ...valid, environment: "production" })).toBeNull();
    expect(parseBookingComOnboardingInput({ ...valid, clientSecret: "bad\nsecret" })).toBeNull();
    expect(parseBookingComOnboardingInput({ ...valid, clientId: "x".repeat(201) })).toBeNull();
    expect(parseBookingComOnboardingInput({ ...valid, unexpected: "value" })).toBeNull();
    expect(parseBookingComOnboardingInput(null)).toBeNull();
  });

  it("encrypts the client secret before storage and always creates disabled, unapproved test metadata", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const rows: { account?: Record<string, unknown>; connection?: Record<string, unknown> } = {};
    const store: BookingComOnboardingStore = {
      async createAccount(row) { rows.account = row; },
      async createConnection(row) { rows.connection = row; },
      async deleteAccount() { throw new Error("unexpected cleanup"); },
    };
    const result = await provisionBookingComTestConnection(valid, { store, createId: () => accountId });
    expect(result).toEqual({
      accountId,
      connectionId: "booking-e3bb11c9a74e4e239f3e74073f0e8311",
      environment: "test",
      status: "partner_approval_pending",
    });
    expect(rows.account).toMatchObject({
      id: accountId, property_id: propertyId, provider: "booking_com", environment: "test",
      credentials_key_version: 1,
    });
    expect(String(rows.account?.credentials_ciphertext)).not.toContain(valid.clientSecret);
    const credentials = decryptBookingComCredentials({
      vaultId: accountId,
      environment: "test",
      envelope: {
        ciphertext: String(rows.account?.credentials_ciphertext),
        initializationVector: String(rows.account?.credentials_initialization_vector),
        authenticationTag: String(rows.account?.credentials_authentication_tag),
        keyVersion: Number(rows.account?.credentials_key_version),
      },
    });
    expect(credentials).toEqual({ clientId: valid.clientId, clientSecret: valid.clientSecret });
    expect(rows.connection).toMatchObject({
      property_id: propertyId, provider: "booking_com", provider_property_id: valid.providerPropertyId,
      environment: "test", machine_account_id: accountId, enabled: false, partner_approved: false,
      pii_compliance_approved: false,
    });
    expect(JSON.stringify(result)).not.toContain(valid.clientSecret);
  });

  it("removes a newly created vault row if connection metadata cannot be saved", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const deleted: string[] = [];
    const store: BookingComOnboardingStore = {
      async createAccount() {},
      async createConnection() { throw new Error("database detail must not escape"); },
      async deleteAccount(id) { deleted.push(id); },
    };
    await expect(provisionBookingComTestConnection(valid, { store, createId: () => accountId }))
      .rejects.toThrow("booking_com_connection_save_failed");
    expect(deleted).toEqual([accountId]);
  });
});
