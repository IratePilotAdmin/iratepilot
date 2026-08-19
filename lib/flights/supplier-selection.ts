export const FLIGHT_SUPPLIER_SELECTION_MODE = "planning_only" as const;

export type FlightSupplierSelectionCriterion = {
  id:
    | "content_coverage"
    | "shopping_quality"
    | "ticketing_authority"
    | "servicing_depth"
    | "commercial_fit"
    | "security_privacy"
    | "operational_support";
  label: string;
  weight: number;
  owner: string;
  questions: readonly string[];
};

export type FlightSandboxAdapterOperation = {
  id: "shopping" | "price_confirmation" | "order_draft" | "servicing_quote";
  label: string;
  contract: string;
  safetyBoundary: string;
};

export type FlightSupplierDecisionGate = {
  id:
    | "rubric_approved"
    | "candidate_evidence_collected"
    | "commercial_shortlist_approved"
    | "legal_authority_approved"
    | "security_architecture_approved"
    | "sandbox_contract_mapped"
    | "credential_channel_approved"
    | "adapter_build_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const flightSupplierSelectionCriteria: readonly FlightSupplierSelectionCriterion[] = [
  {
    id: "content_coverage",
    label: "Content coverage",
    weight: 20,
    owner: "Commercial",
    questions: ["Target carriers and markets", "Schedule and fare breadth", "Fallback and content parity"],
  },
  {
    id: "shopping_quality",
    label: "Shopping quality",
    weight: 15,
    owner: "Product + Engineering",
    questions: ["Taxes and baggage disclosure", "Fare rules and repricing", "Latency, limits, and freshness"],
  },
  {
    id: "ticketing_authority",
    label: "Ticketing authority",
    weight: 15,
    owner: "Legal + Finance",
    questions: ["Issuing and settlement model", "Void, exchange, and refund authority", "Accreditation responsibilities"],
  },
  {
    id: "servicing_depth",
    label: "Servicing depth",
    weight: 20,
    owner: "Operations",
    questions: ["Schedule-change workflows", "Voluntary exchanges and cancellations", "Refund and unused-ticket handling"],
  },
  {
    id: "commercial_fit",
    label: "Commercial fit",
    weight: 10,
    owner: "Commercial + Finance",
    questions: ["Fees and minimum commitments", "Markup and incentive terms", "Reconciliation and liability"],
  },
  {
    id: "security_privacy",
    label: "Security and privacy",
    weight: 10,
    owner: "Security + Privacy",
    questions: ["Passenger-data controls", "Credential and webhook security", "Retention and incident response"],
  },
  {
    id: "operational_support",
    label: "Operational support",
    weight: 10,
    owner: "Operations + Support",
    questions: ["24/7 disruption coverage", "Provider escalation targets", "Outage and rollback coordination"],
  },
];

export const flightSandboxAdapterOperations: readonly FlightSandboxAdapterOperation[] = [
  {
    id: "shopping",
    label: "Shopping request",
    contract: "Normalize route, dates, cabin, travelers, and point of sale into a provider-neutral request.",
    safetyBoundary: "Design only; no endpoint, credential, request, schedule, fare, or availability data.",
  },
  {
    id: "price_confirmation",
    label: "Price confirmation",
    contract: "Define a provider-neutral reprice response with taxes, baggage, fare rules, and expiration.",
    safetyBoundary: "Design only; it cannot quote, reserve, charge, or guarantee a fare.",
  },
  {
    id: "order_draft",
    label: "Order draft",
    contract: "Define idempotency, traveler validation, and reconciliation fields before any order can exist.",
    safetyBoundary: "Design only; order creation, ticket issuance, settlement, and payment remain absent.",
  },
  {
    id: "servicing_quote",
    label: "Servicing quote",
    contract: "Define read-only exchange, cancellation, refund, and schedule-change quote shapes.",
    safetyBoundary: "Design only; it cannot accept, ticket, exchange, cancel, refund, or notify a traveler.",
  },
];

export const flightSupplierDecisionGates: readonly FlightSupplierDecisionGate[] = [
  { id: "rubric_approved", label: "Selection rubric approved", owner: "Product + Commercial", detail: "Approve the weighted criteria and evidence standard before evaluating a named supplier." },
  { id: "candidate_evidence_collected", label: "Candidate evidence collected", owner: "Commercial", detail: "Collect comparable, attributable evidence without recording credentials or implying selection." },
  { id: "commercial_shortlist_approved", label: "Commercial shortlist approved", owner: "Commercial + Finance", detail: "Record a shortlist only after coverage, fees, commitments, settlement, and liability are reviewed." },
  { id: "legal_authority_approved", label: "Legal and ticketing authority approved", owner: "Legal", detail: "Approve content rights, accreditation, issuing authority, servicing responsibilities, and contract terms." },
  { id: "security_architecture_approved", label: "Security architecture approved", owner: "Security + Privacy", detail: "Approve passenger-data flows, secret handling, webhook verification, retention, and incident response." },
  { id: "sandbox_contract_mapped", label: "Sandbox contract mapped", owner: "Engineering", detail: "Map the provider contract to the four inert adapter operations without implementing network access." },
  { id: "credential_channel_approved", label: "Credential channel approved", owner: "Security", detail: "Approve a secure sandbox-only delivery and rotation process before accepting any credential." },
  { id: "adapter_build_authorized", label: "Adapter build separately authorized", owner: "Release approvers", detail: "Require a new approval before adding endpoints, secrets, provider SDKs, database state, or sandbox traffic." },
];

export type FlightSupplierDecisionEvidence = Partial<Record<FlightSupplierDecisionGate["id"], boolean>>;

export function buildFlightSupplierSelectionPlan(evidence: FlightSupplierDecisionEvidence = {}) {
  const gates = flightSupplierDecisionGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_SUPPLIER_SELECTION_MODE,
    selectionState: "not_selected" as const,
    candidateCount: 0,
    gates,
    completedCount,
    totalCount: gates.length,
    planningComplete: completedCount === gates.length,
    credentialsAccepted: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
