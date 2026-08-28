import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFlightBookingConnectorAdapter,
  createDisabledFlightBookingConnectorAdapter,
  disabledFlightBookingConnectorAdapters,
  flightBookingConnectorDefinitions,
  flightBookingConnectorIds,
  getFlightBookingConnectorDefinition,
} from "../lib/flights/booking-connectors";
import {
  buildFlightConnectorActivationReadiness,
  flightConnectorActivationStages,
  FLIGHT_CONNECTOR_ACTIVATION_MODE,
} from "../lib/flights/connector-activation-readiness";
import {
  buildFlightConnectorCandidateReviews,
  FLIGHT_CONNECTOR_CANDIDATE_REVIEW_MODE,
} from "../lib/flights/connector-candidate-review";
import {
  flightConnectorPublicEvidenceRecords,
  FLIGHT_CONNECTOR_PUBLIC_EVIDENCE_MODE,
  getFlightConnectorPublicEvidence,
} from "../lib/flights/connector-public-evidence";
import {
  buildFlightConnectorCredentialIntake,
  flightConnectorCredentialIntakeStages,
  FLIGHT_CONNECTOR_CREDENTIAL_INTAKE_MODE,
} from "../lib/flights/connector-credential-intake";
import {
  buildFlightConnectorSandboxCertification,
  flightConnectorSandboxCertificationStages,
  FLIGHT_CONNECTOR_SANDBOX_CERTIFICATION_MODE,
} from "../lib/flights/connector-sandbox-certification";
import {
  buildFlightConnectorRoutingReadiness,
  flightConnectorRoutingStages,
  FLIGHT_CONNECTOR_ROUTING_READINESS_MODE,
} from "../lib/flights/connector-routing-readiness";
import {
  buildFlightRolloutRouteDecision,
  FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
  FLIGHT_ROLLOUT_ROUTE_DECISION_MODE,
} from "../lib/flights/rollout-route-decision";
import {
  buildFlightRolloutContractAuthority,
  flightRolloutContractAuthorityStages,
  FLIGHT_ROLLOUT_CONTRACT_AUTHORITY_MODE,
} from "../lib/flights/rollout-contract-authority";
import {
  buildFlightRolloutContractEvidenceIntake,
  flightRolloutContractEvidenceStages,
  FLIGHT_ROLLOUT_CONTRACT_EVIDENCE_MODE,
} from "../lib/flights/rollout-contract-evidence-intake";
import {
  buildFlightRolloutSandboxCredentialReadiness,
  flightRolloutSandboxCredentialStages,
  FLIGHT_ROLLOUT_SANDBOX_CREDENTIAL_MODE,
} from "../lib/flights/rollout-sandbox-credential-readiness";
import {
  buildFlightRolloutSandboxCertification,
  flightRolloutSandboxCertificationStages,
  FLIGHT_ROLLOUT_SANDBOX_CERTIFICATION_MODE,
} from "../lib/flights/rollout-sandbox-certification";
import {
  buildFlightRolloutPaymentSettlementReadiness,
  flightRolloutPaymentSettlementStages,
  FLIGHT_ROLLOUT_PAYMENT_SETTLEMENT_MODE,
} from "../lib/flights/rollout-payment-settlement-readiness";
import {
  buildFlightRolloutSecurityPrivacyReadiness,
  flightRolloutSecurityPrivacyStages,
  FLIGHT_ROLLOUT_SECURITY_PRIVACY_MODE,
} from "../lib/flights/rollout-security-privacy-readiness";
import {
  buildFlightRolloutSupportReleaseReadiness,
  flightRolloutSupportReleaseStages,
  FLIGHT_ROLLOUT_SUPPORT_RELEASE_MODE,
} from "../lib/flights/rollout-support-release-readiness";
import {
  buildFlightRolloutPreviewReleaseReadiness,
  flightRolloutPreviewReleaseStages,
  FLIGHT_ROLLOUT_PREVIEW_RELEASE_MODE,
} from "../lib/flights/rollout-preview-release-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight booking connector catalog", () => {
  it("catalogues every requested GDS, host brand, and aggregator", () => {
    expect(flightBookingConnectorIds).toEqual([
      "sabre",
      "amadeus",
      "travelport",
      "worldspan",
      "abacus",
      "galileo",
      "airgateway",
      "verteil",
      "travelfusion",
    ]);
    expect(flightBookingConnectorDefinitions).toHaveLength(9);
    expect(flightBookingConnectorDefinitions.map(({ id }) => id)).toEqual(
      flightBookingConnectorIds,
    );
  });

  it("keeps every catalog entry dark until separate activation evidence exists", () => {
    for (const definition of flightBookingConnectorDefinitions) {
      expect(definition.candidateState).toBe("approved_candidate");
      expect(definition.lifecycle).toBe("catalogued_not_activated");
      expect(definition.externalNetworkAccess).toBe(false);
      expect(definition.supportsLiveTraffic).toBe(false);
      expect(definition.credentialsConfigured).toBe(false);
      expect(definition.activationRequires)
        .toBe("separate_contract_credentials_certification_and_release_approval");
      expect(definition.plannedOperations.length).toBeGreaterThan(0);
    }
  });

  it("preserves host-brand relationships", () => {
    expect(getFlightBookingConnectorDefinition("amadeus").integrationFamily)
      .toBe("amadeus");
    expect(getFlightBookingConnectorDefinition("worldspan").integrationFamily)
      .toBe("travelport");
    expect(getFlightBookingConnectorDefinition("galileo").integrationFamily)
      .toBe("travelport");
    expect(getFlightBookingConnectorDefinition("abacus").integrationFamily)
      .toBe("sabre");
  });

  it("requires a provider-specific ID when building a guarded adapter", () => {
    const bindings = {
      providerId: "sabre_flight_adapter",
      adapterVersion: "1.0.0",
      adapterSourceDigest: "a".repeat(64),
      accountScopeReceiptDigest: "b".repeat(64),
      pointOfSaleScopeReceiptDigest: "c".repeat(64),
      contentScopeReceiptDigest: "d".repeat(64),
    } as const;
    const execute = async () => { throw new Error("executor must not be called"); };
    expect(() => createFlightBookingConnectorAdapter("sabre", {
      mode: "provider_sandbox",
      executionBinding: bindings,
      paymentExecutionBinding: null,
      settlementExecutionBinding: null,
      execute,
      providerId: "wrong_provider_id",
    })).toThrow("requires provider ID sabre_flight_adapter");
  });

  it("provides a disabled runtime shell for every approved candidate", async () => {
    expect(Object.keys(disabledFlightBookingConnectorAdapters)).toEqual([...flightBookingConnectorIds]);
    for (const id of flightBookingConnectorIds) {
      const adapter = disabledFlightBookingConnectorAdapters[id];
      expect(adapter.providerId).toBe(`${id}_flight_adapter`);
      expect(adapter.mode).toBe("provider_sandbox");
      expect(adapter.externalNetworkAccess).toBe(false);
      expect(adapter.supportsLiveTraffic).toBe(false);
      await expect(adapter.search({
        origin: "ORD",
        destination: "LAX",
        departureDate: "2027-02-10",
        returnDate: null,
        cabin: "economy",
        passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      }, {} as never, {} as never)).rejects.toThrow("no provider request was made");
      expect(createDisabledFlightBookingConnectorAdapter(id)).not.toBe(adapter);
    }
  });

  it("surfaces the catalog in the protected administrator workspace", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("GDS and airline adapter surfaces");
    expect(page).toContain("buildFlightConnectorActivationReadiness");
    expect(page).toContain("Approved candidate · {connector.completedCount}/{connector.totalCount} gates");
    expect(page).toContain("Seven-workstream diligence checklist");
    expect(page).toContain("buildFlightConnectorCandidateReviews");
    expect(page).toContain("Official-source research record");
    expect(page).toContain("flightConnectorPublicEvidenceRecords.map");
    expect(page).toContain("Sandbox secret-readiness checklist");
    expect(page).toContain("buildFlightConnectorCredentialIntake");
    expect(page).toContain("Provider test-plan readiness");
    expect(page).toContain("buildFlightConnectorSandboxCertification");
    expect(page).toContain("Multi-connector route readiness");
    expect(page).toContain("buildFlightConnectorRoutingReadiness");
    expect(page).toContain("The authorized route preference is");
    expect(page).toContain("buildFlightRolloutRouteDecision");
    expect(page).toContain("Scoped sandbox credential readiness");
    expect(page).toContain("buildFlightRolloutSandboxCredentialReadiness");
    expect(page).toContain("Route-bound sandbox certification");
    expect(page).toContain("buildFlightRolloutSandboxCertification");
    expect(page).toContain("Flight payment and settlement readiness");
    expect(page).toContain("buildFlightRolloutPaymentSettlementReadiness");
    expect(page).toContain("Flight security and privacy readiness");
    expect(page).toContain("buildFlightRolloutSecurityPrivacyReadiness");
    expect(page).toContain("Controlled Preview and consumer-release readiness");
    expect(page).toContain("buildFlightRolloutSupportReleaseReadiness");
    expect(page).toContain("Controlled Preview release approval");
    expect(page).toContain("buildFlightRolloutPreviewReleaseReadiness");
    expect(page).not.toContain("connector.externalNetworkAccess = true");
  });

  it("keeps every connector at zero of ten activation gates by default", () => {
    const readiness = buildFlightConnectorActivationReadiness();
    expect(FLIGHT_CONNECTOR_ACTIVATION_MODE).toBe("catalogued_readiness_only");
    expect(flightConnectorActivationStages).toHaveLength(10);
    expect(readiness.totalConnectors).toBe(9);
    expect(readiness.readyConnectorCount).toBe(0);
    expect(readiness.liveConnectorCount).toBe(0);
    expect(readiness.tracks.every((track) => track.candidateState === "approved_candidate" && track.completedCount === 0 && track.totalCount === 10)).toBe(true);
    expect(readiness.tracks.every((track) => !track.externalNetworkAccess && !track.productionTrafficAuthorized)).toBe(true);
  });

  it("does not turn a completed checklist into external authorization", () => {
    const evidence = Object.fromEntries(flightBookingConnectorIds.map((id) => [
      id,
      Object.fromEntries(flightConnectorActivationStages.map((stage) => [stage.id, true])),
    ]));
    const readiness = buildFlightConnectorActivationReadiness(evidence);
    expect(readiness.readyConnectorCount).toBe(9);
    expect(readiness.liveConnectorCount).toBe(0);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.ticketingAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
  });

  it("starts candidate evidence review at zero of seven for every connector", () => {
    const review = buildFlightConnectorCandidateReviews();
    expect(FLIGHT_CONNECTOR_CANDIDATE_REVIEW_MODE).toBe("candidate_evidence_pending");
    expect(review.totalCandidates).toBe(9);
    expect(review.completeReviewCount).toBe(0);
    expect(review.shortlistedCount).toBe(0);
    expect(review.selectedCount).toBe(0);
    expect(review.reviews.every((candidate) => candidate.candidateState === "approved_candidate"
      && candidate.reviewState === "evidence_pending"
      && candidate.completedCount === 0
      && candidate.totalCount === 7
      && !candidate.shortlisted
      && !candidate.selected
      && !candidate.contractApproved
      && !candidate.credentialsAccepted
      && !candidate.externalNetworkAccess)).toBe(true);
  });

  it("records official public research without treating it as entitlement", () => {
    expect(FLIGHT_CONNECTOR_PUBLIC_EVIDENCE_MODE).toBe("official_public_research_only");
    expect(flightConnectorPublicEvidenceRecords).toHaveLength(9);
    expect(flightConnectorPublicEvidenceRecords.map(({ connectorId }) => connectorId)).toEqual(flightBookingConnectorIds);
    for (const record of flightConnectorPublicEvidenceRecords) {
      expect(record.evidenceState).toBe("public_research_recorded");
      expect(record.sourceUrls.length).toBeGreaterThan(0);
      expect(record.findings.length).toBeGreaterThan(0);
      expect(record.providerVerified).toBe(false);
      expect(record.contractVerified).toBe(false);
      expect(record.credentialsConfigured).toBe(false);
      expect(record.externalNetworkAccess).toBe(false);
    }
    expect(getFlightConnectorPublicEvidence("travelport").sourceUrls.length).toBeGreaterThan(0);
  });

  it("keeps credential intake blocked at zero of five for every connector", () => {
    const intake = buildFlightConnectorCredentialIntake();
    expect(FLIGHT_CONNECTOR_CREDENTIAL_INTAKE_MODE).toBe("credential_intake_blocked");
    expect(flightConnectorCredentialIntakeStages).toHaveLength(5);
    expect(intake.totalConnectors).toBe(9);
    expect(intake.intakeCompleteCount).toBe(0);
    expect(intake.credentialsStoredCount).toBe(0);
    expect(intake.credentialsTestedCount).toBe(0);
    expect(intake.records.every((record) => record.intakeState === "blocked"
      && record.completedCount === 0
      && record.totalCount === 5
      && !record.credentialStored
      && !record.credentialTested
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps sandbox certification at zero of six for every connector", () => {
    const certification = buildFlightConnectorSandboxCertification();
    expect(FLIGHT_CONNECTOR_SANDBOX_CERTIFICATION_MODE).toBe("sandbox_certification_plan_only");
    expect(flightConnectorSandboxCertificationStages).toHaveLength(6);
    expect(certification.totalConnectors).toBe(9);
    expect(certification.completeCertificationCount).toBe(0);
    expect(certification.records.every((record) => record.certificationState === "not_started"
      && record.completedCount === 0
      && record.totalCount === 6
      && !record.sandboxTrafficAuthorized
      && !record.externalNetworkAccess
      && !record.ticketingAuthorized
      && !record.paymentAuthorized)).toBe(true);
  });

  it("keeps routing unassigned and disabled for every connector", () => {
    const routing = buildFlightConnectorRoutingReadiness();
    expect(FLIGHT_CONNECTOR_ROUTING_READINESS_MODE).toBe("routing_plan_only");
    expect(flightConnectorRoutingStages).toHaveLength(6);
    expect(routing.totalCandidates).toBe(9);
    expect(routing.completeRoutingCount).toBe(0);
    expect(routing.selectedPrimary).toBeNull();
    expect(routing.fallbackOrder).toEqual([]);
    expect(routing.routeEnabled).toBe(false);
    expect(routing.records.every((record) => record.routeRole === "unassigned"
      && !record.active
      && record.completedCount === 0
      && record.totalCount === 6
      && !record.externalNetworkAccess
      && !record.productionTrafficAuthorized)).toBe(true);
  });

  it("records the authorized route preference without enabling operations", () => {
    const decision = buildFlightRolloutRouteDecision();
    expect(FLIGHT_ROLLOUT_ROUTE_DECISION_MODE).toBe("authorized_route_preference_only");
    expect(decision.decisionState).toBe("authorized_route_preference");
    expect(decision.primaryConnectorId).toBe(FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID);
    expect(decision.secondaryConnectorId).toBe(FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID);
    expect(decision.primaryConnectorId).toBe("duffel");
    expect(decision.secondaryConnectorId).toBe("sabre");
    expect(decision.alternativeConnectorIds).toEqual([
      "amadeus",
      "travelport",
      "worldspan",
      "abacus",
      "galileo",
      "airgateway",
      "verteil",
      "travelfusion",
    ]);
    expect(decision.parallelLaunchAuthorized).toBe(false);
    expect(decision.contractAuthorityApproved).toBe(false);
    expect(decision.credentialsConfigured).toBe(false);
    expect(decision.sandboxTrafficAuthorized).toBe(false);
    expect(decision.routeEnabled).toBe(false);
    expect(decision.bookingAuthorized).toBe(false);
    expect(decision.ticketingAuthorized).toBe(false);
    expect(decision.paymentAuthorized).toBe(false);
    expect(decision.productionTrafficAuthorized).toBe(false);
    expect(decision.nextGate).toBe("contract_authority");
  });

  it("opens only the primary contract gate and defers the secondary path", () => {
    const authority = buildFlightRolloutContractAuthority();
    expect(FLIGHT_ROLLOUT_CONTRACT_AUTHORITY_MODE).toBe("route_bound_contract_authority_plan_only");
    expect(flightRolloutContractAuthorityStages).toHaveLength(8);
    expect(authority.routePreference.primaryConnectorId).toBe("duffel");
    expect(authority.routePreference.secondaryConnectorId).toBe("sabre");
    expect(authority.totalRoutes).toBe(2);
    expect(authority.completeRouteCount).toBe(0);
    expect(authority.records[0].connectorId).toBe("duffel");
    expect(authority.records[0].routeRole).toBe("primary");
    expect(authority.records[0].reviewState).toBe("next_gate");
    expect(authority.records[0].completedCount).toBe(0);
    expect(authority.records[1].connectorId).toBe("sabre");
    expect(authority.records[1].routeRole).toBe("secondary");
    expect(authority.records[1].reviewState).toBe("deferred_until_primary_validated");
    expect(authority.records[1].completedCount).toBe(0);
    expect(authority.contractAuthorityApproved).toBe(false);
    expect(authority.credentialsConfigured).toBe(false);
    expect(authority.sandboxTrafficAuthorized).toBe(false);
    expect(authority.routeEnabled).toBe(false);
    expect(authority.bookingAuthorized).toBe(false);
    expect(authority.ticketingAuthorized).toBe(false);
    expect(authority.paymentAuthorized).toBe(false);
    expect(authority.externalNetworkAccess).toBe(false);
    expect(authority.productionTrafficAuthorized).toBe(false);
    expect(authority.nextGate).toBe("contract_authority");
  });

  it("keeps the real contract gate blocked until external evidence is supplied", () => {
    const intake = buildFlightRolloutContractEvidenceIntake();
    expect(FLIGHT_ROLLOUT_CONTRACT_EVIDENCE_MODE).toBe("external_contract_evidence_required");
    expect(flightRolloutContractEvidenceStages).toHaveLength(7);
    expect(intake.routePreference.primaryConnectorId).toBe("duffel");
    expect(intake.routePreference.secondaryConnectorId).toBe("sabre");
    expect(intake.totalRoutes).toBe(2);
    expect(intake.completeRouteCount).toBe(0);
    expect(intake.evidenceReceived).toBe(false);
    expect(intake.contractAccepted).toBe(false);
    expect(intake.credentialsAccepted).toBe(false);
    expect(intake.externalNetworkAccess).toBe(false);
    expect(intake.nextGate).toBe("contract_authority_evidence");
    expect(intake.records.every((record) => record.intakeState === "blocked"
      && record.completedCount === 0
      && record.totalCount === 7
      && !record.evidenceComplete
      && !record.contractAccepted
      && !record.credentialsAccepted
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps sandbox credential readiness blocked behind contract evidence", () => {
    const readiness = buildFlightRolloutSandboxCredentialReadiness();
    expect(FLIGHT_ROLLOUT_SANDBOX_CREDENTIAL_MODE).toBe("sandbox_credential_readiness_plan_only");
    expect(flightRolloutSandboxCredentialStages).toHaveLength(7);
    expect(readiness.routePreference.primaryConnectorId).toBe("duffel");
    expect(readiness.routePreference.secondaryConnectorId).toBe("sabre");
    expect(readiness.totalRoutes).toBe(2);
    expect(readiness.completeRouteCount).toBe(0);
    expect(readiness.blockedBy).toBe("contract_authority_evidence");
    expect(readiness.credentialStored).toBe(false);
    expect(readiness.credentialTested).toBe(false);
    expect(readiness.sandboxTrafficAuthorized).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.nextGate).toBe("sandbox_credential_intake");
    expect(readiness.records.every((record) => record.intakeState === "blocked_by_contract_evidence"
      && record.completedCount === 0
      && record.totalCount === 7
      && !record.readinessComplete
      && !record.credentialStored
      && !record.credentialTested
      && !record.sandboxTrafficAuthorized
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps route-bound sandbox certification blocked behind credential readiness", () => {
    const certification = buildFlightRolloutSandboxCertification();
    expect(FLIGHT_ROLLOUT_SANDBOX_CERTIFICATION_MODE).toBe("sandbox_certification_plan_only");
    expect(flightRolloutSandboxCertificationStages).toHaveLength(8);
    expect(certification.routePreference.primaryConnectorId).toBe("duffel");
    expect(certification.routePreference.secondaryConnectorId).toBe("sabre");
    expect(certification.totalRoutes).toBe(2);
    expect(certification.completeRouteCount).toBe(0);
    expect(certification.testTrafficAuthorized).toBe(false);
    expect(certification.ticketingAuthorized).toBe(false);
    expect(certification.paymentAuthorized).toBe(false);
    expect(certification.externalNetworkAccess).toBe(false);
    expect(certification.blockedBy).toBe("sandbox_credential_intake");
    expect(certification.nextGate).toBe("sandbox_certification");
    expect(certification.records.every((record) => record.certificationState === "blocked_by_sandbox_credential"
      && record.completedCount === 0
      && record.totalCount === 8
      && !record.certificationComplete
      && !record.testTrafficAuthorized
      && !record.ticketingAuthorized
      && !record.paymentAuthorized
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps payment and settlement readiness blocked behind sandbox certification", () => {
    const readiness = buildFlightRolloutPaymentSettlementReadiness();
    expect(FLIGHT_ROLLOUT_PAYMENT_SETTLEMENT_MODE).toBe("payment_settlement_readiness_plan_only");
    expect(flightRolloutPaymentSettlementStages).toHaveLength(9);
    expect(readiness.routePreference.primaryConnectorId).toBe("duffel");
    expect(readiness.routePreference.secondaryConnectorId).toBe("sabre");
    expect(readiness.totalRoutes).toBe(2);
    expect(readiness.completeRouteCount).toBe(0);
    expect(readiness.paymentAuthorized).toBe(false);
    expect(readiness.settlementAuthorized).toBe(false);
    expect(readiness.chargeCreated).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.blockedBy).toBe("sandbox_certification");
    expect(readiness.nextGate).toBe("payment_settlement_readiness");
    expect(readiness.records.every((record) => record.paymentState === "blocked_by_sandbox_certification"
      && record.completedCount === 0
      && record.totalCount === 9
      && !record.readinessComplete
      && !record.paymentAuthorized
      && !record.settlementAuthorized
      && !record.chargeCreated
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps security and privacy readiness blocked behind payment settlement", () => {
    const readiness = buildFlightRolloutSecurityPrivacyReadiness();
    expect(FLIGHT_ROLLOUT_SECURITY_PRIVACY_MODE).toBe("security_privacy_readiness_plan_only");
    expect(flightRolloutSecurityPrivacyStages).toHaveLength(8);
    expect(readiness.routePreference.primaryConnectorId).toBe("duffel");
    expect(readiness.routePreference.secondaryConnectorId).toBe("sabre");
    expect(readiness.totalRoutes).toBe(2);
    expect(readiness.completeRouteCount).toBe(0);
    expect(readiness.passengerDataAuthorized).toBe(false);
    expect(readiness.credentialAccessAuthorized).toBe(false);
    expect(readiness.webhookProcessingAuthorized).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.blockedBy).toBe("payment_settlement_readiness");
    expect(readiness.nextGate).toBe("security_privacy_readiness");
    expect(readiness.records.every((record) => record.securityState === "blocked_by_payment_settlement"
      && record.completedCount === 0
      && record.totalCount === 8
      && !record.readinessComplete
      && !record.passengerDataAuthorized
      && !record.credentialAccessAuthorized
      && !record.webhookProcessingAuthorized
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps support and release readiness blocked behind security and privacy", () => {
    const readiness = buildFlightRolloutSupportReleaseReadiness();
    expect(FLIGHT_ROLLOUT_SUPPORT_RELEASE_MODE).toBe("support_release_readiness_plan_only");
    expect(flightRolloutSupportReleaseStages).toHaveLength(8);
    expect(readiness.routePreference.primaryConnectorId).toBe("duffel");
    expect(readiness.routePreference.secondaryConnectorId).toBe("sabre");
    expect(readiness.totalRoutes).toBe(2);
    expect(readiness.completeRouteCount).toBe(0);
    expect(readiness.supportAuthorized).toBe(false);
    expect(readiness.previewReleaseAuthorized).toBe(false);
    expect(readiness.consumerReleaseAuthorized).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.blockedBy).toBe("security_privacy_readiness");
    expect(readiness.nextGate).toBe("support_release_readiness");
    expect(readiness.records.every((record) => record.releaseState === "blocked_by_security_privacy"
      && record.completedCount === 0
      && record.totalCount === 8
      && !record.readinessComplete
      && !record.supportAuthorized
      && !record.previewReleaseAuthorized
      && !record.consumerReleaseAuthorized
      && !record.productionTrafficAuthorized
      && !record.externalNetworkAccess)).toBe(true);
  });

  it("keeps controlled Preview release blocked behind support readiness", () => {
    const readiness = buildFlightRolloutPreviewReleaseReadiness();
    expect(FLIGHT_ROLLOUT_PREVIEW_RELEASE_MODE).toBe("controlled_preview_release_plan_only");
    expect(flightRolloutPreviewReleaseStages).toHaveLength(8);
    expect(readiness.routePreference.primaryConnectorId).toBe("duffel");
    expect(readiness.routePreference.secondaryConnectorId).toBe("sabre");
    expect(readiness.totalRoutes).toBe(2);
    expect(readiness.completeRouteCount).toBe(0);
    expect(readiness.previewReleaseAuthorized).toBe(false);
    expect(readiness.consumerBookingAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
    expect(readiness.ticketingAuthorized).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.blockedBy).toBe("support_release_readiness");
    expect(readiness.nextGate).toBe("controlled_preview_release");
    expect(readiness.records.every((record) => record.releaseState === "blocked_by_support_release_readiness"
      && record.completedCount === 0
      && record.totalCount === 8
      && !record.readinessComplete
      && !record.previewReleaseAuthorized
      && !record.consumerBookingAuthorized
      && !record.paymentAuthorized
      && !record.ticketingAuthorized
      && !record.externalNetworkAccess)).toBe(true);
  });
});
