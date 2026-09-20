export const CAR_RENTAL_COMMERCIAL_COMPLIANCE_MODE = "commercial_compliance_readiness_offline_only" as const;

export const carRentalCommercialAgreementStates = ["offline_terms_recorded", "review_required", "rejected"] as const;
export const carRentalCompensationModels = ["commission", "markup", "net_rate", "unknown"] as const;
export const carRentalDisclosureStates = ["documented", "missing", "manual_review"] as const;
export const carRentalProtectionWordingStates = ["supplier_terms_only", "platform_summary_only", "not_offered", "missing", "manual_review"] as const;
export const carRentalAccessibilityReadinessStates = ["documented", "partial", "unknown", "manual_review"] as const;
export const carRentalConsumerLawReviewStates = ["offline_review_recorded", "not_reviewed", "manual_review", "rejected"] as const;
export const carRentalSupportOwnershipStates = ["internal_owner_recorded", "supplier_path_recorded", "shared_owner_recorded", "unassigned", "manual_review"] as const;
export const carRentalServiceLevelStates = ["draft_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalIncidentResponseStates = ["draft_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalCommercialReadinessResultStates = ["readiness_documented", "manual_review", "rejected"] as const;

export const carRentalCommercialReadinessRecordedFields = [
  "readiness_case_id",
  "environment_mode",
  "result_state",
  "agreement_state",
  "compensation_model",
  "disclosure_state",
  "protection_wording_state",
  "accessibility_state",
  "consumer_law_state",
  "support_ownership_state",
  "service_level_state",
  "incident_response_state",
  "evidence_digest",
] as const;

export const carRentalCommercialReadinessProhibitedFields = [
  "provider_name",
  "supplier_name",
  "counterparty_identity",
  "signed_contract",
  "signature",
  "raw_contract_text",
  "commission_percentage",
  "markup_amount",
  "net_rate_amount",
  "bank_account",
  "payment_card",
  "api_key",
  "access_token",
  "traveler_identity",
  "driver_license",
  "precise_location",
  "live_reservation_reference",
  "insurance_policy_number",
  "claim_document",
  "legal_advice",
  "privileged_communication",
] as const;

export type CarRentalCommercialAgreementState = (typeof carRentalCommercialAgreementStates)[number];
export type CarRentalCompensationModel = (typeof carRentalCompensationModels)[number];
export type CarRentalDisclosureState = (typeof carRentalDisclosureStates)[number];
export type CarRentalProtectionWordingState = (typeof carRentalProtectionWordingStates)[number];
export type CarRentalAccessibilityReadinessState = (typeof carRentalAccessibilityReadinessStates)[number];
export type CarRentalConsumerLawReviewState = (typeof carRentalConsumerLawReviewStates)[number];
export type CarRentalSupportOwnershipState = (typeof carRentalSupportOwnershipStates)[number];
export type CarRentalServiceLevelState = (typeof carRentalServiceLevelStates)[number];
export type CarRentalIncidentResponseState = (typeof carRentalIncidentResponseStates)[number];
export type CarRentalCommercialReadinessResultState = (typeof carRentalCommercialReadinessResultStates)[number];
export type CarRentalCommercialReadinessRecordedField = (typeof carRentalCommercialReadinessRecordedFields)[number];

export type CarRentalCommercialComplianceContract = {
  id: "commercial_agreement" | "compensation_structure" | "consumer_disclosures" | "protection_wording" | "accessibility_readiness" | "consumer_law_controls" | "support_ownership" | "service_levels" | "incident_response";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalCommercialComplianceContracts: readonly CarRentalCommercialComplianceContract[] = [
  { id: "commercial_agreement", label: "Commercial agreement readiness", requiredFields: ["Offline terms state", "No counterparty identity", "No signature"], validationRule: "Record only a provider-neutral agreement-readiness state without a counterparty, executed terms, signature, or contract text.", safetyBoundary: "An offline agreement state is not negotiation, acceptance, execution, legal advice, or commercial authority." },
  { id: "compensation_structure", label: "Commission or markup structure", requiredFields: ["Controlled model label", "No percentage", "No amount"], validationRule: "Classify commission, markup, net-rate, or unknown structure without percentages, amounts, settlement details, or supplier identity.", safetyBoundary: "A model label does not set pricing, authorize compensation, move money, or create a supplier relationship." },
  { id: "consumer_disclosures", label: "Consumer disclosures", requiredFields: ["Disclosure state", "Review outcome", "Digest-only evidence"], validationRule: "Require documented disclosure evidence before local readiness while preserving missing and manual-review states.", safetyBoundary: "Disclosure evidence is not legal approval, publication, a consumer representation, or permission to sell." },
  { id: "protection_wording", label: "Insurance and protection wording", requiredFields: ["Controlled wording mode", "No policy number", "No coverage promise"], validationRule: "Distinguish supplier terms, platform summary, not offered, missing, or manual review without representing insurance coverage.", safetyBoundary: "The wording mode cannot bind coverage, issue insurance, adjudicate claims, or replace licensed review." },
  { id: "accessibility_readiness", label: "Accessibility readiness", requiredFields: ["Accessibility state", "No traveler identity", "No accommodation request"], validationRule: "Record documented, partial, unknown, or manual-review accessibility readiness using synthetic evidence only.", safetyBoundary: "Accessibility readiness is not a property or vehicle guarantee, accommodation fulfillment, or compliance certification." },
  { id: "consumer_law_controls", label: "Consumer-law controls", requiredFields: ["Offline review state", "No jurisdiction identity", "No legal advice"], validationRule: "Require an offline consumer-law review state without legal conclusions, privileged communications, filings, or named jurisdictions.", safetyBoundary: "A recorded state is not legal advice, representation, filing, waiver, or determination of compliance." },
  { id: "support_ownership", label: "Support ownership", requiredFields: ["Controlled owner path", "No person identity", "No live assignment"], validationRule: "Record internal, supplier-path, shared, unassigned, or manual-review ownership without naming a supplier or assigning a live case.", safetyBoundary: "Ownership evidence cannot staff support, contact a supplier, dispatch service, or accept a case." },
  { id: "service_levels", label: "Service-level readiness", requiredFields: ["Draft state", "No executed SLA", "No operational promise"], validationRule: "Require a provider-neutral draft service-level state before local readiness while preserving missing, review, and rejected outcomes.", safetyBoundary: "A draft state is not an executed SLA, response-time promise, operational capacity, or customer commitment." },
  { id: "incident_response", label: "Incident-response readiness", requiredFields: ["Draft state", "Escalation boundary", "No live incident"], validationRule: "Require a provider-neutral incident-response draft state without opening incidents, contacting services, or creating runtime authority.", safetyBoundary: "Incident readiness cannot create an incident, notify a party, change a reservation, refund, pay, or release Production." },
];

export type CarRentalCommercialComplianceGate = {
  id: "commercial_boundary_reviewed" | "agreement_evidence_reviewed" | "compensation_model_reviewed" | "consumer_disclosures_reviewed" | "protection_wording_reviewed" | "accessibility_reviewed" | "consumer_law_reviewed" | "support_ownership_reviewed" | "service_levels_reviewed" | "incident_response_reviewed" | "evidence_minimization_reviewed" | "commercial_release_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalCommercialComplianceGates: readonly CarRentalCommercialComplianceGate[] = [
  { id: "commercial_boundary_reviewed", label: "Provider-neutral commercial boundary reviewed", owner: "Executive + Commercial", detail: "Approve only the offline model and its no-contact, no-contract, no-transaction boundary." },
  { id: "agreement_evidence_reviewed", label: "Agreement-readiness evidence reviewed", owner: "Commercial + Legal review", detail: "Record a controlled state without a counterparty, negotiated terms, execution, signature, legal advice, or filing." },
  { id: "compensation_model_reviewed", label: "Compensation model reviewed", owner: "Finance + Commercial", detail: "Classify structure only; exclude percentages, amounts, settlement details, accounts, and payment authority." },
  { id: "consumer_disclosures_reviewed", label: "Consumer disclosures reviewed", owner: "Product + Legal review", detail: "Review synthetic disclosure evidence without publication, consumer representation, waiver, or legal conclusion." },
  { id: "protection_wording_reviewed", label: "Protection wording reviewed", owner: "Product + Compliance", detail: "Preserve supplier-terms and platform-summary boundaries without offering insurance or promising coverage." },
  { id: "accessibility_reviewed", label: "Accessibility readiness reviewed", owner: "Accessibility + Product", detail: "Review synthetic readiness without traveler identity, accommodation fulfillment, or compliance certification." },
  { id: "consumer_law_reviewed", label: "Consumer-law controls reviewed", owner: "Legal review + Privacy", detail: "Require separate qualified review without legal advice, representation, privileged material, or filing." },
  { id: "support_ownership_reviewed", label: "Support ownership reviewed", owner: "Support + Operations", detail: "Review provider-neutral ownership paths without assigning people, suppliers, live cases, or service actions." },
  { id: "service_levels_reviewed", label: "Service-level readiness reviewed", owner: "Operations + Support", detail: "Review draft evidence without an executed SLA, response-time promise, or operational commitment." },
  { id: "incident_response_reviewed", label: "Incident-response readiness reviewed", owner: "Security + Operations", detail: "Review the offline escalation design without opening an incident, notifying a party, or changing runtime state." },
  { id: "evidence_minimization_reviewed", label: "Commercial evidence minimization reviewed", owner: "Privacy + Security", detail: "Require the exact allowlist and reject identities, terms, signatures, rates, payment data, credentials, legal material, and live references." },
  { id: "commercial_release_separately_authorized", label: "External commercial action separately authorized", owner: "Independent accountable review", detail: "Require separate authority for research, contact, contracts, accounts, credentials, legal action, traffic, transactions, migrations, or Production." },
];

export type CarRentalCommercialComplianceEvidence = Partial<Record<CarRentalCommercialComplianceGate["id"], boolean>>;

export function buildCarRentalCommercialCompliancePlan(evidence: CarRentalCommercialComplianceEvidence = {}) {
  const gates = carRentalCommercialComplianceGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_COMMERCIAL_COMPLIANCE_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    commercialReviewComplete: completedCount === gates.length,
    supplierResearchAuthorized: false,
    supplierContactAuthorized: false,
    contractExecutionAuthorized: false,
    accountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    legalAdviceProvided: false,
    legalRepresentationAuthorized: false,
    legalFilingAuthorized: false,
    externalTrafficAuthorized: false,
    reservationAuthorized: false,
    refundAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionAuthorized: false,
  } as const;
}

export type CarRentalCanonicalCommercialReadinessRecord = {
  readinessCaseId: string;
  environmentMode: "offline_fixture";
  resultState: CarRentalCommercialReadinessResultState;
  agreementState: CarRentalCommercialAgreementState;
  compensationModel: CarRentalCompensationModel;
  disclosureState: CarRentalDisclosureState;
  protectionWordingState: CarRentalProtectionWordingState;
  accessibilityState: CarRentalAccessibilityReadinessState;
  consumerLawState: CarRentalConsumerLawReviewState;
  supportOwnershipState: CarRentalSupportOwnershipState;
  serviceLevelState: CarRentalServiceLevelState;
  incidentResponseState: CarRentalIncidentResponseState;
  evidenceDigest: string;
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

export function validateCarRentalCommercialReadinessRecord(record: CarRentalCanonicalCommercialReadinessRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.readinessCaseId)) errors.push("Readiness-case ID must be a stable opaque token.");
  if (record.environmentMode !== "offline_fixture") errors.push("Phase 11 commercial evidence must remain in offline-fixture mode.");
  if (!carRentalCommercialReadinessResultStates.includes(record.resultState)) errors.push("Commercial-readiness result state is not supported.");
  if (!carRentalCommercialAgreementStates.includes(record.agreementState)) errors.push("Commercial agreement state is not supported.");
  if (!carRentalCompensationModels.includes(record.compensationModel)) errors.push("Compensation model is not supported.");
  if (!carRentalDisclosureStates.includes(record.disclosureState)) errors.push("Disclosure state is not supported.");
  if (!carRentalProtectionWordingStates.includes(record.protectionWordingState)) errors.push("Protection wording state is not supported.");
  if (!carRentalAccessibilityReadinessStates.includes(record.accessibilityState)) errors.push("Accessibility readiness state is not supported.");
  if (!carRentalConsumerLawReviewStates.includes(record.consumerLawState)) errors.push("Consumer-law review state is not supported.");
  if (!carRentalSupportOwnershipStates.includes(record.supportOwnershipState)) errors.push("Support ownership state is not supported.");
  if (!carRentalServiceLevelStates.includes(record.serviceLevelState)) errors.push("Service-level state is not supported.");
  if (!carRentalIncidentResponseStates.includes(record.incidentResponseState)) errors.push("Incident-response state is not supported.");
  if (!isSha256Digest(record.evidenceDigest)) errors.push("Commercial-readiness evidence must be a lowercase 64-character digest.");
  if (record.prohibitedDataDetected) errors.push("Provider, contract, rate, payment, credential, identity, legal, insurance, claim, location, or live-reference data blocks commercial readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalCommercialReadinessRecordedFields.includes(field as CarRentalCommercialReadinessRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalCommercialReadinessRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized commercial-readiness allowlist.");

  if (record.resultState === "readiness_documented") {
    if (record.agreementState !== "offline_terms_recorded") errors.push("Readiness-documented evidence requires offline terms to be recorded without execution.");
    if (record.compensationModel === "unknown") errors.push("Readiness-documented evidence requires a controlled compensation-model label.");
    if (record.disclosureState !== "documented") errors.push("Readiness-documented evidence requires documented consumer disclosures.");
    if (!["supplier_terms_only", "platform_summary_only", "not_offered"].includes(record.protectionWordingState)) errors.push("Readiness-documented evidence requires a bounded protection-wording mode.");
    if (record.accessibilityState !== "documented") errors.push("Readiness-documented evidence requires documented accessibility readiness.");
    if (record.consumerLawState !== "offline_review_recorded") errors.push("Readiness-documented evidence requires an offline consumer-law review state.");
    if (!["internal_owner_recorded", "supplier_path_recorded", "shared_owner_recorded"].includes(record.supportOwnershipState)) errors.push("Readiness-documented evidence requires a controlled support-ownership path.");
    if (record.serviceLevelState !== "draft_recorded") errors.push("Readiness-documented evidence requires a provider-neutral service-level draft state.");
    if (record.incidentResponseState !== "draft_recorded") errors.push("Readiness-documented evidence requires a provider-neutral incident-response draft state.");
  }

  const valid = errors.length === 0;
  const readinessChecksSatisfied = valid && record.resultState === "readiness_documented";

  return {
    valid,
    readinessChecksSatisfied,
    errors,
    supplierResearchAuthorized: false,
    supplierContactAuthorized: false,
    contractExecutionAuthorized: false,
    accountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    legalAdviceProvided: false,
    legalRepresentationAuthorized: false,
    legalFilingAuthorized: false,
    externalTrafficAuthorized: false,
    reservationAuthorized: false,
    refundAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionAuthorized: false,
  } as const;
}

