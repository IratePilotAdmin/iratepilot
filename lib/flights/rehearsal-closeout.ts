export const FLIGHT_REHEARSAL_CLOSEOUT_MODE = "synthetic_rehearsal_closeout_design_only" as const;

export type FlightRehearsalCloseoutArtifact = {
  id:
    | "scenario_disposition_register"
    | "abort_and_stop_record"
    | "sanitized_observation_inventory"
    | "fictional_fixture_destruction_certificate"
    | "findings_ownership_ledger"
    | "authorization_expiration_closeout_receipt";
  label: string;
  owner: string;
  closeoutRequirement: string;
  nonRecordBoundary: string;
};

export type FlightRehearsalCloseoutSafeguard = {
  id:
    | "no_implied_run_lock"
    | "complete_teardown_lock"
    | "unresolved_finding_lock"
    | "dissent_and_recusal_lock"
    | "no_downstream_authority_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightRehearsalCloseoutGate = {
  id:
    | "phase_9_execution_record_separately_exists"
    | "observer_stop_ledger_verified"
    | "scenario_outcomes_reconciled"
    | "contamination_review_cleared"
    | "fictional_fixture_deletion_confirmed"
    | "sanitized_evidence_inventory_approved"
    | "findings_owned_and_unresolved_items_blocked"
    | "dissent_recusal_and_exceptions_resolved"
    | "authorization_expiration_and_no_restart_recorded"
    | "closeout_requires_separate_approval";
  label: string;
  owner: string;
  detail: string;
};

export const flightRehearsalCloseoutArtifacts: readonly FlightRehearsalCloseoutArtifact[] = [
  {
    id: "scenario_disposition_register",
    label: "Scenario disposition register",
    owner: "Product + Observer",
    closeoutRequirement: "Define the future reconciliation of each separately released fictional scenario to one observed outcome, stop state, and disposition without adding supplier, passenger, fare, schedule, availability, or commercial content.",
    nonRecordBoundary: "Design cannot prove that a scenario was released, run, observed, stopped, completed, or reconciled.",
  },
  {
    id: "abort_and_stop_record",
    label: "Abort and stop record",
    owner: "Security + Risk",
    closeoutRequirement: "Define future documentation of every stop trigger, isolation action, observer veto, scope expiration, and no-restart outcome before closeout could be considered.",
    nonRecordBoundary: "Design cannot detect an event, stop a system, isolate data, create an incident, notify anyone, or authorize a restart.",
  },
  {
    id: "sanitized_observation_inventory",
    label: "Sanitized observation inventory",
    owner: "Privacy + Legal",
    closeoutRequirement: "Define a future inventory limited to fictional scenario identifiers, control outcomes, severity, dissent, and remediation ownership with explicit exclusion of real-world and sensitive values.",
    nonRecordBoundary: "Design cannot capture, store, upload, transmit, approve, or retain an observation, receipt, result, document, or sensitive value.",
  },
  {
    id: "fictional_fixture_destruction_certificate",
    label: "Fictional fixture destruction certificate",
    owner: "Security + Privacy",
    closeoutRequirement: "Define future proof that every invented-only fixture and temporary copy was identified, deleted within scope, independently checked, and excluded from reuse.",
    nonRecordBoundary: "Design cannot create, inspect, locate, retain, delete, certify, restore, or reuse a fictional fixture.",
  },
  {
    id: "findings_ownership_ledger",
    label: "Findings ownership ledger",
    owner: "Risk + Executive",
    closeoutRequirement: "Define future ownership, severity, remediation, dissent, exception, due-date, and closure requirements while unresolved or disputed items keep every downstream decision blocked.",
    nonRecordBoundary: "Design cannot create, assign, accept, resolve, close, waive, score, or use a finding for supplier evaluation.",
  },
  {
    id: "authorization_expiration_closeout_receipt",
    label: "Authorization expiration and closeout receipt",
    owner: "Legal + Release approvers",
    closeoutRequirement: "Define future confirmation that one-time authority expired, the execution window is closed, teardown is complete, restart is prohibited, and no evaluation or release authority follows.",
    nonRecordBoundary: "Design cannot expire an authorization, close a window, create a receipt, approve closeout, open intake, select a supplier, or release traffic.",
  },
];

export const flightRehearsalCloseoutSafeguards: readonly FlightRehearsalCloseoutSafeguard[] = [
  {
    id: "no_implied_run_lock",
    label: "No-implied-run lock",
    owner: "Risk + Release approvers",
    safeguard: "Require separately approved execution evidence before any closeout review could begin; a design, deployment, page view, or completed checklist is never evidence that a rehearsal ran.",
    failClosedBoundary: "Missing execution evidence keeps teardown, findings disposition, closeout, evaluation intake, and every downstream decision blocked.",
  },
  {
    id: "complete_teardown_lock",
    label: "Complete-teardown lock",
    owner: "Security + Privacy",
    safeguard: "Require independently verified fixture deletion, copy inventory, isolation confirmation, retention expiration, and no-reuse proof before closeout could be approved.",
    failClosedBoundary: "Incomplete, ambiguous, unverified, or disputed teardown prohibits closeout, restart, evidence reuse, evaluation intake, and release.",
  },
  {
    id: "unresolved_finding_lock",
    label: "Unresolved-finding lock",
    owner: "Risk + Executive",
    safeguard: "Require every future finding to have accountable ownership and an accepted disposition while any unresolved, overdue, waived, or disputed item remains visible and blocking.",
    failClosedBoundary: "No finding can be silently dropped, converted into approval, used for scoring, or bypassed by schedule, convenience, or prior authorization.",
  },
  {
    id: "dissent_and_recusal_lock",
    label: "Dissent-and-recusal lock",
    owner: "Legal + Observer",
    safeguard: "Require independent preservation and resolution of observer dissent, conflicts, recusals, exceptions, and overridden judgments before a closeout decision could be considered.",
    failClosedBoundary: "Missing, conflicted, overridden, unsigned, or unresolved independent review keeps closeout and all downstream authority blocked.",
  },
  {
    id: "no_downstream_authority_lock",
    label: "No-downstream-authority lock",
    owner: "Legal + Executive",
    safeguard: "Require closeout to state explicitly that it cannot open named supplier intake, create a candidate, score evidence, recommend or select a supplier, accept credentials, enable traffic, issue tickets, or authorize payment.",
    failClosedBoundary: "A rehearsal result, finding disposition, teardown confirmation, or closeout receipt grants no commercial, implementation, Sandbox, ticketing, payment, or Production authority.",
  },
];

