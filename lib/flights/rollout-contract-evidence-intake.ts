import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_CONTRACT_EVIDENCE_MODE =
  "external_contract_evidence_required" as const;

export type FlightRolloutContractEvidenceStageId =
  | "authority_reference_bound"
  | "counterparty_identity_verified"
  | "content_and_use_scope_verified"
  | "ticketing_and_settlement_terms_verified"
  | "commercial_terms_verified"
  | "security_and_privacy_terms_verified"
  | "independent_approvals_recorded";

export type FlightRolloutContractEvidenceStage = Readonly<{
  id: FlightRolloutContractEvidenceStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutContractEvidenceStages: readonly FlightRolloutContractEvidenceStage[] = [
  { id: "authority_reference_bound", label: "Authority reference bound", owner: "Executive + Legal", detail: "Bind one immutable, current approval reference to the Duffel-primary route and its narrowly defined diligence scope." },
  { id: "counterparty_identity_verified", label: "Counterparty identity verified", owner: "Legal + Commercial", detail: "Verify the provider legal entity, authorized representative, agency role, and accreditation claims from attributable evidence." },
  { id: "content_and_use_scope_verified", label: "Content and permitted-use scope verified", owner: "Commercial + Product", detail: "Verify carrier, geography, fare, display, caching, data-use, and downstream restrictions for the consumer launch scope." },
  { id: "ticketing_and_settlement_terms_verified", label: "Ticketing and settlement terms verified", owner: "Legal + Finance", detail: "Verify issuing, validating-carrier, funding, remittance, refund, debit-memo, chargeback, and tax responsibilities." },
  { id: "commercial_terms_verified", label: "Commercial terms verified", owner: "Commercial + Finance", detail: "Verify fees, commitments, incentives, reserves, reconciliation, liability, support charges, and termination terms." },
  { id: "security_and_privacy_terms_verified", label: "Security and privacy terms verified", owner: "Security + Privacy", detail: "Verify passenger-data roles, retention, subprocessors, access, secrets, webhooks, incidents, audit, and deletion terms." },
  { id: "independent_approvals_recorded", label: "Independent approvals recorded", owner: "Legal + Finance + Security + Release", detail: "Record independent legal, finance, security/privacy, operations, and release approvals without signing, accepting, or activating the provider." },
];

export type FlightRolloutContractEvidence = Partial<
  Record<FlightRolloutContractEvidenceStageId, boolean>
>;

export type FlightRolloutContractEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutContractEvidence
  >
>;

type FlightRolloutContractEvidenceRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutContractEvidenceRecord = Readonly<{
  connectorId: FlightRolloutContractEvidenceRouteId;
  routeRole: "primary" | "secondary";
  intakeState: "blocked";
  stages: readonly (FlightRolloutContractEvidenceStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  evidenceComplete: boolean;
  contractAccepted: false;
  credentialsAccepted: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutContractEvidenceIntake(
  evidence: FlightRolloutContractEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutContractEvidenceRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutContractEvidenceStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      intakeState: "blocked",
      stages,
      completedCount,
      totalCount: stages.length,
      evidenceComplete: completedCount === stages.length,
      contractAccepted: false,
      credentialsAccepted: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_CONTRACT_EVIDENCE_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.evidenceComplete).length,
    evidenceReceived: false,
    contractAccepted: false,
    credentialsAccepted: false,
    externalNetworkAccess: false,
    nextGate: "contract_authority_evidence" as const,
  } as const;
}
