import {
  carRentalAdapterOperationKinds,
  type CarRentalAdapterOperationKind,
} from "./provider-adapter-certification";

export const CAR_RENTAL_NAMED_CONNECTOR_MODE = "named_connectors_offline_only" as const;

export const carRentalConnectorIds = ["sabre", "travelport", "aggregator"] as const;
export const carRentalConnectorCategories = ["gds", "aggregator"] as const;
export const carRentalConnectorImplementationStates = ["offline_contract_only"] as const;
export const carRentalConnectorProvisioningStates = ["not_started"] as const;
export const carRentalConnectorCapabilityVerificationStates = ["not_verified"] as const;
export const carRentalConnectorConnectionStates = ["disabled"] as const;
export const carRentalConnectorKillSwitchStates = ["engaged", "released"] as const;

export const carRentalConnectorRecordedFields = [
  "connector_case_id",
  "connector_id",
  "connector_category",
  "implementation_state",
  "provisioning_state",
  "capability_verification_state",
  "connection_state",
  "intended_operation_kinds",
  "evidence_digest",
  "provider_account_present",
  "external_request_attempted",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const;

export const carRentalConnectorProhibitedFields = [
  "provider_endpoint",
  "sandbox_endpoint",
  "production_endpoint",
  "api_key",
  "client_id",
  "client_secret",
  "access_token",
  "refresh_token",
  "credential_value",
  "provider_account_id",
  "supplier_contact",
  "executed_contract",
  "raw_request",
  "raw_response",
  "raw_webhook_payload",
  "traveler_identity",
  "driver_license",
  "payment_card",
  "bank_account",
  "precise_location",
  "live_reservation_reference",
] as const;

export type CarRentalConnectorId = (typeof carRentalConnectorIds)[number];
export type CarRentalConnectorCategory = (typeof carRentalConnectorCategories)[number];
export type CarRentalConnectorImplementationState = (typeof carRentalConnectorImplementationStates)[number];
export type CarRentalConnectorProvisioningState = (typeof carRentalConnectorProvisioningStates)[number];
export type CarRentalConnectorCapabilityVerificationState = (typeof carRentalConnectorCapabilityVerificationStates)[number];
export type CarRentalConnectorConnectionState = (typeof carRentalConnectorConnectionStates)[number];
export type CarRentalConnectorKillSwitchState = (typeof carRentalConnectorKillSwitchStates)[number];

export type CarRentalNamedConnectorDefinition = {
  id: CarRentalConnectorId;
  label: string;
  category: CarRentalConnectorCategory;
  providerBinding: "named_candidate" | "provider_unselected";
  intendedOperationKinds: readonly CarRentalAdapterOperationKind[];
  implementationState: CarRentalConnectorImplementationState;
  provisioningState: CarRentalConnectorProvisioningState;
  capabilityVerificationState: CarRentalConnectorCapabilityVerificationState;
  connectionState: CarRentalConnectorConnectionState;
  summary: string;
  safetyBoundary: string;
};

const intendedOfflineOperations = [...carRentalAdapterOperationKinds] as const;

export const carRentalNamedConnectorDefinitions: readonly CarRentalNamedConnectorDefinition[] = [
  {
    id: "sabre",
    label: "Sabre",
    category: "gds",
    providerBinding: "named_candidate",
    intendedOperationKinds: intendedOfflineOperations,
    implementationState: "offline_contract_only",
    provisioningState: "not_started",
    capabilityVerificationState: "not_verified",
    connectionState: "disabled",
    summary: "Named GDS connector shell for provider-neutral car-rental contract mapping.",
    safetyBoundary: "No Sabre product capability, account, endpoint, credential, entitlement, certification, traffic, or commercial relationship is asserted.",
  },
  {
    id: "travelport",
    label: "Travelport",
    category: "gds",
    providerBinding: "named_candidate",
    intendedOperationKinds: intendedOfflineOperations,
    implementationState: "offline_contract_only",
    provisioningState: "not_started",
    capabilityVerificationState: "not_verified",
    connectionState: "disabled",
    summary: "Named GDS connector shell for provider-neutral car-rental contract mapping.",
    safetyBoundary: "No Travelport product capability, account, endpoint, credential, entitlement, certification, traffic, or commercial relationship is asserted.",
  },
  {
    id: "aggregator",
    label: "Aggregator (runtime provider unselected)",
    category: "aggregator",
    providerBinding: "provider_unselected",
    intendedOperationKinds: intendedOfflineOperations,
    implementationState: "offline_contract_only",
    provisioningState: "not_started",
    capabilityVerificationState: "not_verified",
    connectionState: "disabled",
    summary: "Generic connector shell that remains runtime-unbound while Carnect is the selected commercial-diligence path.",
    safetyBoundary: "No aggregator is contracted or runtime-bound, and no provider is contacted, provisioned, certified, connected, or authorized for traffic or transactions.",
  },
] as const;

export type CarRentalNamedConnectorGate = {
  id: "registry_reviewed" | "operation_intents_reviewed" | "field_minimization_reviewed" | "no_endpoint_reviewed" | "application_kill_switch_reviewed" | "database_kill_switch_reviewed" | "provider_onboarding_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalNamedConnectorGates: readonly CarRentalNamedConnectorGate[] = [
  { id: "registry_reviewed", label: "Three-entry connector registry reviewed", owner: "Engineering + Architecture", detail: "Review Sabre, Travelport, and one generic unselected aggregator entry as local connector identities only." },
  { id: "operation_intents_reviewed", label: "Provider-neutral operation intents reviewed", owner: "Engineering + Product", detail: "Map only the existing offline Phase 10 operation vocabulary without claiming provider capability or compatibility." },
  { id: "field_minimization_reviewed", label: "Connector evidence minimization reviewed", owner: "Privacy + Security", detail: "Retain controlled states and one digest while prohibiting credentials, endpoints, identities, payment data, and raw payloads." },
  { id: "no_endpoint_reviewed", label: "No endpoint or transport reviewed", owner: "Security + Engineering", detail: "Confirm that the connector layer contains no URL, HTTP client, socket, webhook receiver, job, queue, or external transport." },
  { id: "application_kill_switch_reviewed", label: "Application kill switch reviewed", owner: "Engineering + Release", detail: "Require the application traffic switch to remain engaged for every connector record." },
  { id: "database_kill_switch_reviewed", label: "Database kill switch reviewed", owner: "Data + Release", detail: "Require the independent database traffic switch to remain engaged without migrations or runtime overrides." },
  { id: "provider_onboarding_separately_authorized", label: "Provider onboarding separately authorized", owner: "Commercial + Legal + Security + Release", detail: "Require separate approval before contact, account creation, contracts, credentials, capability verification, sandbox connection, or traffic." },
];

export type CarRentalNamedConnectorEvidence = Partial<Record<CarRentalNamedConnectorGate["id"], boolean>>;

export function buildCarRentalNamedConnectorPlan(evidence: CarRentalNamedConnectorEvidence = {}) {
  const gates = carRentalNamedConnectorGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_NAMED_CONNECTOR_MODE,
    connectors: carRentalNamedConnectorDefinitions,
    gates,
    completedCount,
    totalCount: gates.length,
    localReviewComplete: completedCount === gates.length,
    provisionedConnectorCount: 0,
    connectedConnectorCount: 0,
    externalRequestCount: 0,
    supplierContactAuthorized: false,
    providerSelected: false,
    providerMappingCreated: false,
    accountCreationAuthorized: false,
    credentialRequestAuthorized: false,
    credentialAcceptanceAuthorized: false,
    credentialMaterialPresent: false,
    capabilityVerified: false,
    sandboxConnectionAuthorized: false,
    externalTrafficAuthorized: false,
    webhookReceiverAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    productionAuthorized: false,
  } as const;
}

