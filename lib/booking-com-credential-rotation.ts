import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  reencryptBookingComCredentials,
  type BookingComCredentialEnvelope,
} from "@/services/hotel-channels/booking-com/credentials";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENCODED = /^[A-Za-z0-9+/]+={0,2}$/;

type RotationItem = {
  id: string;
  credentials_ciphertext: string;
  credentials_initialization_vector: string;
  credentials_authentication_tag: string;
  credentials_key_version: number;
  lease_token: string;
};

type RotationStore = {
  claim(targetKeyVersion: 1 | 2, limit: number): Promise<RotationItem[]>;
  commit(item: RotationItem, envelope: BookingComCredentialEnvelope): Promise<boolean>;
  release(item: RotationItem): Promise<boolean>;
};

type RotationConfig = {
  targetKeyVersion: 1 | 2;
  limit: number;
};

type Dependencies = { store?: RotationStore };

function validItem(value: unknown): value is RotationItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && UUID.test(row.id)
    && typeof row.lease_token === "string" && UUID.test(row.lease_token)
    && typeof row.credentials_ciphertext === "string" && row.credentials_ciphertext.length > 0
    && row.credentials_ciphertext.length <= 22_000 && ENCODED.test(row.credentials_ciphertext)
    && typeof row.credentials_initialization_vector === "string" && /^[A-Za-z0-9+/]{16}$/.test(row.credentials_initialization_vector)
    && typeof row.credentials_authentication_tag === "string" && /^[A-Za-z0-9+/]{22}==$/.test(row.credentials_authentication_tag)
    && (row.credentials_key_version === 1 || row.credentials_key_version === 2);
}

function createStore(): RotationStore {
  return {
    async claim(targetKeyVersion, limit) {
      const { data, error } = await createAdminClient().rpc("irp_ota_claim_booking_com_credential_rotation", {
        p_target_key_version: targetKeyVersion,
        p_limit: limit,
      });
      if (error || !Array.isArray(data) || data.length > limit || !data.every(validItem)) {
        throw new Error("booking_com_credential_rotation_claim_failed");
      }
      return data;
    },
    async commit(item, envelope) {
      const { data, error } = await createAdminClient().rpc("irp_ota_commit_booking_com_credential_rotation", {
        p_machine_account_id: item.id,
        p_lease_token: item.lease_token,
        p_expected_ciphertext: item.credentials_ciphertext,
        p_expected_initialization_vector: item.credentials_initialization_vector,
        p_expected_authentication_tag: item.credentials_authentication_tag,
        p_expected_key_version: item.credentials_key_version,
        p_ciphertext: envelope.ciphertext,
        p_initialization_vector: envelope.initializationVector,
        p_authentication_tag: envelope.authenticationTag,
        p_key_version: envelope.keyVersion,
      });
      if (error || typeof data !== "boolean") throw new Error("booking_com_credential_rotation_commit_failed");
      return data;
    },
    async release(item) {
      const { data, error } = await createAdminClient().rpc("irp_ota_release_booking_com_credential_rotation", {
        p_machine_account_id: item.id,
        p_lease_token: item.lease_token,
      });
      if (error || typeof data !== "boolean") throw new Error("booking_com_credential_rotation_release_failed");
      return data;
    },
  };
}

/** Rotates a bounded batch of encrypted Booking.com test credentials; plaintext stays in process memory. */
export async function runBookingComCredentialRotation(
  config: RotationConfig,
  dependencies: Dependencies = {},
) {
  if (!config || (config.targetKeyVersion !== 1 && config.targetKeyVersion !== 2)
    || !Number.isSafeInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("booking_com_credential_rotation_configuration_invalid");
  }
  const active = process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION;
  if ((active && active !== String(config.targetKeyVersion)) || (!active && config.targetKeyVersion !== 1)) {
    throw new Error("booking_com_credential_rotation_target_mismatch");
  }

  const store = dependencies.store ?? createStore();
  const items = await store.claim(config.targetKeyVersion, config.limit);
  const result = { claimed: items.length, rotated: 0, stale: 0, failed: 0 };
  for (const item of items) {
    if (!validItem(item) || item.credentials_key_version === config.targetKeyVersion) {
      result.failed += 1;
      await store.release(item).catch(() => false);
      continue;
    }
    try {
      const envelope = reencryptBookingComCredentials({
        vaultId: item.id,
        environment: "test",
        envelope: {
          ciphertext: item.credentials_ciphertext,
          initializationVector: item.credentials_initialization_vector,
          authenticationTag: item.credentials_authentication_tag,
          keyVersion: item.credentials_key_version,
        },
      });
      if (envelope.keyVersion !== config.targetKeyVersion) throw new Error("key_version_mismatch");
      if (await store.commit(item, envelope)) result.rotated += 1;
      else {
        result.stale += 1;
        await store.release(item).catch(() => false);
      }
    } catch {
      result.failed += 1;
      await store.release(item).catch(() => false);
    }
  }
  return result;
}
