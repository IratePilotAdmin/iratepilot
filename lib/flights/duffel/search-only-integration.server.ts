import "server-only";

import type { FlightCommerceSearchRequest } from "../commerce-domain";
import {
  buildDuffelSandboxOfferRequestPlan,
  buildDuffelSandboxOfferRetrievalPlan,
  buildDuffelSandboxOrderListByOfferPlan,
  type DuffelRefreshedOfferEvidence,
  type DuffelSanitizedOfferEvidence,
} from "../duffel-sandbox-contract";
import {
  createDuffelTestHttpTransport,
  type DuffelHttpTransportResult,
  type DuffelTestHttpTransportDependencies,
} from "./http-transport.server";

export const DUFFEL_SEARCH_ONLY_INTEGRATION_MODE = "default_disabled" as const;

export type DuffelSandboxSearchOnlyDependencies = DuffelTestHttpTransportDependencies;

export interface DuffelSandboxSearchOnlyIntegration {
  createOfferRequest(search: FlightCommerceSearchRequest): Promise<DuffelHttpTransportResult>;
  retrieveOffer(
    evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence,
  ): Promise<DuffelHttpTransportResult>;
  listOrdersByOffer(evidence: DuffelRefreshedOfferEvidence): Promise<DuffelHttpTransportResult>;
}

export class DuffelSearchOnlyIntegrationDisabledError extends Error {
  constructor() {
    super("Duffel sandbox search-only integration is disabled.");
    this.name = "DuffelSearchOnlyIntegrationDisabledError";
  }
}

class DisabledDuffelSandboxSearchOnlyIntegration implements DuffelSandboxSearchOnlyIntegration {
  static readonly instance: DuffelSandboxSearchOnlyIntegration = Object.freeze(
    new DisabledDuffelSandboxSearchOnlyIntegration(),
  );

  private constructor() {}

  async createOfferRequest(): Promise<never> {
    throw new DuffelSearchOnlyIntegrationDisabledError();
  }

  async retrieveOffer(): Promise<never> {
    throw new DuffelSearchOnlyIntegrationDisabledError();
  }

  async listOrdersByOffer(): Promise<never> {
    throw new DuffelSearchOnlyIntegrationDisabledError();
  }
}

class InjectedDuffelSandboxSearchOnlyIntegration implements DuffelSandboxSearchOnlyIntegration {
  readonly #transport;

  private constructor(dependencies: DuffelSandboxSearchOnlyDependencies) {
    this.#transport = createDuffelTestHttpTransport(dependencies);
    Object.freeze(this);
  }

  static create(dependencies: DuffelSandboxSearchOnlyDependencies): DuffelSandboxSearchOnlyIntegration {
    return new InjectedDuffelSandboxSearchOnlyIntegration(dependencies);
  }

  async createOfferRequest(search: FlightCommerceSearchRequest): Promise<DuffelHttpTransportResult> {
    return this.#transport.execute(buildDuffelSandboxOfferRequestPlan(search));
  }

  async retrieveOffer(
    evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence,
  ): Promise<DuffelHttpTransportResult> {
    return this.#transport.execute(buildDuffelSandboxOfferRetrievalPlan(evidence));
  }

  async listOrdersByOffer(evidence: DuffelRefreshedOfferEvidence): Promise<DuffelHttpTransportResult> {
    return this.#transport.execute(buildDuffelSandboxOrderListByOfferPlan(evidence));
  }
}

Object.freeze(DisabledDuffelSandboxSearchOnlyIntegration.prototype);
Object.freeze(InjectedDuffelSandboxSearchOnlyIntegration.prototype);

/**
 * The application-safe default captures no traffic, journal, credential, or
 * dispatch capability and cannot be switched on after construction.
 */
export function createDisabledDuffelSandboxSearchOnlyIntegration(): DuffelSandboxSearchOnlyIntegration {
  return DisabledDuffelSandboxSearchOnlyIntegration.instance;
}

/**
 * Explicit composition root for the three migration-069 shopping operations.
 * The delegated transport validates an exact `enabled: true` dependency record,
 * captures stable injected port methods, and refuses every other operation.
 */
export function createInjectedDuffelSandboxSearchOnlyIntegration(
  dependencies: DuffelSandboxSearchOnlyDependencies,
): DuffelSandboxSearchOnlyIntegration {
  return InjectedDuffelSandboxSearchOnlyIntegration.create(dependencies);
}
