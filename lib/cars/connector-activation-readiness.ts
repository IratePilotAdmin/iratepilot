import {
  carRentalNamedConnectorDefinitions,
  type CarRentalConnectorId,
} from "./provider-connectors";

export const CAR_RENTAL_CONNECTOR_ACTIVATION_MODE = "connector_activation_readiness_local_only" as const;

export const carRentalConnectorActivationStageIds = [
  "provider_decision",
  "contact_authorization",
  "commercial_legal_approval",
  "provider_account",
  "capability_verification",
  "security_privacy_approval",
  "credential_vault",
  "sandbox_certification",
  "operational_acceptance",
  "production_activation_decision",
] as const;

export const carRentalConnectorActivationRecordedFields = [
  "activation_case_id",
  "connector_id",
  "provider_decision_state",
  "due_diligence_state",
  "commercial_legal_state",
  "provider_account_state",
  "capability_verification_state",
  "security_privacy_state",
  "credential_vault_state",
  "sandbox_state",
  "certification_state",
  "operational_acceptance_state",
  "production_decision_state",
  "connection_state",
  "evidence_digest",
  "provider_contact_made",
  "provider_account_present",
  "credential_material_present",
  "external_request_attempted",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const;

export const carRentalConnectorActivationProhibitedFields = [
  "provider_contact_identity",
  "provider_contact_message",
  "provider_account_id",
  "executed_contract",
  "commercial_rate",
  "provider_endpoint",
  "sandbox_endpoint",
  "production_endpoint",
  "api_key",
  "client_id",
  "client_secret",
  "access_token",
  "refresh_token",
  "credential_value",
  "raw_request",
  "raw_response",
  "raw_webhook_payload",
  "traveler_identity",
  "driver_license",
  "payment_card",
  "bank_account",
  "live_reservation_reference",
  "production_approval",
] as const;

export type CarRentalConnectorActivationStageId = (typeof carRentalConnectorActivationStageIds)[number];
export type CarRentalConnectorProviderDecisionState = "candidate_only" | "selection_required";
export type CarRentalConnectorDueDiligenceState = "not_started";
export type CarRentalConnectorCommercialLegalState = "not_started";
export type CarRentalConnectorProviderAccountState = "not_created";
export type CarRentalConnectorCapabilityState = "not_verified";
export type CarRentalConnectorSecurityPrivacyState = "not_started";
export type CarRentalConnectorCredentialVaultState = "not_configured";
export type CarRentalConnectorSandboxState = "not_connected";
export type CarRentalConnectorCertificationState = "not_started";
export type CarRentalConnectorOperationalAcceptanceState = "not_started";
export type CarRentalConnectorProductionDecisionState = "separate_decision_required";
export type CarRentalConnectorActivationConnectionState = "disabled";
export type CarRentalConnectorActivationKillSwitchState = "engaged" | "released";

export type CarRentalConnectorActivationStage = {
  id: CarRentalConnectorActivationStageId;
  label: string;
  owner: string;
  kind: "internal_decision" | "provider_dependent" | "release_decision";
  detail: string;
};

export const carRentalConnectorActivationStages: readonly CarRentalConnectorActivationStage[] = [
  { id: "provider_decision", label: "Provider decision recorded", owner: "Executive + Product", kind: "internal_decision", detail: "Record a separately approved commercial provider decision. The aggregator path also requires a named provider selection." },
  { id: "contact_authorization", label: "Provider contact authorized", owner: "Executive + Commercial", kind: "internal_decision", detail: "Approve the exact provider, purpose, sender, recipient role, channel, message, and contact limit before any outreach." },
  { id: "commercial_legal_approval", label: "Commercial and legal terms approved", owner: "Executive + Commercial + Legal", kind: "provider_dependent", detail: "Review current terms, compensation, disclosures, support ownership, liability, privacy, and termination before execution." },
  { id: "provider_account", label: "Provider account provisioned", owner: "Commercial + Security", kind: "provider_dependent", detail: "Create an organization-owned account only after approvals, with named ownership, recovery, access, and offboarding controls." },
  { id: "capability_verification", label: "Car-rental capability verified", owner: "Product + Engineering", kind: "provider_dependent", detail: "Verify the current contracted product supports the required search, pricing, policy, reservation, servicing, refund, and webhook scope." },
  { id: "security_privacy_approval", label: "Security and privacy approved", owner: "Security + Privacy", kind: "provider_dependent", detail: "Approve data flows, retention, sub-processors, access controls, logging, incident response, and credential boundaries." },
  { id: "credential_vault", label: "Credential vault configured", owner: "Security + Engineering", kind: "provider_dependent", detail: "Store scoped non-Production credentials only in the approved secret manager with rotation and revocation controls." },
  { id: "sandbox_certification", label: "Sandbox certification passed", owner: "Engineering + Product + Operations", kind: "provider_dependent", detail: "Complete isolated provider certification across the allowlisted operation set with sanitized evidence and zero Production traffic." },
  { id: "operational_acceptance", label: "Operational acceptance passed", owner: "Operations + Support + Finance + Release", kind: "provider_dependent", detail: "Approve monitoring, support, reconciliation, incidents, refunds, rollback, and a bounded pilot before any live use." },
  { id: "production_activation_decision", label: "Production activation separately approved", owner: "Executive + Release", kind: "release_decision", detail: "Make a connector-specific Production decision after every earlier gate is satisfied; release both kill switches only through that decision." },
] as const;

export type CarRentalConnectorActivationEvidence = Partial<Record<CarRentalConnectorActivationStageId, boolean>>;

export type CarRentalConnectorActivationTrack = {
  connectorId: CarRentalConnectorId;
  label: string;
  providerDecisionState: CarRentalConnectorProviderDecisionState;
  completedStageCount: 0;
  totalStageCount: number;
  connectionState: CarRentalConnectorActivationConnectionState;
  active: false;
  nextRequiredGate: string;
  blocker: string;
};

export function buildCarRentalConnectorActivationPlan(evidence: CarRentalConnectorActivationEvidence = {}) {
  const stages = carRentalConnectorActivationStages.map((stage) => ({ ...stage, complete: evidence[stage.id] === true }));
  const completedPlanningStageCount = stages.filter((stage) => stage.complete).length;
  const tracks: readonly CarRentalConnectorActivationTrack[] = carRentalNamedConnectorDefinitions.map((connector) => ({
    connectorId: connector.id,
    label: connector.label,
    providerDecisionState: connector.providerBinding === "provider_unselected" ? "selection_required" : "candidate_only",
    completedStageCount: 0,
    totalStageCount: carRentalConnectorActivationStages.length,
    connectionState: "disabled",
    active: false,
    nextRequiredGate: connector.providerBinding === "provider_unselected"
      ? "Approve public aggregator research and record a provider decision."
      : `Approve ${connector.label} capability and onboarding research before provider contact.`,
    blocker: connector.providerBinding === "provider_unselected"
      ? "No aggregator provider has been selected."
      : `${connector.label} is a candidate only; no commercial selection, account, entitlement, or verified capability exists.`,
  }));

  return {
    mode: CAR_RENTAL_CONNECTOR_ACTIVATION_MODE,
    stages,
    tracks,
    completedPlanningStageCount,
    totalPlanningStageCount: stages.length,
    planningReviewComplete: completedPlanningStageCount === stages.length,
    activeConnectorCount: 0,
    provisionedAccountCount: 0,
    sandboxCertifiedConnectorCount: 0,
    connectedConnectorCount: 0,
    externalRequestCount: 0,
    supplierContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    livePilotAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionAuthorized: false,
  } as const;
}

export type CarRentalConnectorActivationRecord = {
  activationCaseId: string;
  connectorId: CarRentalConnectorId;
  providerDecisionState: CarRentalConnectorProviderDecisionState;
  dueDiligenceState: CarRentalConnectorDueDiligenceState;
  commercialLegalState: CarRentalConnectorCommercialLegalState;
  providerAccountState: CarRentalConnectorProviderAccountState;
  capabilityVerificationState: CarRentalConnectorCapabilityState;
  securityPrivacyState: CarRentalConnectorSecurityPrivacyState;
  credentialVaultState: CarRentalConnectorCredentialVaultState;
  sandboxState: CarRentalConnectorSandboxState;
  certificationState: CarRentalConnectorCertificationState;
  operationalAcceptanceState: CarRentalConnectorOperationalAcceptanceState;
  productionDecisionState: CarRentalConnectorProductionDecisionState;
  connectionState: CarRentalConnectorActivationConnectionState;
  evidenceDigest: string;
  providerContactMade: false;
  providerAccountPresent: false;
  credentialMaterialPresent: false;
  externalRequestAttempted: false;
  applicationKillSwitchState: CarRentalConnectorActivationKillSwitchState;
  databaseKillSwitchState: CarRentalConnectorActivationKillSwitchState;
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

export function validateCarRentalConnectorActivationRecord(record: CarRentalConnectorActivationRecord) {
  const errors: string[] = [];
  const connector = carRentalNamedConnectorDefinitions.find((candidate) => candidate.id === record.connectorId);
  const expectedProviderDecisionState = connector?.providerBinding === "provider_unselected" ? "selection_required" : "candidate_only";

  if (!isStableToken(record.activationCaseId)) errors.push("Activation-case ID must be a stable opaque token.");
  if (!connector) errors.push("Connector ID is not registered.");
  if (connector && record.providerDecisionState !== expectedProviderDecisionState) errors.push("Provider-decision state must match the connector binding.");
  if (record.dueDiligenceState !== "not_started") errors.push("Provider due diligence must remain not started in the local activation layer.");
  if (record.commercialLegalState !== "not_started") errors.push("Commercial and legal approval must remain not started.");
  if (record.providerAccountState !== "not_created" || record.providerAccountPresent !== false) errors.push("Provider accounts are not authorized in the local activation layer.");
  if (record.capabilityVerificationState !== "not_verified") errors.push("Provider capability must remain not verified.");
  if (record.securityPrivacyState !== "not_started") errors.push("Security and privacy approval must remain not started.");
  if (record.credentialVaultState !== "not_configured" || record.credentialMaterialPresent !== false) errors.push("Credential configuration or material is not authorized.");
  if (record.sandboxState !== "not_connected") errors.push("Provider sandbox connectivity must remain disabled.");
  if (record.certificationState !== "not_started") errors.push("Provider certification must remain not started.");
  if (record.operationalAcceptanceState !== "not_started") errors.push("Operational acceptance must remain not started.");
  if (record.productionDecisionState !== "separate_decision_required") errors.push("A separate Production activation decision remains required.");
  if (record.connectionState !== "disabled") errors.push("Connector connection state must remain disabled.");
  if (!isSha256Digest(record.evidenceDigest)) errors.push("Activation evidence must be a lowercase 64-character digest.");
  if (record.providerContactMade !== false) errors.push("Provider contact is not authorized in the local activation layer.");
  if (record.externalRequestAttempted !== false) errors.push("External requests are not authorized in the local activation layer.");
  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  if (record.recordedFields.some((field) => !carRentalConnectorActivationRecordedFields.includes(field as (typeof carRentalConnectorActivationRecordedFields)[number]))) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalConnectorActivationRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized activation allowlist.");
  if (record.prohibitedDataDetected) errors.push("Contact, contract, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks local activation readiness.");

  return {
    valid: errors.length === 0,
    activationTrackRecorded: errors.length === 0,
    connectorActive: false,
    providerContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionAuthorized: false,
    errors,
  } as const;
}

export const carRentalConnectorActivationFixtures: readonly CarRentalConnectorActivationRecord[] = carRentalNamedConnectorDefinitions.map((connector, index) => ({
  activationCaseId: `activation-case-${String(index + 1).padStart(2, "0")}`,
  connectorId: connector.id,
  providerDecisionState: connector.providerBinding === "provider_unselected" ? "selection_required" : "candidate_only",
  dueDiligenceState: "not_started",
  commercialLegalState: "not_started",
  providerAccountState: "not_created",
  capabilityVerificationState: "not_verified",
  securityPrivacyState: "not_started",
  credentialVaultState: "not_configured",
  sandboxState: "not_connected",
  certificationState: "not_started",
  operationalAcceptanceState: "not_started",
  productionDecisionState: "separate_decision_required",
  connectionState: "disabled",
  evidenceDigest: String(index + 4).repeat(64),
  providerContactMade: false,
  providerAccountPresent: false,
  credentialMaterialPresent: false,
  externalRequestAttempted: false,
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalConnectorActivationRecordedFields,
  prohibitedDataDetected: false,
}));
