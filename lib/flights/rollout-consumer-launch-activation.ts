import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_CONSUMER_LAUNCH_MODE =
  "consumer_booking_activation_plan_only" as const;

export type FlightRolloutConsumerLaunchStageId =
  | "production_release_evidence_verified"
  | "deployment_and_alias_verified"
  | "primary_route_activation_verified"
  | "consumer_booking_guard_verified"
  | "payment_and_ticketing_release_verified"
  | "monitoring_and_stop_controls_live"
  | "customer_disclosures_and_support_live"
  | "action_time_launch_approval_recorded";

export type FlightRolloutConsumerLaunchStage = Readonly<{
  id: FlightRolloutConsumerLaunchStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutConsumerLaunchStages: readonly FlightRolloutConsumerLaunchStage[] = [
  { id: "production_release_evidence_verified", label: "Production-release evidence verified", owner: "Release + Risk", detail: "Verify the completed Production-readiness packet, Preview receipt, and absence of unresolved findings or incidents." },
  { id: "deployment_and_alias_verified", label: "Deployment and alias verified", owner: "Engineering + Release", detail: "Verify an approved artifact, environment, domain, alias, rollback target, and configuration diff without deploying or promoting here." },
  { id: "primary_route_activation_verified", label: "Primary route activation verified", owner: "Architecture + Operations", detail: "Verify Duffel is the sole bounded primary route and Sabre remains a deferred secondary path with no parallel launch." },
  { id: "consumer_booking_guard_verified", label: "Consumer-booking guard verified", owner: "Engineering + Risk", detail: "Verify authentication, eligibility, offer freshness, duplicate prevention, ambiguity recovery, caps, and kill switches before release." },
  { id: "payment_and_ticketing_release_verified", label: "Payment and ticketing release verified", owner: "Finance + Operations", detail: "Verify customer-payment, provider-settlement, ticketing, refund, chargeback, and exposure caps before any capture or order." },
  { id: "monitoring_and_stop_controls_live", label: "Monitoring and stop controls live", owner: "Engineering + Operations", detail: "Verify dashboards, alerts, audit receipts, on-call, stop authority, rollback, incident escalation, and no-restart handling." },
  { id: "customer_disclosures_and_support_live", label: "Customer disclosures and support live", owner: "Product + Legal + Support", detail: "Verify truthful pricing, ticketing, provider, refund, disruption, privacy, terms, and support disclosures before public traffic." },
  { id: "action_time_launch_approval_recorded", label: "Action-time launch approval recorded", owner: "Executive + Release approvers", detail: "Record a separate, current, expiring launch decision; this plan cannot enable consumer bookings, ticketing, payment, or live traffic." },
];

export type FlightRolloutConsumerLaunchEvidence = Partial<
  Record<FlightRolloutConsumerLaunchStageId, boolean>
>;

export type FlightRolloutConsumerLaunchEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutConsumerLaunchEvidence
  >
>;

type FlightRolloutConsumerLaunchRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutConsumerLaunchRecord = Readonly<{
  connectorId: FlightRolloutConsumerLaunchRouteId;
  routeRole: "primary" | "secondary";
  launchState: "blocked_by_production_release";
  stages: readonly (FlightRolloutConsumerLaunchStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  consumerBookingAuthorized: false;
  liveTrafficAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutConsumerLaunchActivation(
  evidence: FlightRolloutConsumerLaunchEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutConsumerLaunchRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutConsumerLaunchStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      launchState: "blocked_by_production_release",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      consumerBookingAuthorized: false,
      liveTrafficAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_CONSUMER_LAUNCH_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    consumerBookingAuthorized: false,
    liveTrafficAuthorized: false,
    paymentAuthorized: false,
    ticketingAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "production_release" as const,
    nextGate: "action_time_launch_approval" as const,
  } as const;
}
