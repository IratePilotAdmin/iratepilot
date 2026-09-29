import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_CONNECTOR_ROUTING_READINESS_MODE = "routing_plan_only" as const;

export type FlightConnectorRoutingStageId =
  | "candidate_scope"
  | "coverage_matrix"
  | "primary_route"
  | "fallback_order"
  | "failover_policy"
  | "release_gate";

export type FlightConnectorRoutingStage = Readonly<{
  id: FlightConnectorRoutingStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightConnectorRoutingStages: readonly FlightConnectorRoutingStage[] = [
  { id: "candidate_scope", label: "Candidate scope frozen", owner: "Product + Architecture", detail: "Confirm the candidate set and the markets or content each route is intended to serve." },
  { id: "coverage_matrix", label: "Coverage matrix approved", owner: "Commercial + Product", detail: "Compare carrier, geography, fare, servicing, and ticketing coverage using attributable evidence." },
  { id: "primary_route", label: "Primary route selected", owner: "Executive + Commercial", detail: "Select one contracted provider path for a defined launch scope." },
  { id: "fallback_order", label: "Fallback order approved", owner: "Architecture + Operations", detail: "Define deterministic fallback order and prevent duplicate or conflicting bookings." },
  { id: "failover_policy", label: "Failover policy certified", owner: "Engineering + Operations", detail: "Test outage, timeout, repricing, ambiguity, reconciliation, and rollback behavior." },
  { id: "release_gate", label: "Route release approved", owner: "Release approvers", detail: "Approve a bounded route release only after contracts, credentials, certification, payment, and support are complete." },
];

export type FlightConnectorRoutingEvidence = Partial<
  Record<FlightConnectorRoutingStageId, boolean>
>;

export type FlightConnectorRoutingEvidenceByConnector = Partial<
  Record<FlightBookingConnectorId, FlightConnectorRoutingEvidence>
>;

export type FlightConnectorRoutingRecord = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  routeRole: "unassigned";
  active: false;
  stages: readonly (FlightConnectorRoutingStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  routingComplete: boolean;
  externalNetworkAccess: false;
  productionTrafficAuthorized: false;
}>;

export function buildFlightConnectorRoutingReadiness(
  evidence: FlightConnectorRoutingEvidenceByConnector = {},
) {
  const records: readonly FlightConnectorRoutingRecord[] = flightBookingConnectorDefinitions.map((connector) => {
    const connectorEvidence = evidence[connector.id] ?? {};
    const stages = flightConnectorRoutingStages.map((stage) => ({
      ...stage,
      complete: connectorEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: connector.id,
      label: connector.label,
      routeRole: "unassigned",
      active: false,
      stages,
      completedCount,
      totalCount: stages.length,
      routingComplete: completedCount === stages.length,
      externalNetworkAccess: false,
      productionTrafficAuthorized: false,
    } as const;
  });

  return {
    mode: FLIGHT_CONNECTOR_ROUTING_READINESS_MODE,
    records,
    totalCandidates: records.length,
    completeRoutingCount: records.filter((record) => record.routingComplete).length,
    selectedPrimary: null,
    fallbackOrder: [],
    routeEnabled: false,
    externalNetworkAccess: false,
    productionTrafficAuthorized: false,
  } as const;
}
