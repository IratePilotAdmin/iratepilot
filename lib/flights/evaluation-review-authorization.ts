export const FLIGHT_EVALUATION_REVIEW_AUTHORIZATION_MODE = "supplier_evidence_review_authorization_design_only" as const;

export type FlightEvaluationReviewAuthorizationArtifact = {
  id:
    | "phase_14_closeout_prerequisite_reference"
    | "admissible_evidence_manifest_and_lineage"
    | "objective_rubric_and_version_charter"
    | "independent_review_and_conflict_plan"
    | "variance_dissent_and_exception_plan"
    | "recommendation_and_shortlist_separation_statement"
    | "authorization_expiry_revocation_and_no_selection_statement";
  label: string;
  owner: string;
  authorizationRequirement: string;
  nonReviewBoundary: string;
};

export type FlightEvaluationReviewAuthorizationSafeguard = {
  id:
    | "no_implied_review_lock"
    | "evidence_admissibility_and_no_new_intake_lock"
    | "rubric_freeze_and_no_retrofitting_lock"
    | "independent_review_dissent_and_exception_lock"
    | "no_recommendation_selection_or_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationReviewAuthorizationGate = {
  id:
    | "phase_14_closeout_separately_approved"
    | "evidence_inventory_lineage_and_admissibility_approved"
    | "evaluation_purpose_rubric_and_thresholds_approved"
    | "legal_commercial_and_data_use_authority_approved"
    | "independent_reviewers_observers_and_conflicts_approved"
    | "variance_dissent_exception_and_override_controls_approved"
    | "privacy_security_retention_and_deletion_controls_confirmed"
    | "audit_reproducibility_findings_and_stop_controls_approved"
    | "no_recommendation_shortlist_contract_selection_or_release_confirmed"
    | "evidence_review_opening_requires_action_time_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationReviewAuthorizationArtifacts: readonly FlightEvaluationReviewAuthorizationArtifact[] = [
  {
    id: "phase_14_closeout_prerequisite_reference",
    label: "Phase 14 closeout prerequisite reference",
    owner: "Risk + Release approvers",
    authorizationRequirement: "Require a separately approved Phase 14 closeout record with intake reconciliation, deletion, incident, finding, dissent, expiry, teardown, and no-restart evidence before supplier-evidence review could be considered.",
    nonReviewBoundary: "Design cannot create or approve closeout, satisfy a prerequisite, reopen intake, admit evidence, begin review, calculate a score, or authorize a downstream decision.",
  },
  {
    id: "admissible_evidence_manifest_and_lineage",
    label: "Admissible evidence manifest and lineage",
    owner: "Privacy + Risk",
    authorizationRequirement: "Define the future closed evidence inventory, source lineage, receipt and sanitation references, permitted use, exclusions, retention status, deletion constraints, and reproducibility requirements without including supplier material.",
    nonReviewBoundary: "Design cannot request, receive, restore, inspect, copy, transform, admit, reject, retain, delete, or disclose evidence or sensitive data.",
  },
  {
    id: "objective_rubric_and_version_charter",
    label: "Objective rubric and version charter",
    owner: "Product + Risk",
    authorizationRequirement: "Define future objective criteria, weights, thresholds, missing-evidence treatment, version freeze, change control, reproducibility, and explicit separation between evidence review and recommendation.",
    nonReviewBoundary: "Design cannot approve or freeze a rubric, assign a weight, calculate a score, change a threshold, rank a supplier, or create a recommendation.",
  },
  {
    id: "independent_review_and_conflict_plan",
    label: "Independent review and conflict plan",
    owner: "Legal + Risk",
    authorizationRequirement: "Define separately accountable reviewer, observer, conflict, recusal, replacement, blind-review, dissent, exception, and escalation requirements before an evidence-review window could open.",
    nonReviewBoundary: "Design cannot assign a person, clear a conflict, waive dissent, approve an exception, open a review, record a judgment, or substitute one role for another.",
  },
  {
    id: "variance_dissent_and_exception_plan",
    label: "Variance, dissent, and exception plan",
    owner: "Risk + Legal",
    authorizationRequirement: "Define future treatment of reviewer variance, missing evidence, conflicting evidence, ambiguity, dissent, exceptions, overrides, stop conditions, findings, remediation, and no silent resolution.",
    nonReviewBoundary: "Design cannot create, suppress, waive, resolve, close, average, override, or convert a variance, dissent, exception, or finding into approval.",
  },
  {
    id: "recommendation_and_shortlist_separation_statement",
    label: "Recommendation and shortlist separation statement",
    owner: "Commercial + Executive",
    authorizationRequirement: "Define the future boundary that evidence review and scoring, if separately authorized, remain distinct from recommendation, shortlist, commercial diligence, contracting, supplier selection, implementation, and release.",
    nonReviewBoundary: "Design cannot recommend, rank, shortlist, negotiate with, contract with, select, implement, credential, activate, or pay a supplier.",
  },
  {
    id: "authorization_expiry_revocation_and_no_selection_statement",
    label: "Authorization expiry, revocation, and no-selection statement",
    owner: "Legal + Release approvers",
    authorizationRequirement: "Define one-time scope, fixed evidence inventory, review-window expiry, revocation, immediate-stop, access removal, work-product deletion, closeout, and explicit no-selection authority.",
    nonReviewBoundary: "Design cannot open or close a review window, grant or remove access, create or delete work product, revoke authority, create a receipt, select a supplier, or release Sandbox or Production activity.",
  },
];

