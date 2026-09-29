export const FLIGHT_EVALUATION_INTAKE_CLOSEOUT_MODE = "supplier_evaluation_intake_closeout_design_only" as const;

export type FlightEvaluationIntakeCloseoutArtifact = {
  id:
    | "phase_13_execution_record_reference"
    | "intake_scope_and_receipt_reconciliation"
    | "evidence_sanitation_retention_and_deletion_record"
    | "incident_quarantine_and_contamination_disposition"
    | "independent_observer_dissent_and_exception_record"
    | "findings_ownership_and_remediation_ledger"
    | "expiry_teardown_and_closeout_receipt";
  label: string;
  owner: string;
  closeoutRequirement: string;
  nonRecordBoundary: string;
};

export type FlightEvaluationIntakeCloseoutSafeguard = {
  id:
    | "no_implied_execution_lock"
    | "evidence_and_data_reconciliation_lock"
    | "incident_finding_and_dissent_lock"
    | "expiry_teardown_and_deletion_lock"
    | "no_scoring_selection_or_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationIntakeCloseoutGate = {
  id:
    | "phase_11_authorization_phase_12_preflight_and_phase_13_execution_verified"
    | "one_time_scope_window_and_receipts_reconciled"
    | "contact_candidate_case_and_evidence_inventory_reconciled"
    | "prohibited_data_sanitation_quarantine_and_incidents_resolved"
    | "retention_deletion_and_access_removal_confirmed"
    | "independent_roles_conflicts_dissent_and_exceptions_reconciled"
    | "findings_remediation_owners_and_blockers_resolved"
    | "expiry_teardown_and_no_restart_confirmed"
    | "no_scoring_selection_contract_credentials_or_release_confirmed"
    | "closeout_requires_separate_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationIntakeCloseoutArtifacts: readonly FlightEvaluationIntakeCloseoutArtifact[] = [
  {
    id: "phase_13_execution_record_reference",
    label: "Phase 13 execution-record reference",
    owner: "Risk + Release approvers",
    closeoutRequirement: "Require separately approved, current Phase 11 authorization, Phase 12 preflight, and Phase 13 execution records before a future supplier-evaluation intake closeout could be considered.",
    nonRecordBoundary: "Design cannot create, approve, infer, reuse, or satisfy a prerequisite or convert software acceptance into execution or closeout evidence.",
  },
  {
    id: "intake_scope_and_receipt_reconciliation",
    label: "Intake scope and receipt reconciliation",
    owner: "Product + Commercial + Risk",
    closeoutRequirement: "Define future reconciliation of one authorized scope, window, contact handoff, candidate-neutral purpose, evaluation case, channel, receipt inventory, stop state, and final disposition.",
    nonRecordBoundary: "Design cannot identify or contact a supplier, open or close a window, create a candidate or case, create a channel, receive evidence, or reconcile an intake.",
  },
  {
    id: "evidence_sanitation_retention_and_deletion_record",
    label: "Evidence sanitation, retention, and deletion record",
    owner: "Privacy + Security",
    closeoutRequirement: "Define future proof for minimal receipt metadata, sanitation, access, approved retention, deletion, copy inventory, and exclusion of prohibited, passenger, credential, live, and unnecessary personal data.",
    nonRecordBoundary: "Design cannot request, receive, inspect, sanitize, retain, copy, delete, certify, restore, disclose, transform, or score supplier material or sensitive data.",
  },
  {
    id: "incident_quarantine_and_contamination_disposition",
    label: "Incident, quarantine, and contamination disposition",
    owner: "Security + Privacy + Risk",
    closeoutRequirement: "Define future reconciliation of every immediate stop, prohibited-data event, malware result, quarantine action, access isolation, incident, contamination review, escalation, and no-restart outcome.",
    nonRecordBoundary: "Design cannot detect an event, quarantine evidence, isolate access, create or resolve an incident, clear contamination, notify anyone, or authorize a restart.",
  },
  {
    id: "independent_observer_dissent_and_exception_record",
    label: "Independent observer, dissent, and exception record",
    owner: "Legal + Risk",
    closeoutRequirement: "Define future confirmation of accountable reviewer and independent observer participation, conflicts, recusals, replacements, preserved dissent, exceptions, overrides, and final acknowledgments.",
    nonRecordBoundary: "Design cannot assign a person, clear a conflict, waive dissent, approve an exception, record an observation, obtain an acknowledgment, or substitute one accountable role for another.",
  },
  {
    id: "findings_ownership_and_remediation_ledger",
    label: "Findings ownership and remediation ledger",
    owner: "Risk + Executive",
    closeoutRequirement: "Define future ownership, severity, evidence, remediation, due date, verification, dissent, exception, and disposition requirements while every unresolved or disputed finding remains blocking.",
    nonRecordBoundary: "Design cannot create, assign, accept, waive, resolve, close, rank, score, or use a finding for supplier recommendation, selection, contracting, or release.",
  },
  {
    id: "expiry_teardown_and_closeout_receipt",
    label: "Expiry, teardown, and closeout receipt",
    owner: "Privacy + Legal + Release approvers",
    closeoutRequirement: "Define future proof that one-time authority expired, the window and channel closed, access was removed, retained material was reconciled, teardown completed, restart is prohibited, and no downstream authority follows.",
    nonRecordBoundary: "Design cannot expire authority, close a channel, remove access, delete material, complete teardown, create a receipt, approve closeout, score or select a supplier, or release an external capability.",
  },
];

