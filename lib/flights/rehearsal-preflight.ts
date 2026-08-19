export const FLIGHT_REHEARSAL_PREFLIGHT_MODE = "synthetic_rehearsal_preflight_design_only" as const;

export type FlightRehearsalPreflightControl = {
  id:
    | "authorization_scope_card"
    | "fictional_fixture_manifest"
    | "offline_isolation_proof"
    | "role_check_in_plan"
    | "scenario_control_cards"
    | "sanitized_evidence_schema"
    | "teardown_and_closeout_plan";
  label: string;
  owner: string;
  readinessRequirement: string;
  nonExecutionBoundary: string;
};

export type FlightRehearsalPreflightSafeguard = {
  id:
    | "authorization_prerequisite_lock"
    | "contamination_stop"
    | "connectivity_stop"
    | "role_conflict_stop"
    | "evidence_and_teardown_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightRehearsalPreflightGate = {
  id:
    | "phase_7_authorization_prerequisite_verified"
    | "authorization_scope_bound"
    | "fictional_fixture_manifest_approved"
    | "no_real_data_attestation_rechecked"
    | "offline_isolation_proof_recorded"
    | "role_independence_rechecked"
    | "observer_and_stop_controls_approved"
    | "sanitized_evidence_schema_approved"
    | "teardown_and_closeout_plan_approved"
    | "rehearsal_execution_remains_separate";
  label: string;
  owner: string;
  detail: string;
};

export const flightRehearsalPreflightControls: readonly FlightRehearsalPreflightControl[] = [
  {
    id: "authorization_scope_card",
    label: "Authorization scope card",
    owner: "Risk + Release approvers",
    readinessRequirement: "Define the future one-time authorization reference, approved fictional scenarios, fixed window, expiration, and non-delegation boundary.",
    nonExecutionBoundary: "Design cannot create, approve, extend, reuse, or satisfy an authorization or permit a rehearsal to start.",
  },
  {
    id: "fictional_fixture_manifest",
    label: "Fictional fixture manifest",
    owner: "Security + Privacy",
    readinessRequirement: "Define allowed invented identifiers, explicit synthetic labels, prohibited fields, contamination checks, retention, and deletion confirmation.",
    nonExecutionBoundary: "Design cannot create, upload, store, inspect, or approve a fixture or accept supplier, passenger, credential, fare, schedule, or availability data.",
  },
  {
    id: "offline_isolation_proof",
    label: "Offline isolation proof",
    owner: "Security + Engineering",
    readinessRequirement: "Define evidence that the future tabletop has no provider SDK, secret, endpoint, webhook, network request, external message, or Production dependency.",
    nonExecutionBoundary: "Design cannot connect to a provider, validate a credential, send a request, create a webhook, or enable Sandbox or Production traffic.",
  },
  {
    id: "role_check_in_plan",
    label: "Role check-in plan",
    owner: "Legal + Executive",
    readinessRequirement: "Define future role labels, independence checks, recusals, observer authority, stop ownership, closeout ownership, and release separation without naming participants.",
    nonExecutionBoundary: "Design cannot name, invite, authenticate, assign, notify, or delegate authority to any participant.",
  },
  {
    id: "scenario_control_cards",
    label: "Scenario control cards",
    owner: "Product + Risk",
    readinessRequirement: "Define the fictional input class, expected fail-closed response, observer checkpoint, severity, immediate stop trigger, and restart prohibition for each scenario.",
    nonExecutionBoundary: "Design cannot create a scenario instance, run a scenario, capture a result, record a finding, contact a supplier, or call an endpoint.",
  },
  {
    id: "sanitized_evidence_schema",
    label: "Sanitized evidence schema",
    owner: "Legal + Privacy",
    readinessRequirement: "Define allowed synthetic references, observed control outcomes, finding severity, dissent, remediation status, and explicit non-release language.",
    nonExecutionBoundary: "Design cannot create a receipt, database table, upload channel, log sink, message, or record containing supplier, passenger, credential, or commercial data.",
  },
  {
    id: "teardown_and_closeout_plan",
    label: "Teardown and closeout plan",
    owner: "Risk + Executive",
    readinessRequirement: "Define stop confirmation, fictional-fixture deletion, finding ownership, dissent resolution, evidence review, closeout, and no-downstream-authority confirmation.",
    nonExecutionBoundary: "Design cannot close a real finding, open evaluation intake, create a candidate, recommend or shortlist a supplier, accept a contract, or release traffic.",
  },
];

