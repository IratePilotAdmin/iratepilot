import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_SANDBOX_CREDENTIAL_MODE =
  "sandbox_credential_readiness_plan_only" as const;

export type FlightRolloutSandboxCredentialStageId =
  | "contract_evidence_accepted"
  | "secret_channel_approved"
  | "sandbox_scope_bound"
  | "credential_metadata_received"
  | "credential_scope_verified"
  | "rotation_and_revocation_approved"
  | "sandbox_test_release_approved";

export type FlightRolloutSandboxCredentialStage = Readonly<{
  id: FlightRolloutSandboxCredentialStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutSandboxCredentialStages: readonly FlightRolloutSandboxCredentialStage[] = [
  { id: "contract_evidence_accepted", label: "Contract evidence accepted", owner: "Legal + Executive", detail: "Require the independently approved contract and authority packet before any secret can be considered." },
  { id: "secret_channel_approved", label: "Secret channel approved", owner: "Security", detail: "Approve one named secret-management channel, accountable recipients, access logging, and no-repository handling." },
  { id: "sandbox_scope_bound", label: "Sandbox scope bound", owner: "Security + Engineering", detail: "Bind environment, provider account, endpoint, permissions, expiry, and no-live-traffic limits before receipt." },
  { id: "credential_metadata_received", label: "Credential metadata received", owner: "Security", detail: "Receive only secret-free metadata and a digest through the approved channel; the credential value is never stored in source or evidence." },
  { id: "credential_scope_verified", label: "Credential scope verified", owner: "Security + Engineering", detail: "Verify provider identity, scopes, expiry, rotation, revocation, and environment without making a provider request." },
  { id: "rotation_and_revocation_approved", label: "Rotation and revocation approved", owner: "Security + Operations", detail: "Approve replacement, expiry, revocation, incident, and access-removal procedures before a test window." },
  { id: "sandbox_test_release_approved", label: "Sandbox test release approved", owner: "Release approvers", detail: "Approve one bounded sandbox test window separately; this gate cannot open network traffic, ticketing, payment, or Production." },
];

export type FlightRolloutSandboxCredentialEvidence = Partial<
  Record<FlightRolloutSandboxCredentialStageId, boolean>
>;

export type FlightRolloutSandboxCredentialEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutSandboxCredentialEvidence
  >
>;

type FlightRolloutSandboxCredentialRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutSandboxCredentialRecord = Readonly<{
  connectorId: FlightRolloutSandboxCredentialRouteId;
  routeRole: "primary" | "secondary";
  intakeState: "blocked_by_contract_evidence";
  stages: readonly (FlightRolloutSandboxCredentialStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  credentialStored: false;
  credentialTested: false;
  sandboxTrafficAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutSandboxCredentialReadiness(
  evidence: FlightRolloutSandboxCredentialEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutSandboxCredentialRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutSandboxCredentialStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      intakeState: "blocked_by_contract_evidence",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      credentialStored: false,
      credentialTested: false,
      sandboxTrafficAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_SANDBOX_CREDENTIAL_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    credentialStored: false,
    credentialTested: false,
    sandboxTrafficAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "contract_authority_evidence" as const,
    nextGate: "sandbox_credential_intake" as const,
  } as const;
}
