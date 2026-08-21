import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalControlledLaunchPlan,
  CAR_RENTAL_CONTROLLED_LAUNCH_MODE,
  carRentalControlledLaunchContracts,
  carRentalControlledLaunchFixtures,
  carRentalControlledLaunchGates,
  carRentalControlledLaunchProhibitedFields,
  carRentalControlledLaunchRecordedFields,
  carRentalIndependentReleaseReviewStates,
  carRentalProductionDecisionStates,
  validateCarRentalControlledLaunchRecord,
  type CarRentalCanonicalControlledLaunchRecord,
} from "../lib/cars/controlled-launch-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [previewFixture, sandboxFixture] = carRentalControlledLaunchFixtures;

function cloneRecord(record: CarRentalCanonicalControlledLaunchRecord): CarRentalCanonicalControlledLaunchRecord {
  return structuredClone(record);
}

describe("car-rental controlled launch readiness phase 12", () => {
  it("starts with every review gate incomplete and every release or runtime authority disabled", () => {
    const plan = buildCarRentalControlledLaunchPlan();
    expect(plan).toMatchObject({
      mode: "controlled_launch_readiness_offline_only",
      completedCount: 0,
      totalCount: 12,
      controlledLaunchReviewComplete: false,
      commitAuthorized: false,
      pushAuthorized: false,
      previewDeploymentAuthorized: false,
      previewReleaseAuthorized: false,
      supplierActionAuthorized: false,
      accountCreationAuthorized: false,
      credentialHandlingAuthorized: false,
      sandboxConnectionAuthorized: false,
      sandboxCertified: false,
      externalTrafficAuthorized: false,
      livePilotAuthorized: false,
      monitoringActivationAuthorized: false,
      rollbackExecutionAuthorized: false,
      reservationAuthorized: false,
      refundAuthorized: false,
      paymentAuthorized: false,
      migrationAuthorized: false,
      productionDecisionSatisfied: false,
      productionAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed review into deployment, sandbox, pilot, transaction, migration, or Production authority", () => {
    const allEvidence = Object.fromEntries(carRentalControlledLaunchGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalControlledLaunchPlan(allEvidence);

    expect(plan.controlledLaunchReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.previewDeploymentAuthorized).toBe(false);
    expect(plan.sandboxConnectionAuthorized).toBe(false);
    expect(plan.livePilotAuthorized).toBe(false);
    expect(plan.rollbackExecutionAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
    expect(plan.migrationAuthorized).toBe(false);
    expect(plan.productionAuthorized).toBe(false);
  });

  it("covers all seven Phase 12 controlled-launch roadmap areas", () => {
    expect(CAR_RENTAL_CONTROLLED_LAUNCH_MODE).toBe("controlled_launch_readiness_offline_only");
    expect(carRentalControlledLaunchContracts.map((contract) => contract.id)).toEqual([
      "preview_acceptance",
      "sandbox_evidence",
      "limited_pilot_controls",
      "observability",
      "rollback",
      "independent_release_review",
      "separate_production_decision",
    ]);
  });

  it("uses fail-closed review and Production states with a minimized field inventory", () => {
    expect(carRentalIndependentReleaseReviewStates).toEqual(["offline_review_recorded", "pending", "conflict_detected", "manual_review", "rejected"]);
    expect(carRentalProductionDecisionStates).toEqual(["separate_decision_required", "not_requested", "manual_review", "rejected"]);
    expect(carRentalControlledLaunchProhibitedFields).toEqual(expect.arrayContaining([
      "supplier_name",
      "api_key",
      "raw_sandbox_payload",
      "pilot_participant_identity",
      "production_approval",
    ]));
    expect(carRentalControlledLaunchRecordedFields).not.toContain("production_approval");
  });

  it("accepts all three sanitized fixtures while keeping every external action disabled", () => {
    for (const fixture of carRentalControlledLaunchFixtures) {
      expect(validateCarRentalControlledLaunchRecord(fixture)).toMatchObject({
        valid: true,
        controlledLaunchChecksSatisfied: true,
        previewDeploymentAuthorized: false,
        previewReleaseAuthorized: false,
        sandboxConnectionAuthorized: false,
        sandboxCertified: false,
        externalTrafficAuthorized: false,
        livePilotAuthorized: false,
        monitoringActivationAuthorized: false,
        rollbackExecutionAuthorized: false,
        reservationAuthorized: false,
        refundAuthorized: false,
        paymentAuthorized: false,
        migrationAuthorized: false,
        productionDecisionSatisfied: false,
        productionAuthorized: false,
        errors: [],
      });
    }
  });

  it("requires stable identity and offline-fixture mode", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.launchCaseId = "bad";
    invalid.environmentMode = "live" as never;

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Launch-case ID must be a stable opaque token.",
      "Phase 12 controlled-launch evidence must remain in offline-fixture mode.",
    ]));
  });

  it("requires digest-only Preview, sandbox, observability, rollback, and review evidence", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.previewEvidenceDigest = "ABC";
    invalid.sandboxEvidenceDigest = "bad";
    invalid.observabilityEvidenceDigest = "";
    invalid.rollbackEvidenceDigest = "g".repeat(64);
    invalid.reviewEvidenceDigest = "F".repeat(64);

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Preview-acceptance evidence must be a lowercase 64-character digest.",
      "Sandbox evidence must be a lowercase 64-character digest.",
      "Observability evidence must be a lowercase 64-character digest.",
      "Rollback evidence must be a lowercase 64-character digest.",
      "Independent-review evidence must be a lowercase 64-character digest.",
    ]));
  });

  it("requires both independent traffic kill switches to remain engaged", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
    ]));
  });

  it("requires isolated Preview acceptance and provider-neutral offline sandbox evidence", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.previewAcceptanceState = "missing";
    invalid.sandboxEvidenceState = "manual_review";

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Controls-documented evidence requires an isolated Preview acceptance record.",
      "Controls-documented evidence requires provider-neutral offline sandbox evidence.",
    ]));
  });

  it("requires bounded pilot, observability, and rollback plans", () => {
    const invalid = cloneRecord(sandboxFixture);
    invalid.limitedPilotControlState = "not_defined";
    invalid.observabilityState = "missing";
    invalid.rollbackState = "manual_review";

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Controls-documented evidence requires a bounded limited-pilot plan.",
      "Controls-documented evidence requires an offline observability plan.",
      "Controls-documented evidence requires an offline rollback plan.",
    ]));
  });

  it("requires sanitized independent review and a separate unsatisfied Production decision", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.independentReviewState = "conflict_detected";
    invalid.productionDecisionState = "not_requested";

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Controls-documented evidence requires a sanitized independent offline review record.",
      "Controls-documented evidence must preserve a separate, unsatisfied Production decision.",
    ]));
  });

  it("rejects unsupported states rather than widening the launch vocabulary", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.previewAcceptanceState = "public_preview" as never;
    invalid.sandboxEvidenceState = "certified_live" as never;
    invalid.productionDecisionState = "approved" as never;

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Preview-acceptance state is not supported.",
      "Sandbox-evidence state is not supported.",
      "Production-decision state is not supported.",
    ]));
  });

  it("rejects duplicate or unsupported fields and prohibited data", () => {
    const invalid = cloneRecord(previewFixture);
    invalid.recordedFields = [...carRentalControlledLaunchRecordedFields, "production_approval", "production_approval"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalControlledLaunchRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Provider, credential, payload, identity, payment, location, pilot, reviewer, Production-approval, or live-reference data blocks controlled-launch readiness.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized controlled-launch allowlist.",
    ]));
  });

  it("preserves manual-review and rejected outcomes without claiming launch readiness", () => {
    const manual = cloneRecord(previewFixture);
    manual.resultState = "manual_review";
    manual.previewAcceptanceState = "manual_review";
    manual.sandboxEvidenceState = "manual_review";
    manual.limitedPilotControlState = "manual_review";
    manual.observabilityState = "manual_review";
    manual.rollbackState = "manual_review";
    manual.independentReviewState = "manual_review";
    manual.productionDecisionState = "manual_review";

    expect(validateCarRentalControlledLaunchRecord(manual)).toMatchObject({ valid: true, controlledLaunchChecksSatisfied: false, errors: [] });

    const rejected = cloneRecord(manual);
    rejected.resultState = "rejected";
    rejected.previewAcceptanceState = "rejected";
    expect(validateCarRentalControlledLaunchRecord(rejected)).toMatchObject({ valid: true, controlledLaunchChecksSatisfied: false, errors: [] });
  });

  it("reconciles the Phase 11 accepted source and published Preview evidence before Phase 12", () => {
    const evidence = read("docs/CAR_RENTALS_PHASE_11_PREVIEW_EVIDENCE_2026-08-21.md");
    const phaseEleven = read("docs/CAR_RENTALS_PHASE_11.md");
    const phaseTwelve = read("docs/CAR_RENTALS_PHASE_12.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(evidence).toContain("451b0129fe74438daac8a3bc24531e97f126b874");
    expect(phaseEleven).toContain("evidence recording complete");
    expect(phaseTwelve).toContain("Controlled Launch Readiness");
    expect(phaseTwelve).toContain("1250611f802bd6fd8118242edf6045fb4e5d7d32");
    expect(packageRoadmap).toContain("Phases 1–11 released, accepted, and documented");
    expect(packageRoadmap).toContain("Phase 12 software is verified locally with release pending");
  });

  it("keeps the administrator workspace read-only and explicit about Phase 12", () => {
    const page = read("app/admin/cars/page.tsx");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 12");
    expect(page).toContain("Controlled launch readiness workspace");
    expect(page).toContain("Seven provider-neutral controlled-launch contracts");
    expect(page).toContain("Twelve separately owned controlled-launch gates");
    expect(page).toContain("Phase 11 commercial and compliance reference");
    expect(page).toContain("remain outside Phase 12 and require separate approval");
    expect(page).not.toContain("remain outside Phase 11 and require separate approval");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(roadmap).toContain("Phase 12 controlled-launch readiness software gates");
  });
});