export const flightEvaluationReviewAuthorizationSafeguards: readonly FlightEvaluationReviewAuthorizationSafeguard[] = [
  {
    id: "no_implied_review_lock",
    label: "No-implied-review lock",
    owner: "Risk + Release approvers",
    safeguard: "Require a separately approved actual Phase 14 closeout and a new action-time evidence-review decision; software completion, publication, deployment, page access, acceptance, or a completed checklist never opens review.",
    failClosedBoundary: "Missing, incomplete, expired, disputed, inferred, reused, or software-only closeout evidence keeps admission, review, scoring, recommendation, selection, and every external capability blocked.",
  },
  {
    id: "evidence_admissibility_and_no_new_intake_lock",
    label: "Evidence-admissibility and no-new-intake lock",
    owner: "Privacy + Security + Risk",
    safeguard: "Require a closed, sanitized, lineaged, allowlisted, access-controlled evidence inventory derived only from a separately closed intake, with no new contact, submission, retrieval, restoration, or supplementation.",
    failClosedBoundary: "Missing lineage, an open channel, new or restored material, prohibited or sensitive data, uncertain access, unresolved deletion, contamination, or inventory drift keeps review closed.",
  },
  {
    id: "rubric_freeze_and_no_retrofitting_lock",
    label: "Rubric-freeze and no-retrofitting lock",
    owner: "Product + Risk",
    safeguard: "Require an objective rubric, version, weights, thresholds, missing-evidence rules, and change-control record to be approved and frozen before any evidence could be evaluated.",
    failClosedBoundary: "Unversioned, subjective, supplier-specific, retrofitted, changed, incomplete, irreproducible, or outcome-driven criteria prohibit review and scoring.",
  },
  {
    id: "independent_review_dissent_and_exception_lock",
    label: "Independent-review, dissent, and exception lock",
    owner: "Legal + Risk",
    safeguard: "Require independent roles, current conflict checks, recusals, replacements, preserved dissent, controlled exceptions, explicit overrides, findings ownership, and unconditional stop authority.",
    failClosedBoundary: "Conflicted, missing, combined, overridden, unsigned, suppressed, waived, overdue, or disputed independent review keeps scoring, closeout, recommendation, selection, and release blocked.",
  },
  {
    id: "no_recommendation_selection_or_release_lock",
    label: "No-recommendation, selection, or release lock",
    owner: "Legal + Executive",
    safeguard: "Require every future review authorization to state that evidence admission, review, scoring, variance resolution, findings, or review closeout cannot itself recommend, shortlist, contract with, select, implement, credential, activate, ticket through, or pay a supplier.",
    failClosedBoundary: "Evidence review authority remains narrow, one-time, revocable, non-transferable, and unable to authorize commercial commitment, Sandbox, ticketing, payment, or Production traffic.",
  },
];