export const flightRehearsalCloseoutGates: readonly FlightRehearsalCloseoutGate[] = [
  { id: "phase_9_execution_record_separately_exists", label: "Phase 9 execution record separately exists", owner: "Risk + Release approvers", detail: "Require separately approved, action-time execution evidence; this design neither creates nor assumes an execution decision, window, fixture, participant, scenario, observation, result, receipt, finding, teardown, or closeout." },
  { id: "observer_stop_ledger_verified", label: "Observer and stop ledger verified", owner: "Observer + Legal", detail: "Verify future entry, scenario, stop, evidence, teardown, and closeout acknowledgments plus every veto, recusal, conflict, and interruption without recording them here." },
  { id: "scenario_outcomes_reconciled", label: "Scenario outcomes reconciled", owner: "Product + Risk", detail: "Reconcile each separately released fictional scenario to one sanitized outcome and disposition; zero scenarios or missing evidence keeps this gate incomplete." },
  { id: "contamination_review_cleared", label: "Contamination review cleared", owner: "Security + Privacy", detail: "Require separate proof that no real supplier, passenger, credential, endpoint, schedule, fare, availability, quote, or commercial information entered the rehearsal or evidence set." },
  { id: "fictional_fixture_deletion_confirmed", label: "Fictional fixture deletion confirmed", owner: "Security + Privacy", detail: "Require independently checked deletion of every invented-only fixture and temporary copy plus expiration of its permitted retention window; this design deletes nothing." },
  { id: "sanitized_evidence_inventory_approved", label: "Sanitized evidence inventory approved", owner: "Privacy + Legal", detail: "Approve only fictional identifiers, control outcomes, severity, dissent, remediation ownership, teardown confirmation, and explicit no-release language." },
  { id: "findings_owned_and_unresolved_items_blocked", label: "Findings owned and unresolved items blocked", owner: "Risk + Executive", detail: "Require accountable ownership and disposition for every finding while unresolved, disputed, waived, or overdue items remain blocking and cannot enter supplier scoring." },
  { id: "dissent_recusal_and_exceptions_resolved", label: "Dissent, recusal, and exceptions resolved", owner: "Legal + Observer", detail: "Require independent resolution of dissent, conflicts, recusals, exceptions, and overrides without suppressing or converting them into authorization." },
  { id: "authorization_expiration_and_no_restart_recorded", label: "Authorization expiration and no restart recorded", owner: "Legal + Risk", detail: "Require proof that one-time authority expired, the window is closed, teardown is complete, and any future rehearsal would need a new authorization and preflight cycle." },
  { id: "closeout_requires_separate_approval", label: "Closeout requires separate approval", owner: "Release approvers", detail: "Require a new decision outside this design before creating a closeout receipt; approval still cannot open named supplier evaluation or authorize any external capability." },
];

export type FlightRehearsalCloseoutEvidence = Partial<Record<FlightRehearsalCloseoutGate["id"], boolean>>;

export function buildFlightRehearsalCloseoutDesign(evidence: FlightRehearsalCloseoutEvidence = {}) {
  const gates = flightRehearsalCloseoutGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_REHEARSAL_CLOSEOUT_MODE,
    planState: "design_only" as const,
    closeoutControlState: "blocked" as const,
    authorizationPrerequisiteState: "not_satisfied" as const,
    preflightPrerequisiteState: "not_satisfied" as const,
    executionRecordState: "not_created" as const,
    executionWindowState: "not_opened" as const,
    scopeBindingState: "not_recorded" as const,
    fixtureManifestState: "not_created" as const,
    syntheticFixtureState: "not_created" as const,
    roleAssignmentState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    rehearsalState: "not_run" as const,
    releasedScenarioCount: 0,
    scenarioResultCount: 0,
    observationCount: 0,
    receiptState: "not_created" as const,
    findingCount: 0,
    findingDispositionState: "not_started" as const,
    contaminationReviewState: "not_started" as const,
    teardownState: "not_started" as const,
    fixtureDeletionState: "not_confirmed" as const,
    observerCloseoutState: "not_recorded" as const,
    authorizationExpirationState: "not_recorded" as const,
    closeoutDecisionState: "not_recorded" as const,
    closeoutState: "not_created" as const,
    evaluationIntakeState: "closed" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    closeoutPlanComplete: completedCount === gates.length,
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
