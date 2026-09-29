export const FLIGHT_REHEARSAL_EXECUTION_CONTROL_MODE = "synthetic_rehearsal_execution_control_design_only" as const;

export type FlightRehearsalExecutionStage = {
  id:
    | "entry_checkpoint"
    | "scenario_release_card"
    | "observer_checkpoint_ledger"
    | "immediate_stop_protocol"
    | "sanitized_observation_protocol"
    | "teardown_closeout_checkpoint";
  label: string;
  owner: string;
  controlRequirement: string;
  nonExecutionBoundary: string;
};

export type FlightRehearsalExecutionSafeguard = {
  id:
    | "no_implicit_start_lock"
    | "one_scenario_at_a_time_lock"
    | "observer_veto_lock"
    | "evidence_quarantine_lock"
    | "abort_and_no_restart_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightRehearsalExecutionGate = {
  id:
    | "phase_7_authorization_separately_satisfied"
    | "phase_8_preflight_separately_approved"
    | "one_time_scope_and_expiry_verified"
    | "fictional_fixture_and_deletion_plan_verified"
    | "role_independence_and_observer_authority_verified"
    | "offline_isolation_reverified"
    | "scenario_sequence_and_stop_triggers_approved"
    | "sanitized_observation_schema_approved"
    | "abort_teardown_and_closeout_approved"
    | "execution_requires_separate_action_time_start";
  label: string;
  owner: string;
  detail: string;
};

export const flightRehearsalExecutionStages: readonly FlightRehearsalExecutionStage[] = [
  {
    id: "entry_checkpoint",
    label: "Entry checkpoint",
    owner: "Risk + Release approvers",
    controlRequirement: "Define the future verification of a current one-time authorization, completed preflight, fixed fictional scope, expiration, role separation, observer authority, and offline isolation before any clock could start.",
    nonExecutionBoundary: "Design cannot satisfy either prerequisite, open an execution window, create a fixture, assign a role, or start a rehearsal.",
  },
  {
    id: "scenario_release_card",
    label: "Scenario release card",
    owner: "Product + Risk",
    controlRequirement: "Define one fictional scenario identifier, expected fail-closed outcome, allowed synthetic inputs, observer checkpoint, stop trigger, and prohibition on parallel or automatic release.",
    nonExecutionBoundary: "Design cannot instantiate, queue, release, run, retry, or complete a scenario or call any supplier or platform endpoint.",
  },
  {
    id: "observer_checkpoint_ledger",
    label: "Observer checkpoint ledger",
    owner: "Legal + Executive",
    controlRequirement: "Define the future observer acknowledgments required at entry, before each fictional scenario, after each outcome, after any stop, and before teardown closeout.",
    nonExecutionBoundary: "Design cannot name an observer, record an acknowledgment, grant authority, resolve a conflict, or permit execution to continue.",
  },
  {
    id: "immediate_stop_protocol",
    label: "Immediate-stop protocol",
    owner: "Security + Risk",
    controlRequirement: "Define immediate stop, isolation, escalation, and no-restart behavior for authorization, contamination, connectivity, role, evidence, sequence, or teardown failures.",
    nonExecutionBoundary: "Design cannot detect a live event, stop a running system, create an incident, send a notification, or authorize a restart.",
  },
  {
    id: "sanitized_observation_protocol",
    label: "Sanitized observation protocol",
    owner: "Privacy + Legal",
    controlRequirement: "Define allowed synthetic references, observed control outcomes, severity, dissent, remediation ownership, and prohibited supplier, passenger, credential, fare, schedule, availability, and commercial content.",
    nonExecutionBoundary: "Design cannot capture, store, upload, transmit, or approve an observation, result, receipt, finding, document, or sensitive value.",
  },
  {
    id: "teardown_closeout_checkpoint",
    label: "Teardown and closeout checkpoint",
    owner: "Risk + Executive",
    controlRequirement: "Define future fixture deletion confirmation, finding ownership, dissent handling, observer closeout, authorization expiration, and explicit confirmation that no downstream release authority exists.",
    nonExecutionBoundary: "Design cannot delete a fixture, close a finding, open evaluation intake, create a candidate, recommend a supplier, or release traffic.",
  },
];

