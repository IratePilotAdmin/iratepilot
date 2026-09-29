import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_SANDBOX_CERTIFICATION_MODE =
  "sandbox_certification_plan_only" as const;

export type FlightRolloutSandboxCertificationStageId =
  | "credential_scope_verified"
  | "sandbox_endpoint_verified"
  | "shopping_and_freshness_certified"
  | "repricing_and_rules_certified"
  | "order_and_ticketing_certified"
  | "payment_and_settlement_certified"
  | "servicing_and_reconciliation_certified"
  | "rollback_and_closeout_certified";

export type FlightRolloutSandboxCertificationStage = Readonly<{
  id: FlightRolloutSandboxCertificationStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutSandboxCertificationStages: readonly FlightRolloutSandboxCertificationStage[] = [
  { id: "credential_scope_verified", label: "Credential scope verified", owner: "Security + Engineering", detail: "Verify the scoped sandbox credential and environment binding without storing the secret or making a provider request." },
  { id: "sandbox_endpoint_verified", label: "Sandbox endpoint verified", owner: "Engineering + Security", detail: "Verify the provider sandbox origin, version, limits, timeout, redirect, and response-boundary contract." },
  { id: "shopping_and_freshness_certified", label: "Shopping and freshness certified", owner: "Product + Engineering", detail: "Certify route, traveler, cabin, fare, tax, baggage, availability, freshness, and provenance handling in approved sandbox fixtures." },
  { id: "repricing_and_rules_certified", label: "Repricing and fare rules certified", owner: "Engineering + Operations", detail: "Certify price confirmation, expiry, fare rules, ancillary disclosures, and stale or changed-offer handling." },
  { id: "order_and_ticketing_certified", label: "Order and ticketing certified", owner: "Engineering + Finance", detail: "Certify idempotency, duplicate refusal, order confirmation, ticketing evidence, and ambiguous-outcome reconciliation without consumer traffic." },
  { id: "payment_and_settlement_certified", label: "Payment and settlement certified", owner: "Finance + Security", detail: "Certify the approved sandbox payment and provider-balance settlement model, refunds, disputes, and reconciliation without moving money." },
  { id: "servicing_and_reconciliation_certified", label: "Servicing and reconciliation certified", owner: "Operations + Support", detail: "Certify changes, cancellations, refunds, schedule disruptions, support escalation, and ledger reconciliation using controlled fixtures." },
  { id: "rollback_and_closeout_certified", label: "Rollback and closeout certified", owner: "Release + Operations", detail: "Certify stop, rollback, access removal, evidence retention, incident handling, and test-window closeout before any release decision." },
];

export type FlightRolloutSandboxCertificationEvidence = Partial<
  Record<FlightRolloutSandboxCertificationStageId, boolean>
>;

export type FlightRolloutSandboxCertificationEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutSandboxCertificationEvidence
  >
>;

type FlightRolloutSandboxCertificationRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutSandboxCertificationRecord = Readonly<{
  connectorId: FlightRolloutSandboxCertificationRouteId;
  routeRole: "primary" | "secondary";
  certificationState: "blocked_by_sandbox_credential";
  stages: readonly (FlightRolloutSandboxCertificationStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  certificationComplete: boolean;
  testTrafficAuthorized: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutSandboxCertification(
  evidence: FlightRolloutSandboxCertificationEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutSandboxCertificationRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutSandboxCertificationStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      certificationState: "blocked_by_sandbox_credential",
      stages,
      completedCount,
      totalCount: stages.length,
      certificationComplete: completedCount === stages.length,
      testTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_SANDBOX_CERTIFICATION_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.certificationComplete).length,
    testTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "sandbox_credential_intake" as const,
    nextGate: "sandbox_certification" as const,
  } as const;
}
