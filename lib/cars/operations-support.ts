export const CAR_RENTAL_OPERATIONS_SUPPORT_MODE = "operations_support_contract_only" as const;

export const carRentalOperationsCaseKinds = [
  "pickup_failure",
  "counter_dispute",
  "unavailable_class",
  "upgrade",
  "breakdown",
  "accident",
  "roadside_assistance",
  "damage_claim",
  "emergency_escalation",
] as const;

export const carRentalOperationsCaseStates = ["opened", "triaged", "pending_external", "resolved", "closed", "manual_review"] as const;
export const carRentalOperationsUrgencies = ["standard", "elevated", "urgent", "emergency"] as const;
export const carRentalOperationsLocationContexts = ["counter", "pickup_site", "roadside", "remote", "unknown"] as const;
export const carRentalSupportOutcomes = ["pending", "information_only", "recorded_resolution", "unavailable", "rejected", "manual_review"] as const;
export const carRentalCounterDisputeStates = ["not_applicable", "reported", "pending", "resolved_recorded", "manual_review"] as const;
export const carRentalVehicleClassResolutionStates = ["not_applicable", "unavailable", "substitute_recorded", "upgrade_recorded", "unknown", "manual_review"] as const;
export const carRentalUpgradeStates = ["not_applicable", "offered_recorded", "accepted_recorded", "declined_recorded", "unknown", "manual_review"] as const;
export const carRentalRoadsideAssistanceStates = ["not_applicable", "pending", "dispatch_recorded", "completed_recorded", "unavailable", "manual_review"] as const;
export const carRentalDamageClaimStates = ["not_applicable", "reported", "pending", "disputed", "resolved_recorded", "manual_review"] as const;
export const carRentalEmergencyEscalationStates = ["not_applicable", "pending", "contact_recorded", "completed_recorded", "manual_review"] as const;

export const carRentalOperationsRecordedFields = [
  "operations_case_id",
  "lifecycle_id",
  "case_kind",
  "case_state",
  "urgency",
  "location_context",
  "opened_at",
  "acknowledged_at",
  "resolved_at",
  "support_outcome",
  "counter_dispute_state",
  "vehicle_class_resolution_state",
  "upgrade_state",
  "roadside_assistance_state",
  "damage_claim_state",
  "emergency_escalation_state",
  "resolution_evidence_digest",
] as const;

export const carRentalOperationsProhibitedFields = [
  "traveler_name",
  "traveler_email",
  "traveler_phone",
  "driver_license_number",
  "driver_license_image",
  "vehicle_plate",
  "vehicle_identification_number",
  "precise_location",
  "payment_card_number",
  "payment_security_code",
  "medical_information",
  "raw_accident_narrative",
  "police_report",
  "insurance_policy_number",
  "raw_supplier_reference",
  "provider_credentials",
] as const;

export type CarRentalOperationsCaseKind = (typeof carRentalOperationsCaseKinds)[number];
export type CarRentalOperationsCaseState = (typeof carRentalOperationsCaseStates)[number];
export type CarRentalOperationsUrgency = (typeof carRentalOperationsUrgencies)[number];
export type CarRentalOperationsLocationContext = (typeof carRentalOperationsLocationContexts)[number];
export type CarRentalSupportOutcome = (typeof carRentalSupportOutcomes)[number];
export type CarRentalCounterDisputeState = (typeof carRentalCounterDisputeStates)[number];
export type CarRentalVehicleClassResolutionState = (typeof carRentalVehicleClassResolutionStates)[number];
export type CarRentalUpgradeState = (typeof carRentalUpgradeStates)[number];
export type CarRentalRoadsideAssistanceState = (typeof carRentalRoadsideAssistanceStates)[number];
export type CarRentalDamageClaimState = (typeof carRentalDamageClaimStates)[number];
export type CarRentalEmergencyEscalationState = (typeof carRentalEmergencyEscalationStates)[number];
export type CarRentalOperationsRecordedField = (typeof carRentalOperationsRecordedFields)[number];

