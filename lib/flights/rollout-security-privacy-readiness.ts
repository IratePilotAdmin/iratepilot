import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
} from "./rollout-route-decision";

export const FLIGHT_ROLLOUT_SECURITY_PRIVACY_MODE =
  "security_privacy_readiness_plan_only" as const;

export type FlightRolloutSecurityPrivacyStageId =
  | "data_flow_and_roles_approved"
  | "passenger_data_minimization_approved"
  | "secret_and_access_controls_approved"
  | "webhook_authentication_approved"
  | "logging_redaction_and_audit_approved"
  | "retention_and_deletion_approved"
  | "incident_and_breach_response_approved"
  | "security_release_approved";

export type FlightRolloutSecurityPrivacyStage = Readonly<{
  id: FlightRolloutSecurityPrivacyStageId;
  label: string;
  owner: string;
  detail: string;
}>;

export const flightRolloutSecurityPrivacyStages: readonly FlightRolloutSecurityPrivacyStage[] = [
  { id: "data_flow_and_roles_approved", label: "Data flow and roles approved", owner: "Security + Privacy + Legal", detail: "Approve controller, processor, provider, and service-provider roles for consumer passenger and payment data." },
  { id: "passenger_data_minimization_approved", label: "Passenger-data minimization approved", owner: "Privacy + Product", detail: "Approve the minimum traveler fields, purpose limits, masking, and prohibition on unnecessary identity documents." },
  { id: "secret_and_access_controls_approved", label: "Secret and access controls approved", owner: "Security + Engineering", detail: "Approve secret storage, least privilege, tenant isolation, access reviews, rotation, revocation, and break-glass controls." },
  { id: "webhook_authentication_approved", label: "Webhook authentication approved", owner: "Security + Engineering", detail: "Approve signature verification, replay protection, event quarantine, delivery limits, and provider-specific authenticity checks." },
  { id: "logging_redaction_and_audit_approved", label: "Logging, redaction, and audit approved", owner: "Security + Compliance", detail: "Approve decision logs, correlation identifiers, redaction, audit integrity, operator access, and sensitive-data exclusions." },
  { id: "retention_and_deletion_approved", label: "Retention and deletion approved", owner: "Privacy + Operations", detail: "Approve retention periods, deletion workflows, legal holds, backups, provider deletion, and traveler-request handling." },
  { id: "incident_and_breach_response_approved", label: "Incident and breach response approved", owner: "Security + Legal + Support", detail: "Approve fraud, breach, outage, ambiguous-order, credential-compromise, notification, escalation, and stop procedures." },
  { id: "security_release_approved", label: "Security release approved", owner: "Security + Release approvers", detail: "Approve a bounded Preview or Production release only after provider, sandbox, payment, support, and privacy evidence is complete." },
];

export type FlightRolloutSecurityPrivacyEvidence = Partial<
  Record<FlightRolloutSecurityPrivacyStageId, boolean>
>;

export type FlightRolloutSecurityPrivacyEvidenceByRoute = Partial<
  Record<
    typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    FlightRolloutSecurityPrivacyEvidence
  >
>;

type FlightRolloutSecurityPrivacyRouteId =
  | typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID
  | typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;

export type FlightRolloutSecurityPrivacyRecord = Readonly<{
  connectorId: FlightRolloutSecurityPrivacyRouteId;
  routeRole: "primary" | "secondary";
  securityState: "blocked_by_payment_settlement";
  stages: readonly (FlightRolloutSecurityPrivacyStage & { complete: boolean })[];
  completedCount: number;
  totalCount: number;
  readinessComplete: boolean;
  passengerDataAuthorized: false;
  credentialAccessAuthorized: false;
  webhookProcessingAuthorized: false;
  externalNetworkAccess: false;
}>;

export function buildFlightRolloutSecurityPrivacyReadiness(
  evidence: FlightRolloutSecurityPrivacyEvidenceByRoute = {},
) {
  const routeDecision = buildFlightRolloutRouteDecision();
  const routes: readonly [
    { connectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID; routeRole: "primary" },
    { connectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID; routeRole: "secondary" },
  ] = [
    { connectorId: routeDecision.primaryConnectorId, routeRole: "primary" },
    { connectorId: routeDecision.secondaryConnectorId, routeRole: "secondary" },
  ];
  const records: readonly FlightRolloutSecurityPrivacyRecord[] = routes.map((route) => {
    const routeEvidence = evidence[route.connectorId] ?? {};
    const stages = flightRolloutSecurityPrivacyStages.map((stage) => ({
      ...stage,
      complete: routeEvidence[stage.id] === true,
    }));
    const completedCount = stages.filter((stage) => stage.complete).length;
    return {
      connectorId: route.connectorId,
      routeRole: route.routeRole,
      securityState: "blocked_by_payment_settlement",
      stages,
      completedCount,
      totalCount: stages.length,
      readinessComplete: completedCount === stages.length,
      passengerDataAuthorized: false,
      credentialAccessAuthorized: false,
      webhookProcessingAuthorized: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_ROLLOUT_SECURITY_PRIVACY_MODE,
    routePreference: {
      primaryConnectorId: routeDecision.primaryConnectorId,
      secondaryConnectorId: routeDecision.secondaryConnectorId,
    },
    records,
    totalRoutes: records.length,
    completeRouteCount: records.filter((record) => record.readinessComplete).length,
    passengerDataAuthorized: false,
    credentialAccessAuthorized: false,
    webhookProcessingAuthorized: false,
    externalNetworkAccess: false,
    blockedBy: "payment_settlement_readiness" as const,
    nextGate: "security_privacy_readiness" as const,
  } as const;
}
