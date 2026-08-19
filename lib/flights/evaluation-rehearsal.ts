export const FLIGHT_SUPPLIER_EVALUATION_REHEARSAL_MODE = "synthetic_rehearsal_design_only" as const;

export type FlightEvaluationRehearsalScenario = {
  id:
    | "provenance_rejection"
    | "freshness_revalidation"
    | "scope_mismatch"
    | "conflict_recusal"
    | "exception_concurrence"
    | "recommendation_boundary";
  label: string;
  owner: string;
  rehearsalObjective: string;
  safetyBoundary: string;
};

export type FlightEvaluationRehearsalReceipt = {
  id:
    | "fixture_attestation"
    | "role_separation"
    | "scenario_outcome"
    | "exception_and_dissent"
    | "release_boundary";
  label: string;
  owner: string;
  receiptRule: string;
  activationBoundary: string;
};

export type FlightEvaluationRehearsalGate = {
  id:
    | "rehearsal_policy_approved"
    | "synthetic_fixture_standard_approved"
    | "no_real_supplier_data_attested"
    | "reviewer_roles_separated"
    | "rejection_scenarios_mapped"
    | "recusal_scenario_mapped"
    | "exception_scenario_mapped"
    | "recommendation_boundary_mapped"
    | "observer_checklist_approved"
    | "rehearsal_execution_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationRehearsalScenarios: readonly FlightEvaluationRehearsalScenario[] = [
  {
    id: "provenance_rejection",
    label: "Evidence provenance rejection",
    owner: "Legal + Commercial",
    rehearsalObjective: "Prove that a fictional evidence item without an attributable source, collection date, scope, and authorized context is rejected.",
    safetyBoundary: "Synthetic rehearsal only; no supplier identity, document, response, representation, or relationship is received.",
  },
  {
    id: "freshness_revalidation",
    label: "Freshness revalidation",
    owner: "Commercial + Product",
    rehearsalObjective: "Prove that an expired fictional coverage or servicing claim is held for revalidation instead of being scored.",
    safetyBoundary: "Synthetic rehearsal only; no current coverage, price, schedule, availability, certification, or service claim is accepted.",
  },
  {
    id: "scope_mismatch",
    label: "Comparable-scope rejection",
    owner: "Product + Risk",
    rehearsalObjective: "Prove that fictional candidates using different markets, assumptions, exclusions, or evidence windows cannot be compared or ranked.",
    safetyBoundary: "Synthetic rehearsal only; no candidate, score, ranking, shortlist, recommendation, or selection is created.",
  },
  {
    id: "conflict_recusal",
    label: "Reviewer conflict and recusal",
    owner: "Legal + Executive",
    rehearsalObjective: "Prove that a fictional reviewer conflict pauses participation and requires documented recusal or independently approved mitigation.",
    safetyBoundary: "Synthetic rehearsal only; no reviewer is assigned, no mitigation is approved, and no authority is delegated.",
  },
  {
    id: "exception_concurrence",
    label: "Exception concurrence",
    owner: "Risk + Security + Legal",
    rehearsalObjective: "Prove that a fictional exception without an owner, rationale, expiry, compensating control, and independent concurrence is rejected.",
    safetyBoundary: "Synthetic rehearsal only; no exception, waiver, contract term, credential, traffic, ticketing, or payment is authorized.",
  },
  {
    id: "recommendation_boundary",
    label: "Recommendation authority boundary",
    owner: "Commercial + Executive",
    rehearsalObjective: "Prove that a fictional recommendation cannot create a shortlist, accept a contract, select a supplier, or authorize implementation or release.",
    safetyBoundary: "Synthetic rehearsal only; no recommendation, shortlist, contract, supplier selection, or release decision is issued.",
  },
];