export type CarRentalOperationsSupportContract = {
  id: CarRentalOperationsCaseKind;
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalOperationsSupportContracts: readonly CarRentalOperationsSupportContract[] = [
  { id: "pickup_failure", label: "Pickup-failure handling", requiredFields: ["Case state", "Pickup context", "Explicit outcome"], validationRule: "Preserve one sanitized pickup-failure case with ordered acknowledgement and resolution evidence.", safetyBoundary: "A local pickup-failure record cannot contact a counter, source a vehicle, change a reservation, or promise a remedy." },
  { id: "counter_dispute", label: "Counter-dispute handling", requiredFields: ["Dispute state", "Counter context", "No raw narrative"], validationRule: "Retain reported, pending, resolved-recorded, and manual-review states without storing identities or allegations.", safetyBoundary: "A recorded dispute is not a finding, settlement, waiver, refund, supplier complaint, or legal conclusion." },
  { id: "unavailable_class", label: "Unavailable-class handling", requiredFields: ["Class state", "Controlled substitute state", "Explicit uncertainty"], validationRule: "Preserve unavailable, substitute-recorded, upgrade-recorded, unknown, and manual-review outcomes.", safetyBoundary: "A class-resolution fixture cannot inspect inventory, allocate a substitute, or guarantee an upgrade." },
  { id: "upgrade", label: "Upgrade evidence", requiredFields: ["Upgrade state", "Case outcome", "No price claim"], validationRule: "Record offered, accepted, declined, unknown, and manual-review upgrade evidence without pricing or fulfillment authority.", safetyBoundary: "A synthetic upgrade state is not a vehicle assignment, acceptance, price, charge, or supplier commitment." },
  { id: "breakdown", label: "Breakdown handling", requiredFields: ["Roadside context", "Assistance state", "Ordered timestamps"], validationRule: "Preserve a sanitized breakdown timeline and explicit roadside-assistance evidence without vehicle or location identifiers.", safetyBoundary: "A breakdown fixture cannot diagnose a vehicle, dispatch assistance, authorize repairs, or determine liability." },
  { id: "accident", label: "Accident handling", requiredFields: ["Urgency", "Assistance state", "Escalation state"], validationRule: "Preserve explicit roadside, damage, and emergency states while rejecting sensitive narratives and precise locations.", safetyBoundary: "An accident fixture cannot contact emergency services, dispatch help, report a claim, determine fault, or provide medical advice." },
  { id: "roadside_assistance", label: "Roadside-assistance evidence", requiredFields: ["Assistance state", "Roadside or remote context", "Sanitized digest"], validationRule: "Retain pending, dispatch-recorded, completed-recorded, unavailable, and manual-review states.", safetyBoundary: "Recorded roadside evidence is not a dispatch request, service confirmation, repair order, or safety guarantee." },
  { id: "damage_claim", label: "Damage-claim evidence", requiredFields: ["Claim state", "Sanitized digest", "No policy data"], validationRule: "Preserve reported, pending, disputed, resolved-recorded, and manual-review states without claim documents or insurance data.", safetyBoundary: "A damage-claim fixture cannot file, accept, deny, price, settle, or represent a claim." },
  { id: "emergency_escalation", label: "Emergency escalation", requiredFields: ["Emergency urgency", "Escalation state", "Fail-closed outcome"], validationRule: "Require explicit emergency urgency and preserve pending, contact-recorded, completed-recorded, and manual-review evidence.", safetyBoundary: "A local escalation record cannot place a call, dispatch emergency services, provide medical guidance, or prove response." },
];

export type CarRentalOperationsSupportGate = {
  id:
    | "contract_approved"
    | "pickup_failure_reviewed"
    | "counter_dispute_reviewed"
    | "class_and_upgrade_reviewed"
    | "breakdown_and_roadside_reviewed"
    | "accident_and_emergency_reviewed"
    | "damage_claim_reviewed"
    | "support_ownership_reviewed"
    | "timeline_and_outcome_reviewed"
    | "field_minimization_reviewed"
    | "fixtures_and_rejections_approved"
    | "live_operations_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalOperationsSupportGates: readonly CarRentalOperationsSupportGate[] = [
  { id: "contract_approved", label: "Operations and support contract approved", owner: "Engineering + Operations", detail: "Approve the provider-neutral case shape, controlled states, ordered timestamps, minimized fields, and non-operational wording." },
  { id: "pickup_failure_reviewed", label: "Pickup-failure behavior reviewed", owner: "Operations + Support", detail: "Preserve pickup-site and counter outcomes without contacting a supplier, sourcing a vehicle, or promising a remedy." },
  { id: "counter_dispute_reviewed", label: "Counter-dispute behavior reviewed", owner: "Support + Legal", detail: "Verify explicit dispute states without identities, raw narratives, findings, settlements, waivers, or refunds." },
  { id: "class_and_upgrade_reviewed", label: "Unavailable class and upgrade reviewed", owner: "Product + Operations", detail: "Preserve class and upgrade evidence without inventory checks, assignments, pricing, charges, or supplier commitments." },
  { id: "breakdown_and_roadside_reviewed", label: "Breakdown and roadside boundary reviewed", owner: "Operations + Safety", detail: "Verify sanitized assistance states without diagnostics, dispatch, repair approval, location data, or safety guarantees." },
  { id: "accident_and_emergency_reviewed", label: "Accident and emergency boundary reviewed", owner: "Safety + Legal", detail: "Require explicit urgency while keeping emergency contact, medical guidance, fault findings, and external reporting disabled." },
  { id: "damage_claim_reviewed", label: "Damage-claim boundary reviewed", owner: "Legal + Finance", detail: "Preserve controlled claim evidence without policy data, documents, filing, acceptance, denial, pricing, or settlement." },
  { id: "support_ownership_reviewed", label: "Support ownership and escalation reviewed", owner: "Support + Operations", detail: "Verify internal ownership labels and escalation states without opening a ticket or contacting any external party." },
  { id: "timeline_and_outcome_reviewed", label: "Timeline and outcome integrity reviewed", owner: "Engineering + Audit", detail: "Require valid UTC ordering, state-consistent acknowledgements, terminal evidence digests, and explicit unresolved outcomes." },
  { id: "field_minimization_reviewed", label: "Operations-data minimization reviewed", owner: "Security + Privacy", detail: "Confirm the exact allowlist and reject identity, license, vehicle, location, payment, medical, narrative, claim, reference, and credential data." },
  { id: "fixtures_and_rejections_approved", label: "Sanitized fixtures and rejections approved", owner: "Engineering + Security", detail: "Review only synthetic pickup, breakdown-roadside, and accident-escalation fixtures plus fail-closed cases." },
  { id: "live_operations_authorized", label: "Live operational action separately authorized", owner: "Release approvers", detail: "Require supplier rights, legal and safety approval, staffed support, sandbox certification, incident response, monitoring, and a separate Production decision." },
];

export type CarRentalOperationsSupportEvidence = Partial<Record<CarRentalOperationsSupportGate["id"], boolean>>;

export function buildCarRentalOperationsSupportPlan(evidence: CarRentalOperationsSupportEvidence = {}) {
  const gates = carRentalOperationsSupportGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_OPERATIONS_SUPPORT_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
    supplierContactAuthorized: false,
    providerMappingCreated: false,
    credentialAcceptanceAuthorized: false,
    externalTrafficAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    supportContactAuthorized: false,
    roadsideDispatchAuthorized: false,
    emergencyServiceContactAuthorized: false,
    replacementVehicleAuthorized: false,
    upgradeFulfillmentAuthorized: false,
    damageClaimSubmissionAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

export type CarRentalCanonicalOperationsSupportRecord = {
  operationsCaseId: string;
  lifecycleId: string;
  caseKind: CarRentalOperationsCaseKind;
  caseState: CarRentalOperationsCaseState;
  urgency: CarRentalOperationsUrgency;
  locationContext: CarRentalOperationsLocationContext;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  supportOutcome: CarRentalSupportOutcome;
  counterDisputeState: CarRentalCounterDisputeState;
  vehicleClassResolutionState: CarRentalVehicleClassResolutionState;
  upgradeState: CarRentalUpgradeState;
  roadsideAssistanceState: CarRentalRoadsideAssistanceState;
  damageClaimState: CarRentalDamageClaimState;
  emergencyEscalationState: CarRentalEmergencyEscalationState;
  resolutionEvidenceDigest: string | null;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function isUtcInstant(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function requiresSpecialState(kind: CarRentalOperationsCaseKind, relevantKinds: readonly CarRentalOperationsCaseKind[]) {
  return relevantKinds.includes(kind);
}

function validateApplicableState(label: string, kind: CarRentalOperationsCaseKind, relevantKinds: readonly CarRentalOperationsCaseKind[], state: string, errors: string[]) {
  const relevant = requiresSpecialState(kind, relevantKinds);
  if (relevant && state === "not_applicable") errors.push(`${label} must be explicit for the selected case kind.`);
  if (!relevant && state !== "not_applicable") errors.push(`${label} must be not applicable for the selected case kind.`);
}

export function validateCarRentalOperationsSupportRecord(record: CarRentalCanonicalOperationsSupportRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.operationsCaseId)) errors.push("Operations-case ID must be a stable opaque token.");
  if (!isStableToken(record.lifecycleId)) errors.push("Lifecycle ID must be a stable opaque token.");
  if (!carRentalOperationsCaseKinds.includes(record.caseKind)) errors.push("Operations case kind is not supported.");
  if (!carRentalOperationsCaseStates.includes(record.caseState)) errors.push("Operations case state is not supported.");
  if (!carRentalOperationsUrgencies.includes(record.urgency)) errors.push("Operations urgency is not supported.");
  if (!carRentalOperationsLocationContexts.includes(record.locationContext)) errors.push("Operations location context is not supported.");
  if (!carRentalSupportOutcomes.includes(record.supportOutcome)) errors.push("Support outcome is not supported.");
  if (!carRentalCounterDisputeStates.includes(record.counterDisputeState)) errors.push("Counter-dispute state is not supported.");
  if (!carRentalVehicleClassResolutionStates.includes(record.vehicleClassResolutionState)) errors.push("Vehicle-class resolution state is not supported.");
  if (!carRentalUpgradeStates.includes(record.upgradeState)) errors.push("Upgrade state is not supported.");
  if (!carRentalRoadsideAssistanceStates.includes(record.roadsideAssistanceState)) errors.push("Roadside-assistance state is not supported.");
  if (!carRentalDamageClaimStates.includes(record.damageClaimState)) errors.push("Damage-claim state is not supported.");
  if (!carRentalEmergencyEscalationStates.includes(record.emergencyEscalationState)) errors.push("Emergency-escalation state is not supported.");

  if (!isUtcInstant(record.openedAt)) errors.push("Opened timestamp must be a valid UTC instant.");
  if (record.acknowledgedAt !== null && !isUtcInstant(record.acknowledgedAt)) errors.push("Acknowledged timestamp must be null or a valid UTC instant.");
  if (record.resolvedAt !== null && !isUtcInstant(record.resolvedAt)) errors.push("Resolved timestamp must be null or a valid UTC instant.");
  if (isUtcInstant(record.openedAt) && record.acknowledgedAt !== null && isUtcInstant(record.acknowledgedAt) && Date.parse(record.acknowledgedAt) < Date.parse(record.openedAt)) errors.push("Acknowledged timestamp cannot precede the opened timestamp.");
  if (record.resolvedAt !== null && isUtcInstant(record.resolvedAt)) {
    if (isUtcInstant(record.openedAt) && Date.parse(record.resolvedAt) < Date.parse(record.openedAt)) errors.push("Resolved timestamp cannot precede the opened timestamp.");
    if (record.acknowledgedAt !== null && isUtcInstant(record.acknowledgedAt) && Date.parse(record.resolvedAt) < Date.parse(record.acknowledgedAt)) errors.push("Resolved timestamp cannot precede the acknowledged timestamp.");
  }

  if (record.caseState === "opened") {
    if (record.acknowledgedAt !== null || record.resolvedAt !== null) errors.push("Opened cases cannot contain acknowledgement or resolution timestamps.");
    if (record.supportOutcome !== "pending") errors.push("Opened cases must keep the support outcome pending.");
  }
  if (["triaged", "pending_external", "manual_review"].includes(record.caseState)) {
    if (record.acknowledgedAt === null) errors.push("Triaged, pending-external, and manual-review cases require an acknowledgement timestamp.");
    if (record.resolvedAt !== null) errors.push("Non-terminal operations cases cannot contain a resolution timestamp.");
  }
  if (record.caseState === "manual_review" && record.supportOutcome !== "manual_review") errors.push("Manual-review cases must keep the support outcome in manual review.");
  if (["resolved", "closed"].includes(record.caseState)) {
    if (record.acknowledgedAt === null || record.resolvedAt === null) errors.push("Resolved and closed cases require acknowledgement and resolution timestamps.");
    if (["pending", "manual_review"].includes(record.supportOutcome)) errors.push("Resolved and closed cases require a terminal support outcome.");
  }

  if (["resolved", "closed"].includes(record.caseState)) {
    if (record.resolutionEvidenceDigest === null || !isSha256Digest(record.resolutionEvidenceDigest)) errors.push("Resolved and closed cases require a lowercase 64-character resolution-evidence digest.");
  } else if (record.resolutionEvidenceDigest !== null) {
    errors.push("Only resolved or closed cases can contain a resolution-evidence digest.");
  }

  validateApplicableState("Counter-dispute state", record.caseKind, ["counter_dispute"], record.counterDisputeState, errors);
  validateApplicableState("Vehicle-class resolution state", record.caseKind, ["pickup_failure", "unavailable_class", "upgrade"], record.vehicleClassResolutionState, errors);
  validateApplicableState("Roadside-assistance state", record.caseKind, ["breakdown", "accident", "roadside_assistance"], record.roadsideAssistanceState, errors);
  validateApplicableState("Damage-claim state", record.caseKind, ["accident", "damage_claim"], record.damageClaimState, errors);
  validateApplicableState("Emergency-escalation state", record.caseKind, ["accident", "emergency_escalation"], record.emergencyEscalationState, errors);

  if (["unavailable_class", "upgrade"].includes(record.caseKind) && record.upgradeState === "not_applicable") errors.push("Upgrade state must be explicit for unavailable-class and upgrade cases.");
  if (!["pickup_failure", "unavailable_class", "upgrade"].includes(record.caseKind) && record.upgradeState !== "not_applicable") errors.push("Upgrade state must be not applicable for the selected case kind.");
  if (record.caseKind === "pickup_failure" && !["counter", "pickup_site", "unknown"].includes(record.locationContext)) errors.push("Pickup-failure cases require counter, pickup-site, or unknown location context.");
  if (record.caseKind === "counter_dispute" && !["counter", "unknown"].includes(record.locationContext)) errors.push("Counter-dispute cases require counter or unknown location context.");
  if (["breakdown", "accident", "roadside_assistance"].includes(record.caseKind) && !["roadside", "remote", "unknown"].includes(record.locationContext)) errors.push("Breakdown, accident, and roadside-assistance cases require roadside, remote, or unknown location context.");
  if (record.urgency === "emergency" && !["accident", "emergency_escalation"].includes(record.caseKind)) errors.push("Emergency urgency is reserved for accident and emergency-escalation cases.");
  if (record.caseKind === "emergency_escalation" && record.urgency !== "emergency") errors.push("Emergency-escalation cases require emergency urgency.");

  if (record.prohibitedDataDetected) errors.push("Identity, license, vehicle, location, payment, medical, narrative, claim-document, raw-reference, or credential data blocks operations-support readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalOperationsRecordedFields.includes(field as CarRentalOperationsRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalOperationsRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized operations-support allowlist.");

  const unresolvedStates = [
    record.counterDisputeState,
    record.vehicleClassResolutionState,
    record.upgradeState,
    record.roadsideAssistanceState,
    record.damageClaimState,
    record.emergencyEscalationState,
  ].filter((state) => state !== "not_applicable");
  const hasUnresolvedState = unresolvedStates.some((state) => ["reported", "pending", "unavailable", "unknown", "disputed", "manual_review"].includes(state));
  const valid = errors.length === 0;
  const contractChecksSatisfied = valid
    && ["resolved", "closed"].includes(record.caseState)
    && ["information_only", "recorded_resolution", "rejected"].includes(record.supportOutcome)
    && record.locationContext !== "unknown"
    && !hasUnresolvedState;

  return {
    valid,
    contractChecksSatisfied,
    errors,
    supplierContactAuthorized: false,
    providerMappingCreated: false,
    credentialAcceptanceAuthorized: false,
    externalTrafficAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationMutationAuthorized: false,
    supportContactAuthorized: false,
    roadsideDispatchAuthorized: false,
    emergencyServiceContactAuthorized: false,
    replacementVehicleAuthorized: false,
    upgradeFulfillmentAuthorized: false,
    damageClaimSubmissionAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

const baseRecord: Omit<CarRentalCanonicalOperationsSupportRecord,
  "operationsCaseId" | "lifecycleId" | "caseKind" | "urgency" | "locationContext" | "openedAt" | "acknowledgedAt" | "resolvedAt" | "supportOutcome" | "counterDisputeState" | "vehicleClassResolutionState" | "upgradeState" | "roadsideAssistanceState" | "damageClaimState" | "emergencyEscalationState" | "resolutionEvidenceDigest"
> = {
  caseState: "resolved",
  recordedFields: carRentalOperationsRecordedFields,
  prohibitedDataDetected: false,
};

export const carRentalOperationsSupportFixtures: readonly CarRentalCanonicalOperationsSupportRecord[] = [
  {
    ...baseRecord,
    operationsCaseId: "ops-pickup-0001",
    lifecycleId: "lifecycle-pickup-0001",
    caseKind: "pickup_failure",
    urgency: "elevated",
    locationContext: "pickup_site",
    openedAt: "2026-08-21T12:00:00Z",
    acknowledgedAt: "2026-08-21T12:04:00Z",
    resolvedAt: "2026-08-21T12:18:00Z",
    supportOutcome: "recorded_resolution",
    counterDisputeState: "not_applicable",
    vehicleClassResolutionState: "substitute_recorded",
    upgradeState: "not_applicable",
    roadsideAssistanceState: "not_applicable",
    damageClaimState: "not_applicable",
    emergencyEscalationState: "not_applicable",
    resolutionEvidenceDigest: "1".repeat(64),
  },
  {
    ...baseRecord,
    operationsCaseId: "ops-breakdown-0001",
    lifecycleId: "lifecycle-breakdown-0001",
    caseKind: "breakdown",
    urgency: "urgent",
    locationContext: "roadside",
    openedAt: "2026-08-21T14:00:00Z",
    acknowledgedAt: "2026-08-21T14:03:00Z",
    resolvedAt: "2026-08-21T14:45:00Z",
    supportOutcome: "recorded_resolution",
    counterDisputeState: "not_applicable",
    vehicleClassResolutionState: "not_applicable",
    upgradeState: "not_applicable",
    roadsideAssistanceState: "completed_recorded",
    damageClaimState: "not_applicable",
    emergencyEscalationState: "not_applicable",
    resolutionEvidenceDigest: "2".repeat(64),
  },
  {
    ...baseRecord,
    operationsCaseId: "ops-accident-0001",
    lifecycleId: "lifecycle-accident-0001",
    caseKind: "accident",
    urgency: "emergency",
    locationContext: "remote",
    openedAt: "2026-08-21T16:00:00Z",
    acknowledgedAt: "2026-08-21T16:01:00Z",
    resolvedAt: "2026-08-21T16:55:00Z",
    supportOutcome: "recorded_resolution",
    counterDisputeState: "not_applicable",
    vehicleClassResolutionState: "not_applicable",
    upgradeState: "not_applicable",
    roadsideAssistanceState: "completed_recorded",
    damageClaimState: "resolved_recorded",
    emergencyEscalationState: "completed_recorded",
    resolutionEvidenceDigest: "3".repeat(64),
  },
];
