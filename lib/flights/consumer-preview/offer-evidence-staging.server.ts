import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import type { DuffelAuthenticatedOfferEvidenceRepository } from "../duffel-sandbox-contract";
import {
  createInjectedFlightConsumerPreviewOfferEvidenceRepository,
  type FlightConsumerOfferEvidenceVault,
  type FlightOfferEvidenceLoadRpcParameters,
  type FlightOfferEvidenceStoreRpcParameters,
} from "./offer-evidence-repository.server";
import {
  readFlightConsumerPreviewOfferEvidenceKeyring,
  type FlightConsumerOfferEvidenceKeyring,
} from "./evidence-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

const identitySchema = z.object({
  customerId: z.string().uuid(),
  searchId: z.string().uuid(),
  offerId: z.string().uuid(),
  localOfferId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  executionScopeSha256: z.string().regex(/^[0-9a-f]{64}$/),
  evidenceKeyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
}).strict();

export class FlightConsumerPreviewOfferEvidenceStagingError extends Error {
  constructor() {
    super("Flight Consumer Preview offer evidence could not be staged.");
    this.name = "FlightConsumerPreviewOfferEvidenceStagingError";
  }
}
export interface FlightConsumerPreviewEvidenceLoadRpc {
  load(parameters: FlightOfferEvidenceLoadRpcParameters): Promise<unknown>;
}

class AdminEvidenceLoadRpc implements FlightConsumerPreviewEvidenceLoadRpc {
  async load(parameters: FlightOfferEvidenceLoadRpcParameters) {
    const { data, error } = await createAdminClient().rpc("load_flight_offer_evidence_v1", parameters);
    if (error) throw new FlightConsumerPreviewOfferEvidenceStagingError();
    return data;
  }
}

class StagingVault implements FlightConsumerOfferEvidenceVault {
  readonly #loader: FlightConsumerPreviewEvidenceLoadRpc;
  #prepared: FlightOfferEvidenceStoreRpcParameters | null = null;

  constructor(loader: FlightConsumerPreviewEvidenceLoadRpc) {
    if (typeof loader?.load !== "function") throw new FlightConsumerPreviewOfferEvidenceStagingError();
    this.#loader = loader;
  }

  async load(parameters: FlightOfferEvidenceLoadRpcParameters) {
    return this.#loader.load(parameters);
  }

  async store(parameters: FlightOfferEvidenceStoreRpcParameters) {
    if (this.#prepared !== null) throw new FlightConsumerPreviewOfferEvidenceStagingError();
    this.#prepared = Object.freeze({ ...parameters });
    return [{
      decision: "created",
      evidence_id: randomUUID(),
      receipt_sha256: parameters.p_receipt_sha256,
    }];
  }

  take() {
    if (this.#prepared === null) throw new FlightConsumerPreviewOfferEvidenceStagingError();
    const prepared = this.#prepared;
    this.#prepared = null;
    return prepared;
  }
}

export type StagedFlightConsumerPreviewOfferEvidenceRepository = Readonly<{
  repository: DuffelAuthenticatedOfferEvidenceRepository;
  takePreparedEvidence: () => FlightOfferEvidenceStoreRpcParameters;
}>;

export function createInjectedStagedFlightConsumerPreviewOfferEvidenceRepository(input: Readonly<{
  identity: z.input<typeof identitySchema>;
  keyring: FlightConsumerOfferEvidenceKeyring;
  loader: FlightConsumerPreviewEvidenceLoadRpc;
  readTrustedTime: () => string;
}>): StagedFlightConsumerPreviewOfferEvidenceRepository {
  try {
    const identity = identitySchema.parse(input.identity);
    const vault = new StagingVault(input.loader);
    const repository = createInjectedFlightConsumerPreviewOfferEvidenceRepository({
      customerId: identity.customerId,
      searchId: identity.searchId,
      offerId: identity.offerId,
      localOfferId: identity.localOfferId,
      executionScopeSha256: identity.executionScopeSha256,
      evidenceKeyVersion: identity.evidenceKeyVersion,
    }, {
      vault,
      keyring: input.keyring,
      readTrustedTime: input.readTrustedTime,
    });
    return Object.freeze({
      repository,
      takePreparedEvidence: () => vault.take(),
    });
  } catch {
    throw new FlightConsumerPreviewOfferEvidenceStagingError();
  }
}

export async function createStagedFlightConsumerPreviewOfferEvidenceRepository(input: Readonly<{
  customerId: string;
  searchId: string;
  offerId: string;
  localOfferId: string;
}>): Promise<StagedFlightConsumerPreviewOfferEvidenceRepository> {
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  return createInjectedStagedFlightConsumerPreviewOfferEvidenceRepository({
    identity: {
      ...input,
      executionScopeSha256: runtime.binding.executionScopeSha256,
      evidenceKeyVersion: runtime.binding.evidenceKeyVersion,
    },
    keyring: readFlightConsumerPreviewOfferEvidenceKeyring(),
    loader: new AdminEvidenceLoadRpc(),
    readTrustedTime: () => new Date().toISOString(),
  });
}
