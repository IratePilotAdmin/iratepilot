import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeBookingComMachineAccountToken } from "./auth";
import {
  decryptBookingComCredentials,
  encryptBookingComCredentials,
  type BookingComCredentialEnvelope,
} from "./credentials";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_REUSE_SKEW_MS = 60_000;

type VaultAccount = {
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

type AccountStore = {
  loadAccount(id: string): Promise<VaultAccount | null>;
  hasApprovedConnection(account: VaultAccount): Promise<boolean>;
  acquireRefreshLease(id: string, leaseToken: string): Promise<"acquired" | "busy" | "rate_limited" | "unavailable">;
  releaseRefreshLease(id: string, leaseToken: string): Promise<boolean>;
  replaceEnvelope(id: string, expectedCiphertext: string, leaseToken: string, envelope: BookingComCredentialEnvelope): Promise<boolean>;
};

type RuntimeOptions = {
  store?: AccountStore;
  fetcher?: typeof fetch;
  now?: () => number;
};

function accountUnavailable() {
  return new Error("booking_com_account_unavailable");
}

function createAccountStore(): AccountStore {
  return {
    async loadAccount(id) {
      const { data, error } = await createAdminClient()
        .from("irp_ota_machine_accounts")
        .select("id,property_id,environment,enabled,partner_approved,approved_at,credentials_ciphertext,credentials_initialization_vector,credentials_authentication_tag,credentials_key_version")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("booking_com_vault_unavailable");
      return data as VaultAccount | null;
    },
    async hasApprovedConnection(account) {
      const admin = createAdminClient();
      const { data: connection, error: connectionError } = await admin
        .from("irp_ota_channel_connections")
        .select("property_id")
        .eq("machine_account_id", account.id)
        .eq("property_id", account.property_id)
        .eq("provider", "booking_com")
        .eq("environment", "test")
        .eq("enabled", true)
        .eq("partner_approved", true)
        .limit(1)
        .maybeSingle();
      if (connectionError) throw new Error("booking_com_vault_unavailable");
      if (!connection) return false;

      const { data: property, error: propertyError } = await admin
        .from("properties")
        .select("partner_id")
        .eq("id", account.property_id)
        .eq("active", true)
        .maybeSingle();
      if (propertyError) throw new Error("booking_com_vault_unavailable");
      if (!property) return false;

      const { data: partner, error: partnerError } = await admin
        .from("partners")
        .select("id")
        .eq("id", property.partner_id)
        .eq("status", "approved")
        .maybeSingle();
      if (partnerError) throw new Error("booking_com_vault_unavailable");
      return !!partner;
    },
    async acquireRefreshLease(id, leaseToken) {
      const { data, error } = await createAdminClient().rpc("irp_ota_acquire_booking_com_token_refresh_lease", {
        p_machine_account_id: id,
        p_lease_token: leaseToken,
      });
      if (error) throw new Error("booking_com_token_lease_unavailable");
      const decision = data as { allowed?: unknown; reason?: unknown } | null;
      if (decision?.allowed === true && decision.reason === "acquired") return "acquired";
      if (decision?.reason === "refresh_in_progress") return "busy";
      if (decision?.reason === "rate_limited") return "rate_limited";
      return "unavailable";
    },
    async releaseRefreshLease(id, leaseToken) {
      const { data, error } = await createAdminClient().rpc("irp_ota_release_booking_com_token_refresh_lease", {
        p_machine_account_id: id,
        p_lease_token: leaseToken,
      });
      if (error || typeof data !== "boolean") throw new Error("booking_com_token_lease_unavailable");
      return data;
    },
    async replaceEnvelope(id, expectedCiphertext, leaseToken, envelope) {
      const { data, error } = await createAdminClient().rpc("irp_ota_commit_booking_com_token_refresh", {
        p_machine_account_id: id,
        p_expected_ciphertext: expectedCiphertext,
        p_lease_token: leaseToken,
        p_ciphertext: envelope.ciphertext,
        p_initialization_vector: envelope.initializationVector,
        p_authentication_tag: envelope.authenticationTag,
        p_key_version: envelope.keyVersion,
      });
      if (error) throw new Error("booking_com_vault_unavailable");
      if (typeof data !== "boolean") throw new Error("booking_com_vault_unavailable");
      return data;
    },
  };
}

function decryptAccount(account: VaultAccount) {
  if (account.environment !== "test") throw accountUnavailable();
  return decryptBookingComCredentials({
    vaultId: account.id,
    environment: "test",
    envelope: {
      ciphertext: account.credentials_ciphertext,
      initializationVector: account.credentials_initialization_vector,
      authenticationTag: account.credentials_authentication_tag,
      keyVersion: account.credentials_key_version,
    },
  });
}

/** Loads an approved Booking.com test account and returns a short-lived JWT.
 * Credentials and the cached JWT stay encrypted in the server-only vault.
 */
export async function getBookingComMachineAccountToken(
  accountId: string,
  options: RuntimeOptions = {},
): Promise<string> {
  if (!UUID.test(accountId)) throw accountUnavailable();
  const store = options.store ?? createAccountStore();
  const account = await store.loadAccount(accountId);
  if (!account || account.id !== accountId || account.environment !== "test"
    || !account.enabled || !account.partner_approved || !account.approved_at
    || !await store.hasApprovedConnection(account)) throw accountUnavailable();

  const now = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("booking_com_auth_clock_invalid");
  const savedCredentials = decryptAccount(account);
  if (savedCredentials.accessToken && savedCredentials.accessTokenExpiresAt
    && savedCredentials.accessTokenExpiresAt > now + TOKEN_REUSE_SKEW_MS) {
    return savedCredentials.accessToken;
  }

  const leaseToken = randomUUID();
  const lease = await store.acquireRefreshLease(accountId, leaseToken);
  if (lease === "busy") throw new Error("booking_com_token_refresh_in_progress");
  if (lease === "rate_limited") throw new Error("booking_com_token_rate_limited");
  if (lease !== "acquired") throw accountUnavailable();

  let leaseHeld = true;
  try {
    // The first read can race another worker's completed refresh. Re-read only
    // after acquiring the lease so a worker never exchanges a stale snapshot.
    const current = await store.loadAccount(accountId);
    if (!current || current.id !== accountId || current.environment !== "test"
      || !current.enabled || !current.partner_approved || !current.approved_at
      || !await store.hasApprovedConnection(current)) throw accountUnavailable();
    const currentCredentials = decryptAccount(current);
    if (currentCredentials.accessToken && currentCredentials.accessTokenExpiresAt
      && currentCredentials.accessTokenExpiresAt > now + TOKEN_REUSE_SKEW_MS) return currentCredentials.accessToken;

    const fresh = await exchangeBookingComMachineAccountToken({
      clientId: currentCredentials.clientId,
      clientSecret: currentCredentials.clientSecret,
    }, { fetcher: options.fetcher, now: options.now });
    const envelope = encryptBookingComCredentials({
      vaultId: accountId,
      environment: "test",
      credentials: {
        clientId: currentCredentials.clientId,
        clientSecret: currentCredentials.clientSecret,
        accessToken: fresh.accessToken,
        accessTokenExpiresAt: fresh.expiresAt,
      },
    });
    if (await store.replaceEnvelope(accountId, current.credentials_ciphertext, leaseToken, envelope)) {
      leaseHeld = false;
      return fresh.accessToken;
    }

    // A lease expiry or cache update race must not overwrite another worker's
    // token. Use a fresh encrypted winner or let the caller retry later.
    const winner = await store.loadAccount(accountId);
    if (winner && winner.enabled && winner.partner_approved && winner.approved_at
      && winner.environment === "test" && await store.hasApprovedConnection(winner)) {
      const winnerCredentials = decryptAccount(winner);
      if (winnerCredentials.accessToken && winnerCredentials.accessTokenExpiresAt
        && winnerCredentials.accessTokenExpiresAt > now + TOKEN_REUSE_SKEW_MS) return winnerCredentials.accessToken;
    }
    throw new Error("booking_com_token_cache_conflict");
  } finally {
    if (leaseHeld) await store.releaseRefreshLease(accountId, leaseToken).catch(() => false);
  }
}
