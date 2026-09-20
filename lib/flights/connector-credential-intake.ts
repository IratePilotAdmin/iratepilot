import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_CONNECTOR_CREDENTIAL_INTAKE_MODE = "credential_intake_blocked" as const;

export type FlightConnectorCredentialIntakeStageId =
  | "provider_selected"
  | "contract_authority_recorded"
  | "secret_channel_approved"
  | "sandbox_credential_received"
  | "credential_scope_verified";

export type FlightConnectorCredentialIntakeStage = Readonly<{
  id: FlightConnectorCredentialIntakeStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightConnectorCredentialIntakeStages: readonly FlightConnectorCredentialIntakeStage[] = [
  { id: "provider_selected", label: "Provider selected", owner: "Commercial + Executive", detail: "Record a single approved provider path before accepting any secret." },
  { id: "contract_authority_recorded", label: "Contract and authority recorded", owner: "Legal + Finance", detail: "Record content, ticketing, settlement, servicing, and support authority." },
  { id: "secret_channel_approved", label: "Secret channel approved", owner: "Security", detail: "Approve a named secret-management channel and accountable recipients." },
  { id: "sandbox_credential_received", label: "Sandbox credential received", owner: "Security", detail: "Receive only a scoped sandbox secret; never place it in source, logs, or evidence." },
  { id: "credential_scope_verified", label: "Credential scope verified", owner: "Security + Engineering", detail: "Verify environment, scopes, expiry, rotation, and provider identity before any test." },
];

export type FlightConnectorCredentialIntakeEvidence = Partial<
  Record<FlightConnectorCredentialIntakeStageId, boolean>
>;

export type FlightConnectorCredentialIntakeEvidenceByConnector = Partial<
  Record<FlightBookingConnectorId, FlightConnectorCredentialIntakeEvidence>
>;

export type FlightConnectorCredentialIntakeRecord = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  intakeState: "blocked";
  stages: readonly (FlightConnectorCredentialIntakeStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  intakeComplete: boolean;
  credentialStored: false;
  credentialTested: false;
  externalNetworkAccess: false;
}>;

export function buildFlightConnectorCredentialIntake(
  evidence: FlightConnectorCredentialIntakeEvidenceByConnector = {},
) {
  const records: readonly FlightConnectorCredentialIntakeRecord[] = flightBookingConnectorDefinitions.map((connector) => {
    const connectorEvidence = evidence[connector.id] ?? {};
    const stages = flightConnectorCredentialIntakeStages.map((stage) => ({
      ...stage,
      complete: connectorEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: connector.id,
      label: connector.label,
      intakeState: "blocked",
      stages,
      completedCount,
      totalCount: stages.length,
      intakeComplete: completedCount === stages.length,
      credentialStored: false,
      credentialTested: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_CONNECTOR_CREDENTIAL_INTAKE_MODE,
    records,
    totalConnectors: records.length,
    intakeCompleteCount: records.filter((record) => record.intakeComplete).length,
    credentialsStoredCount: 0,
    credentialsTestedCount: 0,
    externalNetworkAccess: false,
  } as const;
}
