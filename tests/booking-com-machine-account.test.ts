import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { encryptBookingComCredentials } from "../services/hotel-channels/booking-com/credentials";
import { getBookingComMachineAccountToken } from "../services/hotel-channels/booking-com/machine-account";

const accountId = "e3bb11c9-a74e-4e23-9f3e-74073f0e8311";
const propertyId = "bd4cf12a-5a72-4b8f-8183-2936756107de";
const key = Buffer.alloc(32, 4).toString("base64");
const liveToken = `${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}`;
const refreshedToken = `${"d".repeat(32)}.${"e".repeat(32)}.${"f".repeat(32)}`;
const now = 1_800_000_000_000;

type TestAccount = {
  id: string;
  property_id: string;
  environment: string;
  enabled: boolean;
  partner_approved: boolean;
  approved_at: string | null;
  credentials_ciphertext: string;
  credentials_initialization_vector: string;
  credentials_authentication_tag: string;
  credentials_key_version: number;
};

function account(credentials: { clientId: string; clientSecret: string; accessToken?: string; accessTokenExpiresAt?: number }): TestAccount {
  const envelope = encryptBookingComCredentials({ vaultId: accountId, environment: "test", credentials });
  return {
    id: accountId, property_id: propertyId, environment: "test", enabled: true, partner_approved: true,
    approved_at: new Date(now - 1000).toISOString(),
    credentials_ciphertext: envelope.ciphertext,
    credentials_initialization_vector: envelope.initializationVector,
    credentials_authentication_tag: envelope.authenticationTag,
    credentials_key_version: envelope.keyVersion,
  };
}

function fakeStore(initial: TestAccount, overrides: Record<string, unknown> = {}) {
  let current = { ...initial };
  let leaseHeld = false;
  const calls = { acquire: 0, release: 0, writes: 0, loads: 0 };
  const store = {
    async loadAccount() { calls.loads += 1; return { ...current }; },
    async hasApprovedConnection() { return true; },
    async acquireRefreshLease() { calls.acquire += 1; if (leaseHeld) return "busy"; leaseHeld = true; return "acquired"; },
    async releaseRefreshLease() { calls.release += 1; leaseHeld = false; return true; },
    async replaceEnvelope(_id: string, expectedCiphertext: string, _leaseToken: string, envelope: ReturnType<typeof encryptBookingComCredentials>) {
      calls.writes += 1;
      if (expectedCiphertext !== current.credentials_ciphertext) return false;
      current = {
        ...current,
        credentials_ciphertext: envelope.ciphertext,
        credentials_initialization_vector: envelope.initializationVector,
        credentials_authentication_tag: envelope.authenticationTag,
        credentials_key_version: envelope.keyVersion,
      };
      leaseHeld = false;
      return true;
    },
    ...overrides,
  };
  return { store, calls, current: () => ({ ...current }) };
}

afterEach(() => vi.unstubAllEnvs());

describe("Booking.com machine-account runtime", () => {
  it("reuses a valid encrypted cached token without consuming an exchange", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const { store, calls } = fakeStore(account({
      clientId: "client-id", clientSecret: "client-secret", accessToken: liveToken, accessTokenExpiresAt: now + 600_000,
    }));
    const fetcher: typeof fetch = async () => { throw new Error("must not contact provider"); };
    const token = await getBookingComMachineAccountToken(accountId, { store: store as never, fetcher, now: () => now });
    expect(token).toBe(liveToken);
    expect(calls).toMatchObject({ acquire: 0, writes: 0 });
  });

  it("leases one shared exchange, caches the token encrypted, and reuses it", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const { store, calls, current } = fakeStore(account({ clientId: "client-id", clientSecret: "client-secret" }));
    let requests = 0;
    const fetcher: typeof fetch = async (input, init) => {
      requests += 1;
      expect(String(input)).toBe("https://connectivity-authentication.booking.com/token-based-authentication/exchange");
      expect(JSON.parse(String(init?.body))).toEqual({ client_id: "client-id", client_secret: "client-secret" });
      return new Response(JSON.stringify({ jwt: refreshedToken }), { status: 200 });
    };
    const options = { store: store as never, fetcher, now: () => now };
    expect(await getBookingComMachineAccountToken(accountId, options)).toBe(refreshedToken);
    expect(JSON.stringify(current())).not.toContain("client-secret");
    expect(JSON.stringify(current())).not.toContain(refreshedToken);
    expect(await getBookingComMachineAccountToken(accountId, options)).toBe(refreshedToken);
    expect({ requests, ...calls }).toMatchObject({ requests: 1, acquire: 1, writes: 1, release: 0 });
  });

  it("fails closed before reading or exchanging an unapproved account", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const blocked = account({ clientId: "client-id", clientSecret: "client-secret" });
    blocked.partner_approved = false;
    const { store, calls } = fakeStore(blocked);
    await expect(getBookingComMachineAccountToken(accountId, {
      store: store as never,
      fetcher: async () => { throw new Error("must not contact provider"); },
      now: () => now,
    })).rejects.toThrow("booking_com_account_unavailable");
    expect(calls.acquire).toBe(0);
  });

  it("uses a refreshed cache found after lease acquisition instead of contacting the provider", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const original = account({ clientId: "client-id", clientSecret: "client-secret" });
    const winner = account({ clientId: "client-id", clientSecret: "client-secret", accessToken: liveToken, accessTokenExpiresAt: now + 600_000 });
    let loads = 0;
    const store = {
      async loadAccount() { loads += 1; return loads === 1 ? original : winner; },
      async hasApprovedConnection() { return true; },
      async acquireRefreshLease() { return "acquired"; },
      async releaseRefreshLease() { return true; },
      async replaceEnvelope() { return false; },
    };
    const token = await getBookingComMachineAccountToken(accountId, {
      store: store as never,
      fetcher: async () => { throw new Error("must use the just-refreshed encrypted cache"); },
      now: () => now,
    });
    expect(token).toBe(liveToken);
    expect(loads).toBe(2);
  });

  it("does not start another provider exchange while a different worker holds the refresh lease", async () => {
    vi.stubEnv("BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY", key);
    const { store, calls } = fakeStore(account({ clientId: "client-id", clientSecret: "client-secret" }));
    const fetcher: typeof fetch = async () => { throw new Error("busy worker must not contact provider"); };
    const busyStore = {
      ...store,
      async acquireRefreshLease() { calls.acquire += 1; return "busy" as const; },
    };
    await expect(getBookingComMachineAccountToken(accountId, {
      store: busyStore as never, fetcher, now: () => now,
    })).rejects.toThrow("booking_com_token_refresh_in_progress");
    expect(calls).toMatchObject({ acquire: 1, writes: 0, release: 0 });
  });
});
