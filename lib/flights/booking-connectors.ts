import {
  createDisabledFlightProviderAdapter,
  createGuardedFlightProviderAdapter,
  type FlightProviderAdapter,
  type FlightProviderAdapterConfiguration,
} from "./provider-adapter";

/**
 * Catalogued booking surfaces. These IDs are an inventory of possible
 * integrations, not an assertion that an account, contract, credential, or
 * airline-content entitlement exists.
 */
export const flightBookingConnectorIds = [
  "sabre",
  "amadeus",
  "travelport",
  "worldspan",
  "abacus",
  "galileo",
  "airgateway",
  "verteil",
  "travelfusion",
] as const;

export type FlightBookingConnectorId = (typeof flightBookingConnectorIds)[number];

export type FlightBookingConnectorDefinition = Readonly<{
  id: FlightBookingConnectorId;
  label: string;
  candidateState: "approved_candidate";
  integrationFamily: "sabre" | "amadeus" | "travelport" | "ndc_aggregator";
  category: "gds" | "ndc_aggregator" | "lcc_aggregator";
  plannedOperations: readonly string[];
  lifecycle: "catalogued_not_activated";
  externalNetworkAccess: false;
  supportsLiveTraffic: false;
  credentialsConfigured: false;
  activationRequires: "separate_contract_credentials_certification_and_release_approval";
  notes: string;
}>;

const connectorDefinitions = [
  {
    id: "sabre",
    label: "Sabre Offers and Orders",
    candidateState: "approved_candidate",
    integrationFamily: "sabre",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "orders", "ticketing", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Primary GDS alternative; no Sabre account or content entitlement is bound here.",
  },
  {
    id: "amadeus",
    label: "Amadeus Self-Service Flight APIs",
    candidateState: "approved_candidate",
    integrationFamily: "amadeus",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "create_orders", "order_management"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Ticket issuance and consolidator arrangements require separate validation.",
  },
  {
    id: "travelport",
    label: "Travelport+ TripServices",
    candidateState: "approved_candidate",
    integrationFamily: "travelport",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "booking", "ticketing", "exchanges", "refunds"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Travelport API surface; content, branch, ticketing, and settlement terms remain unverified.",
  },
  {
    id: "worldspan",
    label: "Worldspan (Travelport host)",
    candidateState: "approved_candidate",
    integrationFamily: "travelport",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "booking", "ticketing", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Host-brand connector candidate; not a separate direct airline entitlement by itself.",
  },
  {
    id: "abacus",
    label: "Abacus (Sabre regional host)",
    candidateState: "approved_candidate",
    integrationFamily: "sabre",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "reservation", "ticketing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Regional/legacy host candidate; coverage and post-booking support require validation.",
  },
  {
    id: "galileo",
    label: "Galileo (Travelport host)",
    candidateState: "approved_candidate",
    integrationFamily: "travelport",
    category: "gds",
    plannedOperations: ["shopping", "pricing", "booking", "ticketing", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Host-brand connector candidate; not a separate direct airline entitlement by itself.",
  },
  {
    id: "airgateway",
    label: "AirGateway NDC API",
    candidateState: "approved_candidate",
    integrationFamily: "ndc_aggregator",
    category: "ndc_aggregator",
    plannedOperations: ["shopping", "booking", "issuing", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "NDC/EDIFACT/LCC aggregation candidate; airline-provider coverage remains contract-specific.",
  },
  {
    id: "verteil",
    label: "Verteil NDC API",
    candidateState: "approved_candidate",
    integrationFamily: "ndc_aggregator",
    category: "ndc_aggregator",
    plannedOperations: ["shopping", "booking", "ticketing", "ancillaries", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "NDC network candidate; airline-specific onboarding and payment model remain unverified.",
  },
  {
    id: "travelfusion",
    label: "TravelFusion Airline NDC API",
    candidateState: "approved_candidate",
    integrationFamily: "ndc_aggregator",
    category: "lcc_aggregator",
    plannedOperations: ["shopping", "booking", "ticketing", "servicing"],
    lifecycle: "catalogued_not_activated",
    externalNetworkAccess: false,
    supportsLiveTraffic: false,
    credentialsConfigured: false,
    activationRequires: "separate_contract_credentials_certification_and_release_approval",
    notes: "Low-cost/full-service aggregation candidate; payment and servicing scope remain unverified.",
  },
] as const satisfies readonly FlightBookingConnectorDefinition[];

const definitionsById = new Map<FlightBookingConnectorId, FlightBookingConnectorDefinition>(
  connectorDefinitions.map((definition) => [definition.id, Object.freeze({
    ...definition,
    plannedOperations: Object.freeze([...definition.plannedOperations]),
  })]),
);

export const flightBookingConnectorDefinitions: readonly FlightBookingConnectorDefinition[] = Object.freeze(
  flightBookingConnectorIds.map((id) => definitionsById.get(id)!),
);

export function getFlightBookingConnectorDefinition(
  id: FlightBookingConnectorId,
): FlightBookingConnectorDefinition {
  const definition = definitionsById.get(id);
  if (!definition) throw new Error(`Unknown flight booking connector: ${id}`);
  return definition;
}

/**
 * Build a provider adapter only after an operator supplies the exact runtime
 * bindings and executor. There is intentionally no default constructor that
 * can contact a provider; the generic guarded adapter performs authorization,
 * idempotency, binding, and result validation at call time.
 */
export type FlightBookingConnectorAdapterConfiguration = Omit<
  FlightProviderAdapterConfiguration,
  "providerId"
> & Readonly<{ providerId?: string }>;

export function createFlightBookingConnectorAdapter(
  id: FlightBookingConnectorId,
  configuration: FlightBookingConnectorAdapterConfiguration,
): FlightProviderAdapter {
  const expectedProviderId = `${id}_flight_adapter`;
  if (configuration.providerId !== undefined && configuration.providerId !== expectedProviderId) {
    throw new Error(`Flight connector ${id} requires provider ID ${expectedProviderId}.`);
  }
  return createGuardedFlightProviderAdapter({
    mode: configuration.mode,
    executionBinding: configuration.executionBinding,
    paymentExecutionBinding: configuration.paymentExecutionBinding,
    settlementExecutionBinding: configuration.settlementExecutionBinding,
    execute: configuration.execute,
    providerId: expectedProviderId,
  });
}

/** Returns the dark-by-default runtime shell for a catalogued connector. */
export function createDisabledFlightBookingConnectorAdapter(
  id: FlightBookingConnectorId,
): FlightProviderAdapter {
  return createDisabledFlightProviderAdapter(`${id}_flight_adapter`);
}

export const disabledFlightBookingConnectorAdapters: Readonly<
  Record<FlightBookingConnectorId, FlightProviderAdapter>
> = Object.freeze(
  Object.fromEntries(
    flightBookingConnectorIds.map((id) => [id, createDisabledFlightBookingConnectorAdapter(id)]),
  ) as Record<FlightBookingConnectorId, FlightProviderAdapter>,
);
