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
});
