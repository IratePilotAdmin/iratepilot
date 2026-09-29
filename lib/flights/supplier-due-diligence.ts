export const FLIGHT_SUPPLIER_DUE_DILIGENCE_MODE = "due_diligence_only" as const;

export type FlightSupplierEvidenceWorkstream = {
  id:
    | "corporate_authority"
    | "content_coverage"
    | "commercial_economics"
    | "ticketing_settlement"
    | "servicing_support"
    | "security_privacy"
    | "technical_sandbox";
  label: string;
  owner: string;
  requiredEvidence: readonly string[];
  safetyBoundary: string;
};

export type FlightSupplierContractLane = {
  id:
    | "content_rights"
    | "issuing_authority"
    | "economics_settlement"
    | "servicing_refunds"
    | "data_security"
    | "service_exit";
  label: string;
  owner: string;
  reviewScope: string;
  activationBoundary: string;
};

export type FlightSupplierDiligenceGate = {
  id:
    | "evaluation_packet_approved"
    | "candidate_identity_verified"
    | "coverage_evidence_reviewed"
    | "commercial_terms_reviewed"
    | "authority_settlement_approved"
    | "servicing_support_approved"
    | "security_privacy_approved"
    | "contract_package_approved"
    | "selection_separately_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const flightSupplierEvidenceWorkstreams: readonly FlightSupplierEvidenceWorkstream[] = [
  {
    id: "corporate_authority",
    label: "Corporate identity and authority",
    owner: "Legal + Commercial",
    requiredEvidence: ["Legal entity and contracting authority", "Content-distribution rights", "Accreditation and issuing responsibilities"],
    safetyBoundary: "Requirement only; no supplier identity, document, representation, or approval is stored.",
  },
  {
    id: "content_coverage",
    label: "Content and market coverage",
    owner: "Commercial + Product",
    requiredEvidence: ["Carrier and geography matrix", "Schedule and fare-source coverage", "Fallback and content-parity limits"],
    safetyBoundary: "Requirement only; no airline relationship, schedule, fare, availability, or parity claim is recorded.",
  },
  {
    id: "commercial_economics",
    label: "Commercial economics",
    owner: "Commercial + Finance",
    requiredEvidence: ["Setup, transaction, and servicing fees", "Minimum commitments and incentives", "Reconciliation, dispute, and liability terms"],
    safetyBoundary: "Requirement only; no quote, negotiated term, commitment, forecast, or financial approval is stored.",
  },
  {
    id: "ticketing_settlement",
    label: "Ticketing and settlement",
    owner: "Legal + Finance",
    requiredEvidence: ["Issuing and settlement model", "Void, exchange, and refund authority", "Chargeback, debit-memo, and remittance ownership"],
    safetyBoundary: "Requirement only; no ticketing authority, payment path, settlement account, or money movement is enabled.",
  },
  {
    id: "servicing_support",
    label: "Servicing and disruption support",
    owner: "Operations + Support",
    requiredEvidence: ["Schedule-change and irregular-operations coverage", "Exchange, cancellation, and refund workflows", "Escalation targets and round-the-clock ownership"],
    safetyBoundary: "Requirement only; no traveler case, notification, exchange, cancellation, or refund can be created.",
  },
  {
    id: "security_privacy",
    label: "Security and passenger-data privacy",
    owner: "Security + Privacy",
    requiredEvidence: ["Passenger-data flow and retention model", "Credential and webhook controls", "Access, audit, incident, and deletion procedures"],
    safetyBoundary: "Requirement only; no passenger data, credential, secret, webhook, access grant, or security artifact is accepted.",
  },
  {
    id: "technical_sandbox",
    label: "Technical sandbox readiness",
    owner: "Engineering + Security",
    requiredEvidence: ["Sandbox endpoint and version policy", "Rate limits, idempotency, and error semantics", "Certification, support, and rollback process"],
    safetyBoundary: "Requirement only; no endpoint, SDK, credential, adapter, request, response, or network traffic exists.",
  },
];