export const flightRehearsalExecutionSafeguards: readonly FlightRehearsalExecutionSafeguard[] = [
  {
    id: "no_implicit_start_lock",
    label: "No-implicit-start lock",
    owner: "Risk + Release approvers",
    safeguard: "Require a new action-time start decision after separately satisfying both the Phase 7 authorization and Phase 8 preflight prerequisites.",
    failClosedBoundary: "A completed design, packet, preflight plan, schedule, page view, deployment, or prior decision cannot start or imply a rehearsal.",
  },
  {
    id: "one_scenario_at_a_time_lock",
    label: "One-scenario-at-a-time lock",
    owner: "Product + Risk",
    safeguard: "Require one fictional scenario to be explicitly released, observed, stopped or closed, and reviewed before another could be considered.",
    failClosedBoundary: "Batching, parallel execution, automatic sequencing, retry, resume, or skipped checkpoints keep every scenario prohibited.",
  },
  {
    id: "observer_veto_lock",
    label: "Observer-veto lock",
    owner: "Legal + Executive",
    safeguard: "Give a future independent observer unconditional stop authority at entry, release, outcome, evidence, teardown, and closeout checkpoints.",
    failClosedBoundary: "A missing, conflicted, silent, overridden, or unavailable observer keeps the execution window closed and the rehearsal unrun.",
  },
  {
    id: "evidence_quarantine_lock",
    label: "Evidence-quarantine lock",
    owner: "Security + Privacy",
    safeguard: "Require an immediate stop and separate review if any real supplier, passenger, credential, endpoint, schedule, fare, availability, quote, or commercial information appears.",
    failClosedBoundary: "Suspected contamination prohibits capture, retention, transmission, scoring, recommendation, intake, and downstream use.",
  },
  {
    id: "abort_and_no_restart_lock",
    label: "Abort-and-no-restart lock",
    owner: "Security + Risk",
    safeguard: "Require teardown, finding ownership, dissent resolution, and a new authorization and preflight cycle after any abort or expired scope.",
    failClosedBoundary: "No restart, resume, reuse, extension, delegation, or downstream release is permitted by an aborted or closed rehearsal scope.",
  },
];

export const flightRehearsalExecutionGates: readonly FlightRehearsalExecutionGate[] = [
  { id: "phase_7_authorization_separately_satisfied", label: "Phase 7 authorization separately satisfied", owner: "Risk + Release approvers", detail: "Require a current, one-time, non-delegable authorization through separately controlled internal processes; this design records none." },
  { id: "phase_8_preflight_separately_approved", label: "Phase 8 preflight separately approved", owner: "Risk + Security", detail: "Require approved scope, fictional-fixture manifest, no-real-data recheck, offline isolation proof, independent roles, observer controls, sanitized evidence schema, and teardown plan; this design approves none." },
  { id: "one_time_scope_and_expiry_verified", label: "One-time scope and expiry verified", owner: "Legal + Risk", detail: "Verify one fixed fictional scope, approved scenarios, start and end window, expiration, no delegation, no reuse, and no standing authority." },
  { id: "fictional_fixture_and_deletion_plan_verified", label: "Fictional fixture and deletion plan verified", owner: "Security + Privacy", detail: "Verify invented-only fields, synthetic labels, prohibited content, contamination response, retention limit, and deletion confirmation without creating a fixture." },
  { id: "role_independence_and_observer_authority_verified", label: "Role independence and observer authority verified", owner: "Legal + Executive", detail: "Verify separate preparation, observation, risk, closeout, and release roles plus recusal, veto, and stop authority without naming participants here." },
  { id: "offline_isolation_reverified", label: "Offline isolation reverified", owner: "Security + Engineering", detail: "Reconfirm there is no provider SDK, secret, endpoint, webhook, network path, external message, Sandbox traffic, Production dependency, ticketing, or payment capability." },
  { id: "scenario_sequence_and_stop_triggers_approved", label: "Scenario sequence and stop triggers approved", owner: "Product + Risk", detail: "Approve one-at-a-time fictional sequencing, expected fail-closed outcomes, observer checkpoints, stop triggers, and prohibitions on automatic release, retry, or resume." },
  { id: "sanitized_observation_schema_approved", label: "Sanitized observation schema approved", owner: "Privacy + Legal", detail: "Approve only synthetic references, observed control outcomes, severity, dissent, remediation ownership, teardown confirmation, and explicit non-release language." },
  { id: "abort_teardown_and_closeout_approved", label: "Abort, teardown, and closeout approved", owner: "Risk + Executive", detail: "Approve immediate abort, isolation, fictional-fixture deletion, finding ownership, dissent handling, closeout review, expiration, and no-restart controls." },
  { id: "execution_requires_separate_action_time_start", label: "Execution requires a separate action-time start", owner: "Release approvers", detail: "Require a new decision outside this design before opening a window, creating a fixture, assigning a participant, releasing one scenario, or recording one observation." },
];

export type FlightRehearsalExecutionEvidence = Partial<Record<FlightRehearsalExecutionGate["id"], boolean>>;

export function buildFlightRehearsalExecutionControlDesign(evidence: FlightRehearsalExecutionEvidence = {}) {
  const gates = flightRehearsalExecutionGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_REHEARSAL_EXECUTION_CONTROL_MODE,
    planState: "design_only" as const,
    executionControlState: "blocked" as const,
    authorizationPrerequisiteState: "not_satisfied" as const,
    preflightPrerequisiteState: "not_satisfied" as const,
    executionDecisionState: "not_recorded" as const,
    executionWindowState: "not_opened" as const,
    scopeBindingState: "not_recorded" as const,
    fixtureManifestState: "not_created" as const,
    syntheticFixtureState: "not_created" as const,
    isolationProofState: "not_recorded" as const,
    roleAssignmentState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    rehearsalState: "not_run" as const,
    releasedScenarioCount: 0,
    scenarioResultCount: 0,
    observationCount: 0,
    receiptState: "not_created" as const,
    findingCount: 0,
    teardownState: "not_started" as const,
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
    executionControlPlanComplete: completedCount === gates.length,
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
