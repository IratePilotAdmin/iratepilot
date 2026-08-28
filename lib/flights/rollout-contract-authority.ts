import {
  buildFlightRolloutRouteDecision,
  type FlightRolloutAlternativeConnectorId,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_CONTRACT_AUTHORITY_MODE =
  "route_bound_contract_authority_plan_only" as const;

export type FlightRolloutContractAuthorityStageId =
  | "route_scope_bound"
  | "legal_entity_verified"
  | "content_rights_reviewed"
  | "ticketing_settlement_reviewed"
  | "commercial_terms_reviewed"
  | "security_privacy_reviewed"
  | "servicing_support_reviewed"
  | "contract_execution_authority_approved";

export type FlightRolloutContractAuthorityStage = Readonly<{
  id: FlightRolloutContractAuthorityStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutContractAuthorityStages: readonly FlightRolloutContractAuthorityStage[] = [
  { id: "route_scope_bound", label: "Route scope bound", owner: "Product + Architecture", detail: "Bind contract review to the authorized Duffel-primary and Sabre-secondary route preference without enabling either route." },
  { id: "legal_entity_verified", label: "Legal entity and authority verified", owner: "Legal + Commercial", detail: "Verify the counterparty, contracting authority, agency role, and applicable accreditation without accepting terms or credentials." },
  { id: "content_rights_reviewed", label: "Content rights reviewed", owner: "Commercial + Product", detail: "Review carrier, geography, fare, display, caching, and permitted-use obligations for the defined launch scope." },
  { id: "ticketing_settlement_reviewed", label: "Ticketing and settlement reviewed", owner: "Legal + Finance", detail: "Review issuing, validating-carrier, funding, remittance, debit-memo, refund, and chargeback responsibilities." },
  { id: "commercial_terms_reviewed", label: "Commercial terms reviewed", owner: "Commercial + Finance", detail: "Review fees, commitments, incentives, reserves, taxes, reconciliation, liability, and termination economics." },
  { id: "security_privacy_reviewed", label: "Security and privacy reviewed", owner: "Security + Privacy", detail: "Review passenger-data roles, retention, subprocessors, secret handling, webhook controls, access, incidents, and deletion." },
  { id: "servicing_support_reviewed", label: "Servicing and support reviewed", owner: "Operations + Support", detail: "Review disruption, exchange, cancellation, refund, escalation, service levels, continuity, and exit ownership." },
  { id: "contract_execution_authority_approved", label: "Contract execution authority approved", owner: "Executive + Legal + Release approvers", detail: "Approve any signed agreement and bounded downstream authority separately; this plan cannot sign, accept, or activate a provider." },
];

export type FlightRolloutContractAuthorityEvidence = Partial<
  Record<FlightRolloutContractAuthorityStageId, boolean>
>;

export type FlightRolloutContractAuthorityEvidenceByConnector = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutContractAuthorityEvidence
  >
>;

type FlightRolloutContractAuthorityConnectorId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutContractAuthorityRecord = Readonly<{
  connectorId: FlightRolloutContractAuthorityConnectorId;
  routeRole: "primary" | "secondary";
  reviewState: "next_gate" | "deferred_until_primary_validated";
  stages: readonly (FlightRolloutContractAuthorityStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  planComplete: boolean;
  contractAccepted: false;
  credentialsConfigured: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutContractAuthority(
  evidence: FlightRolloutContractAuthorityEvidenceByConnector = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutContractAuthorityRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutContractAuthorityStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      reviewState: route.routeRole === "primary"
        ? "next_gate"
        : "deferred_until_primary_validated",
      stages,
      completedCount,
      totalCount: stages.length,
      planComplete: completedCount === stages.length,
      contractAccepted: false,
      credentialsConfigured: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_CONTRACT_AUTHORITY_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
      alternativeConnectorIds: routeDecision.alternativeConnectorIds as readonly FlightRolloutAlternativeConnectorId[],
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.planComplete).length,
    contractAuthorityApproved: false,
    credentialsConfigured: false,
    sandboxTrafficAuthorized: false,
    routeEnabled: false,
    bookingAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
    externalNetworkAccess: false,
    productionTrafficAuthorized: false,
    nextGate: "contract_authority" as const,
  } as const;
}
