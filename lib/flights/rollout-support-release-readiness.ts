import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_SUPPORT_RELEASE_MODE =
  "support_release_readiness_plan_only" as const;

export type FlightRolloutSupportReleaseStageId =
  | "support_owner_and_escalation_approved"
  | "disruption_playbook_approved"
  | "customer_communications_approved"
  | "accessibility_and_service_levels_approved"
  | "observability_and_alerts_approved"
  | "incident_stop_and_rollback_approved"
  | "preview_release_scope_approved"
  | "consumer_release_approval_recorded";

export type FlightRolloutSupportReleaseStage = Readonly<{
  id: FlightRolloutSupportReleaseStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutSupportReleaseStages: readonly FlightRolloutSupportReleaseStage[] = [
  { id: "support_owner_and_escalation_approved", label: "Support owner and escalation approved", owner: "Operations + Support", detail: "Approve named operational ownership, provider escalation, 24/7 coverage, and handoff rules without opening a customer channel." },
  { id: "disruption_playbook_approved", label: "Disruption playbook approved", owner: "Operations + Product", detail: "Approve schedule-change, cancellation, exchange, refund, irregular-operations, and stranded-traveler procedures." },
  { id: "customer_communications_approved", label: "Customer communications approved", owner: "Support + Legal + Product", detail: "Approve truthful fare, ticket, payment, delay, refund, and failure messaging without sending consumer notices." },
  { id: "accessibility_and_service_levels_approved", label: "Accessibility and service levels approved", owner: "Support + Compliance", detail: "Approve accessibility, response targets, language coverage, service levels, and exception handling." },
  { id: "observability_and_alerts_approved", label: "Observability and alerts approved", owner: "Engineering + Operations", detail: "Approve health checks, latency, error, stale-offer, payment, ticketing, reconciliation, and provider-outage alerts." },
  { id: "incident_stop_and_rollback_approved", label: "Incident, stop, and rollback approved", owner: "Risk + Operations + Engineering", detail: "Approve immediate stops, kill switches, rollback, ambiguous outcomes, incident ownership, evidence capture, and restart prohibition." },
  { id: "preview_release_scope_approved", label: "Controlled Preview scope approved", owner: "Product + Release", detail: "Approve one bounded Preview audience, inventory scope, booking limits, support coverage, and expiry without Production traffic." },
  { id: "consumer_release_approval_recorded", label: "Consumer release approval recorded", owner: "Executive + Release approvers", detail: "Record a separate consumer-release decision only after provider, sandbox, payment, security, support, and rollback evidence is complete." },
];

export type FlightRolloutSupportReleaseEvidence = Partial<
  Record<FlightRolloutSupportReleaseStageId, boolean>
>;

export type FlightRolloutSupportReleaseEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutSupportReleaseEvidence
  >
>;

type FlightRolloutSupportReleaseRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutSupportReleaseRecord = Readonly<{
  connectorId: FlightRolloutSupportReleaseRouteId;
  routeRole: "primary" | "secondary";
  releaseState: "blocked_by_security_privacy";
  stages: readonly (FlightRolloutSupportReleaseStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  supportAuthorized: false;
  previewReleaseAuthorized: false;
  consumerReleaseAuthorized: false;
  productionTrafficAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutSupportReleaseReadiness(
  evidence: FlightRolloutSupportReleaseEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutSupportReleaseRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutSupportReleaseStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      releaseState: "blocked_by_security_privacy",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      supportAuthorized: false,
      previewReleaseAuthorized: false,
      consumerReleaseAuthorized: false,
      productionTrafficAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_SUPPORT_RELEASE_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    supportAuthorized: false,
    previewReleaseAuthorized: false,
    consumerReleaseAuthorized: false,
    productionTrafficAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "security_privacy_readiness" as const,
    nextGate: "support_release_readiness" as const,
  } as const;
}
