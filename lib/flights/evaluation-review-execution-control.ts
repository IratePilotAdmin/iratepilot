export const FLIGHT_EVALUATION_REVIEW_EXECUTION_CONTROL_MODE = "supplier_evidence_review_execution_control_design_only" as const;

export type FlightEvaluationReviewExecutionStage = {
  id:
    | "authorization_preflight_and_scope_binding"
    | "fixed_inventory_and_rubric_release"
    | "reviewer_observer_and_access_release"
    | "one_criterion_at_a_time_review"
    | "variance_dissent_finding_and_stop_record"
    | "sanitized_work_product_and_audit_record"
    | "expiry_closeout_and_no_recommendation_record";
  label: string;
  owner: string;
  executionRequirement: string;
  nonExecutionBoundary: string;
};

export type FlightEvaluationReviewExecutionSafeguard = {
  id:
    | "no_implicit_review_opening_lock"
    | "inventory_rubric_and_lineage_immutability_lock"
    | "independent_role_access_and_observer_veto_lock"
    | "evidence_work_product_variance_and_abort_lock"
    | "review_closeout_and_no_downstream_authority_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationReviewExecutionGate = {
  id:
    | "phase_15_authorization_separately_satisfied"
    | "phase_16_preflight_separately_approved"
    | "one_time_review_scope_inventory_and_window_bound"
    | "inventory_hashes_lineage_and_admissibility_reverified"
    | "rubric_version_weights_thresholds_and_calculations_frozen"
    | "reviewers_observer_conflicts_recusals_and_access_verified"
    | "isolation_prohibited_data_work_product_and_incident_controls_verified"
    | "criterion_sequence_variance_dissent_finding_and_stop_controls_verified"
    | "expiry_closeout_and_no_recommendation_selection_or_release_verified"
    | "review_opening_requires_separate_action_time_start";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationReviewExecutionStages: readonly FlightEvaluationReviewExecutionStage[] = [
  {
    id: "authorization_preflight_and_scope_binding",
    label: "Authorization, preflight, and scope binding",
    owner: "Risk + Release approvers",
    executionRequirement: "Require one actual Phase 15 authorization, one separately approved Phase 16 preflight receipt, and one action-time start decision bound to the exact evidence inventory, rubric, roles, access, purpose, window, expiry, and stop conditions.",
    nonExecutionBoundary: "Design cannot create, approve, infer, reuse, broaden, or validate authorization, preflight, scope, a receipt, a review window, access, or a start decision.",
  },
  {
    id: "fixed_inventory_and_rubric_release",
    label: "Fixed inventory and rubric release",
    owner: "Product + Privacy + Risk",
    executionRequirement: "Release only one previously authorized, closed, sanitized, lineaged, hashed evidence inventory against one frozen rubric version, criteria set, weight schedule, threshold set, and missing-evidence rule.",
    nonExecutionBoundary: "Design cannot contact a supplier, receive, restore, inspect, hash, admit, release, replace, supplement, or delete evidence or approve, change, tailor, or run a rubric.",
  },
  {
    id: "reviewer_observer_and_access_release",
    label: "Reviewer, observer, and access release",
    owner: "Legal + Risk + Security",
    executionRequirement: "Require independent reviewer and observer acknowledgments, current conflict and recusal checks, replacements, least-privilege isolated access, session expiry, and unconditional observer pause and stop authority.",
    nonExecutionBoundary: "Design cannot identify or assign a person, clear a conflict, grant access, open a session, record an acknowledgment, waive dissent, approve an exception, or override a stop.",
  },
  {
    id: "one_criterion_at_a_time_review",
    label: "One-criterion-at-a-time review",
    owner: "Product + Risk",
    executionRequirement: "Permit only a future separately released criterion to be reviewed against the fixed allowlisted evidence references, with expected calculation, observer checkpoint, variance handling, and immediate-stop conditions before another criterion could be considered.",
    nonExecutionBoundary: "Design cannot release a criterion, inspect evidence, calculate a value, record an observation, create a score, run criteria in parallel, retry, resume, or advance automatically.",
  },
  {
    id: "variance_dissent_finding_and_stop_record",
    label: "Variance, dissent, finding, and stop record",
    owner: "Risk + Legal + Observer",
    executionRequirement: "Preserve future reviewer variance, ambiguity, missing or conflicting evidence, dissent, recusals, exceptions, explicit overrides, findings, escalation, pauses, aborts, and no-restart outcomes without silent averaging or suppression.",
    nonExecutionBoundary: "Design cannot create, suppress, average, waive, resolve, close, override, or convert a variance, dissent, exception, finding, pause, abort, or stop into approval.",
  },
  {
    id: "sanitized_work_product_and_audit_record",
    label: "Sanitized work-product and audit record",
    owner: "Privacy + Security + Audit",
    executionRequirement: "Limit future work product to approved identifiers, rubric versions, control outcomes, calculation references, variance, dissent, findings, access events, retention, deletion, and reproducibility evidence with prohibited-data and contamination stops.",
    nonExecutionBoundary: "Design cannot read, capture, store, disclose, retain, sanitize, quarantine, delete, or certify supplier material, sensitive data, work product, an audit event, or an incident.",
  },
  {
    id: "expiry_closeout_and_no_recommendation_record",
    label: "Expiry, closeout, and no-recommendation record",
    owner: "Legal + Executive + Release approvers",
    executionRequirement: "Require future review expiry, access removal, work-product disposition, evidence reconciliation, findings ownership, dissent preservation, closeout, no restart, and explicit separation from recommendation, shortlist, contracting, selection, credentials, implementation, ticketing, payment, and Production.",
    nonExecutionBoundary: "Design cannot expire authority, remove access, close review, create a receipt, recommend, rank, shortlist, negotiate with, contract with, select, credential, implement, activate, ticket through, or pay a supplier.",
  },
];

export const flightEvaluationReviewExecutionSafeguards: readonly FlightEvaluationReviewExecutionSafeguard[] = [
  {
    id: "no_implicit_review_opening_lock",
    label: "No-implicit-review-opening lock",
    owner: "Risk + Release approvers",
    safeguard: "Require an actual Phase 15 authorization, a separately approved Phase 16 preflight receipt, and a new action-time start decision before a fixed review window could open.",
    failClosedBoundary: "Software completion, Git publication, deployment, page access, browser acceptance, a completed checklist, or prior authority never opens or implies evidence review.",
  },
  {
    id: "inventory_rubric_and_lineage_immutability_lock",
    label: "Inventory, rubric, and lineage immutability lock",
    owner: "Product + Privacy + Risk",
    safeguard: "Require the exact authorized evidence inventory, immutable hashes and lineage, admissibility record, rubric version, criteria, weights, thresholds, missing-evidence treatment, and calculation rules to remain fixed and reproducible.",
    failClosedBoundary: "Any drift, new or restored material, missing hash or lineage, retrofitting, supplier-specific rule, changed threshold, irreproducibility, or outcome-driven calculation stops review.",
  },
  {
    id: "independent_role_access_and_observer_veto_lock",
    label: "Independent-role, access, and observer-veto lock",
    owner: "Legal + Risk + Security",
    safeguard: "Require independent roles, current conflicts, recusals, replacements, acknowledgments, least privilege, isolated expiring access, preserved dissent, and unconditional observer pause and stop authority.",
    failClosedBoundary: "A missing, conflicted, combined, overprivileged, expired, unsigned, suppressed, unavailable, or overridden role or control keeps the review window closed.",
  },
  {
    id: "evidence_work_product_variance_and_abort_lock",
    label: "Evidence, work-product, variance, and abort lock",
    owner: "Privacy + Security + Risk",
    safeguard: "Require one-criterion-at-a-time review, allowlisted references, prohibited-data detection, sanitized work product, variance and findings preservation, incident handling, immediate abort, access removal, and no restart.",
    failClosedBoundary: "Contamination, new intake, unauthorized access, parallel review, calculation drift, suppressed dissent, unresolved findings, incomplete teardown, or missing deletion evidence stops review and blocks all reuse.",
  },
  {
    id: "review_closeout_and_no_downstream_authority_lock",
    label: "Review-closeout and no-downstream-authority lock",
    owner: "Legal + Executive",
    safeguard: "Require expiry, access removal, inventory reconciliation, work-product disposition, findings ownership, dissent preservation, independent closeout, and a separate future decision for every recommendation or commercial step.",
    failClosedBoundary: "Review authority remains one-time, narrow, revocable, non-transferable, and unable to recommend, shortlist, contract with, select, credential, activate, ticket through, or pay a supplier.",
  },
];

export const flightEvaluationReviewExecutionGates: readonly FlightEvaluationReviewExecutionGate[] = [
  { id: "phase_15_authorization_separately_satisfied", label: "Phase 15 authorization separately satisfied", owner: "Risk + Release approvers", detail: "Require one actual, current, scoped, expiring, revocable Phase 15 authorization; software acceptance cannot substitute for authority." },
  { id: "phase_16_preflight_separately_approved", label: "Phase 16 preflight separately approved", owner: "Risk + Security", detail: "Require a separately approved preflight receipt covering the fixed inventory, hashes, lineage, rubric, roles, access, isolation, stops, expiry, and closeout; Phase 16 software cannot create it." },
  { id: "one_time_review_scope_inventory_and_window_bound", label: "One-time review scope, inventory, and window bound", owner: "Legal + Risk", detail: "Bind one review purpose, fixed inventory, rubric version, accountable roles, isolated access, start and end window, expiry, revocation, no delegation, no reuse, and stop conditions." },
  { id: "inventory_hashes_lineage_and_admissibility_reverified", label: "Inventory, hashes, lineage, and admissibility reverified", owner: "Privacy + Risk", detail: "Reverify the exact closed allowlisted inventory, immutable hashes, source lineage, receipt and sanitation references, permitted use, exclusions, retention, deletion, and reproducibility without adding material." },
  { id: "rubric_version_weights_thresholds_and_calculations_frozen", label: "Rubric version, weights, thresholds, and calculations frozen", owner: "Product + Risk", detail: "Reverify the objective rubric version, criteria, weights, thresholds, missing-evidence treatment, calculation rules, change control, and no-retrofitting boundary before any criterion could be released." },
  { id: "reviewers_observer_conflicts_recusals_and_access_verified", label: "Reviewers, observer, conflicts, recusals, and access verified", owner: "Legal + Risk + Security", detail: "Verify independent roles, acknowledgments, current conflicts, recusals, replacements, least-privilege isolated access, session expiry, preserved dissent, and observer veto." },
  { id: "isolation_prohibited_data_work_product_and_incident_controls_verified", label: "Isolation, prohibited-data, work-product, and incident controls verified", owner: "Security + Privacy", detail: "Verify isolation, access logging, allowlisted references, prohibited-data detection, copy inventory, sanitized work-product rules, incident response, quarantine, contamination handling, and deletion evidence." },
  { id: "criterion_sequence_variance_dissent_finding_and_stop_controls_verified", label: "Criterion sequence, variance, dissent, finding, and stop controls verified", owner: "Product + Risk + Observer", detail: "Verify one-criterion-at-a-time release, expected calculation, observer checkpoints, variance, ambiguity, missing or conflicting evidence, dissent, exceptions, explicit overrides, findings, pause, abort, and no restart." },
  { id: "expiry_closeout_and_no_recommendation_selection_or_release_verified", label: "Expiry, closeout, and no recommendation, selection, or release verified", owner: "Executive + Release approvers", detail: "Verify expiry, access removal, inventory reconciliation, work-product disposition, findings ownership, closeout, no restart, and no recommendation, shortlist, contract, selection, credential, Sandbox, ticketing, payment, or Production authority." },
  { id: "review_opening_requires_separate_action_time_start", label: "Review opening requires a separate action-time start", owner: "Release approvers", detail: "Require a new decision outside this design immediately before opening one fixed review window or releasing one criterion; design completion never creates standing authority." },
];

export type FlightEvaluationReviewExecutionEvidence = Partial<Record<FlightEvaluationReviewExecutionGate["id"], boolean>>;

export function buildFlightEvaluationReviewExecutionControlDesign(evidence: FlightEvaluationReviewExecutionEvidence = {}) {
  const gates = flightEvaluationReviewExecutionGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_REVIEW_EXECUTION_CONTROL_MODE,
    planState: "design_only" as const,
    executionControlState: "blocked" as const,
    phase15AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase16PreflightPrerequisiteState: "not_satisfied" as const,
    phase16SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    preflightReceiptState: "not_created" as const,
    executionDecisionState: "not_recorded" as const,
    reviewScopeBindingState: "not_recorded" as const,
    evaluationReviewState: "closed" as const,
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
    reviewSessionState: "not_created" as const,
    releasedCriterionCount: 0,
    reviewedEvidenceCount: 0,
    observationCount: 0,
    calculationCount: 0,
    privacySecurityReviewState: "not_started" as const,
    workProductState: "not_created" as const,
    varianceReviewState: "not_started" as const,
    dissentState: "not_recorded" as const,
    exceptionState: "not_recorded" as const,
    findingCount: 0,
    stopRecordState: "not_created" as const,
    closeoutState: "not_created" as const,
    scoreState: "not_calculated" as const,
    scorecardState: "not_created" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    commercialDiligenceState: "not_started" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    executionControlDesignComplete: completedCount === gates.length,
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
