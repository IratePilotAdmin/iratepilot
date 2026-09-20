export const FLIGHT_SUPPLIER_EVALUATION_GOVERNANCE_MODE = "evaluation_governance_only" as const;

export type FlightEvaluationControl = {
  id:
    | "provenance"
    | "freshness"
    | "comparable_scope"
    | "confidentiality"
    | "reviewer_independence"
    | "exception_handling";
  label: string;
  owner: string;
  requiredRule: string;
  safetyBoundary: string;
};

export type FlightEvaluationDecisionSafeguard = {
  id:
    | "admissibility_record"
    | "scoring_separation"
    | "conflict_record"
    | "exception_concurrence"
    | "recommendation_authority";
  label: string;
  owner: string;
  recordRule: string;
  activationBoundary: string;
};

export type FlightEvaluationGovernanceGate = {
  id:
    | "evaluation_policy_approved"
    | "evidence_standard_approved"
    | "handling_standard_approved"
    | "reviewer_roles_approved"
    | "conflict_process_approved"
    | "comparability_method_approved"
    | "exception_process_approved"
    | "decision_template_approved"
    | "recommendation_boundary_approved"
    | "named_evaluation_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationControls: readonly FlightEvaluationControl[] = [
  {
    id: "provenance",
    label: "Evidence provenance",
    owner: "Legal + Commercial",
    requiredRule: "Require attributable source, collection date, scope, and authorized business context for every future evidence item.",
    safetyBoundary: "Control only; no supplier identity, document, response, representation, or relationship is recorded.",
  },
  {
    id: "freshness",
    label: "Evidence freshness",
    owner: "Commercial + Product",
    requiredRule: "Define review windows and revalidation triggers for coverage, economics, servicing, security, and technical claims.",
    safetyBoundary: "Control only; no current coverage, price, availability, certification, or service claim is accepted.",
  },
  {
    id: "comparable_scope",
    label: "Comparable evaluation scope",
    owner: "Product + Commercial",
    requiredRule: "Use the same target markets, capabilities, assumptions, exclusions, and scoring evidence for every future candidate.",
    safetyBoundary: "Control only; no candidate, score, ranking, shortlist, recommendation, or selection is created.",
  },
  {
    id: "confidentiality",
    label: "Confidentiality and data handling",
    owner: "Security + Privacy",
    requiredRule: "Define classification, approved handling, access, retention, deletion, and redaction before evidence receipt is considered.",
    safetyBoundary: "Control only; no upload, storage, passenger data, credential, secret, webhook, or access grant exists.",
  },
  {
    id: "reviewer_independence",
    label: "Reviewer independence",
    owner: "Legal + Executive",
    requiredRule: "Separate evidence collection, scoring, risk review, commercial recommendation, and final authorization responsibilities.",
    safetyBoundary: "Control only; no reviewer assignment, approval, delegated authority, or external communication is made.",
  },
  {
    id: "exception_handling",
    label: "Exception handling",
    owner: "Risk + Legal",
    requiredRule: "Require a documented owner, rationale, expiry, compensating control, and independent concurrence for every future exception.",
    safetyBoundary: "Control only; no exception, waiver, contract term, credential, traffic, ticketing, or payment is authorized.",
  },
];

export const flightEvaluationDecisionSafeguards: readonly FlightEvaluationDecisionSafeguard[] = [
  {
    id: "admissibility_record",
    label: "Evidence admissibility record",
    owner: "Legal + Commercial",
    recordRule: "Record only whether future evidence meets approved provenance, freshness, scope, and handling standards.",
    activationBoundary: "Record design cannot receive evidence or create a supplier evaluation case.",
  },
  {
    id: "scoring_separation",
    label: "Scoring separation",
    owner: "Product + Risk",
    recordRule: "Keep evidence review, weighted scoring, risk exceptions, and commercial recommendation as distinct future decisions.",
    activationBoundary: "Record design cannot calculate a score, rank a candidate, or create a shortlist.",
  },
  {
    id: "conflict_record",
    label: "Conflict and independence record",
    owner: "Legal + Executive",
    recordRule: "Require future reviewers and decision owners to disclose conflicts and record recusal or mitigation before participation.",
    activationBoundary: "Record design cannot assign a reviewer, approve a mitigation, or delegate authority.",
  },
  {
    id: "exception_concurrence",
    label: "Exception concurrence record",
    owner: "Risk + Security + Legal",
    recordRule: "Require separately owned concurrence and expiry for any future deviation from evidence, security, privacy, or legal standards.",
    activationBoundary: "Record design cannot grant an exception or weaken an activation gate.",
  },
  {
    id: "recommendation_authority",
    label: "Recommendation authority record",
    owner: "Commercial + Executive",
    recordRule: "Separate a future commercial recommendation from shortlist approval, contract approval, supplier selection, and release authorization.",
    activationBoundary: "Record design cannot issue a recommendation, accept a contract, select a supplier, or authorize implementation.",
  },
];

export const flightEvaluationGovernanceGates: readonly FlightEvaluationGovernanceGate[] = [
  { id: "evaluation_policy_approved", label: "Evaluation policy approved", owner: "Product + Commercial", detail: "Approve the neutral evaluation purpose, scope, exclusions, terminology, and decision boundaries before any named review." },
  { id: "evidence_standard_approved", label: "Evidence standard approved", owner: "Legal + Commercial", detail: "Approve provenance, attribution, freshness, completeness, comparability, and revalidation requirements." },
  { id: "handling_standard_approved", label: "Handling standard approved", owner: "Security + Privacy", detail: "Approve classification, access, retention, deletion, redaction, and prohibited-data handling before evidence intake can be considered." },
  { id: "reviewer_roles_approved", label: "Reviewer roles approved", owner: "Executive", detail: "Approve separate evidence, product, commercial, legal, finance, operations, security, privacy, risk, and release responsibilities." },
  { id: "conflict_process_approved", label: "Conflict process approved", owner: "Legal", detail: "Approve disclosure, recusal, mitigation, and independent-review rules for future evaluation participants." },
  { id: "comparability_method_approved", label: "Comparability method approved", owner: "Product + Commercial", detail: "Approve common target markets, capability assumptions, exclusions, evidence windows, and scoring treatment." },
  { id: "exception_process_approved", label: "Exception process approved", owner: "Risk + Legal", detail: "Approve ownership, rationale, expiry, compensating controls, concurrence, and re-review for future exceptions." },
  { id: "decision_template_approved", label: "Decision template approved", owner: "Legal + Executive", detail: "Approve the future admissibility, scoring, conflict, exception, recommendation, and dissent record structure." },
  { id: "recommendation_boundary_approved", label: "Recommendation boundary approved", owner: "Commercial + Executive", detail: "Approve separation between a future recommendation, shortlist, contract, supplier selection, implementation, and release." },
  { id: "named_evaluation_separately_authorized", label: "Named evaluation separately authorized", owner: "Release approvers", detail: "Require a new explicit approval before creating a candidate record, receiving supplier evidence, or beginning a named evaluation." },
];

export type FlightEvaluationGovernanceEvidence = Partial<Record<FlightEvaluationGovernanceGate["id"], boolean>>;

export function buildFlightEvaluationGovernance(evidence: FlightEvaluationGovernanceEvidence = {}) {
  const gates = flightEvaluationGovernanceGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_SUPPLIER_EVALUATION_GOVERNANCE_MODE,
    intakeState: "closed" as const,
    candidateState: "not_recorded" as const,
    candidateCount: 0,
    evaluationCaseState: "not_created" as const,
    evidenceItemCount: 0,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    governanceComplete: completedCount === gates.length,
    credentialsAccepted: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