export const flightEvaluationRehearsalReceipts: readonly FlightEvaluationRehearsalReceipt[] = [
  {
    id: "fixture_attestation",
    label: "Synthetic-fixture attestation",
    owner: "Security + Privacy",
    receiptRule: "Attest that every future rehearsal input is fictional, contains no supplier or passenger data, and is approved for internal tabletop use.",
    activationBoundary: "Receipt design cannot create a fixture, receive supplier material, or accept passenger data.",
  },
  {
    id: "role_separation",
    label: "Role-separation receipt",
    owner: "Legal + Executive",
    receiptRule: "Record future rehearsal participation by role while keeping evidence review, risk concurrence, recommendation, and release ownership separate.",
    activationBoundary: "Receipt design cannot assign a person, approve a conflict mitigation, or delegate decision authority.",
  },
  {
    id: "scenario_outcome",
    label: "Scenario-outcome receipt",
    owner: "Product + Risk",
    receiptRule: "Record only the future synthetic scenario identifier, expected control response, observed control response, and sanitized finding.",
    activationBoundary: "Receipt design cannot run a scenario, store evidence, calculate a supplier score, or rank a candidate.",
  },
  {
    id: "exception_and_dissent",
    label: "Exception-and-dissent receipt",
    owner: "Risk + Legal",
    receiptRule: "Keep future exception concurrence, dissent, expiry, and re-review outcomes distinct from evidence, scoring, and recommendation records.",
    activationBoundary: "Receipt design cannot grant an exception, override a dissent, or weaken an activation gate.",
  },
  {
    id: "release_boundary",
    label: "Release-boundary receipt",
    owner: "Executive + Release approvers",
    receiptRule: "Confirm that future rehearsal completion is separate from named evaluation, shortlist, contract, selection, credential, implementation, and release decisions.",
    activationBoundary: "Receipt design cannot authorize a named evaluation, supplier selection, implementation, or Production release.",
  },
];

export const flightEvaluationRehearsalGates: readonly FlightEvaluationRehearsalGate[] = [
  { id: "rehearsal_policy_approved", label: "Rehearsal policy approved", owner: "Product + Legal", detail: "Approve the synthetic tabletop purpose, scope, terminology, prohibited data, expected control responses, and stop conditions." },
  { id: "synthetic_fixture_standard_approved", label: "Synthetic fixture standard approved", owner: "Security + Privacy", detail: "Approve fictional fixture construction, labeling, access, retention, deletion, and proof that no real supplier or passenger data is present." },
  { id: "no_real_supplier_data_attested", label: "No real supplier data attested", owner: "Security + Commercial", detail: "Require a separate attestation that the future rehearsal contains no supplier identity, document, response, quote, credential, endpoint, or representation." },
  { id: "reviewer_roles_separated", label: "Reviewer roles separated", owner: "Executive", detail: "Approve distinct future evidence, product, commercial, legal, security, privacy, risk, observer, and release roles without naming participants here." },
  { id: "rejection_scenarios_mapped", label: "Evidence rejection scenarios mapped", owner: "Product + Legal", detail: "Approve the fictional provenance, freshness, and comparable-scope scenarios and their expected fail-closed outcomes." },
  { id: "recusal_scenario_mapped", label: "Conflict and recusal scenario mapped", owner: "Legal + Executive", detail: "Approve a fictional conflict scenario that pauses review until recusal or independent mitigation is recorded." },
  { id: "exception_scenario_mapped", label: "Exception concurrence scenario mapped", owner: "Risk + Security + Legal", detail: "Approve a fictional exception scenario that fails without ownership, expiry, compensating controls, and independent concurrence." },
  { id: "recommendation_boundary_mapped", label: "Recommendation boundary scenario mapped", owner: "Commercial + Executive", detail: "Approve a fictional recommendation scenario that cannot create a shortlist, accept a contract, select a supplier, or authorize release." },
  { id: "observer_checklist_approved", label: "Observer checklist approved", owner: "Risk + Release approvers", detail: "Approve the future sanitized observation checklist, finding severity, stop conditions, evidence standard, and closeout decision format." },
  { id: "rehearsal_execution_separately_authorized", label: "Synthetic rehearsal separately authorized", owner: "Release approvers", detail: "Require a new explicit approval before creating a fictional fixture, assigning rehearsal roles, running a scenario, or recording a sanitized result." },
];

export type FlightEvaluationRehearsalEvidence = Partial<Record<FlightEvaluationRehearsalGate["id"], boolean>>;

export function buildFlightEvaluationRehearsal(evidence: FlightEvaluationRehearsalEvidence = {}) {
  const gates = flightEvaluationRehearsalGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_SUPPLIER_EVALUATION_REHEARSAL_MODE,
    planState: "design_only" as const,
    rehearsalState: "not_run" as const,
    syntheticFixtureState: "not_created" as const,
    scenarioResultCount: 0,
    receiptState: "not_created" as const,
    receiptCount: 0,
    observerState: "not_assigned" as const,
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
    rehearsalPlanComplete: completedCount === gates.length,
    realSupplierDataAccepted: false,
    credentialsAccepted: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
