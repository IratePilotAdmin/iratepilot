import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_PREVIEW_RELEASE_MODE =
  "controlled_preview_release_plan_only" as const;

export type FlightRolloutPreviewReleaseStageId =
  | "prerequisite_evidence_reconciled"
  | "preview_audience_and_scope_bound"
  | "inventory_and_booking_limits_bound"
  | "payment_and_ticketing_caps_bound"
  | "monitoring_and_kill_switch_verified"
  | "support_on_call_confirmed"
  | "rollback_and_expiry_window_approved"
  | "preview_release_approval_recorded";

export type FlightRolloutPreviewReleaseStage = Readonly<{
  id: FlightRolloutPreviewReleaseStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutPreviewReleaseStages: readonly FlightRolloutPreviewReleaseStage[] = [
  { id: "prerequisite_evidence_reconciled", label: "Prerequisite evidence reconciled", owner: "Release + Risk", detail: "Reconcile provider, contract, credentials, sandbox, payment, security, privacy, support, and rollback evidence before any release decision." },
  { id: "preview_audience_and_scope_bound", label: "Preview audience and scope bound", owner: "Product + Release", detail: "Bind the named Preview audience, markets, routes, inventory, and dates without opening public consumer traffic." },
  { id: "inventory_and_booking_limits_bound", label: "Inventory and booking limits bound", owner: "Product + Operations", detail: "Set deterministic search, offer, order, booking-count, concurrency, fare, and spend limits with hard stops." },
  { id: "payment_and_ticketing_caps_bound", label: "Payment and ticketing caps bound", owner: "Finance + Operations", detail: "Set zero-default payment, ticketing, settlement, refund, and customer-funds caps until separately released." },
  { id: "monitoring_and_kill_switch_verified", label: "Monitoring and kill switch verified", owner: "Engineering + Operations", detail: "Verify health, latency, stale-offer, payment, ticketing, reconciliation, fraud, provider-outage, and kill-switch signals." },
  { id: "support_on_call_confirmed", label: "Support on-call confirmed", owner: "Support + Operations", detail: "Confirm staffed support, escalation contacts, disruption playbooks, traveler communications, and stop ownership for the window." },
  { id: "rollback_and_expiry_window_approved", label: "Rollback and expiry window approved", owner: "Risk + Release", detail: "Approve one expiring Preview window, rollback path, evidence closeout, access removal, and no-restart controls." },
  { id: "preview_release_approval_recorded", label: "Preview release approval recorded", owner: "Executive + Release approvers", detail: "Record a separate action-time Preview release approval; this plan cannot promote an environment or enable consumer bookings." },
];

export type FlightRolloutPreviewReleaseEvidence = Partial<
  Record<FlightRolloutPreviewReleaseStageId, boolean>
>;

export type FlightRolloutPreviewReleaseEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutPreviewReleaseEvidence
  >
>;

type FlightRolloutPreviewReleaseRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutPreviewReleaseRecord = Readonly<{
  connectorId: FlightRolloutPreviewReleaseRouteId;
  routeRole: "primary" | "secondary";
  releaseState: "blocked_by_support_release_readiness";
  stages: readonly (FlightRolloutPreviewReleaseStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  previewReleaseAuthorized: false;
  consumerBookingAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutPreviewReleaseReadiness(
  evidence: FlightRolloutPreviewReleaseEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutPreviewReleaseRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutPreviewReleaseStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      releaseState: "blocked_by_support_release_readiness",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      previewReleaseAuthorized: false,
      consumerBookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_PREVIEW_RELEASE_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    previewReleaseAuthorized: false,
    consumerBookingAuthorized: false,
    paymentAuthorized: false,
    ticketingAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "support_release_readiness" as const,
    nextGate: "controlled_preview_release" as const,
  } as const;
}
