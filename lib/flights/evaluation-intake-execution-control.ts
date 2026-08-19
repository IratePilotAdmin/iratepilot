export const FLIGHT_EVALUATION_INTAKE_EXECUTION_CONTROL_MODE = "supplier_evaluation_intake_execution_control_design_only" as const;

export type FlightEvaluationIntakeExecutionControl = {
  id:
    | "phase_12_preflight_receipt_reference"
    | "one_time_intake_window_binding"
    | "approved_contact_handoff"
    | "isolated_submission_channel_opening"
    | "evidence_receipt_sanitation_and_quarantine"
    | "independent_observation_and_stop_log"
    | "expiry_teardown_and_closeout_handoff";
  label: string;
  owner: string;
  executionRequirement: string;
  nonExecutionBoundary: string;
};

export type FlightEvaluationIntakeExecutionSafeguard = {
  id:
    | "authorization_and_preflight_dual_lock"
    | "one_supplier_one_window_scope_lock"
    | "contact_channel_and_data_stop"
    | "independent_observation_dissent_stop"
    | "expiry_teardown_and_no_downstream_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationIntakeExecutionGate = {
  id:
    | "phase_11_authorization_and_phase_12_preflight_verified"
    | "one_time_scope_window_and_expiry_bound"
    | "candidate_neutrality_and_contact_handoff_verified"
    | "submission_channel_isolation_verified"
    | "evidence_taxonomy_and_prohibited_data_verified"
    | "independent_roles_conflicts_and_dissent_verified"
    | "immediate_stop_incident_and_quarantine_verified"
    | "retention_deletion_and_teardown_verified"
    | "no_scoring_selection_or_external_release_verified"
    | "intake_start_requires_action_time_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationIntakeExecutionControls: readonly FlightEvaluationIntakeExecutionControl[] = [
  {
    id: "phase_12_preflight_receipt_reference",
    label: "Phase 12 preflight-receipt reference",
    owner: "Risk + Release approvers",
    executionRequirement: "Require separately approved, current Phase 11 authorization and Phase 12 preflight receipts before any future supplier-evaluation intake start could be considered.",
    nonExecutionBoundary: "Design cannot create, approve, infer, reuse, or satisfy either prerequisite or convert software acceptance into intake authority.",
  },
  {
    id: "one_time_intake_window_binding",
    label: "One-time intake-window binding",
    owner: "Product + Legal",
    executionRequirement: "Define one candidate-neutral purpose, permitted evidence classes, accountable owners, start and expiry times, revocation conditions, and explicit no-selection boundary.",
    nonExecutionBoundary: "Design cannot identify a supplier, bind a scope, open or extend a window, delegate authority, create a candidate, or create an evaluation case.",
  },
  {
    id: "approved_contact_handoff",
    label: "Approved contact handoff",
    owner: "Commercial + Legal",
    executionRequirement: "Define the future handoff of one approved contact owner, message, channel, disclosure, jurisdiction, identity-minimization rule, and no-commercial-commitment statement.",
    nonExecutionBoundary: "Design cannot assign an owner, approve or send a message, reveal an identity, schedule a meeting, solicit material, or create a commercial commitment.",
  },
  {
    id: "isolated_submission_channel_opening",
    label: "Isolated submission-channel opening",
    owner: "Security + Privacy",
    executionRequirement: "Define action-time verification for an allowlisted, isolated, least-privilege, logged, time-limited channel with sanitation, malware review, access removal, retention, and deletion controls.",
    nonExecutionBoundary: "Design cannot create, configure, test, open, access, or close a form, upload, mailbox, database path, secret store, endpoint, webhook, provider connection, or network channel.",
  },
  {
    id: "evidence_receipt_sanitation_and_quarantine",
    label: "Evidence receipt, sanitation, and quarantine",
    owner: "Privacy + Security",
    executionRequirement: "Define minimal receipt metadata, sanitation status, prohibited-data detection, malware disposition, quarantine, access log, retention clock, deletion confirmation, and contamination escalation.",
    nonExecutionBoundary: "Design cannot request, receive, inspect, download, upload, sanitize, quarantine, retain, delete, transform, score, or disclose supplier evidence or sensitive data.",
  },
  {
    id: "independent_observation_and_stop_log",
    label: "Independent observation and stop log",
    owner: "Legal + Risk",
    executionRequirement: "Define action-time acknowledgments for the accountable reviewer, independent observer, conflicts, recusals, replacements, dissent, exceptions, immediate stops, incidents, and no-restart decisions.",
    nonExecutionBoundary: "Design cannot name or assign a person, clear a conflict, waive dissent, approve an exception, observe an intake, record an event, create an incident, or authorize a restart.",
  },
  {
    id: "expiry_teardown_and_closeout_handoff",
    label: "Expiry, teardown, and closeout handoff",
    owner: "Privacy + Release approvers",
    executionRequirement: "Define authority expiry, access removal, channel teardown, evidence reconciliation, deletion confirmation, findings ownership, dissent disposition, closeout handoff, and explicit no-downstream-release confirmation.",
    nonExecutionBoundary: "Design cannot expire authority, remove access, close a channel, reconcile or delete evidence, resolve a finding, create closeout, score or select a supplier, or release any external capability.",
  },
];

