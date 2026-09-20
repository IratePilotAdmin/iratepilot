import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalAggregatorStageOneDecisionPlan,
  buildCarRentalConnectorActivationPlan,
  buildCarRentalProviderDecisionReadinessPlan,
  buildCarRentalProviderPathSequencingPlan,
  CAR_RENTAL_AGGREGATOR_STAGE_ONE_CASE_ID,
  CAR_RENTAL_AGGREGATOR_STAGE_ONE_DECISION_ID,
  CAR_RENTAL_AGGREGATOR_STAGE_ONE_DECISION_SOURCE_COMMIT,
  CAR_RENTAL_AGGREGATOR_STAGE_ONE_EVIDENCE_MODE,
  CAR_RENTAL_AGGREGATOR_STAGE_ONE_MODE,
  CAR_RENTAL_CONNECTOR_ACTIVATION_MODE,
  CAR_RENTAL_PROVIDER_DECISION_READINESS_EVIDENCE_MODE,
  CAR_RENTAL_PROVIDER_DECISION_READINESS_MODE,
  CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT,
  CAR_RENTAL_PROVIDER_PATH_DECISION_ID,
  CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT,
  CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE,
  CAR_RENTAL_PROVIDER_PATH_SEQUENCING_MODE,
  CAR_RENTAL_PROVIDER_PATH_SEQUENCING_CASE_ID,
  CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT,
  carRentalAggregatorAlternateCandidateIds,
  carRentalAggregatorStageOneAcceptedPreviewTrackStageCounts,
  carRentalAggregatorStageOneCompletedStages,
  carRentalAggregatorStageOneLocalSourceTrackStageCounts,
  carRentalAggregatorStageOneProhibitedFields,
  carRentalAggregatorStageOneRecord,
  carRentalAggregatorStageOneRecordedFields,
  carRentalAggregatorShortlistCandidateIds,
  carRentalCompletedProviderDecisionReadinessEvidence,
  carRentalConnectorActivationFixtures,
  carRentalConnectorActivationProhibitedFields,
  carRentalConnectorActivationRecordedFields,
  carRentalConnectorActivationStageIds,
  carRentalConnectorActivationStages,
  carRentalProviderDecisionReadinessGateIds,
  carRentalProviderDecisionReadinessGates,
  carRentalProviderDecisionReadinessProhibitedFields,
  carRentalProviderDecisionReadinessRecordedFields,
  carRentalProviderPathConditions,
  carRentalProviderPathOwnerConstraint,
  carRentalProviderPathProviderVerificationConditionIds,
  carRentalProviderPathSequencingEntries,
  carRentalProviderPathSequencingProhibitedFields,
  carRentalProviderPathSequencingRecord,
  carRentalProviderPathSequencingRecordedFields,
  carRentalProviderPathSoleOwnerConflicts,
  carRentalProviderPathUnresolvedBlockingConditionIds,
  carRentalPublicResearchProfiles,
  carRentalSyntheticProviderDecisionReadinessFixture,
  carRentalUnselectedDecisionAlternativeIds,
  validateCarRentalConnectorActivationRecord,
  validateCarRentalAggregatorStageOneRecord,
  validateCarRentalProviderDecisionReadinessRecord,
  validateCarRentalProviderPathSequencingRecord,
  type CarRentalAggregatorStageOneRecord,
  type CarRentalConnectorActivationRecord,
  type CarRentalProviderDecisionReadinessRecord,
  type CarRentalProviderPathSequencingRecord,
} from "../lib/cars/connector-activation-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function cloneRecord(record: CarRentalConnectorActivationRecord): CarRentalConnectorActivationRecord {
  return structuredClone(record);
}

function cloneDecisionRecord(record: CarRentalProviderDecisionReadinessRecord): CarRentalProviderDecisionReadinessRecord {
  return structuredClone(record);
}

function cloneProviderPathRecord(record: CarRentalProviderPathSequencingRecord): CarRentalProviderPathSequencingRecord {
  return structuredClone(record);
}

