import "server-only";

import { createAdminClient } from "../../supabase/admin";
import {
  createInjectedFlightConsumerPreviewPiiRepository,
  type FlightConsumerPiiRepository,
  type FlightConsumerPiiVault,
  type FlightSecurePiiLoadRpcParameters,
  type FlightSecurePiiStoreRpcParameters,
  type FlightSecurePiiTombstoneRpcParameters,
} from "./pii-repository.server";
import { readFlightConsumerPreviewPiiKeyring } from "./pii-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export class FlightConsumerPreviewPiiStagingError extends Error {
  constructor() {
    super("Flight Consumer Preview passenger records could not be staged.");
    this.name = "FlightConsumerPreviewPiiStagingError";
  }
}

class StagedPiiVault implements FlightConsumerPiiVault {
  readonly #records = new Map<string, FlightSecurePiiStoreRpcParameters>();

  async store(parameters: FlightSecurePiiStoreRpcParameters) {
    const existing = this.#records.get(parameters.p_secure_pii_record_ref);
    if (existing && JSON.stringify(existing) !== JSON.stringify(parameters)) {
      throw new FlightConsumerPreviewPiiStagingError();
    }
    this.#records.set(parameters.p_secure_pii_record_ref, Object.freeze({ ...parameters }));
    return [{
      decision: existing ? "replay" : "created",
      secure_pii_record_ref: parameters.p_secure_pii_record_ref,
    }];
  }

  async load(parameters: FlightSecurePiiLoadRpcParameters) {
    const staged = this.#records.get(parameters.p_secure_pii_record_ref);
    if (staged) {
      return [{
        secure_pii_record_ref: staged.p_secure_pii_record_ref,
        customer_id: staged.p_customer_id,
        order_id: staged.p_order_id,
        execution_scope_sha256: staged.p_execution_scope_sha256,
        traveler_type: staged.p_traveler_type,
        pii_record_sha256: staged.p_pii_record_sha256,
        pii_authority_receipt_sha256: staged.p_pii_authority_receipt_sha256,
        retention_expires_at: staged.p_retention_expires_at,
        key_version: staged.p_key_version,
        iv_base64url: staged.p_iv_base64url,
        auth_tag_base64url: staged.p_auth_tag_base64url,
        ciphertext_base64url: staged.p_ciphertext_base64url,
        aad_sha256: staged.p_aad_sha256,
        pii_hmac_sha256: staged.p_pii_hmac_sha256,
      }];
    }
    const { data, error } = await createAdminClient().rpc("load_flight_secure_pii_record_v1", parameters);
    if (error) throw new FlightConsumerPreviewPiiStagingError();
    return data;
  }

  async tombstone(_parameters: FlightSecurePiiTombstoneRpcParameters) {
    void _parameters;
    throw new FlightConsumerPreviewPiiStagingError();
  }

  takeAll() {
    if (this.#records.size === 0) throw new FlightConsumerPreviewPiiStagingError();
    const records = [...this.#records.values()].sort((left, right) => (
      left.p_secure_pii_record_ref.localeCompare(right.p_secure_pii_record_ref)
    ));
    this.#records.clear();
    return Object.freeze(records);
  }
}

export type StagedFlightConsumerPreviewPiiRepository = Readonly<{
  repository: FlightConsumerPiiRepository;
  takePreparedPassengers: () => readonly FlightSecurePiiStoreRpcParameters[];
}>;

export async function createStagedFlightConsumerPreviewPiiRepository(input: Readonly<{
  customerId: string;
  orderId: string;
}>): Promise<StagedFlightConsumerPreviewPiiRepository> {
  try {
    const runtime = await requireFlightConsumerPreviewRequestRuntime();
    const vault = new StagedPiiVault();
    const repository = createInjectedFlightConsumerPreviewPiiRepository({
      customerId: input.customerId,
      orderId: input.orderId,
      executionScopeSha256: runtime.binding.executionScopeSha256,
      piiKeyVersion: runtime.binding.piiKeyVersion,
    }, {
      vault,
      keyring: readFlightConsumerPreviewPiiKeyring(),
      readTrustedTime: () => new Date().toISOString(),
    });
    return Object.freeze({
      repository,
      takePreparedPassengers: () => vault.takeAll(),
    });
  } catch {
    throw new FlightConsumerPreviewPiiStagingError();
  }
}

export function normalizedStagedFlightConsumerPassenger(
  travelerSequence: number,
  parameters: FlightSecurePiiStoreRpcParameters,
) {
  return Object.freeze({
    traveler_sequence: travelerSequence,
    traveler_type: parameters.p_traveler_type,
    secure_pii_record_ref: parameters.p_secure_pii_record_ref,
    pii_record_sha256: parameters.p_pii_record_sha256,
    pii_authority_receipt_sha256: parameters.p_pii_authority_receipt_sha256,
    retention_expires_at: parameters.p_retention_expires_at,
    key_version: parameters.p_key_version,
    iv_base64url: parameters.p_iv_base64url,
    auth_tag_base64url: parameters.p_auth_tag_base64url,
    ciphertext_base64url: parameters.p_ciphertext_base64url,
    aad_sha256: parameters.p_aad_sha256,
    pii_hmac_sha256: parameters.p_pii_hmac_sha256,
  });
}