export const flightEvaluationIntakeExecutionSafeguards: readonly FlightEvaluationIntakeExecutionSafeguard[] = [
  {
    id: "authorization_and_preflight_dual_lock",
    label: "Authorization-and-preflight dual lock",
    owner: "Risk + Release approvers",
    safeguard: "Require separately approved, current Phase 11 authorization and Phase 12 preflight receipts plus a new action-time start decision.",
    failClosedBoundary: "Software completion, Git publication, deployment, page access, browser acceptance, an old receipt, or one satisfied prerequisite cannot open evaluation intake.",
  },
  {
    id: "one_supplier_one_window_scope_lock",
    label: "One-supplier, one-window scope lock",
    owner: "Product + Legal",
    safeguard: "Limit any future decision to one candidate-neutral purpose, one separately identified supplier, one fixed evidence scope, one accountable team, and one expiring, non-delegable window.",
    failClosedBoundary: "Batching, parallel suppliers, broadened evidence, reuse, delegation, extension, automatic renewal, ranking, or selection keeps intake closed.",
  },
  {
    id: "contact_channel_and_data_stop",
    label: "Contact, channel, and data stop",
    owner: "Commercial + Security + Privacy",
    safeguard: "Require approved contact, channel isolation, least privilege, minimal evidence, prohibited-data detection, sanitation, malware review, quarantine, retention, deletion, and incident controls.",
    failClosedBoundary: "Unapproved contact, identity exposure, channel drift, credential or passenger data, live content, executable material, contamination, or unexpected access requires immediate stop and no downstream use.",
  },
  {
    id: "independent_observation_dissent_stop",
    label: "Independent-observation and dissent stop",
    owner: "Legal + Risk",
    safeguard: "Require an accountable reviewer and independent observer with current conflict checks, recusal and replacement controls, preserved dissent, exception ownership, and unconditional stop authority.",
    failClosedBoundary: "A missing, conflicted, silent, overridden, unavailable, or dissenting role keeps intake closed or immediately stopped and cannot become implied approval.",
  },
  {
    id: "expiry_teardown_and_no_downstream_release_lock",
    label: "Expiry, teardown, and no-release lock",
    owner: "Privacy + Release approvers",
    safeguard: "Require automatic expiry, access removal, channel teardown, evidence reconciliation, retention and deletion confirmation, findings ownership, closeout, and a fresh decision before any later phase.",
    failClosedBoundary: "An open item, expired scope, incomplete teardown, retained evidence, unresolved dissent, missing closeout, or prior intake cannot authorize scoring, selection, contracting, credentials, Sandbox, ticketing, payment, or Production.",
  },
];