export const flightRehearsalPreflightSafeguards: readonly FlightRehearsalPreflightSafeguard[] = [
  {
    id: "authorization_prerequisite_lock",
    label: "Authorization prerequisite lock",
    owner: "Risk + Release approvers",
    safeguard: "Require the separately approved Phase 7 packet and one-time decision to exist before any future preflight review could begin.",
    failClosedBoundary: "Missing, expired, ambiguous, reusable, or out-of-scope authorization keeps preflight blocked and rehearsal execution prohibited.",
  },
  {
    id: "contamination_stop",
    label: "Real-data contamination stop",
    owner: "Security + Privacy",
    safeguard: "Require an immediate stop if any real supplier, passenger, credential, endpoint, schedule, fare, availability, or commercial information appears.",
    failClosedBoundary: "Any suspected contamination keeps the fixture prohibited, results unrecorded, and all progression blocked pending separate review.",
  },
  {
    id: "connectivity_stop",
    label: "Connectivity stop",
    owner: "Security + Engineering",
    safeguard: "Require an immediate stop if the future tabletop can resolve, call, message, authenticate to, or otherwise reach an external system.",
    failClosedBoundary: "Any external dependency keeps the preflight blocked and Sandbox, Production, ticketing, and payment capabilities disabled.",
  },
  {
    id: "role_conflict_stop",
    label: "Role-conflict stop",
    owner: "Legal + Executive",
    safeguard: "Require recusal and replacement when preparation, observation, risk concurrence, closeout, or release authority is not independent.",
    failClosedBoundary: "Missing separation or unresolved conflict keeps roles unassigned, the observer unassigned, and the rehearsal unrun.",
  },
  {
    id: "evidence_and_teardown_lock",
    label: "Evidence and teardown lock",
    owner: "Risk + Privacy",
    safeguard: "Require sanitized evidence review, fictional-fixture deletion, finding ownership, dissent handling, and explicit no-release closeout.",
    failClosedBoundary: "Missing teardown or unresolved findings keep evaluation intake closed and cannot authorize a candidate, recommendation, shortlist, contract, supplier, or traffic.",
  },
];

export const flightRehearsalPreflightGates: readonly FlightRehearsalPreflightGate[] = [
  { id: "phase_7_authorization_prerequisite_verified", label: "Phase 7 authorization prerequisite verified", owner: "Risk + Release approvers", detail: "Require a separately approved, current, one-time authorization reference before any future preflight review; this design records no authorization." },
  { id: "authorization_scope_bound", label: "Authorization scope bound", owner: "Legal + Risk", detail: "Bind the future review to one fictional fixture, six approved scenarios, a fixed window, explicit stop conditions, expiration, and no delegation." },
  { id: "fictional_fixture_manifest_approved", label: "Fictional fixture manifest approved", owner: "Security + Privacy", detail: "Approve invented-only fields, synthetic labels, prohibited content, contamination handling, retention, and deletion requirements without creating a fixture." },
  { id: "no_real_data_attestation_rechecked", label: "No-real-data attestation rechecked", owner: "Security + Commercial", detail: "Require independent reconfirmation that no supplier, passenger, credential, endpoint, schedule, fare, availability, quote, or commercial data is present." },
  { id: "offline_isolation_proof_recorded", label: "Offline isolation proof recorded", owner: "Security + Engineering", detail: "Require proof that the future tabletop has no provider SDK, secret, network path, webhook, external message, Sandbox traffic, or Production dependency." },
  { id: "role_independence_rechecked", label: "Role independence rechecked", owner: "Legal + Executive", detail: "Require independent future preparation, observation, risk, closeout, and release roles plus conflict and recusal handling without naming anyone here." },
  { id: "observer_and_stop_controls_approved", label: "Observer and stop controls approved", owner: "Product + Risk", detail: "Approve scenario checkpoints, expected fail-closed outcomes, severity, observer authority, immediate stop triggers, and restart prohibition." },
  { id: "sanitized_evidence_schema_approved", label: "Sanitized evidence schema approved", owner: "Legal + Privacy", detail: "Approve only synthetic references, observed control outcomes, findings, dissent, remediation, deletion confirmation, and no-release language." },
  { id: "teardown_and_closeout_plan_approved", label: "Teardown and closeout plan approved", owner: "Risk + Executive", detail: "Approve fictional-fixture deletion, finding ownership, remediation evidence, dissent resolution, closeout review, and no-downstream-authority confirmation." },
  { id: "rehearsal_execution_remains_separate", label: "Rehearsal execution remains separately controlled", owner: "Release approvers", detail: "Require a new action outside this design before creating a fixture, assigning roles, running one scenario, or recording one result, receipt, or finding." },
];

export type FlightRehearsalPreflightEvidence = Partial<Record<FlightRehearsalPreflightGate["id"], boolean>>;

export function buildFlightRehearsalPreflightDesign(evidence: FlightRehearsalPreflightEvidence = {}) {
  const gates = flightRehearsalPreflightGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_REHEARSAL_PREFLIGHT_MODE,
    planState: "design_only" as const,
    preflightState: "blocked" as const,
    authorizationPrerequisiteState: "not_satisfied" as const,
    authorizationReferenceState: "not_recorded" as const,
    scopeBindingState: "not_recorded" as const,
    fixtureManifestState: "not_created" as const,
    isolationProofState: "not_recorded" as const,
    roleAssignmentState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    rehearsalState: "not_run" as const,
    syntheticFixtureState: "not_created" as const,
    scenarioResultCount: 0,
    receiptState: "not_created" as const,
    findingCount: 0,
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
    preflightPlanComplete: completedCount === gates.length,
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
