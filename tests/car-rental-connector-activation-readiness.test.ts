import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalConnectorActivationPlan,
  buildCarRentalProviderDecisionReadinessPlan,
  CAR_RENTAL_CONNECTOR_ACTIVATION_MODE,
  CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE,
  CAR_RENTAL_PROVIDER_DECISION_READINESS_MODE,
  carRentalAggregatorAlternateCandidateIds,
  carRentalAggregatorShortlistCandidateIds,
  carRentalConnectorActivationFixtures,
  carRentalConnectorActivationProhibitedFields,
  carRentalConnectorActivationRecordedFields,
  carRentalConnectorActivationStageIds,
  carRentalConnectorActivationStages,
  carRentalProviderDecisionReadinessGateIds,
  carRentalProviderDecisionReadinessGates,
  carRentalProviderDecisionReadinessProhibitedFields,
  carRentalProviderDecisionReadinessRecordedFields,
  carRentalPublicResearchProfiles,
  carRentalSyntheticProviderDecisionReadinessFixture,
  validateCarRentalConnectorActivationRecord,
  validateCarRentalProviderDecisionReadinessRecord,
  type CarRentalConnectorActivationRecord,
  type CarRentalProviderDecisionReadinessRecord,
} from "../lib/cars/connector-activation-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function cloneRecord(record: CarRentalConnectorActivationRecord): CarRentalConnectorActivationRecord {
  return structuredClone(record);
}

function cloneDecisionRecord(record: CarRentalProviderDecisionReadinessRecord): CarRentalProviderDecisionReadinessRecord {
  return structuredClone(record);
}

