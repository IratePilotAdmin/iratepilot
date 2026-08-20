export const CAR_RENTAL_SUPPLIER_READINESS_MODE = "evaluation_only" as const;

export type CarRentalSupplierPath = {
  id: "direct_rental_company" | "broker" | "aggregator" | "gds";
  label: string;
  fit: string;
  diligence: string;
};

export type CarRentalCapabilityGroup = {
  id: "inventory" | "pricing" | "reservations" | "operations";
  label: string;
  capabilities: readonly string[];
};

export type CarRentalActivationGate = {
  id:
    | "supplier_path_selected"
    | "contract_approved"
    | "sandbox_credentials"
    | "inventory_certified"
    | "pricing_policies_certified"
    | "reservation_lifecycle_certified"
    | "driver_privacy_approved"
    | "payment_risk_approved"
    | "support_approved"
    | "security_approved"
    | "preview_accepted";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalSupplierPaths: readonly CarRentalSupplierPath[] = [
  {
    id: "direct_rental_company",
    label: "Direct rental company",
    fit: "Contracted inventory and reservation access from an individual rental brand or operating group.",
    diligence: "Confirm location coverage, fleet ownership, total-price content, servicing depth, and geographic limits.",
  },
  {
    id: "broker",
    label: "Rental broker",
    fit: "A contracted intermediary that distributes inventory and may own booking or customer-service responsibilities.",
    diligence: "Confirm merchant of record, supplier disclosure, deposits, protection products, changes, cancellations, and claim ownership.",
  },
  {
    id: "aggregator",
    label: "Car-rental aggregator",
    fit: "Multiple rental sources normalized behind one contracted shopping and reservation interface.",
    diligence: "Confirm source transparency, duplicate inventory, location mapping, policy fidelity, reservation references, and outage handling.",
  },
  {
    id: "gds",
    label: "Global distribution system",
    fit: "Broad rental-company content distributed through established travel-agency workflows.",
    diligence: "Confirm agency authority, content scope, queue or servicing workflows, settlement duties, and commercial commitments.",
  },
];

export const carRentalCapabilityGroups: readonly CarRentalCapabilityGroup[] = [
  {
    id: "inventory",
    label: "Locations and vehicle inventory",
    capabilities: ["Airport and neighborhood locations", "Opening hours and pickup instructions", "Vehicle-class equivalency", "Availability and accessibility features", "One-way rental support"],
  },
  {
    id: "pricing",
    label: "Total pricing and policies",
    capabilities: ["Base rate, taxes, and mandatory fees", "Mileage and fuel or charging terms", "Deposits and authorization holds", "Protection-product disclosures", "Repricing and policy snapshots"],
  },
  {
    id: "reservations",
    label: "Reservation lifecycle",
    capabilities: ["Create and confirm", "Modify and cancel", "No-show and pickup failure", "Extension and early or late return", "Refund and supplier-reference reconciliation"],
  },
  {
    id: "operations",
    label: "Operational controls",
    capabilities: ["Sandbox isolation", "Idempotency and duplicate protection", "Timeout and retry limits", "Authenticated webhook handling", "Audit evidence and outage fallback"],
  },
];

export const carRentalActivationGates: readonly CarRentalActivationGate[] = [
  { id: "supplier_path_selected", label: "Supplier path selected", owner: "Commercial", detail: "Record an approved distribution model without naming or implying a supplier relationship before authorization." },
  { id: "contract_approved", label: "Contract and content rights approved", owner: "Legal + Commercial", detail: "Confirm inventory rights, pricing terms, commissions or markups, servicing, liability, and termination duties." },
  { id: "sandbox_credentials", label: "Sandbox credentials received", owner: "Security", detail: "Receive scoped credentials through an approved secret channel and constrain every endpoint to the sandbox." },
  { id: "inventory_certified", label: "Location and inventory certification complete", owner: "Engineering", detail: "Validate locations, hours, pickup instructions, vehicle classes, features, availability, and one-way rules." },
  { id: "pricing_policies_certified", label: "Total pricing and policy certification complete", owner: "Engineering + Legal", detail: "Validate taxes, fees, deposits, mileage, fuel or charging, protection products, exclusions, and repricing." },
  { id: "reservation_lifecycle_certified", label: "Reservation lifecycle certification complete", owner: "Engineering + Operations", detail: "Validate idempotent create, confirmation, change, cancellation, no-show, pickup, return, refund, and reconciliation behavior." },
  { id: "driver_privacy_approved", label: "Driver eligibility and privacy approved", owner: "Legal + Privacy", detail: "Approve age, license, residency, additional-driver, geographic, retention, deletion, and access requirements." },
  { id: "payment_risk_approved", label: "Payment and risk model approved", owner: "Finance + Legal", detail: "Approve pay-now or pay-at-counter handling, deposits, holds, fraud, disputes, refunds, currency, taxes, and receipts." },
  { id: "support_approved", label: "Customer support model approved", owner: "Operations", detail: "Define pickup failures, unavailable classes, breakdowns, accidents, roadside assistance, damage claims, and escalation ownership." },
  { id: "security_approved", label: "Security and incident response approved", owner: "Security", detail: "Approve secret access, endpoint allowlists, webhook verification, logs, monitoring, kill switches, and incident procedures." },
  { id: "preview_accepted", label: "Controlled Preview accepted", owner: "Release approvers", detail: "Complete recorded sandbox API and browser acceptance with observability and rollback evidence." },
];

export type CarRentalGateEvidence = Partial<Record<CarRentalActivationGate["id"], boolean>>;

export function buildCarRentalSupplierReadiness(evidence: CarRentalGateEvidence = {}) {
  const gates = carRentalActivationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_SUPPLIER_READINESS_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    evaluationComplete: completedCount === gates.length,
    supplierContactAuthorized: false,
    accountCreationAuthorized: false,
    credentialAcceptanceAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
