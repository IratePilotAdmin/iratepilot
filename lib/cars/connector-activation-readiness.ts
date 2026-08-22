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
      ? "Complete internal shortlist decision readiness, then make a separate aggregator-provider decision."
      : "Complete internal provider-decision readiness, then make a separate provider decision.",
    blocker: connector.providerBinding === "provider_unselected"
      ? "Public aggregator research is recorded. No aggregator provider has been selected."
      : `${connector.label} public research is recorded, but no provider decision, contracted capability, account, entitlement, or certification exists.`,
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

function sameOrderedValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

export const CAR_RENTAL_PROVIDER_DECISION_READINESS_MODE = "provider_decision_readiness_local_only" as const;
export const CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE = "offline_fixture" as const;
export const CAR_RENTAL_PUBLIC_RESEARCH_ARTIFACT_ID = "car-rentals-public-connector-research-2026-08-21" as const;
export const CAR_RENTAL_PUBLIC_RESEARCH_RECORDED_DATE = "2026-08-21" as const;

export const carRentalAggregatorShortlistCandidateIds = [
  "carnect",
  "cartrawler",
  "booking_com_demand",
] as const;

export const carRentalAggregatorAlternateCandidateIds = [
  "economybookings",
  "discovercars",
] as const;

export type CarRentalAggregatorShortlistCandidateId = (typeof carRentalAggregatorShortlistCandidateIds)[number];
export type CarRentalAggregatorAlternateCandidateId = (typeof carRentalAggregatorAlternateCandidateIds)[number];
export type CarRentalPublicResearchState = "public_research_recorded";
export type CarRentalPublicResearchDisposition = "technical_secondary_candidate" | "conditional_enterprise_candidate" | "shortlist_selection_required";

export type CarRentalPublicResearchProfile = {
  connectorId: CarRentalConnectorId;
  label: string;
  researchState: CarRentalPublicResearchState;
  disposition: CarRentalPublicResearchDisposition;
  publicEvidenceSummary: string;
  materialUnknowns: readonly string[];
  hardStops: readonly string[];
  aggregatorShortlistCandidateIds: readonly CarRentalAggregatorShortlistCandidateId[];
  aggregatorAlternateCandidateIds: readonly CarRentalAggregatorAlternateCandidateId[];
};

export const carRentalPublicResearchProfiles: readonly CarRentalPublicResearchProfile[] = [
  {
    connectorId: "sabre",
    label: "Sabre",
    researchState: "public_research_recorded",
    disposition: "technical_secondary_candidate",
    publicEvidenceSummary: "Official public evidence supports an enterprise car workflow spanning search, price and rules, booking, retrieval, modification, and cancellation.",
    materialUnknowns: ["iRatePilot entitlement", "commercial economics", "contracted geography and brands", "certification scope and limits"],
    hardStops: ["Partner onboarding required", "credentialed CERT access required", "separate contractual Production authorization required"],
    aggregatorShortlistCandidateIds: [],
    aggregatorAlternateCandidateIds: [],
  },
  {
    connectorId: "travelport",
    label: "Travelport",
    researchState: "public_research_recorded",
    disposition: "conditional_enterprise_candidate",
    publicEvidenceSummary: "Official public evidence records a conditional enterprise path through Travelport Universal API car services.",
    materialUnknowns: ["iRatePilot eligibility", "contracted capability", "commercial economics", "certification scope and limits"],
    hardStops: ["Written Core Category eligibility or exception required", "SOAP integration path requires separate technical review", "separate contractual Production authorization required"],
    aggregatorShortlistCandidateIds: [],
    aggregatorAlternateCandidateIds: [],
  },
  {
    connectorId: "aggregator",
    label: "Aggregator (provider unselected)",
    researchState: "public_research_recorded",
    disposition: "shortlist_selection_required",
    publicEvidenceSummary: "Public research records three priority candidates and two retained alternates without selecting or binding the generic aggregator connector.",
    materialUnknowns: ["provider selection", "contracted inventory and geography", "commercial economics", "integration and certification scope"],
    hardStops: ["Provider remains unselected", "No public ranking is a formal score or recommendation", "separate contractual Production authorization required"],
    aggregatorShortlistCandidateIds: carRentalAggregatorShortlistCandidateIds,
    aggregatorAlternateCandidateIds: carRentalAggregatorAlternateCandidateIds,
  },
] as const;

export const carRentalProviderDecisionReadinessGateIds = [
  "research_artifact_reconciled",
  "decision_question_defined",
  "candidate_scope_frozen",
  "public_evidence_limits_acknowledged",
  "unknowns_and_hard_stops_reviewed",
  "owners_and_conflicts_reviewed",
  "separate_decision_boundary_acknowledged",
] as const;

export type CarRentalProviderDecisionReadinessGateId = (typeof carRentalProviderDecisionReadinessGateIds)[number];
export type CarRentalProviderDecisionReadinessState = "review_required" | "ready_for_internal_decision";
export type CarRentalProviderDecisionState = "separate_decision_required";
export type CarRentalFormalRecommendationState = "not_issued";

export type CarRentalProviderDecisionReadinessGate = {
  id: CarRentalProviderDecisionReadinessGateId;
  label: string;
  owner: string;
  detail: string;
};

export const carRentalProviderDecisionReadinessGates: readonly CarRentalProviderDecisionReadinessGate[] = [
  { id: "research_artifact_reconciled", label: "Public research artifact reconciled", owner: "Product + Research", detail: "Confirm that all three research paths and their public-evidence limitations are recorded without adding private or provider-supplied claims." },
  { id: "decision_question_defined", label: "Decision question defined", owner: "Executive + Product", detail: "Define the internal choice to be made without turning candidate language into a recommendation, selection, or provider authorization." },
  { id: "candidate_scope_frozen", label: "Candidate scope frozen", owner: "Product + Architecture", detail: "Freeze Sabre, Travelport, and the controlled aggregator shortlist for one review cycle; the generic aggregator binding remains unselected." },
  { id: "public_evidence_limits_acknowledged", label: "Public-evidence limits acknowledged", owner: "Research + Legal", detail: "Acknowledge that public capability, onboarding, pricing, entitlement, geography, certification, and support evidence cannot prove contracted iRatePilot capability." },
  { id: "unknowns_and_hard_stops_reviewed", label: "Unknowns and hard stops reviewed", owner: "Commercial + Engineering + Security", detail: "Review every recorded unknown and stop condition without contacting providers, creating accounts, or requesting credentials." },
  { id: "owners_and_conflicts_reviewed", label: "Functional owners and conflicts reviewed", owner: "Executive + Governance", detail: "Record accountable internal functions and unresolved conflicts without claiming independent approval or delegating the final decision." },
  { id: "separate_decision_boundary_acknowledged", label: "Separate provider decision boundary acknowledged", owner: "Executive + Release", detail: "Confirm that packet readiness does not issue a recommendation, select a provider, complete activation stage 1, or authorize any external action." },
] as const;