describe("car-rental connector activation readiness", () => {
  it("creates one fail-closed activation track for every named connector", () => {
    const plan = buildCarRentalConnectorActivationPlan();

    expect(CAR_RENTAL_CONNECTOR_ACTIVATION_MODE).toBe("connector_activation_readiness_local_only");
    expect(plan.tracks.map((track) => track.connectorId)).toEqual(["sabre", "travelport", "aggregator"]);
    expect(plan.tracks.every((track) => track.active === false && track.connectionState === "disabled")).toBe(true);
  });

  it("keeps the live activation countdown at zero", () => {
    expect(buildCarRentalConnectorActivationPlan()).toMatchObject({
      activeConnectorCount: 0,
      provisionedAccountCount: 0,
      sandboxCertifiedConnectorCount: 0,
      connectedConnectorCount: 0,
      externalRequestCount: 0,
      supplierContactAuthorized: false,
      providerAccountCreationAuthorized: false,
      credentialHandlingAuthorized: false,
      sandboxTrafficAuthorized: false,
      livePilotAuthorized: false,
      reservationMutationAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
      migrationAuthorized: false,
      productionAuthorized: false,
    });
  });

  it("defines the ten required activation stages in order", () => {
    expect(carRentalConnectorActivationStageIds).toEqual([
      "provider_decision",
      "contact_authorization",
      "commercial_legal_approval",
      "provider_account",
      "capability_verification",
      "security_privacy_approval",
      "credential_vault",
      "sandbox_certification",
      "operational_acceptance",
      "production_activation_decision",
    ]);
    expect(carRentalConnectorActivationStages).toHaveLength(10);
  });

  it("never converts a completed planning review into supplier, traffic, transaction, or Production authority", () => {
    const allEvidence = Object.fromEntries(carRentalConnectorActivationStages.map((stage) => [stage.id, true]));
    const plan = buildCarRentalConnectorActivationPlan(allEvidence);

    expect(plan.planningReviewComplete).toBe(true);
    expect(plan.completedPlanningStageCount).toBe(plan.totalPlanningStageCount);
    expect(plan.activeConnectorCount).toBe(0);
    expect(plan.supplierContactAuthorized).toBe(false);
    expect(plan.credentialHandlingAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.reservationMutationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
    expect(plan.productionAuthorized).toBe(false);
  });

  it("distinguishes named candidates from the unselected aggregator path", () => {
    const [sabre, travelport, aggregator] = buildCarRentalConnectorActivationPlan().tracks;

    expect(sabre.providerDecisionState).toBe("candidate_only");
    expect(travelport.providerDecisionState).toBe("candidate_only");
    expect(aggregator.providerDecisionState).toBe("selection_required");
    expect(aggregator.blocker).toContain("No aggregator provider has been selected");
  });

  it("accepts three sanitized local activation records without activating a connector", () => {
    expect(carRentalConnectorActivationFixtures).toHaveLength(3);
    for (const fixture of carRentalConnectorActivationFixtures) {
      expect(validateCarRentalConnectorActivationRecord(fixture)).toMatchObject({
        valid: true,
        activationTrackRecorded: true,
        connectorActive: false,
        providerContactAuthorized: false,
        providerAccountCreationAuthorized: false,
        credentialHandlingAuthorized: false,
        sandboxTrafficAuthorized: false,
        externalTrafficAuthorized: false,
        reservationMutationAuthorized: false,
        refundExecutionAuthorized: false,
        paymentAuthorized: false,
        migrationAuthorized: false,
        productionAuthorized: false,
        errors: [],
      });
    }
  });

  it("rejects attempts to advance provider, account, credential, sandbox, connection, or Production state", () => {
    const invalid = cloneRecord(carRentalConnectorActivationFixtures[0]);
    invalid.dueDiligenceState = "complete" as never;
    invalid.providerAccountState = "created" as never;
    invalid.capabilityVerificationState = "verified" as never;
    invalid.credentialVaultState = "configured" as never;
    invalid.sandboxState = "connected" as never;
    invalid.connectionState = "active" as never;
    invalid.productionDecisionState = "approved" as never;

    expect(validateCarRentalConnectorActivationRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Provider due diligence must remain not started in the local activation layer.",
      "Provider accounts are not authorized in the local activation layer.",
      "Provider capability must remain not verified.",
      "Credential configuration or material is not authorized.",
      "Provider sandbox connectivity must remain disabled.",
      "Connector connection state must remain disabled.",
      "A separate Production activation decision remains required.",
    ]));
  });

  it("rejects malformed evidence, released kill switches, excess fields, and prohibited data", () => {
    const invalid = cloneRecord(carRentalConnectorActivationFixtures[1]);
    invalid.activationCaseId = "bad";
    invalid.evidenceDigest = "ABC";
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";
    invalid.recordedFields = [...carRentalConnectorActivationRecordedFields, "api_key", "api_key"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalConnectorActivationRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Activation-case ID must be a stable opaque token.",
      "Activation evidence must be a lowercase 64-character digest.",
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized activation allowlist.",
      "Contact, contract, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks local activation readiness.",
    ]));
    expect(carRentalConnectorActivationProhibitedFields).toContain("api_key");
    expect(carRentalConnectorActivationRecordedFields).not.toContain("api_key");
  });

  it("requires the aggregator track to remain unselected", () => {
    const invalid = cloneRecord(carRentalConnectorActivationFixtures[2]);
    invalid.providerDecisionState = "candidate_only";

    expect(validateCarRentalConnectorActivationRecord(invalid).errors).toContain("Provider-decision state must match the connector binding.");
  });

  it("records exactly three public-research profiles without issuing a recommendation", () => {
    expect(carRentalPublicResearchProfiles.map((profile) => [profile.connectorId, profile.researchState, profile.disposition])).toEqual([
      ["sabre", "public_research_recorded", "technical_secondary_candidate"],
      ["travelport", "public_research_recorded", "conditional_enterprise_candidate"],
      ["aggregator", "public_research_recorded", "shortlist_selection_required"],
    ]);
    expect(carRentalAggregatorShortlistCandidateIds).toEqual(["carnect", "cartrawler", "booking_com_demand"]);
    expect(carRentalAggregatorAlternateCandidateIds).toEqual(["economybookings", "discovercars"]);
    expect(new Set(carRentalPublicResearchProfiles.map((profile) => profile.connectorId)).size).toBe(3);
    expect(carRentalPublicResearchProfiles[2].aggregatorShortlistCandidateIds).toEqual(carRentalAggregatorShortlistCandidateIds);
    expect(carRentalPublicResearchProfiles[0].aggregatorShortlistCandidateIds).toEqual([]);
    expect(JSON.stringify(carRentalPublicResearchProfiles)).not.toMatch(/formalScore|weightedScore|scorePercent|recommendationId/);
  });

  it("defines seven unique, owned internal decision-readiness gates", () => {
    expect(carRentalProviderDecisionReadinessGateIds).toEqual([
      "research_artifact_reconciled",
      "decision_question_defined",
      "candidate_scope_frozen",
      "public_evidence_limits_acknowledged",
      "unknowns_and_hard_stops_reviewed",
      "owners_and_conflicts_reviewed",
      "separate_decision_boundary_acknowledged",
    ]);
    expect(carRentalProviderDecisionReadinessGates).toHaveLength(7);
    expect(new Set(carRentalProviderDecisionReadinessGates.map((gate) => gate.id)).size).toBe(7);
    expect(carRentalProviderDecisionReadinessGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("starts with research 3 of 3 and decision readiness 0 of 7", () => {
    expect(buildCarRentalProviderDecisionReadinessPlan()).toMatchObject({
      mode: CAR_RENTAL_PROVIDER_DECISION_READINESS_MODE,
      researchCompletedCount: 3,
      researchTotalCount: 3,
      researchComplete: true,
      completedReadinessGateCount: 0,
      totalReadinessGateCount: 7,
      readinessState: "review_required",
      decisionPacketReady: false,
      providerDecisionState: "separate_decision_required",
      providerDecisionRecorded: false,
      selectedProviderId: null,
      formalRecommendationState: "not_issued",
      activationStageOneComplete: false,
      activeConnectorCount: 0,
      providerContactAuthorized: false,
      deploymentAuthorized: false,
      productionAuthorized: false,
      applicationKillSwitchState: "engaged",
      databaseKillSwitchState: "engaged",
    });
  });

  it("makes a packet ready without selecting, contacting, connecting, or activating a provider", () => {
    const allEvidence = Object.fromEntries(carRentalProviderDecisionReadinessGates.map((gate) => [gate.id, true]));
    const decisionPlan = buildCarRentalProviderDecisionReadinessPlan(allEvidence);
    const activationPlan = buildCarRentalConnectorActivationPlan();

    expect(decisionPlan).toMatchObject({
      completedReadinessGateCount: 7,
      totalReadinessGateCount: 7,
      readinessState: "ready_for_internal_decision",
      decisionPacketReady: true,
      providerDecisionRecorded: false,
      selectedProviderId: null,
      formalRecommendationState: "not_issued",
      activationStageOneComplete: false,
      activeConnectorCount: 0,
      providerContactAuthorized: false,
      providerAccountCreationAuthorized: false,
      credentialHandlingAuthorized: false,
      sandboxTrafficAuthorized: false,
      externalTrafficAuthorized: false,
      reservationMutationAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
      migrationAuthorized: false,
      deploymentAuthorized: false,
      productionAuthorized: false,
    });
    expect(activationPlan.tracks.every((track) => track.completedStageCount === 0)).toBe(true);
    expect(activationPlan.activeConnectorCount).toBe(0);
  });

  it("accepts a sanitized synthetic packet-ready fixture without completing provider decision stage 1", () => {
    expect(carRentalSyntheticProviderDecisionReadinessFixture.evidenceMode).toBe(CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE);
    expect(validateCarRentalProviderDecisionReadinessRecord(carRentalSyntheticProviderDecisionReadinessFixture)).toMatchObject({
      valid: true,
      decisionPacketReady: true,
      providerDecisionRecorded: false,
      providerSelected: false,
      activationStageOneComplete: false,
      providerContactAuthorized: false,
      providerAccountCreationAuthorized: false,
      credentialHandlingAuthorized: false,
      sandboxTrafficAuthorized: false,
      externalTrafficAuthorized: false,
      reservationMutationAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
      migrationAuthorized: false,
      deploymentAuthorized: false,
      productionAuthorized: false,
      errors: [],
    });
  });

  it("rejects provider selection, recommendation, accounts, credentials, traffic, transactions, deployment, and Production", () => {
    const invalid = cloneDecisionRecord(carRentalSyntheticProviderDecisionReadinessFixture);
    invalid.providerDecisionRecorded = true as never;
    invalid.selectedProviderId = "sabre" as never;
    invalid.formalRecommendationState = "issued" as never;
    invalid.providerContactMade = true as never;
    invalid.providerAccountPresent = true as never;
    invalid.credentialMaterialPresent = true as never;
    invalid.sandboxConnectionPresent = true as never;
    invalid.externalRequestAttempted = true as never;
    invalid.reservationActionAttempted = true as never;
    invalid.refundActionAttempted = true as never;
    invalid.paymentActionAttempted = true as never;
    invalid.migrationAttempted = true as never;
    invalid.deploymentAttempted = true as never;
    invalid.productionAuthorized = true as never;

    expect(validateCarRentalProviderDecisionReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "A separate provider decision remains required and unrecorded.",
      "Provider selection is not permitted in a decision-readiness record.",
      "A formal provider recommendation has not been authorized.",
      "Provider contact is not authorized by decision readiness.",
      "Provider accounts are not authorized by decision readiness.",
      "Credential material is not authorized by decision readiness.",
      "Sandbox connectivity is not authorized by decision readiness.",
      "External provider traffic is not authorized by decision readiness.",
      "Reservation, refund, or payment actions are not authorized by decision readiness.",
      "Migration or deployment is not authorized by decision readiness.",
      "Production is not authorized by decision readiness.",
    ]));
  });

  it("rejects malformed, tampered, duplicated, excess, prohibited, or kill-switch-releasing decision evidence", () => {
    const invalid = cloneDecisionRecord(carRentalSyntheticProviderDecisionReadinessFixture);
    invalid.decisionReadinessCaseId = "bad";
    invalid.evidenceMode = "live" as never;
    invalid.researchArtifactId = "different-artifact" as never;
    invalid.researchRecordedDate = "2026-08-22" as never;
    invalid.evidenceDigest = "UPPERCASE";
    invalid.researchedConnectorIds = ["sabre", "sabre", "aggregator"];
    invalid.aggregatorShortlistCandidateIds = ["cartrawler", "carnect", "booking_com_demand"];
    invalid.aggregatorAlternateCandidateIds = ["discovercars", "economybookings"];
    invalid.completedGateIds = [...carRentalProviderDecisionReadinessGateIds, "research_artifact_reconciled"];
    invalid.readinessState = "ready_for_internal_decision";
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";
    invalid.recordedFields = [...carRentalProviderDecisionReadinessRecordedFields, "formal_score", "formal_score"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalProviderDecisionReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Decision-readiness case ID must be a stable opaque token.",
      "Decision-readiness records must remain explicitly synthetic offline fixtures.",
      "Decision readiness must bind the recorded public-research artifact.",
      "Public-research recorded date does not match the controlled artifact.",
      "Researched connector inventory cannot contain duplicates.",
      "Researched connector inventory must exactly match Sabre, Travelport, and the unselected aggregator path.",
      "Aggregator shortlist must exactly match the ordered controlled public-research candidates.",
      "Aggregator alternates must exactly match the ordered controlled public-research candidates.",
      "Completed readiness-gate inventory cannot contain duplicates.",
      "Readiness state must match the completed local gate inventory.",
      "Decision-readiness evidence must be a lowercase 64-character digest.",
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized decision-readiness allowlist.",
      "Contact, submission, contract, score, recommendation, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks decision readiness.",
    ]));
    expect(carRentalProviderDecisionReadinessProhibitedFields).toContain("formal_score");
    expect(carRentalProviderDecisionReadinessRecordedFields).not.toContain("formal_score");
  });

  it("rejects actual extra runtime fields even when the declared allowlist stays clean", () => {
    const invalid = {
      ...cloneDecisionRecord(carRentalSyntheticProviderDecisionReadinessFixture),
      api_key: "must-not-be-retained",
    } as unknown as CarRentalProviderDecisionReadinessRecord;

    expect(validateCarRentalProviderDecisionReadinessRecord(invalid).errors).toContain("Decision-readiness record contains unsupported or prohibited runtime fields.");
  });

  it("adds a read-only decision workspace and documents the separate provider-decision boundary", () => {
    const page = read("app/admin/cars/page.tsx");
    const activationDocument = read("docs/CAR_RENTALS_CONNECTOR_ACTIVATION_READINESS.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Provider-decision readiness");
    expect(page).toContain("3 of 3 public research tracks recorded");
    expect(page).toContain("No provider selected");
    expect(page).toContain("Live connector activation control center");
    expect(page).toContain("Three activation tracks, all fail-closed");
    expect(page).toContain("{connectorActivation.activeConnectorCount} of {connectorActivation.tracks.length} live");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(activationDocument).toContain("No provider contact is authorized");
    expect(activationDocument).toContain("Public research recorded: 3 of 3 paths");
    expect(activationDocument).toContain("Provider decision recorded: no");
    expect(packageRoadmap).toContain("Current live connector activation: **0 of 3 connectors**");
    expect(packageRoadmap).toContain("Public connector research: **3 of 3 paths recorded**");
    expect(roadmap).toContain("Public connector research is recorded for all three paths at `afed647`");
  });
});
