export const FLIGHT_REHEARSAL_AUTHORIZATION_MODE = "rehearsal_authorization_readiness_only" as const;

export type FlightRehearsalAuthorizationArtifact = {
  id:
    | "policy_baseline"
    | "fictional_fixture_standard"
    | "prohibited_data_attestation"
    | "role_independence_matrix"
    | "scenario_and_stop_plan"
    | "closeout_and_release_record";
  label: string;
  owner: string;
  requiredDecision: string;
  activationBoundary: string;
};

export type FlightRehearsalAuthorizationSafeguard = {
  id:
    | "no_real_data"
    | "no_external_connectivity"
    | "role_separation"
    | "single_rehearsal_scope"
    | "findings_before_progression";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightRehearsalAuthorizationGate = {
  id:
    | "rehearsal_policy_recorded"
    | "fixture_standard_recorded"
    | "no_real_data_attestation_recorded"
    | "no_external_connectivity_attestation_recorded"
    | "role_independence_recorded"
    | "scenario_scope_recorded"
    | "observer_and_stop_plan_recorded"
    | "receipt_standard_recorded"
    | "closeout_process_recorded"
    | "one_time_execution_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const flightRehearsalAuthorizationArtifacts: readonly FlightRehearsalAuthorizationArtifact[] = [
  {
    id: "policy_baseline",
    label: "Synthetic rehearsal policy",
    owner: "Product + Legal",
    requiredDecision: "Approve the internal tabletop purpose, fictional-only scope, prohibited actions, stop conditions, and expiration of any future one-time authorization.",
    activationBoundary: "Policy design cannot authorize a rehearsal, create a fixture, assign a person, or open supplier evaluation intake.",
  },
  {
    id: "fictional_fixture_standard",
    label: "Fictional fixture standard",
    owner: "Security + Privacy",
    requiredDecision: "Approve labeling, construction, review, access, retention, and deletion rules for a future fixture made entirely from invented data.",
    activationBoundary: "Standard design cannot create or store a fixture and cannot accept supplier, passenger, credential, endpoint, schedule, fare, or availability data.",
  },
  {
    id: "prohibited_data_attestation",
    label: "Prohibited-data attestation",
    owner: "Security + Commercial",
    requiredDecision: "Require independent confirmation that no real supplier identity, relationship, material, representation, quote, passenger record, secret, or commercial data is present.",
    activationBoundary: "Attestation design cannot inspect, receive, upload, retain, or approve any real supplier or passenger material.",
  },
  {
    id: "role_independence_matrix",
    label: "Role-independence matrix",
    owner: "Legal + Executive",
    requiredDecision: "Separate fixture preparation, control observation, risk concurrence, recommendation authority, closeout, and release responsibilities.",
    activationBoundary: "Matrix design cannot name, invite, assign, authenticate, or delegate authority to a participant.",
  },
  {
    id: "scenario_and_stop_plan",
    label: "Scenario and stop plan",
    owner: "Product + Risk",
    requiredDecision: "Map each fictional scenario to its expected fail-closed response, observer evidence, stop trigger, severity, and restart prohibition.",
    activationBoundary: "Plan design cannot run a scenario, capture a result, send a message, contact a supplier, or call an external endpoint.",
  },
  {
    id: "closeout_and_release_record",
    label: "Closeout and release record",
    owner: "Risk + Release approvers",
    requiredDecision: "Define sanitized findings, dissent, remediation ownership, evidence review, closure, and the explicit decision that rehearsal completion grants no downstream authority.",
    activationBoundary: "Record design cannot close a real finding, authorize named evaluation, create a shortlist, accept a contract, select a supplier, or release traffic.",
  },
];

export const flightRehearsalAuthorizationSafeguards: readonly FlightRehearsalAuthorizationSafeguard[] = [
  {
    id: "no_real_data",
    label: "Fictional data only",
    owner: "Security + Privacy",
    safeguard: "Require an independently reviewed no-real-data attestation before any future one-time rehearsal decision.",
    failClosedBoundary: "Missing or uncertain attestation keeps authorization unrecorded and fixture creation prohibited.",
  },
  {
    id: "no_external_connectivity",
    label: "No external connectivity",
    owner: "Security + Engineering",
    safeguard: "Require proof that the future tabletop path has no provider SDK, secret, webhook, network request, supplier endpoint, or external message.",
    failClosedBoundary: "Any external dependency keeps the rehearsal blocked and all supplier traffic disabled.",
  },
  {
    id: "role_separation",
    label: "Independent roles",
    owner: "Legal + Executive",
    safeguard: "Require separately accountable preparer, reviewers, observer, risk owner, and release decision owner with conflict handling.",
    failClosedBoundary: "Missing separation or unresolved conflict keeps role assignment and rehearsal execution prohibited.",
  },
  {
    id: "single_rehearsal_scope",
    label: "One-time bounded scope",
    owner: "Risk + Release approvers",
    safeguard: "Limit any future authorization to one identified synthetic fixture, six approved scenarios, a fixed window, and explicit stop conditions.",
    failClosedBoundary: "No standing, reusable, scheduled, delegated, or Production authorization can be created by this design.",
  },
  {
    id: "findings_before_progression",
    label: "Findings before progression",
    owner: "Risk + Executive",
    safeguard: "Require sanitized findings, dissent, remediation, and closeout review before any later named-evaluation decision is considered.",
    failClosedBoundary: "Rehearsal completion cannot open intake, create a candidate, calculate a score, recommend, shortlist, contract, select, implement, or release.",
  },
];

export const flightRehearsalAuthorizationGates: readonly FlightRehearsalAuthorizationGate[] = [
  { id: "rehearsal_policy_recorded", label: "Rehearsal policy recorded", owner: "Product + Legal", detail: "Record the synthetic-only purpose, scope, terminology, prohibited actions, stop conditions, expiration, and non-authorizing closeout statement." },
  { id: "fixture_standard_recorded", label: "Fictional fixture standard recorded", owner: "Security + Privacy", detail: "Record invented-data construction, labeling, access, review, retention, deletion, and contamination-response requirements." },
  { id: "no_real_data_attestation_recorded", label: "No-real-data attestation recorded", owner: "Security + Commercial", detail: "Require independent attestation that no supplier, passenger, credential, endpoint, schedule, fare, availability, or commercial data is present." },
  { id: "no_external_connectivity_attestation_recorded", label: "No-connectivity attestation recorded", owner: "Security + Engineering", detail: "Require proof that the future tabletop has no provider SDK, secret, webhook, network request, external message, or supplier endpoint." },
  { id: "role_independence_recorded", label: "Role independence recorded", owner: "Legal + Executive", detail: "Record separate future preparation, review, observation, risk, closeout, and release roles plus conflict and recusal rules." },
  { id: "scenario_scope_recorded", label: "Scenario scope recorded", owner: "Product + Risk", detail: "Record the six fictional scenarios, expected fail-closed responses, evidence criteria, prohibited deviations, and scenario-level stop triggers." },
  { id: "observer_and_stop_plan_recorded", label: "Observer and stop plan recorded", owner: "Risk + Release approvers", detail: "Record independent observer criteria, finding severity, immediate stop triggers, contamination handling, and restart prohibition." },
  { id: "receipt_standard_recorded", label: "Sanitized receipt standard recorded", owner: "Legal + Privacy", detail: "Record only allowed synthetic identifiers, observed control outcomes, findings, dissent, remediation status, and non-release boundary." },
  { id: "closeout_process_recorded", label: "Closeout process recorded", owner: "Risk + Executive", detail: "Record finding ownership, remediation evidence, dissent resolution, closeout review, deletion confirmation, and no-downstream-authority decision." },
  { id: "one_time_execution_separately_authorized", label: "One-time rehearsal separately authorized", owner: "Release approvers", detail: "Require a new explicit decision outside this software phase before creating a fixture, assigning roles, running one scenario, or recording one result." },
];

export type FlightRehearsalAuthorizationEvidence = Partial<Record<FlightRehearsalAuthorizationGate["id"], boolean>>;

export function buildFlightRehearsalAuthorizationReadiness(evidence: FlightRehearsalAuthorizationEvidence = {}) {
  const gates = flightRehearsalAuthorizationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_REHEARSAL_AUTHORIZATION_MODE,
    packetState: "design_only" as const,
    authorizationState: "not_recorded" as const,
    policyState: "not_recorded" as const,
    fixtureStandardState: "not_recorded" as const,
    attestationState: "not_recorded" as const,
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
    authorizationPacketComplete: completedCount === gates.length,
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