export const flightEvaluationReviewAuthorizationGates: readonly FlightEvaluationReviewAuthorizationGate[] = [
  { id: "phase_14_closeout_separately_approved", label: "Phase 14 closeout separately approved", owner: "Risk + Release approvers", detail: "Require a separately created and approved actual closeout record; Phase 14 software, Git publication, Preview deployment, page access, or browser acceptance cannot substitute for a completed intake closeout." },
  { id: "evidence_inventory_lineage_and_admissibility_approved", label: "Evidence inventory, lineage, and admissibility approved", owner: "Privacy + Risk", detail: "Approve the closed inventory, source lineage, receipt and sanitation references, permitted use, exclusions, retention, deletion, access, and reproducibility without adding or restoring evidence." },
  { id: "evaluation_purpose_rubric_and_thresholds_approved", label: "Evaluation purpose, rubric, and thresholds approved", owner: "Product + Risk", detail: "Approve the permitted review purpose, objective criteria, weights, thresholds, missing-evidence treatment, version freeze, change control, and explicit no-recommendation boundary." },
  { id: "legal_commercial_and_data_use_authority_approved", label: "Legal, commercial, and data-use authority approved", owner: "Legal + Commercial + Privacy", detail: "Confirm authority for the narrowly defined evidence use, confidentiality, jurisdiction, retention, deletion, reviewer access, disclosures, and exclusions without accepting a proposal or contract." },
  { id: "independent_reviewers_observers_and_conflicts_approved", label: "Independent reviewers, observers, and conflicts approved", owner: "Legal + Risk", detail: "Approve separately accountable reviewer and observer roles, blind-review rules, conflicts, recusals, replacements, acknowledgments, and stop authority without assigning people here." },
  { id: "variance_dissent_exception_and_override_controls_approved", label: "Variance, dissent, exception, and override controls approved", owner: "Risk + Legal", detail: "Approve treatment for reviewer variance, ambiguity, missing or conflicting evidence, preserved dissent, controlled exceptions, explicit overrides, escalation, and no silent resolution." },
  { id: "privacy_security_retention_and_deletion_controls_confirmed", label: "Privacy, security, retention, and deletion controls confirmed", owner: "Privacy + Security", detail: "Confirm least privilege, access logging, isolation, prohibited-data controls, retention, copy inventory, work-product handling, deletion, incident, and contamination controls before review." },
  { id: "audit_reproducibility_findings_and_stop_controls_approved", label: "Audit, reproducibility, findings, and stop controls approved", owner: "Risk + Audit", detail: "Approve immutable version references, sanitized decision records, reproducibility checks, finding ownership, remediation, verification, immediate stops, expiry, teardown, and no restart." },
  { id: "no_recommendation_shortlist_contract_selection_or_release_confirmed", label: "No recommendation, shortlist, contract, selection, or release confirmed", owner: "Executive + Release approvers", detail: "Confirm that review creates no recommendation, ranking, shortlist, commercial commitment, contract, supplier selection, credential, implementation, Sandbox, ticketing, payment, or Production authority." },
  { id: "evidence_review_opening_requires_action_time_decision", label: "Evidence review opening requires an action-time decision", owner: "Release approvers", detail: "Require a new, one-time, scoped, expiring, revocable decision outside this design immediately before a fixed evidence inventory could enter review; design completion never creates standing authority." },
];

export type FlightEvaluationReviewAuthorizationEvidence = Partial<Record<FlightEvaluationReviewAuthorizationGate["id"], boolean>>;

export function buildFlightEvaluationReviewAuthorizationDesign(evidence: FlightEvaluationReviewAuthorizationEvidence = {}) {
  const gates = flightEvaluationReviewAuthorizationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_REVIEW_AUTHORIZATION_MODE,
    planState: "design_only" as const,
    reviewAuthorizationState: "blocked" as const,
    phase14CloseoutPrerequisiteState: "not_satisfied" as const,
    phase14SoftwareAcceptanceState: "accepted_in_preview" as const,
    closeoutReferenceState: "not_recorded" as const,
    evaluationReviewState: "closed" as const,
    reviewDecisionState: "not_recorded" as const,
    reviewWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    submissionChannelState: "not_created" as const,
    evidenceCount: 0,
    evidenceInventoryState: "not_created" as const,
    evidenceLineageState: "not_recorded" as const,
    admissibilityReviewState: "not_started" as const,
    rubricState: "not_approved" as const,
    rubricVersionState: "not_recorded" as const,
    reviewerState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    accessState: "not_granted" as const,
    scoreState: "not_calculated" as const,
    scorecardState: "not_created" as const,
    varianceReviewState: "not_started" as const,
    dissentState: "not_recorded" as const,
    exceptionState: "not_recorded" as const,
    findingCount: 0,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    commercialDiligenceState: "not_started" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    authorizationDesignComplete: completedCount === gates.length,
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
