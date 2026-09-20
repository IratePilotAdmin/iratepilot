export const CAR_RENTAL_CONTROLLED_LAUNCH_MODE = "controlled_launch_readiness_offline_only" as const;

export const carRentalPreviewAcceptanceStates = ["isolated_preview_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalSandboxEvidenceStates = ["offline_evidence_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalLimitedPilotControlStates = ["limited_plan_recorded", "not_defined", "manual_review", "rejected"] as const;
export const carRentalObservabilityReadinessStates = ["offline_plan_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalRollbackReadinessStates = ["offline_plan_recorded", "missing", "manual_review", "rejected"] as const;
export const carRentalIndependentReleaseReviewStates = ["offline_review_recorded", "pending", "conflict_detected", "manual_review", "rejected"] as const;
export const carRentalProductionDecisionStates = ["separate_decision_required", "not_requested", "manual_review", "rejected"] as const;
export const carRentalControlledLaunchResultStates = ["controls_documented", "manual_review", "rejected"] as const;
export const carRentalControlledLaunchKillSwitchStates = ["engaged", "released"] as const;

export const carRentalControlledLaunchRecordedFields = [
  "launch_case_id",
  "environment_mode",
  "result_state",
  "preview_acceptance_state",
  "sandbox_evidence_state",
  "limited_pilot_control_state",
  "observability_state",
  "rollback_state",
  "independent_review_state",
  "production_decision_state",
  "preview_evidence_digest",
  "sandbox_evidence_digest",
  "observability_evidence_digest",
  "rollback_evidence_digest",
  "review_evidence_digest",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const;

export const carRentalControlledLaunchProhibitedFields = [
  "provider_name",
  "supplier_name",
  "counterparty_identity",
  "live_endpoint",
  "api_key",
  "client_secret",
  "access_token",
  "credential_value",
  "raw_sandbox_payload",
  "raw_observability_log",
  "traveler_identity",
  "driver_license",
  "payment_card",
  "bank_account",
  "precise_location",
  "live_reservation_reference",
  "pilot_participant_identity",
  "reviewer_identity",
  "production_approval",
] as const;

export type CarRentalPreviewAcceptanceState = (typeof carRentalPreviewAcceptanceStates)[number];
export type CarRentalSandboxEvidenceState = (typeof carRentalSandboxEvidenceStates)[number];
export type CarRentalLimitedPilotControlState = (typeof carRentalLimitedPilotControlStates)[number];
export type CarRentalObservabilityReadinessState = (typeof carRentalObservabilityReadinessStates)[number];
export type CarRentalRollbackReadinessState = (typeof carRentalRollbackReadinessStates)[number];
export type CarRentalIndependentReleaseReviewState = (typeof carRentalIndependentReleaseReviewStates)[number];
export type CarRentalProductionDecisionState = (typeof carRentalProductionDecisionStates)[number];
export type CarRentalControlledLaunchResultState = (typeof carRentalControlledLaunchResultStates)[number];
export type CarRentalControlledLaunchKillSwitchState = (typeof carRentalControlledLaunchKillSwitchStates)[number];
export type CarRentalControlledLaunchRecordedField = (typeof carRentalControlledLaunchRecordedFields)[number];

export type CarRentalControlledLaunchContract = {
  id: "preview_acceptance" | "sandbox_evidence" | "limited_pilot_controls" | "observability" | "rollback" | "independent_release_review" | "separate_production_decision";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalControlledLaunchContracts: readonly CarRentalControlledLaunchContract[] = [
  { id: "preview_acceptance", label: "Isolated Preview acceptance", requiredFields: ["Controlled acceptance state", "Digest-only evidence", "No deployment action"], validationRule: "Record only sanitized evidence that an isolated Preview acceptance boundary was reviewed, without deploying or promoting anything.", safetyBoundary: "A recorded Preview state is not a deployment, public release, alias change, approval bypass, or Production decision." },
  { id: "sandbox_evidence", label: "Sandbox evidence readiness", requiredFields: ["Offline evidence state", "Digest-only evidence", "No provider traffic"], validationRule: "Require a provider-neutral offline evidence state while rejecting endpoints, credentials, raw payloads, provider identities, and live references.", safetyBoundary: "Offline evidence does not establish a provider connection, supplier certification, account, credential, webhook, or external request." },
  { id: "limited_pilot_controls", label: "Limited-pilot controls", requiredFields: ["Bounded plan state", "Zero live traffic", "Separate pilot decision"], validationRule: "Record only a controlled limited-pilot plan with both traffic kill switches engaged and no participant or transaction data.", safetyBoundary: "A pilot plan cannot enroll anyone, open traffic, expose inventory, create a reservation, refund, charge, or start a live pilot." },
  { id: "observability", label: "Observability readiness", requiredFields: ["Offline monitoring plan", "Digest-only evidence", "No raw logs"], validationRule: "Require a sanitized observability plan without runtime activation, raw logs, identities, endpoints, payloads, or external telemetry.", safetyBoundary: "Observability readiness does not enable monitoring traffic, create alerts, notify people, process incidents, or prove live service health." },
  { id: "rollback", label: "Rollback readiness", requiredFields: ["Offline rollback plan", "Digest-only evidence", "No execution"], validationRule: "Require a provider-neutral rollback plan and evidence digest while keeping application and database kill switches engaged.", safetyBoundary: "A rollback plan cannot change a deployment, database, reservation, payment, provider state, Preview environment, or Production environment." },
  { id: "independent_release_review", label: "Independent release review", requiredFields: ["Controlled review state", "Conflict boundary", "No reviewer identity"], validationRule: "Record only sanitized offline review evidence and preserve pending, conflict, manual-review, and rejected states.", safetyBoundary: "A review record does not appoint a reviewer, waive independence, resolve a conflict, approve release, or authorize an external action." },
  { id: "separate_production_decision", label: "Separate Production decision", requiredFields: ["Separate-decision-required state", "No Production approval", "No promotion"], validationRule: "Require Production to remain a separate, unsatisfied decision even when every offline Phase 12 control is documented.", safetyBoundary: "Phase 12 software cannot approve, schedule, promote, deploy, migrate, route traffic to, or otherwise change Production." },
];

export type CarRentalControlledLaunchGate = {
  id: "phase_11_evidence_reconciled" | "controlled_launch_boundary_reviewed" | "preview_acceptance_reviewed" | "sandbox_evidence_reviewed" | "limited_pilot_controls_reviewed" | "observability_reviewed" | "rollback_reviewed" | "independent_release_reviewed" | "conflicts_and_recusals_reviewed" | "evidence_minimization_reviewed" | "runtime_kill_switches_reviewed" | "production_decision_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalControlledLaunchGates: readonly CarRentalControlledLaunchGate[] = [
  { id: "phase_11_evidence_reconciled", label: "Phase 11 evidence reconciled", owner: "Engineering + Audit", detail: "Reconcile the accepted Phase 11 source and published Preview evidence without inferring Phase 12 release authority." },
  { id: "controlled_launch_boundary_reviewed", label: "Controlled-launch boundary reviewed", owner: "Executive + Release", detail: "Approve only the provider-neutral offline model and its no-deployment, no-traffic, no-pilot, no-Production boundary." },
  { id: "preview_acceptance_reviewed", label: "Isolated Preview acceptance reviewed", owner: "Quality + Release", detail: "Review sanitized acceptance evidence without deploying, promoting, bypassing protection, or changing an alias." },
  { id: "sandbox_evidence_reviewed", label: "Sandbox evidence reviewed", owner: "Engineering + Security", detail: "Review digest-only offline evidence without a provider, account, credential, endpoint, request, webhook, or certification claim." },
  { id: "limited_pilot_controls_reviewed", label: "Limited-pilot controls reviewed", owner: "Product + Operations", detail: "Review a bounded plan while participant enrollment, inventory, traffic, reservations, support actions, and payments remain disabled." },
  { id: "observability_reviewed", label: "Observability plan reviewed", owner: "Reliability + Security", detail: "Review sanitized monitoring and escalation design without runtime telemetry, raw logs, alerts, messages, or external services." },
  { id: "rollback_reviewed", label: "Rollback plan reviewed", owner: "Engineering + Data", detail: "Review rollback design without changing code, deployments, databases, reservations, payments, Preview, or Production." },
  { id: "independent_release_reviewed", label: "Independent release review recorded", owner: "Independent accountable review", detail: "Preserve independence, dissent, and rejection without naming a reviewer or creating release authority." },
  { id: "conflicts_and_recusals_reviewed", label: "Conflicts and recusals reviewed", owner: "Governance + Audit", detail: "Require conflicts, recusals, replacements, and unresolved dissent to fail closed." },
  { id: "evidence_minimization_reviewed", label: "Launch evidence minimization reviewed", owner: "Privacy + Security", detail: "Require the exact allowlist and reject suppliers, credentials, raw payloads, identities, payments, locations, and live references." },
  { id: "runtime_kill_switches_reviewed", label: "Runtime kill switches reviewed", owner: "Engineering + Data", detail: "Require both independent application and database traffic switches to remain engaged." },
  { id: "production_decision_separately_authorized", label: "Separate Production decision required", owner: "Independent Production approvers", detail: "Require a new decision outside Phase 12 before any Production deployment, migration, traffic, reservation, support action, or payment." },
];

export type CarRentalControlledLaunchEvidence = Partial<Record<CarRentalControlledLaunchGate["id"], boolean>>;

export function buildCarRentalControlledLaunchPlan(evidence: CarRentalControlledLaunchEvidence = {}) {
  const gates = carRentalControlledLaunchGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_CONTROLLED_LAUNCH_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    controlledLaunchReviewComplete: completedCount === gates.length,
    commitAuthorized: false,
    pushAuthorized: false,
    previewDeploymentAuthorized: false,
    previewReleaseAuthorized: false,
    supplierActionAuthorized: false,
    accountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxConnectionAuthorized: false,
    sandboxCertified: false,
    externalTrafficAuthorized: false,
    livePilotAuthorized: false,
    monitoringActivationAuthorized: false,
    rollbackExecutionAuthorized: false,
    reservationAuthorized: false,
    refundAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionDecisionSatisfied: false,
    productionAuthorized: false,
  } as const;
}

export type CarRentalCanonicalControlledLaunchRecord = {
  launchCaseId: string;
  environmentMode: "offline_fixture";
  resultState: CarRentalControlledLaunchResultState;
  previewAcceptanceState: CarRentalPreviewAcceptanceState;
  sandboxEvidenceState: CarRentalSandboxEvidenceState;
  limitedPilotControlState: CarRentalLimitedPilotControlState;
  observabilityState: CarRentalObservabilityReadinessState;
  rollbackState: CarRentalRollbackReadinessState;
  independentReviewState: CarRentalIndependentReleaseReviewState;
  productionDecisionState: CarRentalProductionDecisionState;
  previewEvidenceDigest: string;
  sandboxEvidenceDigest: string;
  observabilityEvidenceDigest: string;
  rollbackEvidenceDigest: string;
  reviewEvidenceDigest: string;
  applicationKillSwitchState: CarRentalControlledLaunchKillSwitchState;
  databaseKillSwitchState: CarRentalControlledLaunchKillSwitchState;
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

export function validateCarRentalControlledLaunchRecord(record: CarRentalCanonicalControlledLaunchRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.launchCaseId)) errors.push("Launch-case ID must be a stable opaque token.");
  if (record.environmentMode !== "offline_fixture") errors.push("Phase 12 controlled-launch evidence must remain in offline-fixture mode.");
  if (!carRentalControlledLaunchResultStates.includes(record.resultState)) errors.push("Controlled-launch result state is not supported.");
  if (!carRentalPreviewAcceptanceStates.includes(record.previewAcceptanceState)) errors.push("Preview-acceptance state is not supported.");
  if (!carRentalSandboxEvidenceStates.includes(record.sandboxEvidenceState)) errors.push("Sandbox-evidence state is not supported.");
  if (!carRentalLimitedPilotControlStates.includes(record.limitedPilotControlState)) errors.push("Limited-pilot control state is not supported.");
  if (!carRentalObservabilityReadinessStates.includes(record.observabilityState)) errors.push("Observability state is not supported.");
  if (!carRentalRollbackReadinessStates.includes(record.rollbackState)) errors.push("Rollback state is not supported.");
  if (!carRentalIndependentReleaseReviewStates.includes(record.independentReviewState)) errors.push("Independent-review state is not supported.");
  if (!carRentalProductionDecisionStates.includes(record.productionDecisionState)) errors.push("Production-decision state is not supported.");
  if (!carRentalControlledLaunchKillSwitchStates.includes(record.applicationKillSwitchState) || !carRentalControlledLaunchKillSwitchStates.includes(record.databaseKillSwitchState)) errors.push("Controlled-launch kill-switch state is not supported.");

  const digests = [
    [record.previewEvidenceDigest, "Preview-acceptance"],
    [record.sandboxEvidenceDigest, "Sandbox"],
    [record.observabilityEvidenceDigest, "Observability"],
    [record.rollbackEvidenceDigest, "Rollback"],
    [record.reviewEvidenceDigest, "Independent-review"],
  ] as const;
  for (const [digest, label] of digests) {
    if (!isSha256Digest(digest)) errors.push(`${label} evidence must be a lowercase 64-character digest.`);
  }

  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (record.prohibitedDataDetected) errors.push("Provider, credential, payload, identity, payment, location, pilot, reviewer, Production-approval, or live-reference data blocks controlled-launch readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalControlledLaunchRecordedFields.includes(field as CarRentalControlledLaunchRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalControlledLaunchRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized controlled-launch allowlist.");

  if (record.resultState === "controls_documented") {
    if (record.previewAcceptanceState !== "isolated_preview_recorded") errors.push("Controls-documented evidence requires an isolated Preview acceptance record.");
    if (record.sandboxEvidenceState !== "offline_evidence_recorded") errors.push("Controls-documented evidence requires provider-neutral offline sandbox evidence.");
    if (record.limitedPilotControlState !== "limited_plan_recorded") errors.push("Controls-documented evidence requires a bounded limited-pilot plan.");
    if (record.observabilityState !== "offline_plan_recorded") errors.push("Controls-documented evidence requires an offline observability plan.");
    if (record.rollbackState !== "offline_plan_recorded") errors.push("Controls-documented evidence requires an offline rollback plan.");
    if (record.independentReviewState !== "offline_review_recorded") errors.push("Controls-documented evidence requires a sanitized independent offline review record.");
    if (record.productionDecisionState !== "separate_decision_required") errors.push("Controls-documented evidence must preserve a separate, unsatisfied Production decision.");
  }

  const valid = errors.length === 0;
  const controlledLaunchChecksSatisfied = valid && record.resultState === "controls_documented";

  return {
    valid,
    controlledLaunchChecksSatisfied,
    errors,
    commitAuthorized: false,
    pushAuthorized: false,
    previewDeploymentAuthorized: false,
    previewReleaseAuthorized: false,
    supplierActionAuthorized: false,
    accountCreationAuthorized: false,
    credentialHandlingAuthorized: false,
    sandboxConnectionAuthorized: false,
    sandboxCertified: false,
    externalTrafficAuthorized: false,
    livePilotAuthorized: false,
    monitoringActivationAuthorized: false,
    rollbackExecutionAuthorized: false,
    reservationAuthorized: false,
    refundAuthorized: false,
    paymentAuthorized: false,
    migrationAuthorized: false,
    productionDecisionSatisfied: false,
    productionAuthorized: false,
  } as const;
}

const baseRecord: Omit<CarRentalCanonicalControlledLaunchRecord,
  "launchCaseId" | "previewEvidenceDigest" | "sandboxEvidenceDigest" | "observabilityEvidenceDigest" | "rollbackEvidenceDigest" | "reviewEvidenceDigest"
> = {
  environmentMode: "offline_fixture",
  resultState: "controls_documented",
  previewAcceptanceState: "isolated_preview_recorded",
  sandboxEvidenceState: "offline_evidence_recorded",
  limitedPilotControlState: "limited_plan_recorded",
  observabilityState: "offline_plan_recorded",
  rollbackState: "offline_plan_recorded",
  independentReviewState: "offline_review_recorded",
  productionDecisionState: "separate_decision_required",
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalControlledLaunchRecordedFields,
  prohibitedDataDetected: false,
};

export const carRentalControlledLaunchFixtures: readonly CarRentalCanonicalControlledLaunchRecord[] = [
  { ...baseRecord, launchCaseId: "launch-preview-controls-0001", previewEvidenceDigest: "1".repeat(64), sandboxEvidenceDigest: "2".repeat(64), observabilityEvidenceDigest: "3".repeat(64), rollbackEvidenceDigest: "4".repeat(64), reviewEvidenceDigest: "5".repeat(64) },
  { ...baseRecord, launchCaseId: "launch-sandbox-controls-0001", previewEvidenceDigest: "6".repeat(64), sandboxEvidenceDigest: "7".repeat(64), observabilityEvidenceDigest: "8".repeat(64), rollbackEvidenceDigest: "9".repeat(64), reviewEvidenceDigest: "a".repeat(64) },
  { ...baseRecord, launchCaseId: "launch-pilot-controls-0001", previewEvidenceDigest: "b".repeat(64), sandboxEvidenceDigest: "c".repeat(64), observabilityEvidenceDigest: "d".repeat(64), rollbackEvidenceDigest: "e".repeat(64), reviewEvidenceDigest: "f".repeat(64) },
];