export const flightEvaluationIntakeExecutionGates: readonly FlightEvaluationIntakeExecutionGate[] = [
  { id: "phase_11_authorization_and_phase_12_preflight_verified", label: "Phase 11 authorization and Phase 12 preflight verified", owner: "Risk + Release approvers", detail: "Verify separately created, approved, current, one-time authorization and preflight receipts; this design creates, records, and assumes neither." },
  { id: "one_time_scope_window_and_expiry_bound", label: "One-time scope, window, and expiry bound", owner: "Product + Legal", detail: "Bind one candidate-neutral purpose, allowed evidence, exclusions, owners, start, expiry, revocation, no delegation, no reuse, and no-selection boundary outside this design." },
  { id: "candidate_neutrality_and_contact_handoff_verified", label: "Candidate neutrality and contact handoff verified", owner: "Commercial + Legal", detail: "Verify objective eligibility and one separately approved contact owner, message, channel, disclosure, jurisdiction, identity-minimization rule, stop condition, and no-commercial-commitment statement." },
  { id: "submission_channel_isolation_verified", label: "Submission-channel isolation verified", owner: "Security + Engineering", detail: "Verify an allowlisted, isolated, least-privilege, logged, time-limited channel plus access removal and teardown without creating or opening it here." },
  { id: "evidence_taxonomy_and_prohibited_data_verified", label: "Evidence taxonomy and prohibited data verified", owner: "Privacy + Security", detail: "Verify minimal evidence classes and exclusions for credentials, passenger data, live content, executable material, unnecessary personal data, and out-of-scope commercial records." },
  { id: "independent_roles_conflicts_and_dissent_verified", label: "Independent roles, conflicts, and dissent verified", owner: "Legal + Risk", detail: "Verify accountable reviewer and independent observer roles, disclosures, recusals, replacements, preserved dissent, exceptions, escalation, and unconditional stop authority." },
  { id: "immediate_stop_incident_and_quarantine_verified", label: "Immediate stop, incident, and quarantine verified", owner: "Security + Risk", detail: "Verify immediate-stop triggers, contamination response, access isolation, evidence quarantine, incident ownership, escalation, no restart, and required new approval cycles." },
  { id: "retention_deletion_and_teardown_verified", label: "Retention, deletion, and teardown verified", owner: "Privacy + Release approvers", detail: "Verify retention clocks, deletion confirmation, access removal, channel teardown, evidence reconciliation, findings ownership, closeout handoff, and expiry controls." },
  { id: "no_scoring_selection_or_external_release_verified", label: "No scoring, selection, or external release verified", owner: "Executive + Release approvers", detail: "Verify that intake creates no score, recommendation, shortlist, contract, supplier selection, implementation, credential, Sandbox, ticketing, payment, or Production authority." },
  { id: "intake_start_requires_action_time_decision", label: "Intake start requires an action-time decision", owner: "Release approvers", detail: "Require a new, one-time, scoped, expiring, revocable decision outside this design immediately before contacting one supplier or opening one isolated intake window." },
];

export type FlightEvaluationIntakeExecutionEvidence = Partial<Record<FlightEvaluationIntakeExecutionGate["id"], boolean>>;

export function buildFlightEvaluationIntakeExecutionControlDesign(evidence: FlightEvaluationIntakeExecutionEvidence = {}) {
  const gates = flightEvaluationIntakeExecutionGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_INTAKE_EXECUTION_CONTROL_MODE,
    planState: "design_only" as const,
    executionControlState: "blocked" as const,
    phase11AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase12PreflightPrerequisiteState: "not_satisfied" as const,
    phase12SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    preflightReceiptState: "not_created" as const,
    executionDecisionState: "not_recorded" as const,
    scopeBindingState: "not_recorded" as const,
    intakeWindowState: "not_opened" as const,
    candidateNeutralityCheckState: "not_started" as const,
    contactHandoffState: "not_created" as const,
    submissionChannelState: "not_created" as const,
    isolationProofState: "not_recorded" as const,
    evidenceTaxonomyState: "not_approved" as const,
    roleAssignmentState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    supplierContactState: "not_started" as const,
    evaluationIntakeState: "closed" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    evidenceCount: 0,
    sanitationState: "not_started" as const,
    quarantineState: "not_started" as const,
    incidentState: "not_created" as const,
    stopRecordState: "not_created" as const,
    teardownState: "not_started" as const,
    closeoutState: "not_created" as const,
    authorizationExpiryState: "not_recorded" as const,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
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