const baseRecord: Omit<CarRentalCanonicalCommercialReadinessRecord, "readinessCaseId" | "compensationModel" | "protectionWordingState" | "supportOwnershipState" | "evidenceDigest"> = {
  environmentMode: "offline_fixture",
  resultState: "readiness_documented",
  agreementState: "offline_terms_recorded",
  disclosureState: "documented",
  accessibilityState: "documented",
  consumerLawState: "offline_review_recorded",
  serviceLevelState: "draft_recorded",
  incidentResponseState: "draft_recorded",
  recordedFields: carRentalCommercialReadinessRecordedFields,
  prohibitedDataDetected: false,
};

export const carRentalCommercialReadinessFixtures: readonly CarRentalCanonicalCommercialReadinessRecord[] = [
  { ...baseRecord, readinessCaseId: "commercial-commission-0001", compensationModel: "commission", protectionWordingState: "supplier_terms_only", supportOwnershipState: "internal_owner_recorded", evidenceDigest: "5".repeat(64) },
  { ...baseRecord, readinessCaseId: "commercial-markup-0001", compensationModel: "markup", protectionWordingState: "platform_summary_only", supportOwnershipState: "shared_owner_recorded", evidenceDigest: "6".repeat(64) },
  { ...baseRecord, readinessCaseId: "commercial-net-rate-0001", compensationModel: "net_rate", protectionWordingState: "not_offered", supportOwnershipState: "supplier_path_recorded", evidenceDigest: "7".repeat(64) },
];