export type CarRentalNamedConnectorRecord = {
  connectorCaseId: string;
  connectorId: CarRentalConnectorId;
  connectorCategory: CarRentalConnectorCategory;
  implementationState: CarRentalConnectorImplementationState;
  provisioningState: CarRentalConnectorProvisioningState;
  capabilityVerificationState: CarRentalConnectorCapabilityVerificationState;
  connectionState: CarRentalConnectorConnectionState;
  intendedOperationKinds: readonly CarRentalAdapterOperationKind[];
  evidenceDigest: string;
  providerAccountPresent: false;
  externalRequestAttempted: false;
  applicationKillSwitchState: CarRentalConnectorKillSwitchState;
  databaseKillSwitchState: CarRentalConnectorKillSwitchState;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function validateCarRentalNamedConnectorRecord(record: CarRentalNamedConnectorRecord) {
  const errors: string[] = [];
  const definition = carRentalNamedConnectorDefinitions.find((candidate) => candidate.id === record.connectorId);

  if (!isStableToken(record.connectorCaseId)) errors.push("Connector-case ID must be a stable opaque token.");
  if (!definition) errors.push("Connector ID is not registered.");
  if (definition && record.connectorCategory !== definition.category) errors.push("Connector category must match the registered connector definition.");
  if (record.implementationState !== "offline_contract_only") errors.push("Named connectors must remain offline-contract-only.");
  if (record.provisioningState !== "not_started") errors.push("Provider provisioning must remain not started.");
  if (record.capabilityVerificationState !== "not_verified") errors.push("Provider capability verification must remain not verified.");
  if (record.connectionState !== "disabled") errors.push("Connector connection state must remain disabled.");
  if (hasDuplicates(record.intendedOperationKinds)) errors.push("Intended operation inventory cannot contain duplicates.");
  if (definition && !sameValues(record.intendedOperationKinds, definition.intendedOperationKinds)) errors.push("Intended operations must exactly match the offline connector contract.");
  if (!isSha256Digest(record.evidenceDigest)) errors.push("Connector evidence must be a lowercase 64-character digest.");
  if (record.providerAccountPresent !== false) errors.push("Provider accounts are prohibited in the offline connector layer.");
  if (record.externalRequestAttempted !== false) errors.push("External requests are prohibited in the offline connector layer.");
  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  if (record.recordedFields.some((field) => !carRentalConnectorRecordedFields.includes(field as (typeof carRentalConnectorRecordedFields)[number]))) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalConnectorRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized connector allowlist.");
  if (record.prohibitedDataDetected) errors.push("Endpoint, credential, contract, payload, identity, payment, location, or live-reference data blocks connector readiness.");

  return {
    valid: errors.length === 0,
    connectorPrepared: errors.length === 0,
    connectorEnabled: false,
    capabilityVerified: false,
    providerAccountPresent: false,
    supplierContactAuthorized: false,
    credentialAcceptanceAuthorized: false,
    sandboxConnectionAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    productionAuthorized: false,
    errors,
  } as const;
}

export function runCarRentalNamedConnectorOperation(connectorId: CarRentalConnectorId, operationKind: CarRentalAdapterOperationKind) {
  return {
    ok: false,
    code: "connector_disabled",
    connectorId,
    operationKind,
    externalRequestSent: false,
    reservationChanged: false,
    paymentMoved: false,
    message: "Connector is an offline contract only; provider onboarding and traffic are not authorized.",
  } as const;
}

export const carRentalNamedConnectorFixtures: readonly CarRentalNamedConnectorRecord[] = carRentalNamedConnectorDefinitions.map((definition, index) => ({
  connectorCaseId: `connector-case-${String(index + 1).padStart(2, "0")}`,
  connectorId: definition.id,
  connectorCategory: definition.category,
  implementationState: "offline_contract_only",
  provisioningState: "not_started",
  capabilityVerificationState: "not_verified",
  connectionState: "disabled",
  intendedOperationKinds: definition.intendedOperationKinds,
  evidenceDigest: String(index + 1).repeat(64),
  providerAccountPresent: false,
  externalRequestAttempted: false,
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalConnectorRecordedFields,
  prohibitedDataDetected: false,
}));
