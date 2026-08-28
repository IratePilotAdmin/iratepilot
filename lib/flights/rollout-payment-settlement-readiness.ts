import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_PAYMENT_SETTLEMENT_MODE =
  "payment_settlement_readiness_plan_only" as const;

export type FlightRolloutPaymentSettlementStageId =
  | "processor_account_approved"
  | "customer_collection_model_approved"
  | "provider_settlement_model_approved"
  | "price_currency_and_margin_rules_approved"
  | "order_payment_binding_approved"
  | "refund_exchange_and_chargeback_policy_approved"
  | "webhook_and_reconciliation_approved"
  | "fraud_pci_and_privacy_controls_approved"
  | "payment_release_approved";

export type FlightRolloutPaymentSettlementStage = Readonly<{
  id: FlightRolloutPaymentSettlementStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutPaymentSettlementStages: readonly FlightRolloutPaymentSettlementStage[] = [
  { id: "processor_account_approved", label: "Processor account approved", owner: "Finance + Executive", detail: "Approve the customer-payment processor account and legal merchant role without creating a charge or PaymentIntent." },
  { id: "customer_collection_model_approved", label: "Customer collection model approved", owner: "Finance + Legal", detail: "Approve pricing display, authorization, capture, taxes, receipts, and customer-funds responsibilities for flight bookings." },
  { id: "provider_settlement_model_approved", label: "Provider settlement model approved", owner: "Finance + Commercial", detail: "Approve provider-balance funding, remittance, settlement timing, reserves, refunds, disputes, and liability." },
  { id: "price_currency_and_margin_rules_approved", label: "Price, currency, and margin rules approved", owner: "Commercial + Product", detail: "Approve currency, rounding, fare expiry, markups, fees, taxes, and margin rules with no live offer or customer quote." },
  { id: "order_payment_binding_approved", label: "Order and payment binding approved", owner: "Engineering + Finance", detail: "Approve immutable order/payment binding, idempotency, duplicate prevention, ambiguity recovery, and capture-before-ticket rules." },
  { id: "refund_exchange_and_chargeback_policy_approved", label: "Refund, exchange, and chargeback policy approved", owner: "Operations + Finance + Legal", detail: "Approve refund, exchange, cancellation, chargeback, dispute, credit, and customer-notification ownership." },
  { id: "webhook_and_reconciliation_approved", label: "Webhook and reconciliation approved", owner: "Engineering + Finance", detail: "Approve signed webhook handling, ledger reconciliation, settlement reports, retries, and missing-event investigation." },
  { id: "fraud_pci_and_privacy_controls_approved", label: "Fraud, PCI, and privacy controls approved", owner: "Security + Privacy + Risk", detail: "Approve fraud controls, PCI scope, passenger-data minimization, access, retention, incident response, and deletion." },
  { id: "payment_release_approved", label: "Payment release approved", owner: "Executive + Finance + Release", detail: "Approve a separately scoped payment test or consumer release only after provider, sandbox, security, and support evidence is complete." },
];

export type FlightRolloutPaymentSettlementEvidence = Partial<
  Record<FlightRolloutPaymentSettlementStageId, boolean>
>;

export type FlightRolloutPaymentSettlementEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutPaymentSettlementEvidence
  >
>;

type FlightRolloutPaymentSettlementRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutPaymentSettlementRecord = Readonly<{
  connectorId: FlightRolloutPaymentSettlementRouteId;
  routeRole: "primary" | "secondary";
  paymentState: "blocked_by_sandbox_certification";
  stages: readonly (FlightRolloutPaymentSettlementStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  paymentAuthorized: false;
  settlementAuthorized: false;
  chargeCreated: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutPaymentSettlementReadiness(
  evidence: FlightRolloutPaymentSettlementEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutPaymentSettlementRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutPaymentSettlementStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      paymentState: "blocked_by_sandbox_certification",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      paymentAuthorized: false,
      settlementAuthorized: false,
      chargeCreated: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_PAYMENT_SETTLEMENT_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    paymentAuthorized: false,
    settlementAuthorized: false,
    chargeCreated: false,
    externalNetworkAccess: false,
    blockedBy: "sandbox_certification" as const,
    nextGate: "payment_settlement_readiness" as const,
  } as const;
}