export type CarRentalProviderDecisionReadinessEvidence = Partial<Record<CarRentalProviderDecisionReadinessGateId, boolean>>;

export function buildCarRentalProviderDecisionReadinessPlan(evidence: CarRentalProviderDecisionReadinessEvidence = {}) {
  const gates = carRentalProviderDecisionReadinessGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedReadinessGateCount = gates.filter((gate) => gate.complete).length;
  const totalReadinessGateCount = gates.length;
  const decisionPacketReady = completedReadinessGateCount === totalReadinessGateCount;

  return {
    mode: CAR_RENTAL_PROVIDER_DECISION_READINESS_MODE,
    researchArtifactId: CAR_RENTAL_PUBLIC_RESEARCH_ARTIFACT_ID,
    researchRecordedDate: CAR_RENTAL_PUBLIC_RESEARCH_RECORDED_DATE,
    researchProfiles: carRentalPublicResearchProfiles,
    researchCompletedCount: carRentalPublicResearchProfiles.length,
    researchTotalCount: carRentalPublicResearchProfiles.length,
    researchComplete: true,
    gates,
    completedReadinessGateCount,
    totalReadinessGateCount,
    readinessState: decisionPacketReady ? "ready_for_internal_decision" : "review_required",
    decisionPacketReady,
    providerDecisionState: "separate_decision_required",
    providerDecisionRecorded: false,
    selectedProviderId: null,
    formalRecommendationState: "not_issued",
    activationStageOneComplete: false,
    activeConnectorCount: 0,
    providerContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    deploymentAuthorized: false,
    productionAuthorized: false,
    applicationKillSwitchState: "engaged",
    databaseKillSwitchState: "engaged",
  } as const;
}