export const flightEvaluationIntakeCloseoutSafeguards: readonly FlightEvaluationIntakeCloseoutSafeguard[] = [
  {
    id: "no_implied_execution_lock",
    label: "No-implied-execution lock",
    owner: "Risk + Release approvers",
    safeguard: "Require separate action-time authorization, preflight, and execution records before closeout review; software completion, publication, deployment, page access, or browser acceptance is never evidence that intake ran.",
    failClosedBoundary: "Missing, expired, inferred, reused, widened, or disputed execution evidence keeps reconciliation, teardown, findings disposition, closeout, and every downstream decision blocked.",
  },
  {
    id: "evidence_and_data_reconciliation_lock",
    label: "Evidence-and-data reconciliation lock",
    owner: "Privacy + Security",
    safeguard: "Require a complete receipt and copy inventory, minimal metadata, sanitation, prohibited-data disposition, access history, retention expiry, deletion confirmation, and independent verification.",
    failClosedBoundary: "Missing, contaminated, unnecessary, sensitive, inaccessible, duplicated, retained, unverifiable, or disputed material prohibits closeout, reuse, scoring, selection, and release.",
  },
  {
    id: "incident_finding_and_dissent_lock",
    label: "Incident, finding, and dissent lock",
    owner: "Security + Risk + Legal",
    safeguard: "Require every stop, incident, contamination concern, finding, conflict, recusal, dissent, exception, and override to remain visible, independently owned, and resolved through its accountable process.",
    failClosedBoundary: "An unresolved, waived, suppressed, unsigned, overdue, overridden, or disputed item keeps closeout, restart, scoring, recommendation, selection, and external release blocked.",
  },
  {
    id: "expiry_teardown_and_deletion_lock",
    label: "Expiry, teardown, and deletion lock",
    owner: "Privacy + Legal + Release approvers",
    safeguard: "Require proof that authorization and access expired, the intake window and submission channel closed, copies were reconciled, required deletion completed, teardown was independently checked, and restart requires a new cycle.",
    failClosedBoundary: "Any open authority, active access, reachable channel, retained copy, incomplete deletion, uncertain teardown, extension, renewal, or restart path keeps closeout blocked.",
  },
  {
    id: "no_scoring_selection_or_release_lock",
    label: "No-scoring, selection, or release lock",
    owner: "Legal + Executive",
    safeguard: "Require closeout to state explicitly that intake evidence, observations, findings, remediation, deletion, teardown, or a receipt creates no score, recommendation, shortlist, contract, supplier selection, credential, implementation, or traffic authority.",
    failClosedBoundary: "No intake result or closeout record can authorize commercial commitment, evidence reuse, Sandbox traffic, ticketing, payment, Production traffic, or another supplier evaluation.",
  },
];