export const flightSupplierContractLanes: readonly FlightSupplierContractLane[] = [
  {
    id: "content_rights",
    label: "Content rights and permitted use",
    owner: "Legal + Commercial",
    reviewScope: "Distribution rights, display obligations, caching, brand rules, data use, and downstream restrictions.",
    activationBoundary: "Review cannot claim inventory rights or authorize airline content.",
  },
  {
    id: "issuing_authority",
    label: "Issuing authority and accreditation",
    owner: "Legal + Finance",
    reviewScope: "Agency roles, validating carrier, ticket issuance, accreditation, debit memos, and regulatory responsibilities.",
    activationBoundary: "Review cannot issue a ticket or represent iRatePilot as accredited.",
  },
  {
    id: "economics_settlement",
    label: "Economics and settlement",
    owner: "Commercial + Finance",
    reviewScope: "Fees, commitments, incentives, settlement timing, taxes, reconciliation, reserves, disputes, and liability.",
    activationBoundary: "Review cannot accept a commercial term or enable collection, settlement, or payout.",
  },
  {
    id: "servicing_refunds",
    label: "Servicing, exchanges, and refunds",
    owner: "Operations + Legal",
    reviewScope: "Schedule changes, exchanges, cancellations, refunds, unused tickets, traveler notices, and escalation ownership.",
    activationBoundary: "Review cannot service an itinerary or communicate with a traveler.",
  },
  {
    id: "data_security",
    label: "Passenger data and security",
    owner: "Security + Privacy",
    reviewScope: "Data roles, retention, subprocessors, encryption, credentials, webhooks, audits, incidents, and deletion.",
    activationBoundary: "Review cannot accept credentials or authorize passenger-data processing.",
  },
  {
    id: "service_exit",
    label: "Service levels, continuity, and exit",
    owner: "Operations + Engineering",
    reviewScope: "Availability, support response, outages, change control, certification, termination, transition, and data return.",
    activationBoundary: "Review cannot authorize an adapter build, sandbox traffic, or Production traffic.",
  },
];

export const flightSupplierDiligenceGates: readonly FlightSupplierDiligenceGate[] = [
  { id: "evaluation_packet_approved", label: "Evaluation packet approved", owner: "Product + Commercial", detail: "Approve the required evidence format, source attribution, freshness standard, and handling boundary before reviewing any candidate." },
  { id: "candidate_identity_verified", label: "Candidate identity and authority verified", owner: "Legal", detail: "Verify the legal entity, contracting representative, distribution authority, and applicable accreditation without accepting credentials." },
  { id: "coverage_evidence_reviewed", label: "Coverage evidence reviewed", owner: "Commercial + Product", detail: "Review attributable carrier, geography, fare-source, fallback, and content-parity evidence against target markets." },
  { id: "commercial_terms_reviewed", label: "Commercial terms reviewed", owner: "Commercial + Finance", detail: "Review fees, commitments, incentives, settlement, reconciliation, disputes, reserves, and liability without accepting terms." },
  { id: "authority_settlement_approved", label: "Authority and settlement approved", owner: "Legal + Finance", detail: "Approve the proposed ticketing, accreditation, issuing, remittance, debit-memo, chargeback, and tax responsibilities." },
  { id: "servicing_support_approved", label: "Servicing and support approved", owner: "Operations + Support", detail: "Approve disruption, exchange, cancellation, refund, notification, accessibility, escalation, and round-the-clock ownership." },
  { id: "security_privacy_approved", label: "Security and privacy approved", owner: "Security + Privacy", detail: "Approve passenger-data roles, retention, credentials, webhooks, access, audit, incident, subprocessor, and deletion controls." },
  { id: "contract_package_approved", label: "Contract package approved", owner: "Legal + Executive", detail: "Approve the complete negotiated agreement and all schedules without activating credentials, traffic, ticketing, or payment." },
  { id: "selection_separately_authorized", label: "Supplier selection separately authorized", owner: "Release approvers", detail: "Require a new, explicit decision naming one contracted supplier path before credentials or implementation can be considered." },
];

export type FlightSupplierDiligenceEvidence = Partial<Record<FlightSupplierDiligenceGate["id"], boolean>>;

export function buildFlightSupplierDueDiligence(evidence: FlightSupplierDiligenceEvidence = {}) {
  const gates = flightSupplierDiligenceGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_SUPPLIER_DUE_DILIGENCE_MODE,
    candidateState: "not_recorded" as const,
    candidateCount: 0,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    diligenceComplete: completedCount === gates.length,
    credentialsAccepted: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
