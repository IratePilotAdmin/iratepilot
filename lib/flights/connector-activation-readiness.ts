import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_CONNECTOR_ACTIVATION_MODE = "catalogued_readiness_only" as const;

export type FlightConnectorActivationStageId =
  | "provider_decision"
  | "contract_authority"
  | "credentials"
  | "sandbox_access"
  | "shopping_certification"
  | "order_ticketing_certification"
  | "servicing_certification"
  | "payment_settlement"
  | "security_privacy"
  | "release_approval";

export type FlightConnectorActivationStage = Readonly<{
  id: FlightConnectorActivationStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightConnectorActivationStages: readonly FlightConnectorActivationStage[] = [
  { id: "provider_decision", label: "Provider decision", owner: "Commercial", detail: "Record the approved connector and intended airline-content scope." },
  { id: "contract_authority", label: "Contract and authority", owner: "Legal + Commercial", detail: "Approve content rights, ticketing authority, settlement, support, and liability." },
  { id: "credentials", label: "Credentials received", owner: "Security", detail: "Receive scoped credentials through an approved secret-management path." },
  { id: "sandbox_access", label: "Sandbox access", owner: "Engineering", detail: "Constrain the adapter to the provider sandbox and record access evidence." },
  { id: "shopping_certification", label: "Shopping certified", owner: "Engineering", detail: "Validate schedules, fares, taxes, baggage, rules, and repricing." },
  { id: "order_ticketing_certification", label: "Order and ticketing certified", owner: "Engineering + Finance", detail: "Validate idempotent order creation, ticket issuance, confirmation, and reconciliation." },
  { id: "servicing_certification", label: "Servicing certified", owner: "Operations", detail: "Validate changes, exchanges, cancellations, refunds, and disruption handling." },
  { id: "payment_settlement", label: "Payment and settlement approved", owner: "Finance + Legal", detail: "Approve collection, settlement, fraud, refunds, disputes, and chargebacks." },
  { id: "security_privacy", label: "Security and privacy approved", owner: "Security + Privacy", detail: "Approve passenger-data handling, retention, access, logs, incidents, and webhooks." },
  { id: "release_approval", label: "Release approval", owner: "Release approvers", detail: "Approve a controlled rollout only after all connector evidence is independently reviewed." },
];

export type FlightConnectorActivationEvidence = Partial<
  Record<FlightConnectorActivationStageId, boolean>
>;

export type FlightConnectorActivationEvidenceByConnector = Partial<
  Record<FlightBookingConnectorId, FlightConnectorActivationEvidence>
>;

export type FlightConnectorActivationTrack = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  candidateState: "approved_candidate";
  category: string;
  notes: string;
  plannedOperations: readonly string[];
  stages: readonly (FlightConnectorActivationStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  externalNetworkAccess: false;
  credentialsConfigured: false;
  sandboxTrafficAuthorized: false;
  productionTrafficAuthorized: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
}>;

export function buildFlightConnectorActivationReadiness(
  evidence: FlightConnectorActivationEvidenceByConnector = {},
) {
  const tracks: readonly FlightConnectorActivationTrack[] = flightBookingConnectorDefinitions.map((connector) => {
    const connectorEvidence = evidence[connector.id] ?? {};
    const stages = flightConnectorActivationStages.map((stage) => ({
      ...stage,
      complete: connectorEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: connector.id,
      label: connector.label,
      candidateState: connector.candidateState,
      category: connector.category,
      notes: connector.notes,
      plannedOperations: connector.plannedOperations,
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      externalNetworkAccess: false,
      credentialsConfigured: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    } as const;
  });

  return {
    mode: FLIGHT_CONNECTOR_ACTIVATION_MODE,
    tracks,
    totalConnectors: tracks.length,
    readyConnectorCount: tracks.filter((track) => track.readinessComplete).length,
    liveConnectorCount: 0,
    externalNetworkAccess: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
