import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptBookingComCredentials } from "./credentials";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,80}$/;

export type BookingComOnboardingInput = {
  propertyId: string;
  providerPropertyId: string;
  clientId: string;
  clientSecret: string;
};

export type BookingComOnboardingStore = {
  createAccount(row: Record<string, unknown>): Promise<void>;
  createConnection(row: Record<string, unknown>): Promise<void>;
  deleteAccount(id: string): Promise<void>;
};

export function parseBookingComOnboardingInput(value: unknown): BookingComOnboardingInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["propertyId", "providerPropertyId", "clientId", "clientSecret"].includes(key))) return null;
  if (typeof body.propertyId !== "string" || !UUID.test(body.propertyId)
    || typeof body.providerPropertyId !== "string" || !PROVIDER_ID.test(body.providerPropertyId)
    || typeof body.clientId !== "string" || body.clientId.length < 1 || body.clientId.length > 200
    || /[\u0000-\u001f\u007f]/.test(body.clientId)
    || typeof body.clientSecret !== "string" || body.clientSecret.length < 1 || body.clientSecret.length > 4096
    || /[\u0000-\u001f\u007f]/.test(body.clientSecret)) return null;
  return {
    propertyId: body.propertyId,
    providerPropertyId: body.providerPropertyId,
    clientId: body.clientId,
    clientSecret: body.clientSecret,
  };
}

function createStore(): BookingComOnboardingStore {
  return {
    async createAccount(row) {
      const { error } = await createAdminClient().from("irp_ota_machine_accounts").insert(row);
      if (error?.code === "42P01") throw new Error("booking_com_vault_migration_required");
      if (error) throw new Error("booking_com_account_save_failed");
    },
    async createConnection(row) {
      const { error } = await createAdminClient().from("irp_ota_channel_connections").insert(row);
      if (error?.code === "42P01") throw new Error("booking_com_vault_migration_required");
      if (error) throw new Error("booking_com_connection_save_failed");
    },
    async deleteAccount(id) {
      const { error } = await createAdminClient().from("irp_ota_machine_accounts").delete().eq("id", id);
      if (error) throw new Error("booking_com_account_cleanup_failed");
    },
  };
}

/** Creates a disabled Booking.com test account. The submitted secret is encrypted
 * before any database write and is never returned to the caller.
 */
export async function provisionBookingComTestConnection(
  input: BookingComOnboardingInput,
  options: { store?: BookingComOnboardingStore; createId?: () => string } = {},
) {
  const parsed = parseBookingComOnboardingInput(input);
  if (!parsed) throw new Error("booking_com_onboarding_input_invalid");
  const id = options.createId?.() ?? randomUUID();
  if (!UUID.test(id)) throw new Error("booking_com_onboarding_input_invalid");
  const connectionId = `booking-${id.replaceAll("-", "").slice(0, 32)}`;
  const envelope = encryptBookingComCredentials({
    vaultId: id,
    environment: "test",
    credentials: { clientId: parsed.clientId, clientSecret: parsed.clientSecret },
  });
  const store = options.store ?? createStore();
  await store.createAccount({
    id,
    property_id: parsed.propertyId,
    provider: "booking_com",
    environment: "test",
    credentials_ciphertext: envelope.ciphertext,
    credentials_initialization_vector: envelope.initializationVector,
    credentials_authentication_tag: envelope.authenticationTag,
    credentials_key_version: envelope.keyVersion,
  });
  try {
    await store.createConnection({
      connection_id: connectionId,
      property_id: parsed.propertyId,
      provider: "booking_com",
      provider_property_id: parsed.providerPropertyId,
      environment: "test",
      machine_account_id: id,
      enabled: false,
      partner_approved: false,
      pii_compliance_approved: false,
    });
  } catch {
    try { await store.deleteAccount(id); } catch { /* Leave the caller a sanitized error; an orphan stays disabled. */ }
    throw new Error("booking_com_connection_save_failed");
  }
  return { accountId: id, connectionId, environment: "test" as const, status: "partner_approval_pending" as const };
}