export const carRentalProviderDecisionReadinessRecordedFields = [
  "decision_readiness_case_id",
  "evidence_mode",
  "research_artifact_id",
  "research_recorded_date",
  "researched_connector_ids",
  "aggregator_shortlist_candidate_ids",
  "aggregator_alternate_candidate_ids",
  "completed_gate_ids",
  "readiness_state",
  "provider_decision_state",
  "provider_decision_recorded",
  "selected_provider_id",
  "formal_recommendation_state",
  "evidence_digest",
  "provider_contact_made",
  "provider_account_present",
  "credential_material_present",
  "sandbox_connection_present",
  "external_request_attempted",
  "reservation_action_attempted",
  "refund_action_attempted",
  "payment_action_attempted",
  "migration_attempted",
  "deployment_attempted",
  "production_authorized",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const;

export const carRentalProviderDecisionReadinessProhibitedFields = [
  "provider_contact_identity",
  "provider_contact_message",
  "provider_submission",
  "provider_application",
  "executed_contract",
  "commercial_rate",
  "formal_score",
  "weighted_score",
  "formal_recommendation",
  "provider_account_id",
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

export type CarRentalProviderDecisionReadinessRecord = {
  decisionReadinessCaseId: string;
  evidenceMode: typeof CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE;
  researchArtifactId: typeof CAR_RENTAL_PUBLIC_RESEARCH_ARTIFACT_ID;
  researchRecordedDate: typeof CAR_RENTAL_PUBLIC_RESEARCH_RECORDED_DATE;
  researchedConnectorIds: readonly CarRentalConnectorId[];
  aggregatorShortlistCandidateIds: readonly CarRentalAggregatorShortlistCandidateId[];
  aggregatorAlternateCandidateIds: readonly CarRentalAggregatorAlternateCandidateId[];
  completedGateIds: readonly CarRentalProviderDecisionReadinessGateId[];
  readinessState: CarRentalProviderDecisionReadinessState;
  providerDecisionState: CarRentalProviderDecisionState;
  providerDecisionRecorded: false;
  selectedProviderId: null;
  formalRecommendationState: CarRentalFormalRecommendationState;
  evidenceDigest: string;
  providerContactMade: false;
  providerAccountPresent: false;
  credentialMaterialPresent: false;
  sandboxConnectionPresent: false;
  externalRequestAttempted: false;
  reservationActionAttempted: false;
  refundActionAttempted: false;
  paymentActionAttempted: false;
  migrationAttempted: false;
  deploymentAttempted: false;
  productionAuthorized: false;
  applicationKillSwitchState: CarRentalConnectorActivationKillSwitchState;
  databaseKillSwitchState: CarRentalConnectorActivationKillSwitchState;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

const carRentalProviderDecisionReadinessRuntimeKeys = [
  "decisionReadinessCaseId",
  "evidenceMode",
  "researchArtifactId",
  "researchRecordedDate",
  "researchedConnectorIds",
  "aggregatorShortlistCandidateIds",
  "aggregatorAlternateCandidateIds",
  "completedGateIds",
  "readinessState",
  "providerDecisionState",
  "providerDecisionRecorded",
  "selectedProviderId",
  "formalRecommendationState",
  "evidenceDigest",
  "providerContactMade",
  "providerAccountPresent",
  "credentialMaterialPresent",
  "sandboxConnectionPresent",
  "externalRequestAttempted",
  "reservationActionAttempted",
  "refundActionAttempted",
  "paymentActionAttempted",
  "migrationAttempted",
  "deploymentAttempted",
  "productionAuthorized",
  "applicationKillSwitchState",
  "databaseKillSwitchState",
  "recordedFields",
  "prohibitedDataDetected",
] as const;

export function validateCarRentalProviderDecisionReadinessRecord(record: CarRentalProviderDecisionReadinessRecord) {
  const errors: string[] = [];
  const expectedConnectorIds = carRentalNamedConnectorDefinitions.map((connector) => connector.id);
  const expectedReadinessState = record.completedGateIds.length === carRentalProviderDecisionReadinessGateIds.length
    && sameValues(record.completedGateIds, carRentalProviderDecisionReadinessGateIds)
    ? "ready_for_internal_decision"
    : "review_required";

  if (!isStableToken(record.decisionReadinessCaseId)) errors.push("Decision-readiness case ID must be a stable opaque token.");
  if (record.evidenceMode !== "offline_fixture") errors.push("Decision-readiness records must remain explicitly synthetic offline fixtures.");
  if (record.researchArtifactId !== CAR_RENTAL_PUBLIC_RESEARCH_ARTIFACT_ID) errors.push("Decision readiness must bind the recorded public-research artifact.");
  if (record.researchRecordedDate !== CAR_RENTAL_PUBLIC_RESEARCH_RECORDED_DATE) errors.push("Public-research recorded date does not match the controlled artifact.");
  if (hasDuplicates(record.researchedConnectorIds)) errors.push("Researched connector inventory cannot contain duplicates.");
  if (!sameValues(record.researchedConnectorIds, expectedConnectorIds)) errors.push("Researched connector inventory must exactly match Sabre, Travelport, and the unselected aggregator path.");
  if (hasDuplicates(record.aggregatorShortlistCandidateIds) || !sameOrderedValues(record.aggregatorShortlistCandidateIds, carRentalAggregatorShortlistCandidateIds)) errors.push("Aggregator shortlist must exactly match the ordered controlled public-research candidates.");
  if (hasDuplicates(record.aggregatorAlternateCandidateIds) || !sameOrderedValues(record.aggregatorAlternateCandidateIds, carRentalAggregatorAlternateCandidateIds)) errors.push("Aggregator alternates must exactly match the ordered controlled public-research candidates.");
  if (hasDuplicates(record.completedGateIds)) errors.push("Completed readiness-gate inventory cannot contain duplicates.");
  if (record.completedGateIds.some((gateId) => !carRentalProviderDecisionReadinessGateIds.includes(gateId))) errors.push("Completed readiness-gate inventory contains an unsupported gate.");
  if (record.readinessState !== expectedReadinessState) errors.push("Readiness state must match the completed local gate inventory.");
  if (record.providerDecisionState !== "separate_decision_required" || record.providerDecisionRecorded !== false) errors.push("A separate provider decision remains required and unrecorded.");
  if (record.selectedProviderId !== null) errors.push("Provider selection is not permitted in a decision-readiness record.");
  if (record.formalRecommendationState !== "not_issued") errors.push("A formal provider recommendation has not been authorized.");
  if (!isSha256Digest(record.evidenceDigest)) errors.push("Decision-readiness evidence must be a lowercase 64-character digest.");
  if (record.providerContactMade !== false) errors.push("Provider contact is not authorized by decision readiness.");
  if (record.providerAccountPresent !== false) errors.push("Provider accounts are not authorized by decision readiness.");
  if (record.credentialMaterialPresent !== false) errors.push("Credential material is not authorized by decision readiness.");
  if (record.sandboxConnectionPresent !== false) errors.push("Sandbox connectivity is not authorized by decision readiness.");
  if (record.externalRequestAttempted !== false) errors.push("External provider traffic is not authorized by decision readiness.");
  if (record.reservationActionAttempted !== false || record.refundActionAttempted !== false || record.paymentActionAttempted !== false) errors.push("Reservation, refund, or payment actions are not authorized by decision readiness.");
  if (record.migrationAttempted !== false || record.deploymentAttempted !== false) errors.push("Migration or deployment is not authorized by decision readiness.");
  if (record.productionAuthorized !== false) errors.push("Production is not authorized by decision readiness.");
  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (!sameValues(Object.keys(record), carRentalProviderDecisionReadinessRuntimeKeys)) errors.push("Decision-readiness record contains unsupported or prohibited runtime fields.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  if (record.recordedFields.some((field) => !carRentalProviderDecisionReadinessRecordedFields.includes(field as (typeof carRentalProviderDecisionReadinessRecordedFields)[number]))) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalProviderDecisionReadinessRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized decision-readiness allowlist.");
  if (record.prohibitedDataDetected) errors.push("Contact, submission, contract, score, recommendation, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks decision readiness.");

  const valid = errors.length === 0;
  const decisionPacketReady = valid && record.readinessState === "ready_for_internal_decision";

  return {
    valid,
    decisionPacketReady,
    providerDecisionRecorded: false,
    providerSelected: false,
    activationStageOneComplete: false,
    providerContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    deploymentAuthorized: false,
    productionAuthorized: false,
    errors,
  } as const;
}

export const carRentalSyntheticProviderDecisionReadinessFixture: CarRentalProviderDecisionReadinessRecord = {
  decisionReadinessCaseId: "provider-decision-readiness-case-01",
  evidenceMode: CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE,
  researchArtifactId: CAR_RENTAL_PUBLIC_RESEARCH_ARTIFACT_ID,
  researchRecordedDate: CAR_RENTAL_PUBLIC_RESEARCH_RECORDED_DATE,
  researchedConnectorIds: ["sabre", "travelport", "aggregator"],
  aggregatorShortlistCandidateIds: carRentalAggregatorShortlistCandidateIds,
  aggregatorAlternateCandidateIds: carRentalAggregatorAlternateCandidateIds,
  completedGateIds: carRentalProviderDecisionReadinessGateIds,
  readinessState: "ready_for_internal_decision",
  providerDecisionState: "separate_decision_required",
  providerDecisionRecorded: false,
  selectedProviderId: null,
  formalRecommendationState: "not_issued",
  evidenceDigest: "8".repeat(64),
  providerContactMade: false,
  providerAccountPresent: false,
  credentialMaterialPresent: false,
  sandboxConnectionPresent: false,
  externalRequestAttempted: false,
  reservationActionAttempted: false,
  refundActionAttempted: false,
  paymentActionAttempted: false,
  migrationAttempted: false,
  deploymentAttempted: false,
  productionAuthorized: false,
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalProviderDecisionReadinessRecordedFields,
  prohibitedDataDetected: false,
};

export const CAR_RENTAL_PROVIDER_PATH_SEQUENCING_MODE = "provider_path_sequencing_local_only" as const;
export const CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE = "local_documentation" as const;
export const CAR_RENTAL_PROVIDER_PATH_DECISION_ID = "cars-provider-path-decision-2026-08-22-01" as const;
export const CAR_RENTAL_PROVIDER_PATH_DECISION_RECORDED_DATE = "2026-08-22" as const;
export const CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_COMMIT = "9a587281b8347bf24d5c49550afb6ddf14c1ac39" as const;
export const CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_DIGEST = "8b0e7ad0ca0eb10191cad295f4830f05649699ac0e810c948453284c85ab757b" as const;

export const carRentalCompletedProviderDecisionReadinessEvidence: CarRentalProviderDecisionReadinessEvidence = {
  research_artifact_reconciled: true,
  decision_question_defined: true,
  candidate_scope_frozen: true,
  public_evidence_limits_acknowledged: true,
  unknowns_and_hard_stops_reviewed: true,
  owners_and_conflicts_reviewed: true,
  separate_decision_boundary_acknowledged: true,
};

export const carRentalProviderPathSequencingProviderIds = Object.freeze([
  "carnect",
  "sabre",
  "travelport",
  "cartrawler",
  "booking_com_demand",
  "economybookings",
  "discovercars",
] as const);

export const carRentalUnselectedDecisionAlternativeIds = Object.freeze([
  "cartrawler",
  "booking_com_demand",
  "economybookings",
  "discovercars",
] as const);

export const carRentalProviderPathAggregatorDiligencePriorityIds = Object.freeze([
  ...carRentalAggregatorShortlistCandidateIds,
] as const);

export const carRentalProviderPathAggregatorResearchAlternateIds = Object.freeze([
  ...carRentalAggregatorAlternateCandidateIds,
] as const);

export type CarRentalProviderPathSequencingProviderId = (typeof carRentalProviderPathSequencingProviderIds)[number];
export type CarRentalUnselectedDecisionAlternativeId = (typeof carRentalUnselectedDecisionAlternativeIds)[number];
export type CarRentalProviderPathDecisionKind = "phased_diligence_sequencing";
export type CarRentalProviderPathDecisionDisposition =
  | "primary_aggregator_diligence_path"
  | "secondary_enterprise_diligence_path"
  | "conditional_hold"
  | "unselected_decision_alternative";
export type CarRentalProviderPathResearchClassification =
  | "diligence_priority_candidate"
  | "technical_secondary_candidate"
  | "conditional_enterprise_candidate"
  | "research_alternate";
export type CarRentalProviderPathSelectionState = "not_recorded";
export type CarRentalRuntimeProviderBindingState = "unbound";
export type CarRentalSoleOwnerConflictState = "unresolved";

export type CarRentalProviderPathSequencingEntry = {
  providerId: CarRentalProviderPathSequencingProviderId;
  label: string;
  pathCategory: "aggregator" | "enterprise";
  disposition: CarRentalProviderPathDecisionDisposition;
  researchClassification: CarRentalProviderPathResearchClassification;
  conditionalConditionId: "TRAVELPORT-01" | null;
  conditionalRequirement: "written_core_category_eligibility_or_approved_exception" | null;
  selectedForRuntime: false;
  contactAuthorized: false;
};

export const carRentalProviderPathSequencingEntries: readonly Readonly<CarRentalProviderPathSequencingEntry>[] = Object.freeze(([
  {
    providerId: "carnect",
    label: "Carnect",
    pathCategory: "aggregator",
    disposition: "primary_aggregator_diligence_path",
    researchClassification: "diligence_priority_candidate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "sabre",
    label: "Sabre",
    pathCategory: "enterprise",
    disposition: "secondary_enterprise_diligence_path",
    researchClassification: "technical_secondary_candidate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "travelport",
    label: "Travelport",
    pathCategory: "enterprise",
    disposition: "conditional_hold",
    researchClassification: "conditional_enterprise_candidate",
    conditionalConditionId: "TRAVELPORT-01",
    conditionalRequirement: "written_core_category_eligibility_or_approved_exception",
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "cartrawler",
    label: "CarTrawler",
    pathCategory: "aggregator",
    disposition: "unselected_decision_alternative",
    researchClassification: "diligence_priority_candidate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "booking_com_demand",
    label: "Booking.com Demand API",
    pathCategory: "aggregator",
    disposition: "unselected_decision_alternative",
    researchClassification: "diligence_priority_candidate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "economybookings",
    label: "EconomyBookings",
    pathCategory: "aggregator",
    disposition: "unselected_decision_alternative",
    researchClassification: "research_alternate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
  {
    providerId: "discovercars",
    label: "DiscoverCars",
    pathCategory: "aggregator",
    disposition: "unselected_decision_alternative",
    researchClassification: "research_alternate",
    conditionalConditionId: null,
    conditionalRequirement: null,
    selectedForRuntime: false,
    contactAuthorized: false,
  },
] satisfies readonly CarRentalProviderPathSequencingEntry[]).map((entry) => Object.freeze(entry)));

export const CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT = 29 as const;
export const CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT = 12 as const;
export const CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT = 17 as const;

export const carRentalProviderPathUnresolvedBlockingConditionIds = Object.freeze([
  "ALL-01",
  "ALL-11",
  "SABRE-02",
  "SABRE-03",
  "TRAVELPORT-01",
  "TRAVELPORT-03",
  "TRAVELPORT-04",
  "AGG-01",
  "AGG-02",
  "AGG-03",
  "CARNECT-01",
  "BOOKING-01",
] as const);

export const carRentalProviderPathProviderVerificationConditionIds = Object.freeze([
  "ALL-02",
  "ALL-03",
  "ALL-04",
  "ALL-05",
  "ALL-06",
  "ALL-07",
  "ALL-08",
  "ALL-09",
  "ALL-10",
  "SABRE-01",
  "SABRE-04",
  "TRAVELPORT-02",
  "TRAVELPORT-05",
  "CARTRAWLER-01",
  "BOOKING-02",
  "ECONOMY-01",
  "DISCOVER-01",
] as const);

export type CarRentalProviderPathConditionId =
  | (typeof carRentalProviderPathUnresolvedBlockingConditionIds)[number]
  | (typeof carRentalProviderPathProviderVerificationConditionIds)[number];
export type CarRentalProviderPathConditionState = "unresolved_blocking" | "later_provider_verification_required";
export type CarRentalProviderPathCondition = {
  id: CarRentalProviderPathConditionId;
  state: CarRentalProviderPathConditionState;
};

export const carRentalProviderPathConditions: readonly Readonly<CarRentalProviderPathCondition>[] = Object.freeze([
  ...carRentalProviderPathUnresolvedBlockingConditionIds.map((id) => ({ id, state: "unresolved_blocking" as const })),
  ...carRentalProviderPathProviderVerificationConditionIds.map((id) => ({ id, state: "later_provider_verification_required" as const })),
].map((condition) => Object.freeze(condition)));

export const carRentalProviderPathOwnerConstraint = Object.freeze({
  id: "OWNERS-01",
  state: "recorded_constraint",
} as const);

export const carRentalProviderPathSoleOwnerConflicts = Object.freeze([
  { id: "CONFLICT-01", state: "unresolved_conflict" },
  { id: "CONFLICT-02", state: "unresolved_conflict" },
  { id: "CONFLICT-03", state: "unresolved_conflict" },
].map((conflict) => Object.freeze(conflict))) as readonly Readonly<{
  id: "CONFLICT-01" | "CONFLICT-02" | "CONFLICT-03";
  state: "unresolved_conflict";
}>[];

export const carRentalProviderPathCompletedActivationStageIds = Object.freeze([]) as readonly [];

export const carRentalProviderPathZeroActivationTrackStageCounts: Readonly<Record<CarRentalConnectorId, 0>> = Object.freeze({
  sabre: 0,
  travelport: 0,
  aggregator: 0,
});

export function buildCarRentalProviderPathSequencingPlan() {
  const readiness = buildCarRentalProviderDecisionReadinessPlan(carRentalCompletedProviderDecisionReadinessEvidence);
  const activation = buildCarRentalConnectorActivationPlan();

  return {
    mode: CAR_RENTAL_PROVIDER_PATH_SEQUENCING_MODE,
    decisionId: CAR_RENTAL_PROVIDER_PATH_DECISION_ID,
    decisionRecordedDate: CAR_RENTAL_PROVIDER_PATH_DECISION_RECORDED_DATE,
    decisionKind: "phased_diligence_sequencing",
    localSequencingDecisionRecorded: true,
    decisionPaths: carRentalProviderPathSequencingEntries,
    primaryAggregatorProviderId: "carnect",
    secondaryEnterpriseProviderId: "sabre",
    conditionalHoldProviderId: "travelport",
    conditionalHoldConditionId: "TRAVELPORT-01",
    conditionalHoldRequirement: "written_core_category_eligibility_or_approved_exception",
    unselectedDecisionAlternativeIds: carRentalUnselectedDecisionAlternativeIds,
    decisionPacketReady: readiness.decisionPacketReady,
    completedReadinessGateCount: readiness.completedReadinessGateCount,
    totalReadinessGateCount: readiness.totalReadinessGateCount,
    classifiedConditionCount: CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT,
    unresolvedBlockingConditionCount: CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT,
    providerVerificationRequiredCount: CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT,
    resolvedConditionCount: 0,
    conditions: carRentalProviderPathConditions,
    ownerConstraint: carRentalProviderPathOwnerConstraint,
    soleOwnerConflicts: carRentalProviderPathSoleOwnerConflicts,
    soleOwnerConflictState: "unresolved",
    independentApprovalPresent: false,
    separationOfDutiesPresent: false,
    conditionResolutionPresent: false,
    conflictResolutionPresent: false,
    riskAcceptancePresent: false,
    waiverOrOverridePresent: false,
    formalRecommendationState: "not_issued",
    commercialProviderSelectionState: "not_recorded",
    providerSelected: false,
    selectedProviderId: null,
    runtimeProviderBindingState: "unbound",
    runtimeProviderBinding: null,
    activationProviderDecisionRecorded: false,
    activationStageOneComplete: false,
    completedActivationStageIds: carRentalProviderPathCompletedActivationStageIds,
    parallelLaunchAuthorized: false,
    activationTracks: activation.tracks.map((track) => ({
      connectorId: track.connectorId,
      completedStageCount: track.completedStageCount,
      totalStageCount: track.totalStageCount,
      active: track.active,
      connectionState: track.connectionState,
    })),
    liveConnectorCount: activation.activeConnectorCount,
    providerContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    deploymentAuthorized: false,
    productionAuthorized: false,
    applicationKillSwitchState: "engaged",
    databaseKillSwitchState: "engaged",
  } as const;
}

export const carRentalProviderPathSequencingRecordedFields = Object.freeze([
  "decision_case_id",
  "evidence_mode",
  "decision_artifact_id",
  "decision_source_commit",
  "decision_recorded_date",
  "decision_kind",
  "decision_paths",
  "primary_aggregator_provider_id",
  "secondary_enterprise_provider_id",
  "conditional_hold_provider_id",
  "conditional_hold_condition_id",
  "conditional_hold_requirement",
  "unselected_decision_alternative_ids",
  "aggregator_diligence_priority_ids",
  "aggregator_research_alternate_ids",
  "classified_condition_count",
  "unresolved_blocking_condition_count",
  "provider_verification_required_count",
  "resolved_condition_count",
  "conditions",
  "owner_constraint",
  "sole_owner_conflicts",
  "sole_owner_conflict_state",
  "independent_approval_present",
  "separation_of_duties_present",
  "condition_resolution_present",
  "conflict_resolution_present",
  "risk_acceptance_present",
  "waiver_or_override_present",
  "formal_recommendation_state",
  "commercial_provider_selection_state",
  "provider_selected",
  "selected_provider_id",
  "runtime_provider_binding_state",
  "runtime_provider_binding",
  "activation_provider_decision_recorded",
  "activation_stage_one_complete",
  "completed_activation_stage_ids",
  "parallel_launch_authorized",
  "activation_track_stage_counts",
  "live_connector_count",
  "evidence_digest",
  "provider_contact_made",
  "provider_account_present",
  "credential_material_present",
  "sandbox_connection_present",
  "external_request_attempted",
  "reservation_action_attempted",
  "refund_action_attempted",
  "payment_action_attempted",
  "migration_attempted",
  "deployment_attempted",
  "production_authorized",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const);

export const carRentalProviderPathSequencingProhibitedFields = Object.freeze([
  "provider_contact_identity",
  "provider_contact_message",
  "provider_submission",
  "provider_application",
  "executed_contract",
  "commercial_rate",
  "formal_score",
  "weighted_score",
  "formal_recommendation",
  "runtime_provider_id",
  "provider_account_id",
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
] as const);

export type CarRentalProviderPathSequencingRecord = {
  decisionCaseId: string;
  evidenceMode: typeof CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE;
  decisionArtifactId: typeof CAR_RENTAL_PROVIDER_PATH_DECISION_ID;
  decisionSourceCommit: typeof CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_COMMIT;
  decisionRecordedDate: typeof CAR_RENTAL_PROVIDER_PATH_DECISION_RECORDED_DATE;
  decisionKind: CarRentalProviderPathDecisionKind;
  decisionPaths: readonly CarRentalProviderPathSequencingEntry[];
  primaryAggregatorProviderId: "carnect";
  secondaryEnterpriseProviderId: "sabre";
  conditionalHoldProviderId: "travelport";
  conditionalHoldConditionId: "TRAVELPORT-01";
  conditionalHoldRequirement: "written_core_category_eligibility_or_approved_exception";
  unselectedDecisionAlternativeIds: readonly CarRentalUnselectedDecisionAlternativeId[];
  aggregatorDiligencePriorityIds: readonly CarRentalAggregatorShortlistCandidateId[];
  aggregatorResearchAlternateIds: readonly CarRentalAggregatorAlternateCandidateId[];
  classifiedConditionCount: 29;
  unresolvedBlockingConditionCount: 12;
  providerVerificationRequiredCount: 17;
  resolvedConditionCount: 0;
  conditions: readonly CarRentalProviderPathCondition[];
  ownerConstraint: typeof carRentalProviderPathOwnerConstraint;
  soleOwnerConflicts: typeof carRentalProviderPathSoleOwnerConflicts;
  soleOwnerConflictState: CarRentalSoleOwnerConflictState;
  independentApprovalPresent: false;
  separationOfDutiesPresent: false;
  conditionResolutionPresent: false;
  conflictResolutionPresent: false;
  riskAcceptancePresent: false;
  waiverOrOverridePresent: false;
  formalRecommendationState: CarRentalFormalRecommendationState;
  commercialProviderSelectionState: CarRentalProviderPathSelectionState;
  providerSelected: false;
  selectedProviderId: null;
  runtimeProviderBindingState: CarRentalRuntimeProviderBindingState;
  runtimeProviderBinding: null;
  activationProviderDecisionRecorded: false;
  activationStageOneComplete: false;
  completedActivationStageIds: readonly [];
  parallelLaunchAuthorized: false;
  activationTrackStageCounts: Readonly<Record<CarRentalConnectorId, 0>>;
  liveConnectorCount: 0;
  evidenceDigest: string;
  providerContactMade: false;
  providerAccountPresent: false;
  credentialMaterialPresent: false;
  sandboxConnectionPresent: false;
  externalRequestAttempted: false;
  reservationActionAttempted: false;
  refundActionAttempted: false;
  paymentActionAttempted: false;
  migrationAttempted: false;
  deploymentAttempted: false;
  productionAuthorized: false;
  applicationKillSwitchState: CarRentalConnectorActivationKillSwitchState;
  databaseKillSwitchState: CarRentalConnectorActivationKillSwitchState;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

const carRentalProviderPathSequencingRuntimeKeys = Object.freeze([
  "decisionCaseId",
  "evidenceMode",
  "decisionArtifactId",
  "decisionSourceCommit",
  "decisionRecordedDate",
  "decisionKind",
  "decisionPaths",
  "primaryAggregatorProviderId",
  "secondaryEnterpriseProviderId",
  "conditionalHoldProviderId",
  "conditionalHoldConditionId",
  "conditionalHoldRequirement",
  "unselectedDecisionAlternativeIds",
  "aggregatorDiligencePriorityIds",
  "aggregatorResearchAlternateIds",
  "classifiedConditionCount",
  "unresolvedBlockingConditionCount",
  "providerVerificationRequiredCount",
  "resolvedConditionCount",
  "conditions",
  "ownerConstraint",
  "soleOwnerConflicts",
  "soleOwnerConflictState",
  "independentApprovalPresent",
  "separationOfDutiesPresent",
  "conditionResolutionPresent",
  "conflictResolutionPresent",
  "riskAcceptancePresent",
  "waiverOrOverridePresent",
  "formalRecommendationState",
  "commercialProviderSelectionState",
  "providerSelected",
  "selectedProviderId",
  "runtimeProviderBindingState",
  "runtimeProviderBinding",
  "activationProviderDecisionRecorded",
  "activationStageOneComplete",
  "completedActivationStageIds",
  "parallelLaunchAuthorized",
  "activationTrackStageCounts",
  "liveConnectorCount",
  "evidenceDigest",
  "providerContactMade",
  "providerAccountPresent",
  "credentialMaterialPresent",
  "sandboxConnectionPresent",
  "externalRequestAttempted",
  "reservationActionAttempted",
  "refundActionAttempted",
  "paymentActionAttempted",
  "migrationAttempted",
  "deploymentAttempted",
  "productionAuthorized",
  "applicationKillSwitchState",
  "databaseKillSwitchState",
  "recordedFields",
  "prohibitedDataDetected",
] as const);

function buildCarRentalProviderPathSequencingValidationResult(errors: string[]) {
  const valid = errors.length === 0;

  return {
    valid,
    localSequencingDecisionRecorded: valid,
    conditionsPreserved: valid,
    conflictsPreserved: valid,
    providerSelected: false,
    runtimeProviderBound: false,
    activationProviderDecisionRecorded: false,
    activationStageOneComplete: false,
    liveConnectorCount: 0,
    providerContactAuthorized: false,
    providerAccountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxTrafficAuthorized: false,
    externalTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    deploymentAuthorized: false,
    productionAuthorized: false,
    errors,
  } as const;
}

function sameExactDataValue(left: unknown, right: unknown, visited = new WeakMap<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;

  try {
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;

    const priorMatch = visited.get(left);
    if (priorMatch) return priorMatch === right;
    visited.set(left, right);

    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;

    return leftKeys.every((key) => {
      const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
      const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
      if (!leftDescriptor || !rightDescriptor || !("value" in leftDescriptor) || !("value" in rightDescriptor)) return false;
      if (leftDescriptor.enumerable !== rightDescriptor.enumerable) return false;
      return sameExactDataValue(leftDescriptor.value, rightDescriptor.value, visited);
    });
  } catch {
    return false;
  }
}

function hasExactOwnEnumerableDataKeys(value: object, expectedKeys: readonly string[]) {
  try {
    const actualKeys = Reflect.ownKeys(value);
    return actualKeys.length === expectedKeys.length
      && actualKeys.every((key) => {
        if (typeof key !== "string" || !expectedKeys.includes(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return Boolean(descriptor && descriptor.enumerable && "value" in descriptor);
      });
  } catch {
    return false;
  }
}

function isPlainProviderPathRecord(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === "object"
      && value !== null
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function hasOnlyPlainOwnDataGraph(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null) return typeof value !== "function" && typeof value !== "symbol";

  try {
    if (visited.has(value)) return true;
    visited.add(value);

    const expectedPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
    if (Object.getPrototypeOf(value) !== expectedPrototype) return false;

    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor && "value" in descriptor && hasOnlyPlainOwnDataGraph(descriptor.value, visited));
    });
  } catch {
    return false;
  }
}

function validateCarRentalProviderPathSequencingRecordKnown(record: CarRentalProviderPathSequencingRecord) {
  const errors: string[] = [];
  const expectedConnectorIds = carRentalNamedConnectorDefinitions.map((connector) => connector.id);

  if (typeof record.decisionCaseId !== "string" || !isStableToken(record.decisionCaseId)) errors.push("Provider-path decision case ID must be a stable opaque token.");
  if (record.evidenceMode !== CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE) errors.push("Provider-path decision evidence must remain local documentation.");
  if (record.decisionArtifactId !== CAR_RENTAL_PROVIDER_PATH_DECISION_ID) errors.push("Provider-path decision must bind the controlled decision artifact.");
  if (record.decisionSourceCommit !== CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_COMMIT) errors.push("Provider-path decision source commit does not match the published artifact.");
  if (record.decisionRecordedDate !== CAR_RENTAL_PROVIDER_PATH_DECISION_RECORDED_DATE) errors.push("Provider-path decision date does not match the controlled artifact.");
  if (record.decisionKind !== "phased_diligence_sequencing") errors.push("Only the approved phased diligence sequencing decision may be represented.");
  if (!Array.isArray(record.decisionPaths) || !sameExactDataValue(record.decisionPaths, carRentalProviderPathSequencingEntries)) errors.push("Provider-path entries must exactly match the approved sequencing decision and frozen research classifications.");
  if (record.primaryAggregatorProviderId !== "carnect") errors.push("Carnect must remain the named primary aggregator diligence path.");
  if (record.secondaryEnterpriseProviderId !== "sabre") errors.push("Sabre must remain the secondary enterprise diligence path.");
  if (record.conditionalHoldProviderId !== "travelport"
    || record.conditionalHoldConditionId !== "TRAVELPORT-01"
    || record.conditionalHoldRequirement !== "written_core_category_eligibility_or_approved_exception") errors.push("Travelport must remain on the exact approved TRAVELPORT-01 conditional hold.");
  if (!Array.isArray(record.unselectedDecisionAlternativeIds)
    || hasDuplicates(record.unselectedDecisionAlternativeIds)
    || !sameExactDataValue(record.unselectedDecisionAlternativeIds, carRentalUnselectedDecisionAlternativeIds)) errors.push("Unselected decision alternatives must exactly preserve the approved order.");
  if (!Array.isArray(record.aggregatorDiligencePriorityIds)
    || hasDuplicates(record.aggregatorDiligencePriorityIds)
    || !sameExactDataValue(record.aggregatorDiligencePriorityIds, carRentalProviderPathAggregatorDiligencePriorityIds)) errors.push("Aggregator diligence-priority research classifications must remain unchanged.");
  if (!Array.isArray(record.aggregatorResearchAlternateIds)
    || hasDuplicates(record.aggregatorResearchAlternateIds)
    || !sameExactDataValue(record.aggregatorResearchAlternateIds, carRentalProviderPathAggregatorResearchAlternateIds)) errors.push("Aggregator research-alternate classifications must remain unchanged.");
  if (record.classifiedConditionCount !== CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT
    || record.unresolvedBlockingConditionCount !== CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT
    || record.providerVerificationRequiredCount !== CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT
    || record.resolvedConditionCount !== 0
    || record.unresolvedBlockingConditionCount + record.providerVerificationRequiredCount !== record.classifiedConditionCount
    || !Array.isArray(record.conditions)
    || !sameExactDataValue(record.conditions, carRentalProviderPathConditions)) errors.push("All 29 classified conditions must remain unresolved in their exact recorded categories.");
  if (!sameExactDataValue(record.ownerConstraint, carRentalProviderPathOwnerConstraint)
    || !Array.isArray(record.soleOwnerConflicts)
    || !sameExactDataValue(record.soleOwnerConflicts, carRentalProviderPathSoleOwnerConflicts)
    || record.soleOwnerConflictState !== "unresolved"
    || record.independentApprovalPresent !== false
    || record.separationOfDutiesPresent !== false
    || record.conditionResolutionPresent !== false
    || record.conflictResolutionPresent !== false
    || record.riskAcceptancePresent !== false
    || record.waiverOrOverridePresent !== false) errors.push("Sole-owner conflicts, unresolved conditions, and missing independent review must remain unchanged.");
  if (record.formalRecommendationState !== "not_issued") errors.push("A formal provider recommendation has not been issued.");
  if (record.commercialProviderSelectionState !== "not_recorded" || record.providerSelected !== false || record.selectedProviderId !== null) errors.push("Commercial provider selection is not recorded by path sequencing.");
  if (record.runtimeProviderBindingState !== "unbound" || record.runtimeProviderBinding !== null) errors.push("Runtime provider binding must remain absent.");
  if (record.activationProviderDecisionRecorded !== false
    || record.activationStageOneComplete !== false
    || !Array.isArray(record.completedActivationStageIds)
    || record.completedActivationStageIds.length !== 0
    || !sameExactDataValue(record.completedActivationStageIds, carRentalProviderPathCompletedActivationStageIds)
    || record.parallelLaunchAuthorized !== false) errors.push("Activation provider decision, stage 1, completed-stage inventory, and parallel launch must remain false or empty.");
  if (typeof record.activationTrackStageCounts !== "object"
    || record.activationTrackStageCounts === null
    || Array.isArray(record.activationTrackStageCounts)
    || !hasExactOwnEnumerableDataKeys(record.activationTrackStageCounts, expectedConnectorIds)
    || !sameExactDataValue(record.activationTrackStageCounts, carRentalProviderPathZeroActivationTrackStageCounts)
    || record.liveConnectorCount !== 0) errors.push("Every connector must remain at 0 of 10 activation stages and 0 of 3 live.");
  if (typeof record.evidenceDigest !== "string" || record.evidenceDigest !== CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_DIGEST || !isSha256Digest(record.evidenceDigest)) errors.push("Provider-path decision evidence digest must match the published decision artifact.");
  if (record.providerContactMade !== false) errors.push("Provider contact is not authorized by path sequencing.");
  if (record.providerAccountPresent !== false) errors.push("Provider accounts are not authorized by path sequencing.");
  if (record.credentialMaterialPresent !== false) errors.push("Credential material is not authorized by path sequencing.");
  if (record.sandboxConnectionPresent !== false || record.externalRequestAttempted !== false) errors.push("Sandbox or external provider traffic is not authorized by path sequencing.");
  if (record.reservationActionAttempted !== false || record.refundActionAttempted !== false || record.paymentActionAttempted !== false) errors.push("Reservation, refund, or payment actions are not authorized by path sequencing.");
  if (record.migrationAttempted !== false || record.deploymentAttempted !== false) errors.push("Migration or deployment is not authorized by path sequencing.");
  if (record.productionAuthorized !== false) errors.push("Production is not authorized by path sequencing.");
  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (!hasExactOwnEnumerableDataKeys(record, carRentalProviderPathSequencingRuntimeKeys)) errors.push("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");
  if (!Array.isArray(record.recordedFields)) {
    errors.push("Recorded-field inventory must be an array.");
  } else {
    if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
    if (record.recordedFields.some((field) => !carRentalProviderPathSequencingRecordedFields.includes(field as (typeof carRentalProviderPathSequencingRecordedFields)[number]))) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
    if (!sameExactDataValue(record.recordedFields, carRentalProviderPathSequencingRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized provider-path allowlist.");
  }
  if (record.prohibitedDataDetected !== false) errors.push("Contact, contract, score, recommendation, runtime binding, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks provider-path sequencing.");

  return buildCarRentalProviderPathSequencingValidationResult(errors);
}

export function validateCarRentalProviderPathSequencingRecord(input: unknown) {
  if (!isPlainProviderPathRecord(input)) {
    return buildCarRentalProviderPathSequencingValidationResult(["Provider-path sequencing record must be a plain object."]);
  }

  if (!hasExactOwnEnumerableDataKeys(input, carRentalProviderPathSequencingRuntimeKeys) || !hasOnlyPlainOwnDataGraph(input)) {
    return buildCarRentalProviderPathSequencingValidationResult(["Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields."]);
  }

  try {
    structuredClone(input);
    return validateCarRentalProviderPathSequencingRecordKnown(input as CarRentalProviderPathSequencingRecord);
  } catch {
    return buildCarRentalProviderPathSequencingValidationResult(["Provider-path sequencing record could not be read safely."]);
  }
}

export const carRentalProviderPathSequencingRecord: CarRentalProviderPathSequencingRecord = Object.freeze({
  decisionCaseId: "provider-path-sequencing-case-01",
  evidenceMode: CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE,
  decisionArtifactId: CAR_RENTAL_PROVIDER_PATH_DECISION_ID,
  decisionSourceCommit: CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_COMMIT,
  decisionRecordedDate: CAR_RENTAL_PROVIDER_PATH_DECISION_RECORDED_DATE,
  decisionKind: "phased_diligence_sequencing",
  decisionPaths: carRentalProviderPathSequencingEntries,
  primaryAggregatorProviderId: "carnect",
  secondaryEnterpriseProviderId: "sabre",
  conditionalHoldProviderId: "travelport",
  conditionalHoldConditionId: "TRAVELPORT-01",
  conditionalHoldRequirement: "written_core_category_eligibility_or_approved_exception",
  unselectedDecisionAlternativeIds: carRentalUnselectedDecisionAlternativeIds,
  aggregatorDiligencePriorityIds: carRentalProviderPathAggregatorDiligencePriorityIds,
  aggregatorResearchAlternateIds: carRentalProviderPathAggregatorResearchAlternateIds,
  classifiedConditionCount: CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT,
  unresolvedBlockingConditionCount: CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT,
  providerVerificationRequiredCount: CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT,
  resolvedConditionCount: 0,
  conditions: carRentalProviderPathConditions,
  ownerConstraint: carRentalProviderPathOwnerConstraint,
  soleOwnerConflicts: carRentalProviderPathSoleOwnerConflicts,
  soleOwnerConflictState: "unresolved",
  independentApprovalPresent: false,
  separationOfDutiesPresent: false,
  conditionResolutionPresent: false,
  conflictResolutionPresent: false,
  riskAcceptancePresent: false,
  waiverOrOverridePresent: false,
  formalRecommendationState: "not_issued",
  commercialProviderSelectionState: "not_recorded",
  providerSelected: false,
  selectedProviderId: null,
  runtimeProviderBindingState: "unbound",
  runtimeProviderBinding: null,
  activationProviderDecisionRecorded: false,
  activationStageOneComplete: false,
  completedActivationStageIds: carRentalProviderPathCompletedActivationStageIds,
  parallelLaunchAuthorized: false,
  activationTrackStageCounts: carRentalProviderPathZeroActivationTrackStageCounts,
  liveConnectorCount: 0,
  evidenceDigest: CAR_RENTAL_PROVIDER_PATH_DECISION_SOURCE_DIGEST,
  providerContactMade: false,
  providerAccountPresent: false,
  credentialMaterialPresent: false,
  sandboxConnectionPresent: false,
  externalRequestAttempted: false,
  reservationActionAttempted: false,
  refundActionAttempted: false,
  paymentActionAttempted: false,
  migrationAttempted: false,
  deploymentAttempted: false,
  productionAuthorized: false,
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalProviderPathSequencingRecordedFields,
  prohibitedDataDetected: false,
});