function cloneAggregatorStageOneRecord(record: CarRentalAggregatorStageOneRecord): CarRentalAggregatorStageOneRecord {
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

  it("records the exact approved provider-path sequence without creating runtime selection", () => {
    expect(CAR_RENTAL_PROVIDER_PATH_SEQUENCING_MODE).toBe("provider_path_sequencing_local_only");
    expect(CAR_RENTAL_PROVIDER_PATH_DECISION_ID).toBe("cars-provider-path-decision-2026-08-22-01");
    expect(CAR_RENTAL_PROVIDER_PATH_SEQUENCING_CASE_ID).toBe("provider-path-sequencing-case-01");
    expect(carRentalProviderPathSequencingEntries.map((entry) => ({
      providerId: entry.providerId,
      pathCategory: entry.pathCategory,
      disposition: entry.disposition,
      researchClassification: entry.researchClassification,
      conditionalConditionId: entry.conditionalConditionId,
      conditionalRequirement: entry.conditionalRequirement,
      selectedForRuntime: entry.selectedForRuntime,
      contactAuthorized: entry.contactAuthorized,
    }))).toEqual([
      {
        providerId: "carnect",
        pathCategory: "aggregator",
        disposition: "primary_aggregator_diligence_path",
        researchClassification: "diligence_priority_candidate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "sabre",
        pathCategory: "enterprise",
        disposition: "secondary_enterprise_diligence_path",
        researchClassification: "technical_secondary_candidate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "travelport",
        pathCategory: "enterprise",
        disposition: "conditional_hold",
        researchClassification: "conditional_enterprise_candidate",
        conditionalConditionId: "TRAVELPORT-01",
        conditionalRequirement: "written_core_category_eligibility_or_approved_exception",
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "cartrawler",
        pathCategory: "aggregator",
        disposition: "unselected_decision_alternative",
        researchClassification: "diligence_priority_candidate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "booking_com_demand",
        pathCategory: "aggregator",
        disposition: "unselected_decision_alternative",
        researchClassification: "diligence_priority_candidate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "economybookings",
        pathCategory: "aggregator",
        disposition: "unselected_decision_alternative",
        researchClassification: "research_alternate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
      {
        providerId: "discovercars",
        pathCategory: "aggregator",
        disposition: "unselected_decision_alternative",
        researchClassification: "research_alternate",
        conditionalConditionId: null,
        conditionalRequirement: null,
        selectedForRuntime: false,
        contactAuthorized: false,
      },
    ]);
    expect(carRentalUnselectedDecisionAlternativeIds).toEqual([
      "cartrawler",
      "booking_com_demand",
      "economybookings",
      "discovercars",
    ]);
  });

  it("builds a read-only local sequencing plan with every downstream authority fail-closed", () => {
    const plan = buildCarRentalProviderPathSequencingPlan();

    expect(plan).toMatchObject({
      mode: CAR_RENTAL_PROVIDER_PATH_SEQUENCING_MODE,
      decisionId: CAR_RENTAL_PROVIDER_PATH_DECISION_ID,
      decisionKind: "phased_diligence_sequencing",
      localSequencingDecisionRecorded: true,
      primaryAggregatorProviderId: "carnect",
      secondaryEnterpriseProviderId: "sabre",
      conditionalHoldProviderId: "travelport",
      conditionalHoldConditionId: "TRAVELPORT-01",
      conditionalHoldRequirement: "written_core_category_eligibility_or_approved_exception",
      decisionPacketReady: true,
      completedReadinessGateCount: 7,
      totalReadinessGateCount: 7,
      classifiedConditionCount: 29,
      unresolvedBlockingConditionCount: 12,
      providerVerificationRequiredCount: 17,
      resolvedConditionCount: 0,
      soleOwnerConflictState: "unresolved",
      independentApprovalPresent: false,
      separationOfDutiesPresent: false,
      conditionResolutionPresent: false,
      conflictResolutionPresent: false,
      riskAcceptancePresent: false,
      waiverOrOverridePresent: false,
      formalRecommendationState: "not_issued",
      commercialProviderSelectionState: "not_recorded",
      providerSelected: false,
      selectedProviderId: null,
      runtimeProviderBindingState: "unbound",
      runtimeProviderBinding: null,
      activationProviderDecisionRecorded: false,
      activationStageOneComplete: false,
      completedActivationStageIds: [],
      parallelLaunchAuthorized: false,
      liveConnectorCount: 0,
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
      applicationKillSwitchState: "engaged",
      databaseKillSwitchState: "engaged",
    });
    expect(plan.activationTracks).toEqual([
      { connectorId: "sabre", completedStageCount: 0, totalStageCount: 10, active: false, connectionState: "disabled" },
      { connectorId: "travelport", completedStageCount: 0, totalStageCount: 10, active: false, connectionState: "disabled" },
      { connectorId: "aggregator", completedStageCount: 0, totalStageCount: 10, active: false, connectionState: "disabled" },
    ]);
  });

  it("preserves all 29 unresolved conditions in the exact 12 and 17 classifications", () => {
    expect(CAR_RENTAL_PROVIDER_PATH_CLASSIFIED_CONDITION_COUNT).toBe(29);
    expect(CAR_RENTAL_PROVIDER_PATH_UNRESOLVED_BLOCKING_COUNT).toBe(12);
    expect(CAR_RENTAL_PROVIDER_PATH_PROVIDER_VERIFICATION_COUNT).toBe(17);
    expect(carRentalProviderPathUnresolvedBlockingConditionIds).toEqual([
      "ALL-01",
      "ALL-11",
      "SABRE-02",
      "SABRE-03",
      "TRAVELPORT-01",
      "TRAVELPORT-03",
      "TRAVELPORT-04",
      "AGG-01",
      "AGG-02",
      "AGG-03",
      "CARNECT-01",
      "BOOKING-01",
    ]);
    expect(carRentalProviderPathProviderVerificationConditionIds).toEqual([
      "ALL-02",
      "ALL-03",
      "ALL-04",
      "ALL-05",
      "ALL-06",
      "ALL-07",
      "ALL-08",
      "ALL-09",
      "ALL-10",
      "SABRE-01",
      "SABRE-04",
      "TRAVELPORT-02",
      "TRAVELPORT-05",
      "CARTRAWLER-01",
      "BOOKING-02",
      "ECONOMY-01",
      "DISCOVER-01",
    ]);
    expect(carRentalProviderPathConditions).toHaveLength(29);
    expect(new Set(carRentalProviderPathConditions.map((condition) => condition.id)).size).toBe(29);
    expect(carRentalProviderPathConditions.filter((condition) => condition.state === "unresolved_blocking")).toHaveLength(12);
    expect(carRentalProviderPathConditions.filter((condition) => condition.state === "later_provider_verification_required")).toHaveLength(17);
  });

  it("preserves the sole-owner constraint and all three unresolved conflicts", () => {
    expect(carRentalProviderPathOwnerConstraint).toEqual({ id: "OWNERS-01", state: "recorded_constraint" });
    expect(carRentalProviderPathSoleOwnerConflicts).toEqual([
      { id: "CONFLICT-01", state: "unresolved_conflict" },
      { id: "CONFLICT-02", state: "unresolved_conflict" },
      { id: "CONFLICT-03", state: "unresolved_conflict" },
    ]);
  });

  it("records a valid local sequencing fixture without completing the activation provider decision", () => {
    expect(carRentalProviderPathSequencingRecord.evidenceMode).toBe(CAR_RENTAL_PROVIDER_PATH_SEQUENCING_EVIDENCE_MODE);
    expect(validateCarRentalProviderPathSequencingRecord(carRentalProviderPathSequencingRecord)).toMatchObject({
      valid: true,
      localSequencingDecisionRecorded: true,
      conditionsPreserved: true,
      conflictsPreserved: true,
      providerSelected: false,
      runtimeProviderBound: false,
      activationProviderDecisionRecorded: false,
      activationStageOneComplete: false,
      liveConnectorCount: 0,
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

  it("keeps packet readiness, local sequencing, and activation-provider decision semantics separate", () => {
    const readiness = buildCarRentalProviderDecisionReadinessPlan(carRentalCompletedProviderDecisionReadinessEvidence);
    const sequencing = buildCarRentalProviderPathSequencingPlan();
    const activation = buildCarRentalConnectorActivationPlan();

    expect(readiness).toMatchObject({
      decisionPacketReady: true,
      providerDecisionRecorded: false,
      selectedProviderId: null,
      activationStageOneComplete: false,
    });
    expect(sequencing).toMatchObject({
      localSequencingDecisionRecorded: true,
      commercialProviderSelectionState: "not_recorded",
      providerSelected: false,
      runtimeProviderBindingState: "unbound",
      activationProviderDecisionRecorded: false,
      activationStageOneComplete: false,
    });
    expect(activation.tracks.every((track) => track.completedStageCount === 0 && track.totalStageCount === 10 && track.active === false)).toBe(true);
  });

  it("rejects reordered paths, changed dispositions, a released Travelport hold, or changed research classifications", () => {
    const invalid = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    invalid.decisionPaths = [...invalid.decisionPaths].reverse();
    invalid.primaryAggregatorProviderId = "sabre" as never;
    invalid.secondaryEnterpriseProviderId = "travelport" as never;
    invalid.conditionalHoldProviderId = "carnect" as never;
    invalid.conditionalHoldConditionId = "TRAVELPORT-02" as never;
    invalid.conditionalHoldRequirement = "waived" as never;
    invalid.unselectedDecisionAlternativeIds = ["cartrawler", "cartrawler", "economybookings", "discovercars"];
    invalid.aggregatorDiligencePriorityIds = ["cartrawler", "carnect", "booking_com_demand"];
    invalid.aggregatorResearchAlternateIds = ["discovercars", "economybookings"];

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Provider-path entries must exactly match the approved sequencing decision and frozen research classifications.",
      "Carnect must remain the named primary aggregator diligence path.",
      "Sabre must remain the secondary enterprise diligence path.",
      "Travelport must remain on the exact approved TRAVELPORT-01 conditional hold.",
      "Unselected decision alternatives must exactly preserve the approved order.",
      "Aggregator diligence-priority research classifications must remain unchanged.",
      "Aggregator research-alternate classifications must remain unchanged.",
    ]));
  });

  it("rejects missing or reclassified conditions and any resolution of sole-owner conflicts", () => {
    const invalid = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    invalid.classifiedConditionCount = 28 as never;
    invalid.unresolvedBlockingConditionCount = 11 as never;
    invalid.providerVerificationRequiredCount = 18 as never;
    invalid.resolvedConditionCount = 1 as never;
    invalid.conditions = [
      { ...carRentalProviderPathConditions[0], state: "later_provider_verification_required" },
      ...carRentalProviderPathConditions.slice(1, -1),
    ];
    invalid.ownerConstraint = { id: "OWNERS-01", state: "resolved" } as never;
    invalid.soleOwnerConflicts = [
      { id: "CONFLICT-01", state: "resolved" },
      ...carRentalProviderPathSoleOwnerConflicts.slice(1),
    ] as never;
    invalid.soleOwnerConflictState = "resolved" as never;
    invalid.independentApprovalPresent = true as never;
    invalid.separationOfDutiesPresent = true as never;
    invalid.conditionResolutionPresent = true as never;
    invalid.conflictResolutionPresent = true as never;
    invalid.riskAcceptancePresent = true as never;
    invalid.waiverOrOverridePresent = true as never;

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toEqual(expect.arrayContaining([
      "All 29 classified conditions must remain unresolved in their exact recorded categories.",
      "Sole-owner conflicts, unresolved conditions, and missing independent review must remain unchanged.",
    ]));
  });

  it("rejects recommendation, selection, runtime binding, stage advancement, or parallel launch", () => {
    const invalid = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    invalid.formalRecommendationState = "issued" as never;
    invalid.commercialProviderSelectionState = "recorded" as never;
    invalid.providerSelected = true as never;
    invalid.selectedProviderId = "carnect" as never;
    invalid.runtimeProviderBindingState = "bound" as never;
    invalid.runtimeProviderBinding = "carnect" as never;
    invalid.activationProviderDecisionRecorded = true as never;
    invalid.activationStageOneComplete = true as never;
    invalid.completedActivationStageIds = ["provider_decision"] as never;
    invalid.parallelLaunchAuthorized = true as never;
    invalid.activationTrackStageCounts = { sabre: 1, travelport: 0, aggregator: 0 } as never;
    invalid.liveConnectorCount = 1 as never;

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toEqual(expect.arrayContaining([
      "A formal provider recommendation has not been issued.",
      "Commercial provider selection is not recorded by path sequencing.",
      "Runtime provider binding must remain absent.",
      "Activation provider decision, stage 1, completed-stage inventory, and parallel launch must remain false or empty.",
      "Every connector must remain at 0 of 10 activation stages and 0 of 3 live.",
    ]));
  });

  it("rejects contact, accounts, credentials, traffic, transactions, deployment, and Production", () => {
    const invalid = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
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

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Provider contact is not authorized by path sequencing.",
      "Provider accounts are not authorized by path sequencing.",
      "Credential material is not authorized by path sequencing.",
      "Sandbox or external provider traffic is not authorized by path sequencing.",
      "Reservation, refund, or payment actions are not authorized by path sequencing.",
      "Migration or deployment is not authorized by path sequencing.",
      "Production is not authorized by path sequencing.",
    ]));
  });

  it("rejects malformed provenance, evidence, kill switches, declared fields, and prohibited data", () => {
    const invalid = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    invalid.decisionCaseId = "bad" as never;
    invalid.evidenceMode = "live" as never;
    invalid.decisionArtifactId = "different-artifact" as never;
    invalid.decisionSourceCommit = "different-commit" as never;
    invalid.decisionRecordedDate = "2026-08-21" as never;
    invalid.decisionKind = "provider_selection" as never;
    invalid.evidenceDigest = "UPPERCASE";
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";
    invalid.recordedFields = [...carRentalProviderPathSequencingRecordedFields, "formal_score", "formal_score"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Provider-path decision case ID must match the sanitized source record.",
      "Provider-path decision evidence must remain local documentation.",
      "Provider-path decision must bind the controlled decision artifact.",
      "Provider-path decision source commit does not match the published artifact.",
      "Provider-path decision date does not match the controlled artifact.",
      "Only the approved phased diligence sequencing decision may be represented.",
      "Provider-path decision evidence digest must match the published decision artifact.",
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized provider-path allowlist.",
      "Contact, contract, score, recommendation, runtime binding, account, credential, endpoint, payload, identity, payment, live-reference, or Production-approval data blocks provider-path sequencing.",
    ]));
    expect(carRentalProviderPathSequencingProhibitedFields).toEqual(expect.arrayContaining(["formal_score", "runtime_provider_id", "api_key"]));
    expect(carRentalProviderPathSequencingRecordedFields).not.toEqual(expect.arrayContaining(["formal_score", "runtime_provider_id", "api_key"]));
  });

  it("fails closed without throwing for malformed unknown provider-path inputs", () => {
    for (const input of [undefined, null, false, 0, "record", [], ["record"]]) {
      expect(() => validateCarRentalProviderPathSequencingRecord(input)).not.toThrow();
      expect(validateCarRentalProviderPathSequencingRecord(input)).toMatchObject({
        valid: false,
        localSequencingDecisionRecorded: false,
        conditionsPreserved: false,
        conflictsPreserved: false,
        providerSelected: false,
        runtimeProviderBound: false,
        activationStageOneComplete: false,
        productionAuthorized: false,
      });
    }

    const malformedNested = {
      ...cloneProviderPathRecord(carRentalProviderPathSequencingRecord),
      decisionPaths: null,
      unselectedDecisionAlternativeIds: "not-an-array",
      aggregatorDiligencePriorityIds: null,
      aggregatorResearchAlternateIds: 7,
      conditions: null,
      soleOwnerConflicts: null,
      completedActivationStageIds: null,
      activationTrackStageCounts: null,
      recordedFields: null,
    };
    expect(() => validateCarRentalProviderPathSequencingRecord(malformedNested)).not.toThrow();
    expect(validateCarRentalProviderPathSequencingRecord(malformedNested)).toMatchObject({
      valid: false,
      localSequencingDecisionRecorded: false,
      providerSelected: false,
      runtimeProviderBound: false,
      activationStageOneComplete: false,
      productionAuthorized: false,
    });

    const cyclicPaths: unknown[] = [];
    cyclicPaths.push(cyclicPaths);
    const cyclicNested = {
      ...cloneProviderPathRecord(carRentalProviderPathSequencingRecord),
      decisionPaths: cyclicPaths,
    };
    expect(() => validateCarRentalProviderPathSequencingRecord(cyclicNested)).not.toThrow();
    expect(validateCarRentalProviderPathSequencingRecord(cyclicNested).valid).toBe(false);

    const unreadable = { ...cloneProviderPathRecord(carRentalProviderPathSequencingRecord) };
    Object.defineProperty(unreadable, "decisionCaseId", {
      enumerable: true,
      get() {
        throw new Error("unreadable");
      },
    });
    expect(() => validateCarRentalProviderPathSequencingRecord(unreadable)).not.toThrow();
    expect(validateCarRentalProviderPathSequencingRecord(unreadable)).toMatchObject({
      valid: false,
      providerSelected: false,
      runtimeProviderBound: false,
      activationStageOneComplete: false,
      errors: ["Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields."],
    });
  });

  it("rejects actual extra provider-path runtime fields even with a clean declared allowlist", () => {
    const invalid = {
      ...cloneProviderPathRecord(carRentalProviderPathSequencingRecord),
      api_key: "must-not-be-retained",
    };

    expect(validateCarRentalProviderPathSequencingRecord(invalid).errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");
  });

  it("rejects serialization, sparse-array, symbol, and non-enumerable field bypasses", () => {
    expect(Object.isFrozen(carRentalProviderPathSequencingRecord)).toBe(true);
    expect(Object.isFrozen(carRentalProviderPathSequencingRecord.completedActivationStageIds)).toBe(true);
    expect(Object.isFrozen(carRentalProviderPathSequencingRecord.activationTrackStageCounts)).toBe(true);
    expect(Object.isFrozen(carRentalProviderPathSequencingEntries)).toBe(true);
    expect(carRentalProviderPathSequencingEntries.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(Object.isFrozen(carRentalProviderPathConditions)).toBe(true);
    expect(carRentalProviderPathConditions.every((condition) => Object.isFrozen(condition))).toBe(true);

    const disguisedPaths = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    (disguisedPaths.decisionPaths as unknown as Array<Record<string, unknown>>)[0] = {
      ...disguisedPaths.decisionPaths[0],
      selectedForRuntime: true,
      contactAuthorized: true,
    };
    Object.defineProperty(disguisedPaths.decisionPaths, "toJSON", {
      enumerable: false,
      value: () => carRentalProviderPathSequencingEntries,
    });
    expect(validateCarRentalProviderPathSequencingRecord(disguisedPaths).errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");

    const sparseAlternatives = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    delete (sparseAlternatives.unselectedDecisionAlternativeIds as unknown as string[])[1];
    expect(validateCarRentalProviderPathSequencingRecord(sparseAlternatives).errors).toContain("Unselected decision alternatives must exactly preserve the approved order.");

    const hiddenField = cloneProviderPathRecord(carRentalProviderPathSequencingRecord) as CarRentalProviderPathSequencingRecord & { api_key?: string };
    Object.defineProperty(hiddenField, "api_key", { enumerable: false, value: "must-not-be-retained" });
    expect(validateCarRentalProviderPathSequencingRecord(hiddenField).errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");

    const symbolField = cloneProviderPathRecord(carRentalProviderPathSequencingRecord) as CarRentalProviderPathSequencingRecord & Record<symbol, string>;
    symbolField[Symbol("api_key")] = "must-not-be-retained";
    expect(validateCarRentalProviderPathSequencingRecord(symbolField).errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");

    const hiddenStageCounts = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    const nonEnumerableCounts = {} as Record<string, number>;
    for (const connectorId of ["sabre", "travelport", "aggregator"]) {
      Object.defineProperty(nonEnumerableCounts, connectorId, { enumerable: false, value: 1 });
    }
    hiddenStageCounts.activationTrackStageCounts = nonEnumerableCounts as never;
    expect(validateCarRentalProviderPathSequencingRecord(hiddenStageCounts).valid).toBe(false);

    const hiddenCompletedStageMetadata = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    Object.defineProperty(hiddenCompletedStageMetadata.completedActivationStageIds, "api_key", { enumerable: false, value: "must-not-be-retained" });
    expect(validateCarRentalProviderPathSequencingRecord(hiddenCompletedStageMetadata).valid).toBe(false);

    const symbolCompletedStageMetadata = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    (symbolCompletedStageMetadata.completedActivationStageIds as unknown as Record<symbol, string>)[Symbol("api_key")] = "must-not-be-retained";
    expect(validateCarRentalProviderPathSequencingRecord(symbolCompletedStageMetadata).errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");

    const hiddenNestedSafetyLock = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    Object.defineProperty(hiddenNestedSafetyLock.decisionPaths[0], "selectedForRuntime", { enumerable: false, value: false });
    expect(validateCarRentalProviderPathSequencingRecord(hiddenNestedSafetyLock).valid).toBe(false);

    const accessorState = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    let providerSelectedReadCount = 0;
    Object.defineProperty(accessorState, "providerSelected", {
      enumerable: true,
      get() {
        providerSelectedReadCount += 1;
        return providerSelectedReadCount === 1 ? false : true;
      },
    });
    const accessorValidation = validateCarRentalProviderPathSequencingRecord(accessorState);
    expect(accessorValidation.valid).toBe(false);
    expect(accessorValidation.errors).toContain("Provider-path sequencing record contains unsupported, hidden, accessor-backed, or prohibited runtime fields.");
    expect(providerSelectedReadCount).toBe(0);
  });

  it("rejects proxy-backed provider-path records before semantic reads", () => {
    let topLevelReadCount = 0;
    const topLevelProxy = new Proxy(cloneProviderPathRecord(carRentalProviderPathSequencingRecord), {
      get(target, property, receiver) {
        topLevelReadCount += 1;
        if (property === "providerSelected") return topLevelReadCount === 1 ? false : true;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(validateCarRentalProviderPathSequencingRecord(topLevelProxy)).toMatchObject({
      valid: false,
      errors: ["Provider-path sequencing record could not be read safely."],
    });
    expect(topLevelReadCount).toBe(0);

    let nestedReadCount = 0;
    const nestedProxyRecord = cloneProviderPathRecord(carRentalProviderPathSequencingRecord);
    nestedProxyRecord.conditions = new Proxy(nestedProxyRecord.conditions, {
      get(target, property, receiver) {
        nestedReadCount += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(validateCarRentalProviderPathSequencingRecord(nestedProxyRecord)).toMatchObject({
      valid: false,
      errors: ["Provider-path sequencing record could not be read safely."],
    });
    expect(nestedReadCount).toBe(0);
  });

  it("rejects built-ins disguised as plain provider-path or Aggregator Stage 1 records", () => {
    const disguisedProviderPathMap = Object.assign(
      new Map([["api_key", "hidden-internal-slot"]]),
      cloneProviderPathRecord(carRentalProviderPathSequencingRecord),
    );
    Object.setPrototypeOf(disguisedProviderPathMap, Object.prototype);
    expect(validateCarRentalProviderPathSequencingRecord(disguisedProviderPathMap)).toMatchObject({
      valid: false,
      providerSelected: false,
      runtimeProviderBound: false,
      productionAuthorized: false,
    });

    const disguisedProviderPathDate = Object.assign(
      new Date(0),
      cloneProviderPathRecord(carRentalProviderPathSequencingRecord),
    );
    Object.setPrototypeOf(disguisedProviderPathDate, Object.prototype);
    expect(validateCarRentalProviderPathSequencingRecord(disguisedProviderPathDate).valid).toBe(false);

    const disguisedAggregatorMap = Object.assign(
      new Map([["api_key", "hidden-internal-slot"]]),
      cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord),
    );
    Object.setPrototypeOf(disguisedAggregatorMap, Object.prototype);
    expect(validateCarRentalAggregatorStageOneRecord(disguisedAggregatorMap)).toMatchObject({
      valid: false,
      localSourceAggregatorStageOneRecorded: false,
      commercialDiligenceProviderSelected: false,
      runtimeProviderBound: false,
      productionAuthorized: false,
    });

    const disguisedAggregatorDate = Object.assign(
      new Date(0),
      cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord),
    );
    Object.setPrototypeOf(disguisedAggregatorDate, Object.prototype);
    expect(validateCarRentalAggregatorStageOneRecord(disguisedAggregatorDate).valid).toBe(false);
  });

  it("records only the local Aggregator provider-decision stage while keeping Preview at zero", () => {
    const plan = buildCarRentalAggregatorStageOneDecisionPlan();

    expect(CAR_RENTAL_AGGREGATOR_STAGE_ONE_MODE).toBe("aggregator_stage_one_source_reconciliation_local_only");
    expect(CAR_RENTAL_AGGREGATOR_STAGE_ONE_EVIDENCE_MODE).toBe("local_documentation");
    expect(CAR_RENTAL_AGGREGATOR_STAGE_ONE_CASE_ID).toBe("aggregator-stage-one-case-01");
    expect(CAR_RENTAL_AGGREGATOR_STAGE_ONE_DECISION_ID).toBe("cars-aggregator-stage-1-provider-decision-2026-08-22-01");
    expect(CAR_RENTAL_AGGREGATOR_STAGE_ONE_DECISION_SOURCE_COMMIT).toBe("931c342dd5fc6d2d753073c3d6e2e6a69111680c");
    expect(plan.localSourceTrackStageCounts).toEqual({ sabre: 0, travelport: 0, aggregator: 1 });
    expect(plan.acceptedPreviewTrackStageCounts).toEqual({ sabre: 0, travelport: 0, aggregator: 0 });
    expect(plan.completedStages).toEqual([{ connectorId: "aggregator", stageId: "provider_decision" }]);
    expect(plan.activationTracks.map((track) => [track.connectorId, track.completedStageCount])).toEqual([
      ["sabre", 0],
      ["travelport", 0],
      ["aggregator", 1],
    ]);
    expect(plan.stages[0]).toMatchObject({ id: "provider_decision", completedConnectorIds: ["aggregator"] });
    expect(plan.stages.slice(1).every((stage) => stage.completedConnectorIds.length === 0)).toBe(true);
  });

  it("keeps the Aggregator Stage 1 plan fail-closed after the diligence decision", () => {
    expect(buildCarRentalAggregatorStageOneDecisionPlan()).toMatchObject({
      commercialDiligenceProviderId: "carnect",
      secondaryCandidateProviderId: "sabre",
      conditionalHoldProviderId: "travelport",
      conditionalHoldConditionId: "TRAVELPORT-01",
      formalRecommendationState: "not_issued",
      aggregatorActivationProviderDecisionRecorded: true,
      aggregatorActivationStageOneComplete: true,
      resolvedConditionCount: 0,
      soleOwnerConflictState: "unresolved",
      runtimeProviderSelected: false,
      runtimeProviderBindingState: "unbound",
      runtimeProviderBinding: null,
      liveConnectorCount: 0,
      stageTwoContactAuthorized: false,
      providerContactAuthorized: false,
      commercialLegalApprovalPresent: false,
      contractPresent: false,
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
      applicationKillSwitchState: "engaged",
      databaseKillSwitchState: "engaged",
    });
  });

  it("accepts the exact sanitized Aggregator Stage 1 source record", () => {
    expect(carRentalAggregatorStageOneCompletedStages).toEqual([{ connectorId: "aggregator", stageId: "provider_decision" }]);
    expect(carRentalAggregatorStageOneLocalSourceTrackStageCounts).toEqual({ sabre: 0, travelport: 0, aggregator: 1 });
    expect(carRentalAggregatorStageOneAcceptedPreviewTrackStageCounts).toEqual({ sabre: 0, travelport: 0, aggregator: 0 });
    expect(Object.isFrozen(carRentalAggregatorStageOneCompletedStages)).toBe(true);
    expect(Object.isFrozen(carRentalAggregatorStageOneCompletedStages[0])).toBe(true);
    expect(Object.isFrozen(carRentalAggregatorStageOneLocalSourceTrackStageCounts)).toBe(true);
    expect(Object.isFrozen(carRentalAggregatorStageOneAcceptedPreviewTrackStageCounts)).toBe(true);
    expect(Object.isFrozen(carRentalAggregatorStageOneRecord)).toBe(true);
    expect(validateCarRentalAggregatorStageOneRecord(carRentalAggregatorStageOneRecord)).toMatchObject({
      valid: true,
      localSourceAggregatorStageOneRecorded: true,
      commercialDiligenceProviderId: "carnect",
      acceptedPreviewReconciled: false,
      liveConnectorCount: 0,
      runtimeProviderBound: false,
      stageTwoContactAuthorized: false,
      providerContactAuthorized: false,
      productionAuthorized: false,
      errors: [],
    });
  });

  it("preserves all 29 conditions and every sole-owner conflict in Aggregator Stage 1", () => {
    expect(carRentalAggregatorStageOneRecord.conditions).toEqual(carRentalProviderPathConditions);
    expect(carRentalAggregatorStageOneRecord.ownerConstraint).toEqual(carRentalProviderPathOwnerConstraint);
    expect(carRentalAggregatorStageOneRecord.soleOwnerConflicts).toEqual(carRentalProviderPathSoleOwnerConflicts);
    expect(carRentalAggregatorStageOneRecord).toMatchObject({
      classifiedConditionCount: 29,
      unresolvedBlockingConditionCount: 12,
      providerVerificationRequiredCount: 17,
      resolvedConditionCount: 0,
      soleOwnerConflictState: "unresolved",
      independentApprovalPresent: false,
      separationOfDutiesPresent: false,
      conditionResolutionPresent: false,
      conflictResolutionPresent: false,
      riskAcceptancePresent: false,
      waiverOrOverridePresent: false,
    });
  });

  it("rejects any counter, completed-stage, Preview, or Stage 2 advancement outside the approved scope", () => {
    const invalidRecords = [
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.aggregatorActivationProviderDecisionRecorded = false as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.aggregatorActivationStageOneComplete = false as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.localSourceTrackStageCounts = { sabre: 1, travelport: 0, aggregator: 1 } as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.localSourceTrackStageCounts = { sabre: 0, travelport: 0, aggregator: 0 } as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.localSourceTrackStageCounts = { sabre: 0, travelport: 0, aggregator: 2 } as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.localSourceLiveConnectorCount = 1 as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.completedStages = [{ connectorId: "aggregator", stageId: "provider_decision" }, { connectorId: "aggregator", stageId: "contact_authorization" }] as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewState = "reconciled" as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewSourceCommit = "0".repeat(40) as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewProviderDecisionRecorded = true as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewProviderSelected = true as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewSelectedProviderId = "carnect" as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewTrackStageCounts = { sabre: 0, travelport: 0, aggregator: 1 } as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewStageOneComplete = true as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewCompletedStages = [{ connectorId: "aggregator", stageId: "provider_decision" }] as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.acceptedPreviewLiveConnectorCount = 1 as never; return value; })(),
      (() => { const value = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord); value.stageTwoContactAuthorized = true as never; return value; })(),
    ];

    for (const record of invalidRecords) expect(validateCarRentalAggregatorStageOneRecord(record).valid).toBe(false);
  });

  it("rejects runtime binding, contact, commercial, account, credential, traffic, transaction, deployment, or Production authority", () => {
    const mutations: readonly [keyof CarRentalAggregatorStageOneRecord, unknown][] = [
      ["runtimeProviderSelected", true],
      ["runtimeProviderBindingState", "bound"],
      ["runtimeProviderBinding", "carnect"],
      ["liveConnectorCount", 1],
      ["providerContactMade", true],
      ["commercialLegalApprovalPresent", true],
      ["contractPresent", true],
      ["providerAccountPresent", true],
      ["credentialMaterialPresent", true],
      ["sandboxConnectionPresent", true],
      ["externalRequestAttempted", true],
      ["reservationActionAttempted", true],
      ["refundActionAttempted", true],
      ["paymentActionAttempted", true],
      ["migrationAttempted", true],
      ["deploymentAttempted", true],
      ["productionAuthorized", true],
      ["applicationKillSwitchState", "released"],
      ["databaseKillSwitchState", "released"],
    ];

    for (const [key, value] of mutations) {
      const record = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord) as unknown as Record<string, unknown>;
      record[key] = value;
      expect(validateCarRentalAggregatorStageOneRecord(record).valid, String(key)).toBe(false);
    }
  });

  it("rejects tampered provenance, allowlists, prohibited data, hidden fields, accessors, and proxies", () => {
    expect(carRentalAggregatorStageOneRecordedFields).toHaveLength(new Set(carRentalAggregatorStageOneRecordedFields).size);
    expect(carRentalAggregatorStageOneProhibitedFields).toContain("api_key");
    expect(carRentalAggregatorStageOneProhibitedFields).toContain("provider_contact_message");
    expect(carRentalAggregatorStageOneProhibitedFields).toContain("production_approval");

    const wrongCommit = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    wrongCommit.decisionSourceCommit = "0".repeat(40) as never;
    expect(validateCarRentalAggregatorStageOneRecord(wrongCommit).valid).toBe(false);

    const alternateCaseId = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    alternateCaseId.decisionCaseId = "sk_live_not-a-real-secret" as never;
    expect(validateCarRentalAggregatorStageOneRecord(alternateCaseId).valid).toBe(false);

    const wrongDigest = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    wrongDigest.evidenceDigest = "A".repeat(64);
    expect(validateCarRentalAggregatorStageOneRecord(wrongDigest).valid).toBe(false);

    const excessAllowlist = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    excessAllowlist.recordedFields = [...carRentalAggregatorStageOneRecordedFields, "api_key"];
    expect(validateCarRentalAggregatorStageOneRecord(excessAllowlist).valid).toBe(false);

    const prohibited = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    prohibited.prohibitedDataDetected = true;
    expect(validateCarRentalAggregatorStageOneRecord(prohibited).valid).toBe(false);

    const extraRuntimeField = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord) as unknown as Record<string, unknown>;
    extraRuntimeField.api_key = "not-a-real-secret";
    expect(validateCarRentalAggregatorStageOneRecord(extraRuntimeField).valid).toBe(false);

    const hiddenField = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    Object.defineProperty(hiddenField, "api_key", { value: "hidden", enumerable: false });
    expect(validateCarRentalAggregatorStageOneRecord(hiddenField).valid).toBe(false);

    let getterReadCount = 0;
    const accessor = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    Object.defineProperty(accessor, "runtimeProviderSelected", { enumerable: true, get: () => { getterReadCount += 1; return false; } });
    expect(validateCarRentalAggregatorStageOneRecord(accessor).valid).toBe(false);
    expect(getterReadCount).toBe(0);

    const proxy = new Proxy(cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord), {});
    expect(validateCarRentalAggregatorStageOneRecord(proxy)).toMatchObject({ valid: false });
  });

  it("fails closed without reading malformed nested Aggregator Stage 1 evidence", () => {
    const malformedInputs: unknown[] = [null, undefined, true, 1, "record", [], () => false];
    for (const input of malformedInputs) {
      expect(() => validateCarRentalAggregatorStageOneRecord(input)).not.toThrow();
      expect(validateCarRentalAggregatorStageOneRecord(input)).toMatchObject({
        valid: false,
        localSourceAggregatorStageOneRecorded: false,
        commercialDiligenceProviderSelected: false,
        commercialDiligenceProviderId: null,
        runtimeProviderBound: false,
        stageTwoContactAuthorized: false,
        productionAuthorized: false,
      });
    }

    const cyclic = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord) as unknown as Record<string, unknown>;
    cyclic.conditions = [cyclic];
    expect(() => validateCarRentalAggregatorStageOneRecord(cyclic)).not.toThrow();
    expect(validateCarRentalAggregatorStageOneRecord(cyclic).valid).toBe(false);

    const hiddenNested = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    Object.defineProperty(hiddenNested.completedStages[0], "api_key", { value: "hidden", enumerable: false });
    expect(validateCarRentalAggregatorStageOneRecord(hiddenNested).valid).toBe(false);

    const symbolNested = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    Object.defineProperty(symbolNested.completedStages[0], Symbol("secret"), { value: "hidden", enumerable: true });
    expect(validateCarRentalAggregatorStageOneRecord(symbolNested).valid).toBe(false);

    const sparseAlternatives = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    delete (sparseAlternatives.unselectedDecisionAlternativeIds as unknown[])[1];
    expect(validateCarRentalAggregatorStageOneRecord(sparseAlternatives).valid).toBe(false);

    let nestedGetterReadCount = 0;
    const accessorNested = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    Object.defineProperty(accessorNested.completedStages[0], "stageId", {
      enumerable: true,
      get() {
        nestedGetterReadCount += 1;
        return "provider_decision";
      },
    });
    expect(validateCarRentalAggregatorStageOneRecord(accessorNested).valid).toBe(false);
    expect(nestedGetterReadCount).toBe(0);

    let nestedProxyReadCount = 0;
    const nestedProxyRecord = cloneAggregatorStageOneRecord(carRentalAggregatorStageOneRecord);
    nestedProxyRecord.conditions = new Proxy(nestedProxyRecord.conditions, {
      get(target, property, receiver) {
        nestedProxyReadCount += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(validateCarRentalAggregatorStageOneRecord(nestedProxyRecord).valid).toBe(false);
    expect(nestedProxyReadCount).toBe(0);
  });

  it("adds a read-only decision workspace and documents the separate provider-decision boundary", () => {
    const page = read("app/admin/cars/page.tsx");
    const activationDocument = read("docs/CAR_RENTALS_CONNECTOR_ACTIVATION_READINESS.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Provider-decision readiness");
    expect(page).toContain("Aggregator Stage 1 recorded locally; runtime remains disabled");
    expect(page).toContain("Carnect · commercial diligence only");
    expect(page).toContain("Local source: Sabre {aggregatorStageOne.localSourceTrackStageCounts.sabre} of 10");
    expect(page).toContain("Accepted Preview: Sabre {aggregatorStageOne.acceptedPreviewTrackStageCounts.sabre} of 10");
    expect(page).toContain("accepted Preview remains 0 of 10 for all three pending a separate release");
    expect(page).toContain("All {aggregatorStageOne.classifiedConditionCount} recorded conditions remain unresolved");
    expect(page).toContain("Live connector activation control center");
    expect(page).toContain("Three activation tracks, all fail-closed");
    expect(page).toContain("{aggregatorStageOne.liveConnectorCount} of {aggregatorStageOne.activationTracks.length} live");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(activationDocument).toContain("No provider contact is authorized");
    expect(activationDocument).toContain("Public research recorded: 3 of 3 paths");
    expect(activationDocument).toContain("Local phased-diligence decision recorded: yes");
    expect(activationDocument).toContain("Separate provider-path sequencing source record and validator hardening: implemented and verified");
    expect(activationDocument).toContain("Local source activation: aggregator `providerDecisionRecorded` true and Stage 1 complete");
    expect(activationDocument).toContain("Accepted Preview activation at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`: provider decision false");
    expect(packageRoadmap).toContain("Current live connector activation: **0 of 3 connectors**");
    expect(packageRoadmap).toContain("Public connector research: **3 of 3 paths recorded**");
    expect(roadmap).toContain("Public connector research is recorded for all three paths at `afed647`");
  });
});
