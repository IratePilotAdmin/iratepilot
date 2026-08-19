export const FLIGHT_EVALUATION_REVIEW_PREFLIGHT_MODE = "supplier_evidence_review_preflight_design_only" as const;

export type FlightEvaluationReviewPreflightControl = {
  id:
    | "phase_15_review_authorization_reference"
    | "fixed_evidence_inventory_and_lineage_recheck"
    | "rubric_version_weights_and_thresholds_freeze"
    | "reviewer_observer_conflict_and_access_check_in"
    | "privacy_security_retention_and_work_product_plan"
    | "variance_dissent_exception_and_stop_plan"
    | "review_window_expiry_closeout_and_no_recommendation_plan";
  label: string;
  owner: string;
  preflightRequirement: string;
  nonOpeningBoundary: string;
};

export type FlightEvaluationReviewPreflightSafeguard = {
  id:
    | "authorization_prerequisite_lock"
    | "evidence_inventory_drift_and_new_intake_stop"
    | "rubric_drift_and_retrofitting_stop"
    | "role_access_conflict_dissent_and_exception_stop"
    | "review_closeout_and_no_downstream_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationReviewPreflightGate = {
  id:
    | "phase_15_authorization_prerequisite_verified"
    | "fixed_inventory_lineage_admissibility_and_hashes_verified"
    | "review_purpose_rubric_version_weights_thresholds_verified"
    | "legal_commercial_privacy_and_data_use_rechecked"
    | "reviewers_observer_conflicts_recusals_and_access_verified"
    | "variance_dissent_exception_override_and_stop_controls_verified"
    | "security_isolation_prohibited_data_incident_and_contamination_verified"
    | "retention_work_product_deletion_audit_and_reproducibility_verified"
    | "expiry_closeout_no_recommendation_selection_or_release_verified"
    | "review_opening_remains_separate";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationReviewPreflightControls: readonly FlightEvaluationReviewPreflightControl[] = [
  {
    id: "phase_15_review_authorization_reference",
    label: "Phase 15 review-authorization reference",
    owner: "Risk + Release approvers",
    preflightRequirement: "Require one actual, current, separately approved Phase 15 authorization with the exact purpose, evidence inventory, rubric, roles, scope, expiry, revocation, and stop authority before preflight could begin.",
    nonOpeningBoundary: "Design cannot create, infer, approve, renew, reuse, or validate authorization; open a review; admit evidence; calculate a score; or authorize a downstream decision.",
  },
  {
    id: "fixed_evidence_inventory_and_lineage_recheck",
    label: "Fixed evidence inventory and lineage recheck",
    owner: "Privacy + Risk",
    preflightRequirement: "Recheck the future closed inventory, immutable hashes, source lineage, receipt and sanitation references, admissibility, permitted use, exclusions, access, retention, deletion, and reproducibility without reading supplier material here.",
    nonOpeningBoundary: "Design cannot request, receive, restore, inspect, copy, transform, hash, admit, reject, retain, delete, disclose, or supplement supplier evidence or sensitive data.",
  },
  {
    id: "rubric_version_weights_and_thresholds_freeze",
    label: "Rubric version, weights, and thresholds freeze",
    owner: "Product + Risk",
    preflightRequirement: "Recheck that the future objective rubric, version, weights, thresholds, missing-evidence rules, permitted calculations, reproducibility, and change-control record were frozen before evidence review.",
    nonOpeningBoundary: "Design cannot approve, freeze, change, or tailor a rubric; assign a weight; calculate a score; rank a supplier; or create a recommendation.",
  },
  {
    id: "reviewer_observer_conflict_and_access_check_in",
    label: "Reviewer, observer, conflict, and access check-in",
    owner: "Legal + Risk + Security",
    preflightRequirement: "Recheck separately accountable future reviewer and observer assignments, acknowledgments, current conflicts, recusals, replacements, least-privilege access, session isolation, and unconditional stop authority.",
    nonOpeningBoundary: "Design cannot assign or identify a person, clear a conflict, grant access, start a session, waive dissent, approve an exception, or record a review judgment.",
  },
  {
    id: "privacy_security_retention_and_work_product_plan",
    label: "Privacy, security, retention, and work-product plan",
    owner: "Privacy + Security",
    preflightRequirement: "Recheck future prohibited-data detection, copy inventory, access logging, isolation, incident response, contamination handling, work-product limits, permitted retention, and deletion evidence.",
    nonOpeningBoundary: "Design cannot process data, create work product, open storage, grant access, resolve an incident, quarantine material, retain a copy, delete evidence, or certify compliance.",
  },
  {
    id: "variance_dissent_exception_and_stop_plan",
    label: "Variance, dissent, exception, and stop plan",
    owner: "Risk + Legal",
    preflightRequirement: "Recheck future handling for missing or conflicting evidence, reviewer variance, ambiguity, preserved dissent, controlled exceptions, explicit overrides, findings, escalation, pause, and immediate stop.",
    nonOpeningBoundary: "Design cannot create, suppress, waive, resolve, average, close, or override a variance, dissent, exception, finding, escalation, pause, or stop decision.",
  },
  {
    id: "review_window_expiry_closeout_and_no_recommendation_plan",
    label: "Review-window expiry, closeout, and no-recommendation plan",
    owner: "Legal + Executive + Release approvers",
    preflightRequirement: "Recheck the future one-time review window, expiry, revocation, access removal, work-product deletion, closeout evidence, no restart, and separation from recommendation, shortlist, commercial diligence, contracting, selection, implementation, and release.",
    nonOpeningBoundary: "Design cannot open or close a review, revoke authority, remove access, delete work product, recommend, shortlist, contract with, select, implement, credential, activate, ticket through, or pay a supplier.",
  },
];

export const flightEvaluationReviewPreflightSafeguards: readonly FlightEvaluationReviewPreflightSafeguard[] = [
  {
    id: "authorization_prerequisite_lock",
    label: "Authorization-prerequisite lock",
    owner: "Risk + Release approvers",
    safeguard: "Require an actual, current, one-time Phase 15 authorization reference and a new action-time preflight decision; software completion, publication, deployment, page access, or acceptance never supplies authority.",
    failClosedBoundary: "Missing, incomplete, expired, revoked, disputed, inferred, reused, broadened, or software-only authorization keeps preflight and evidence review blocked.",
  },
  {
    id: "evidence_inventory_drift_and_new_intake_stop",
    label: "Evidence-inventory drift and new-intake stop",
    owner: "Privacy + Security + Risk",
    safeguard: "Require the exact authorized, closed, sanitized, lineaged, hashed, allowlisted evidence inventory with no new contact, channel, submission, retrieval, restoration, replacement, or supplementation.",
    failClosedBoundary: "Any missing hash or lineage, inventory drift, open channel, new or restored material, prohibited data, uncertain access, deletion gap, incident, or contamination stops preflight.",
  },
  {
    id: "rubric_drift_and_retrofitting_stop",
    label: "Rubric-drift and retrofitting stop",
    owner: "Product + Risk",
    safeguard: "Require the authorized rubric version, weights, thresholds, missing-evidence treatment, and calculation rules to remain unchanged and reproducible before any evidence could enter review.",
    failClosedBoundary: "An unversioned, subjective, supplier-specific, retrofitted, changed, incomplete, irreproducible, or outcome-driven rubric stops review and scoring.",
  },
  {
    id: "role_access_conflict_dissent_and_exception_stop",
    label: "Role, access, conflict, dissent, and exception stop",
    owner: "Legal + Risk + Security",
    safeguard: "Require independent roles, current conflict checks, recusals, replacements, acknowledgments, least privilege, isolated access, preserved dissent, controlled exceptions, explicit overrides, and stop authority.",
    failClosedBoundary: "Missing, conflicted, combined, overprivileged, expired, unsigned, suppressed, waived, overdue, or disputed role or control evidence stops preflight and review.",
  },
  {
    id: "review_closeout_and_no_downstream_release_lock",
    label: "Review-closeout and no-downstream-release lock",
    owner: "Legal + Executive",
    safeguard: "Require expiry, revocation, access removal, work-product disposition, audit evidence, closeout, and no restart while preserving separation from recommendation, shortlist, contracting, selection, credentials, Sandbox, ticketing, payment, and Production.",
    failClosedBoundary: "Preflight authority remains narrow, one-time, revocable, non-transferable, and unable to open review or authorize any commercial commitment or external capability.",
  },
];

export const flightEvaluationReviewPreflightGates: readonly FlightEvaluationReviewPreflightGate[] = [
  { id: "phase_15_authorization_prerequisite_verified", label: "Phase 15 authorization prerequisite verified", owner: "Risk + Release approvers", detail: "Verify one separately created, current, scoped, expiring, revocable actual Phase 15 authorization; Phase 15 software, Git publication, Preview deployment, page access, or acceptance cannot substitute for authority." },
  { id: "fixed_inventory_lineage_admissibility_and_hashes_verified", label: "Fixed inventory, lineage, admissibility, and hashes verified", owner: "Privacy + Risk", detail: "Verify the exact closed inventory, immutable hashes, source lineage, receipt and sanitation references, admissibility, permitted use, exclusions, access, retention, deletion, and reproducibility without adding material." },
  { id: "review_purpose_rubric_version_weights_thresholds_verified", label: "Review purpose, rubric version, weights, and thresholds verified", owner: "Product + Risk", detail: "Verify the authorized purpose and frozen objective rubric version, criteria, weights, thresholds, missing-evidence treatment, calculation rules, change control, and no-retrofitting boundary." },
  { id: "legal_commercial_privacy_and_data_use_rechecked", label: "Legal, commercial, privacy, and data-use authority rechecked", owner: "Legal + Commercial + Privacy", detail: "Recheck narrow data-use authority, confidentiality, jurisdiction, retention, deletion, disclosures, exclusions, and no-contract boundary immediately before review could be considered." },
  { id: "reviewers_observer_conflicts_recusals_and_access_verified", label: "Reviewers, observer, conflicts, recusals, and access verified", owner: "Legal + Risk + Security", detail: "Verify separately accountable roles, acknowledgments, current conflicts, recusals, replacements, blind-review rules, least-privilege access, session isolation, and stop authority." },
  { id: "variance_dissent_exception_override_and_stop_controls_verified", label: "Variance, dissent, exception, override, and stop controls verified", owner: "Risk + Legal", detail: "Verify treatment for ambiguity, missing or conflicting evidence, reviewer variance, preserved dissent, controlled exceptions, explicit overrides, escalation, findings, pause, and immediate stop." },
  { id: "security_isolation_prohibited_data_incident_and_contamination_verified", label: "Security, isolation, prohibited-data, incident, and contamination controls verified", owner: "Security + Privacy", detail: "Verify isolation, access logging, prohibited-data detection, copy inventory, incident response, quarantine, contamination handling, and unconditional stop conditions before any review session." },
  { id: "retention_work_product_deletion_audit_and_reproducibility_verified", label: "Retention, work product, deletion, audit, and reproducibility verified", owner: "Privacy + Risk + Audit", detail: "Verify permitted retention, work-product limits, deletion evidence, immutable version references, sanitized audit records, reproducibility, findings ownership, and remediation controls." },
  { id: "expiry_closeout_no_recommendation_selection_or_release_verified", label: "Expiry, closeout, and no recommendation, selection, or release verified", owner: "Executive + Release approvers", detail: "Verify one-time expiry, revocation, access removal, work-product disposition, closeout, no restart, and no recommendation, shortlist, contract, selection, credential, Sandbox, ticketing, payment, or Production authority." },
  { id: "review_opening_remains_separate", label: "Review opening remains a separate decision", owner: "Release approvers", detail: "Require a new action-time decision outside this design after every preflight item is independently verified; completing the design or preflight record never opens review or creates standing authority." },
];

export type FlightEvaluationReviewPreflightEvidence = Partial<Record<FlightEvaluationReviewPreflightGate["id"], boolean>>;

export function buildFlightEvaluationReviewPreflightDesign(evidence: FlightEvaluationReviewPreflightEvidence = {}) {
  const gates = flightEvaluationReviewPreflightGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_REVIEW_PREFLIGHT_MODE,
    planState: "design_only" as const,
    preflightState: "blocked" as const,
    phase15AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase15SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    evaluationReviewState: "closed" as const,
    preflightDecisionState: "not_recorded" as const,
    reviewWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    submissionChannelState: "not_created" as const,
    evidenceCount: 0,
    evidenceInventoryState: "not_created" as const,
    evidenceInventoryHashState: "not_recorded" as const,
    evidenceLineageState: "not_recorded" as const,
    admissibilityReviewState: "not_started" as const,
    rubricState: "not_approved" as const,
    rubricVersionState: "not_recorded" as const,
    rubricFreezeState: "not_confirmed" as const,
    reviewerState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    accessState: "not_granted" as const,
    privacySecurityReviewState: "not_started" as const,
    retentionState: "not_confirmed" as const,
    deletionState: "not_confirmed" as const,
    workProductPlanState: "not_approved" as const,
    varianceReviewState: "not_started" as const,
    dissentState: "not_recorded" as const,
    exceptionState: "not_recorded" as const,
    stopPlanState: "not_approved" as const,
    closeoutPlanState: "not_approved" as const,
    scoreState: "not_calculated" as const,
    scorecardState: "not_created" as const,
    findingCount: 0,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    commercialDiligenceState: "not_started" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    preflightDesignComplete: completedCount === gates.length,
    realSupplierDataAccepted: false,
    passengerDataAccepted: false,
    credentialsAccepted: false,
    externalNetworkAccess: false,
    externalSideEffects: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