export const flightEvaluationIntakeCloseoutGates: readonly FlightEvaluationIntakeCloseoutGate[] = [
  { id: "phase_11_authorization_phase_12_preflight_and_phase_13_execution_verified", label: "Phase 11 authorization, Phase 12 preflight, and Phase 13 execution verified", owner: "Risk + Release approvers", detail: "Require separate, current, action-time records for every prerequisite; this design neither creates nor assumes authorization, preflight, execution, contact, intake, evidence, teardown, or closeout." },
  { id: "one_time_scope_window_and_receipts_reconciled", label: "One-time scope, window, and receipts reconciled", owner: "Product + Risk", detail: "Reconcile the separately authorized purpose, boundaries, start, expiry, revocations, owner acknowledgments, contact handoff, channel receipts, stops, and final scope without widening or reuse." },
  { id: "contact_candidate_case_and_evidence_inventory_reconciled", label: "Contact, candidate, case, and evidence inventory reconciled", owner: "Commercial + Privacy", detail: "Reconcile one supplier contact path, candidate-neutral record, evaluation case, submission channel, receipt inventory, access history, and evidence disposition without recording identities or material here." },
  { id: "prohibited_data_sanitation_quarantine_and_incidents_resolved", label: "Prohibited data, sanitation, quarantine, and incidents resolved", owner: "Security + Privacy + Risk", detail: "Require separate proof for prohibited-data detection, malware review, sanitation, quarantine, isolation, immediate stops, contamination review, incidents, escalation, and no restart." },
  { id: "retention_deletion_and_access_removal_confirmed", label: "Retention, deletion, and access removal confirmed", owner: "Privacy + Security", detail: "Confirm permitted retention expired or remains narrowly justified, every copy is accounted for, required deletion is verified, access is removed, and no channel, mailbox, upload, store, or endpoint remains available." },
  { id: "independent_roles_conflicts_dissent_and_exceptions_reconciled", label: "Independent roles, conflicts, dissent, and exceptions reconciled", owner: "Legal + Risk", detail: "Require separate reviewer and observer acknowledgments plus resolution of conflicts, recusals, replacements, dissent, exceptions, overrides, and stop decisions without suppression or conversion into authority." },
  { id: "findings_remediation_owners_and_blockers_resolved", label: "Findings, remediation owners, and blockers resolved", owner: "Risk + Executive", detail: "Require accountable ownership, severity, evidence, remediation, due dates, independent verification, and accepted disposition while any unresolved, waived, overdue, or disputed finding stays blocking." },
  { id: "expiry_teardown_and_no_restart_confirmed", label: "Expiry, teardown, and no restart confirmed", owner: "Legal + Release approvers", detail: "Require proof that one-time authority and access expired, the window and channel closed, teardown completed, reuse is prohibited, and any future intake requires new authorization, preflight, and execution decisions." },
  { id: "no_scoring_selection_contract_credentials_or_release_confirmed", label: "No scoring, selection, contract, credentials, or release confirmed", owner: "Executive + Release approvers", detail: "Confirm that intake and closeout create no score, recommendation, shortlist, contract, supplier selection, credential, implementation, Sandbox, ticketing, payment, or Production authority." },
  { id: "closeout_requires_separate_decision", label: "Closeout requires a separate decision", owner: "Release approvers", detail: "Require a new decision outside this design after every prerequisite, reconciliation, independent acknowledgment, finding, deletion, expiry, and teardown requirement is satisfied before a closeout receipt could be created." },
];

export type FlightEvaluationIntakeCloseoutEvidence = Partial<Record<FlightEvaluationIntakeCloseoutGate["id"], boolean>>;

export function buildFlightEvaluationIntakeCloseoutDesign(evidence: FlightEvaluationIntakeCloseoutEvidence = {}) {
  const gates = flightEvaluationIntakeCloseoutGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_INTAKE_CLOSEOUT_MODE,
    planState: "design_only" as const,
    closeoutControlState: "blocked" as const,
    phase11AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase12PreflightPrerequisiteState: "not_satisfied" as const,
    phase13ExecutionRecordPrerequisiteState: "not_satisfied" as const,
    phase13SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    preflightReceiptState: "not_created" as const,
    executionRecordState: "not_created" as const,
    scopeReconciliationState: "not_started" as const,
    intakeWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    contactHandoffState: "not_created" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    submissionChannelState: "not_created" as const,
    evidenceCount: 0,
    evidenceInventoryState: "not_created" as const,
    sanitationState: "not_started" as const,
    quarantineState: "not_started" as const,
    incidentState: "not_created" as const,
    stopRecordState: "not_created" as const,
    contaminationReviewState: "not_started" as const,
    retentionState: "not_confirmed" as const,
    deletionState: "not_confirmed" as const,
    accessRemovalState: "not_confirmed" as const,
    reviewerState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    dissentState: "not_recorded" as const,
    exceptionState: "not_recorded" as const,
    findingCount: 0,
    findingDispositionState: "not_started" as const,
    teardownState: "not_started" as const,
    authorizationExpiryState: "not_recorded" as const,
    closeoutDecisionState: "not_recorded" as const,
    closeoutState: "not_created" as const,
    evaluationIntakeState: "closed" as const,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    closeoutDesignComplete: completedCount === gates.length,
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
