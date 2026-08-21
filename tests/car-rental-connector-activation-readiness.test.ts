import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalConnectorActivationPlan,
  CAR_RENTAL_CONNECTOR_ACTIVATION_MODE,
  carRentalConnectorActivationFixtures,
  carRentalConnectorActivationProhibitedFields,
  carRentalConnectorActivationRecordedFields,
  carRentalConnectorActivationStageIds,
  carRentalConnectorActivationStages,
  validateCarRentalConnectorActivationRecord,
  type CarRentalConnectorActivationRecord,
} from "../lib/cars/connector-activation-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function cloneRecord(record: CarRentalConnectorActivationRecord): CarRentalConnectorActivationRecord {
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

  it("adds a read-only activation control center and documents the next external gates", () => {
    const page = read("app/admin/cars/page.tsx");
    const activationDocument = read("docs/CAR_RENTALS_CONNECTOR_ACTIVATION_READINESS.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(page).toContain("Live connector activation control center");
    expect(page).toContain("Three activation tracks, all fail-closed");
    expect(page).toContain("{connectorActivation.activeConnectorCount} of {connectorActivation.tracks.length} live");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(activationDocument).toContain("No provider contact is authorized");
    expect(activationDocument).toContain("Aggregator selection required");
    expect(packageRoadmap).toContain("Current live connector activation: **0 of 3 connectors**");
  });
});
