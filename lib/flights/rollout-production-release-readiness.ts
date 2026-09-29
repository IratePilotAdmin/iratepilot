import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_PRODUCTION_RELEASE_MODE =
  "production_release_readiness_plan_only" as const;

export type FlightRolloutProductionReleaseStageId =
  | "preview_acceptance_receipt_verified"
  | "provider_sandbox_certification_verified"
  | "payment_settlement_evidence_verified"
  | "security_privacy_evidence_verified"
  | "support_observability_evidence_verified"
  | "production_credentials_segregated"
  | "production_scope_and_caps_bound"
  | "rollback_incident_and_financial_caps_verified"
  | "production_release_approval_recorded";

export type FlightRolloutProductionReleaseStage = Readonly<{
  id: FlightRolloutProductionReleaseStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutProductionReleaseStages: readonly FlightRolloutProductionReleaseStage[] = [
  { id: "preview_acceptance_receipt_verified", label: "Preview acceptance receipt verified", owner: "Release + Risk", detail: "Verify an accepted, bounded Preview run with no unresolved findings, ambiguous outcomes, or unclosed incidents." },
  { id: "provider_sandbox_certification_verified", label: "Provider certification verified", owner: "Engineering + Operations", detail: "Verify provider search, repricing, order, ticketing, servicing, reconciliation, and rollback certification evidence." },
  { id: "payment_settlement_evidence_verified", label: "Payment and settlement evidence verified", owner: "Finance + Legal", detail: "Verify customer collection, provider settlement, refunds, chargebacks, reconciliation, and funds-flow evidence." },
  { id: "security_privacy_evidence_verified", label: "Security and privacy evidence verified", owner: "Security + Privacy", detail: "Verify passenger-data, secrets, webhook, logging, retention, deletion, incident, and access-control evidence." },
  { id: "support_observability_evidence_verified", label: "Support and observability evidence verified", owner: "Support + Operations", detail: "Verify staffed support, disruption escalation, customer messaging, alerts, on-call, and stop ownership." },
  { id: "production_credentials_segregated", label: "Production credentials segregated", owner: "Security + Engineering", detail: "Verify production-only secret storage, least privilege, rotation, access review, and environment separation without reading or activating a secret." },
  { id: "production_scope_and_caps_bound", label: "Production scope and caps bound", owner: "Product + Finance + Operations", detail: "Bind markets, carriers, audiences, booking limits, payment caps, ticketing caps, spend limits, and rollout percentage." },
  { id: "rollback_incident_and_financial_caps_verified", label: "Rollback, incident, and financial caps verified", owner: "Risk + Release + Finance", detail: "Verify kill switches, rollback, ambiguity recovery, incident response, refunds, chargebacks, exposure caps, and no-restart controls." },
  { id: "production_release_approval_recorded", label: "Production release approval recorded", owner: "Executive + Release approvers", detail: "Record a separate action-time Production release approval; this plan cannot deploy, promote, alias, or enable consumer bookings." },
];

export type FlightRolloutProductionReleaseEvidence = Partial<
  Record<FlightRolloutProductionReleaseStageId, boolean>
>;

export type FlightRolloutProductionReleaseEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutProductionReleaseEvidence
  >
>;

type FlightRolloutProductionReleaseRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutProductionReleaseRecord = Readonly<{
  connectorId: FlightRolloutProductionReleaseRouteId;
  routeRole: "primary" | "secondary";
  releaseState: "blocked_by_preview_release";
  stages: readonly (FlightRolloutProductionReleaseStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  productionCredentialsActivated: false;
  productionTrafficAuthorized: false;
  consumerBookingAuthorized: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutProductionReleaseReadiness(
  evidence: FlightRolloutProductionReleaseEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutProductionReleaseRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutProductionReleaseStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      releaseState: "blocked_by_preview_release",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      productionCredentialsActivated: false,
      productionTrafficAuthorized: false,
      consumerBookingAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_PRODUCTION_RELEASE_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    productionCredentialsActivated: false,
    productionTrafficAuthorized: false,
    consumerBookingAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "controlled_preview_release" as const,
    nextGate: "production_release" as const,
  } as const;
}
