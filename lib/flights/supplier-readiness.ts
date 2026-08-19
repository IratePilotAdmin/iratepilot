export const FLIGHT_SUPPLIER_READINESS_MODE = "evaluation_only" as const;

export type FlightSupplierPath = {
  id: "ndc_aggregator" | "gds" | "consolidator";
  label: string;
  fit: string;
  diligence: string;
};

export type FlightCapabilityGroup = {
  id: "shopping" | "orders" | "servicing" | "operations";
  label: string;
  capabilities: readonly string[];
};

export type FlightActivationGate = {
  id:
    | "supplier_selected"
    | "contract_approved"
    | "sandbox_credentials"
    | "shopping_certified"
    | "orders_certified"
    | "servicing_certified"
    | "payment_approved"
    | "security_approved"
    | "support_approved"
    | "preview_accepted";
  label: string;
  owner: string;
  detail: string;
};

export const flightSupplierPaths: readonly FlightSupplierPath[] = [
  {
    id: "ndc_aggregator",
    label: "NDC aggregator",
    fit: "Direct airline content through one contracted integration surface.",
    diligence: "Confirm carrier coverage, servicing depth, ticketing authority, fallback content, and certification scope.",
  },
  {
    id: "gds",
    label: "Global distribution system",
    fit: "Broad schedule, fare, ticketing, and agency workflows through an established distribution network.",
    diligence: "Confirm agency accreditation, commercial commitments, queues, exchanges, refunds, and settlement responsibilities.",
  },
  {
    id: "consolidator",
    label: "Ticketing consolidator",
    fit: "A contracted ticketing and settlement path when iRatePilot does not hold its own issuing authority.",
    diligence: "Confirm inventory ownership, markups, payment timing, support handoffs, schedule-change coverage, and refund liability.",
  },
];

export const flightCapabilityGroups: readonly FlightCapabilityGroup[] = [
  {
    id: "shopping",
    label: "Shopping and pricing",
    capabilities: ["Schedule search", "Fare and tax breakdown", "Baggage disclosure", "Fare rules", "Repricing before purchase"],
  },
  {
    id: "orders",
    label: "Orders and ticketing",
    capabilities: ["Traveler validation", "Order creation", "Ticket issuance", "Provider confirmation", "Duplicate-order protection"],
  },
  {
    id: "servicing",
    label: "Post-booking servicing",
    capabilities: ["Schedule changes", "Voluntary exchanges", "Cancellations", "Refund status", "Unused-ticket handling"],
  },
  {
    id: "operations",
    label: "Operational controls",
    capabilities: ["Sandbox isolation", "Idempotency", "Webhook verification", "Audit evidence", "Provider outage fallback"],
  },
];

export const flightActivationGates: readonly FlightActivationGate[] = [
  { id: "supplier_selected", label: "Supplier path selected", owner: "Commercial", detail: "Record the approved content and ticketing model without implying a partnership before contract signature." },
  { id: "contract_approved", label: "Contract and authority approved", owner: "Legal + Commercial", detail: "Confirm content rights, ticketing authority, settlement, support, and liability." },
  { id: "sandbox_credentials", label: "Sandbox credentials received", owner: "Security", detail: "Receive credentials through an approved secret channel and constrain endpoints to sandbox only." },
  { id: "shopping_certified", label: "Shopping certification complete", owner: "Engineering", detail: "Validate schedules, prices, taxes, baggage, fare rules, and repricing against provider evidence." },
  { id: "orders_certified", label: "Order and ticket certification complete", owner: "Engineering + Finance", detail: "Validate idempotent order creation, ticket issuance, confirmation, and reconciliation." },
  { id: "servicing_certified", label: "Servicing certification complete", owner: "Operations", detail: "Validate schedule changes, exchanges, cancellations, refunds, and escalation ownership." },
  { id: "payment_approved", label: "Flight payment model approved", owner: "Finance + Legal", detail: "Approve collection, settlement, fraud, refunds, disputes, and chargebacks separately from hotels." },
  { id: "security_approved", label: "Security and privacy approved", owner: "Security + Privacy", detail: "Approve passenger-data handling, retention, access, logs, incident response, and webhook verification." },
  { id: "support_approved", label: "Traveler support model approved", owner: "Operations", detail: "Define 24/7 disruption ownership, provider escalation, accessibility, and customer communications." },
  { id: "preview_accepted", label: "Controlled Preview accepted", owner: "Release approvers", detail: "Complete recorded sandbox browser and API acceptance with rollback evidence." },
];

export type FlightGateEvidence = Partial<Record<FlightActivationGate["id"], boolean>>;

export function buildFlightSupplierReadiness(evidence: FlightGateEvidence = {}) {
  const gates = flightActivationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;
  return {
    mode: FLIGHT_SUPPLIER_READINESS_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    evaluationComplete: completedCount === gates.length,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
