import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalCommercialCompliancePlan,
  CAR_RENTAL_COMMERCIAL_COMPLIANCE_MODE,
  carRentalCommercialAgreementStates,
  carRentalCommercialComplianceContracts,
  carRentalCommercialComplianceGates,
  carRentalCommercialReadinessFixtures,
  carRentalCommercialReadinessProhibitedFields,
  carRentalCommercialReadinessRecordedFields,
  carRentalCompensationModels,
  validateCarRentalCommercialReadinessRecord,
  type CarRentalCanonicalCommercialReadinessRecord,
} from "../lib/cars/commercial-compliance-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [commissionFixture, markupFixture] = carRentalCommercialReadinessFixtures;

function cloneRecord(record: CarRentalCanonicalCommercialReadinessRecord): CarRentalCanonicalCommercialReadinessRecord {
  return structuredClone(record);
}

describe("car-rental commercial and compliance readiness phase 11", () => {
  it("starts with every review gate incomplete and every external authority disabled", () => {
    const plan = buildCarRentalCommercialCompliancePlan();
    expect(plan).toMatchObject({
      mode: "commercial_compliance_readiness_offline_only",
      completedCount: 0,
      totalCount: 12,
      commercialReviewComplete: false,
      supplierResearchAuthorized: false,
      supplierContactAuthorized: false,
      contractExecutionAuthorized: false,
      accountCreationAuthorized: false,
      credentialHandlingAuthorized: false,
      legalAdviceProvided: false,
      legalRepresentationAuthorized: false,
      legalFilingAuthorized: false,
      externalTrafficAuthorized: false,
      reservationAuthorized: false,
      refundAuthorized: false,
      paymentAuthorized: false,
      migrationAuthorized: false,
      productionAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed review into commercial, legal, supplier, transaction, migration, or Production authority", () => {
    const allEvidence = Object.fromEntries(carRentalCommercialComplianceGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalCommercialCompliancePlan(allEvidence);

    expect(plan.commercialReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supplierContactAuthorized).toBe(false);
    expect(plan.contractExecutionAuthorized).toBe(false);
    expect(plan.legalRepresentationAuthorized).toBe(false);
    expect(plan.externalTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
    expect(plan.migrationAuthorized).toBe(false);
    expect(plan.productionAuthorized).toBe(false);
  });

  it("covers all nine Phase 11 commercial and compliance roadmap areas", () => {
    expect(CAR_RENTAL_COMMERCIAL_COMPLIANCE_MODE).toBe("commercial_compliance_readiness_offline_only");
    expect(carRentalCommercialComplianceContracts.map((contract) => contract.id)).toEqual([
      "commercial_agreement",
      "compensation_structure",
      "consumer_disclosures",
      "protection_wording",
      "accessibility_readiness",
      "consumer_law_controls",
      "support_ownership",
      "service_levels",
      "incident_response",
    ]);
  });

  it("uses controlled commercial states and excludes executable or sensitive fields", () => {
    expect(carRentalCommercialAgreementStates).not.toContain("executed");
    expect(carRentalCompensationModels).toEqual(["commission", "markup", "net_rate", "unknown"]);
    expect(carRentalCommercialReadinessProhibitedFields).toEqual(expect.arrayContaining([
      "supplier_name",
      "signed_contract",
      "commission_percentage",
      "payment_card",
      "legal_advice",
    ]));
    expect(carRentalCommercialReadinessRecordedFields).not.toContain("supplier_name");
  });

  it("accepts all three sanitized fixtures while keeping every external action disabled", () => {
    for (const fixture of carRentalCommercialReadinessFixtures) {
      expect(validateCarRentalCommercialReadinessRecord(fixture)).toMatchObject({
        valid: true,
        readinessChecksSatisfied: true,
        supplierContactAuthorized: false,
        contractExecutionAuthorized: false,
        credentialHandlingAuthorized: false,
        legalAdviceProvided: false,
        legalRepresentationAuthorized: false,
        legalFilingAuthorized: false,
        externalTrafficAuthorized: false,
        reservationAuthorized: false,
        refundAuthorized: false,
        paymentAuthorized: false,
        migrationAuthorized: false,
        productionAuthorized: false,
        errors: [],
      });
    }
  });

  it("requires stable identity and offline-fixture mode", () => {
    const invalid = cloneRecord(commissionFixture);
    invalid.readinessCaseId = "bad";
    invalid.environmentMode = "live" as never;

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Readiness-case ID must be a stable opaque token.",
      "Phase 11 commercial evidence must remain in offline-fixture mode.",
    ]));
  });

  it("requires offline terms and a controlled compensation model for readiness", () => {
    const invalid = cloneRecord(commissionFixture);
    invalid.agreementState = "review_required";
    invalid.compensationModel = "unknown";

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Readiness-documented evidence requires offline terms to be recorded without execution.",
      "Readiness-documented evidence requires a controlled compensation-model label.",
    ]));
  });

  it("requires documented disclosures and bounded protection wording", () => {
    const invalid = cloneRecord(commissionFixture);
    invalid.disclosureState = "missing";
    invalid.protectionWordingState = "manual_review";

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Readiness-documented evidence requires documented consumer disclosures.",
      "Readiness-documented evidence requires a bounded protection-wording mode.",
    ]));
  });

  it("requires documented accessibility and an offline consumer-law review state", () => {
    const invalid = cloneRecord(commissionFixture);
    invalid.accessibilityState = "partial";
    invalid.consumerLawState = "not_reviewed";

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Readiness-documented evidence requires documented accessibility readiness.",
      "Readiness-documented evidence requires an offline consumer-law review state.",
    ]));
  });

  it("requires controlled support ownership, service levels, and incident response", () => {
    const invalid = cloneRecord(markupFixture);
    invalid.supportOwnershipState = "unassigned";
    invalid.serviceLevelState = "missing";
    invalid.incidentResponseState = "manual_review";

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Readiness-documented evidence requires a controlled support-ownership path.",
      "Readiness-documented evidence requires a provider-neutral service-level draft state.",
      "Readiness-documented evidence requires a provider-neutral incident-response draft state.",
    ]));
  });

  it("rejects malformed digests, duplicate fields, unsupported fields, and prohibited data", () => {
    const invalid = cloneRecord(commissionFixture);
    invalid.evidenceDigest = "ABC";
    invalid.recordedFields = [...carRentalCommercialReadinessRecordedFields, "supplier_name", "supplier_name"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalCommercialReadinessRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Commercial-readiness evidence must be a lowercase 64-character digest.",
      "Provider, contract, rate, payment, credential, identity, legal, insurance, claim, location, or live-reference data blocks commercial readiness.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized commercial-readiness allowlist.",
    ]));
  });

  it("preserves manual-review and rejected outcomes without claiming readiness", () => {
    const manual = cloneRecord(commissionFixture);
    manual.resultState = "manual_review";
    manual.agreementState = "review_required";
    manual.compensationModel = "unknown";
    manual.disclosureState = "manual_review";
    manual.protectionWordingState = "manual_review";
    manual.accessibilityState = "manual_review";
    manual.consumerLawState = "manual_review";
    manual.supportOwnershipState = "manual_review";
    manual.serviceLevelState = "manual_review";
    manual.incidentResponseState = "manual_review";

    expect(validateCarRentalCommercialReadinessRecord(manual)).toMatchObject({ valid: true, readinessChecksSatisfied: false, errors: [] });

    const rejected = cloneRecord(manual);
    rejected.resultState = "rejected";
    rejected.agreementState = "rejected";
    expect(validateCarRentalCommercialReadinessRecord(rejected)).toMatchObject({ valid: true, readinessChecksSatisfied: false, errors: [] });
  });

  it("reconciles the Phase 10 source, Preview acceptance, and evidence publication before Phase 11", () => {
    const evidence = read("docs/CAR_RENTALS_PHASE_10_PREVIEW_EVIDENCE_2026-08-21.md");
    const phaseTen = read("docs/CAR_RENTALS_PHASE_10.md");
    const phaseEleven = read("docs/CAR_RENTALS_PHASE_11.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(evidence).toContain("c0d3275001eef9d7bbc9a7a869cfc74d6d9350b3");
    expect(evidence).toContain("dpl_Ge8oFywCWuThTcATdJdge7c9eKLE");
    expect(phaseTen).toContain("evidence recording complete");
    expect(phaseEleven).toContain("Commercial and Compliance Readiness");
    expect(packageRoadmap).toContain("Phases 1–11 released, accepted, and documented");
    expect(packageRoadmap).toContain("Phase 12 software is verified locally with release pending");
  });

  it("keeps the administrator workspace read-only and explicit about Phase 11", () => {
    const page = read("app/admin/cars/page.tsx");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 12");
    expect(page).toContain("Phase 11 commercial and compliance reference");
    expect(page).toContain("Commercial and compliance readiness workspace");
    expect(page).toContain("Nine provider-neutral commercial and compliance contracts");
    expect(page).toContain("Twelve separately owned commercial-readiness gates");
    expect(page).toContain("Phase 10 provider adapter certification reference");
    expect(page).toContain("remain outside Phase 12 and require separate approval");
    expect(page).not.toContain("remain outside Phase 11 and require separate approval");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(roadmap).toContain("Phase 11 commercial and compliance readiness software gates");
  });
});
