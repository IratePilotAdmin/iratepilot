import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_CONNECTOR_SANDBOX_CERTIFICATION_MODE = "sandbox_certification_plan_only" as const;

export type FlightConnectorSandboxCertificationStageId =
  | "contract_mapping"
  | "sandbox_scope"
  | "shopping_certification"
  | "order_ticketing_certification"
  | "servicing_reconciliation_certification"
  | "rollback_evidence";

export type FlightConnectorSandboxCertificationStage = Readonly<{
  id: FlightConnectorSandboxCertificationStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightConnectorSandboxCertificationStages: readonly FlightConnectorSandboxCertificationStage[] = [
  { id: "contract_mapping", label: "Provider contract mapped", owner: "Engineering", detail: "Map the provider contract to the guarded provider-neutral operation shapes." },
  { id: "sandbox_scope", label: "Sandbox scope confirmed", owner: "Security", detail: "Confirm environment, account, point-of-sale, content, rate-limit, and data boundaries." },
  { id: "shopping_certification", label: "Shopping certified", owner: "Product + Engineering", detail: "Test schedules, fares, taxes, baggage, rules, expiry, and repricing against provider evidence." },
  { id: "order_ticketing_certification", label: "Order and ticketing certified", owner: "Engineering + Finance", detail: "Test idempotency, held orders, issuance, confirmation, reconciliation, and duplicate protection." },
  { id: "servicing_reconciliation_certification", label: "Servicing and reconciliation certified", owner: "Operations", detail: "Test changes, exchanges, cancellations, refunds, webhooks, and ambiguous-outcome handling." },
  { id: "rollback_evidence", label: "Rollback evidence recorded", owner: "Release + Operations", detail: "Record a reproducible stop, rollback, and closeout path before any controlled release." },
];

export type FlightConnectorSandboxCertificationEvidence = Partial<
  Record<FlightConnectorSandboxCertificationStageId, boolean>
>;

export type FlightConnectorSandboxCertificationEvidenceByConnector = Partial<
  Record<FlightBookingConnectorId, FlightConnectorSandboxCertificationEvidence>
>;

export type FlightConnectorSandboxCertificationRecord = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  certificationState: "not_started";
  stages: readonly (FlightConnectorSandboxCertificationStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  certificationComplete: boolean;
  sandboxTrafficAuthorized: false;
  externalNetworkAccess: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
}>;

export function buildFlightConnectorSandboxCertification(
  evidence: FlightConnectorSandboxCertificationEvidenceByConnector = {},
) {
  const records: readonly FlightConnectorSandboxCertificationRecord[] = flightBookingConnectorDefinitions.map((connector) => {
    const connectorEvidence = evidence[connector.id] ?? {};
    const stages = flightConnectorSandboxCertificationStages.map((stage) => ({
      ...stage,
      complete: connectorEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: connector.id,
      label: connector.label,
      certificationState: "not_started",
      stages,
      completedCount,
      totalCount: stages.length,
      certificationComplete: completedCount === stages.length,
      sandboxTrafficAuthorized: false,
      externalNetworkAccess: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    } as const;
  });

  return {
    mode: FLIGHT_CONNECTOR_SANDBOX_CERTIFICATION_MODE,
    records,
    totalConnectors: records.length,
    completeCertificationCount: records.filter((record) => record.certificationComplete).length,
    sandboxTrafficAuthorized: false,
    externalNetworkAccess: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
