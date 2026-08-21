import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalDriverPrivacyPlan,
  CAR_RENTAL_DRIVER_PRIVACY_MODE,
  carRentalDeletionStates,
  carRentalDriverPrivacyContracts,
  carRentalDriverPrivacyGates,
  carRentalEligibilityStates,
  carRentalGeographicPermissionStates,
  carRentalLicenseRuleStates,
  carRentalMinimizedDriverFields,
  carRentalProhibitedDriverFields,
  carRentalRequirementStates,
  validateCarRentalDriverPrivacyRecord,
  type CarRentalCanonicalDriverPrivacyRecord,
} from "../lib/cars/driver-eligibility-privacy";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const minimizedFields = [
  "age_years",
  "driver_age_band",
  "minimum_age_years",
  "license_country",
  "license_class",
  "license_expiry_date",
  "additional_driver_count",
  "pickup_country",
  "return_country",
  "policy_fingerprint",
] as const;

const validRecord: CarRentalCanonicalDriverPrivacyRecord = {
  evaluationId: "eligibility_demo_0001",
  policyFingerprint: "c".repeat(64),
  rentalStartsOn: "2026-09-01",
  ageYears: 30,
  driverAgeBand: "25_plus",
  minimumAgeYears: 25,
  license: {
    state: "satisfied",
    issuingCountryCode: "US",
    licenseClass: "standard",
    expiresOn: "2028-04-30",
    ruleReference: "license_rule_demo_0001",
  },
  residency: { state: "not_required" },
  additionalDrivers: { count: 0, state: "not_required" },
  geography: {
    pickupCountryCode: "US",
    returnCountryCode: "US",
    state: "not_required",
  },
  declaredEligibility: "eligible",
  privacy: {
    collectedFields: minimizedFields,
    prohibitedDataDetected: false,
    collectedAt: "2026-08-20T12:00:00.000Z",
    retentionDays: 30,
    deletionDueAt: "2026-09-19T12:00:00.000Z",
    observedAt: "2026-08-20T12:05:00.000Z",
    deletionState: "scheduled",
  },
};

describe("car-rental driver eligibility and privacy phase 6", () => {
  it("starts with every review gate incomplete and every runtime authority disabled", () => {
    const plan = buildCarRentalDriverPrivacyPlan();
    expect(plan).toMatchObject({
      mode: "eligibility_privacy_contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      personalDataCollected: false,
      rawLicenseDataStored: false,
      automatedEligibilityDecisionAuthorized: false,
      liveEligibilityVerificationAuthorized: false,
      providerMappingCreated: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts completed design evidence into personal-data, eligibility, traffic, reservation, or payment authority", () => {
    const allEvidence = Object.fromEntries(carRentalDriverPrivacyGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalDriverPrivacyPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.personalDataCollected).toBe(false);
    expect(plan.rawLicenseDataStored).toBe(false);
    expect(plan.automatedEligibilityDecisionAuthorized).toBe(false);
    expect(plan.liveEligibilityVerificationAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers every roadmap eligibility and privacy area with explicit controlled states", () => {
    expect(CAR_RENTAL_DRIVER_PRIVACY_MODE).toBe("eligibility_privacy_contract_only");
    expect(carRentalDriverPrivacyContracts.map((contract) => contract.id)).toEqual([
      "minimum_age",
      "license_rules",
      "residency",
      "additional_drivers",
      "geographic_restrictions",
      "data_minimization",
      "retention",
      "deletion",
    ]);
    expect(carRentalLicenseRuleStates).toEqual(["satisfied", "not_satisfied", "manual_review"]);
    expect(carRentalRequirementStates).toEqual(["not_required", "satisfied", "not_satisfied", "manual_review"]);
    expect(carRentalGeographicPermissionStates).toEqual(["not_required", "allowed", "restricted", "manual_review"]);
    expect(carRentalEligibilityStates).toEqual(["eligible", "ineligible", "manual_review"]);
    expect(carRentalDeletionStates).toEqual(["scheduled", "completed", "overdue"]);
    expect(carRentalProhibitedDriverFields).toContain("license_number");
    expect(carRentalMinimizedDriverFields).not.toContain("license_number");
    expect(new Set(carRentalDriverPrivacyGates.map((gate) => gate.id)).size).toBe(carRentalDriverPrivacyGates.length);
  });

  it("accepts a minimized synthetic eligible record without authorizing live verification or booking", () => {
    expect(validateCarRentalDriverPrivacyRecord(validRecord)).toMatchObject({
      valid: true,
      calculatedAgeBand: "25_plus",
      calculatedEligibility: "eligible",
      calculatedDeletionState: "scheduled",
      eligibilityChecksSatisfied: true,
      privacyControlsSatisfied: true,
      contractChecksSatisfied: true,
      liveEligibilityVerificationAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
      errors: [],
    });
  });

  it("preserves a valid ineligible age outcome without turning it into reservation authority", () => {
    const underMinimum = {
      ...validRecord,
      ageYears: 22,
      driverAgeBand: "21_24",
      declaredEligibility: "ineligible",
    } as const;

    expect(validateCarRentalDriverPrivacyRecord(underMinimum)).toMatchObject({
      valid: true,
      calculatedAgeBand: "21_24",
      calculatedEligibility: "ineligible",
      eligibilityChecksSatisfied: false,
      contractChecksSatisfied: false,
      reservationAuthorized: false,
      errors: [],
    });
  });

  it("preserves manual review for unresolved synthetic rules", () => {
    const manualReview = {
      ...validRecord,
      license: { ...validRecord.license, state: "manual_review" },
      declaredEligibility: "manual_review",
    } as const;

    expect(validateCarRentalDriverPrivacyRecord(manualReview)).toMatchObject({
      valid: true,
      calculatedEligibility: "manual_review",
      eligibilityChecksSatisfied: false,
      contractChecksSatisfied: false,
      errors: [],
    });
  });

  it("rejects malformed identity, policy, dates, age, and age-band facts", () => {
    const invalid = {
      ...validRecord,
      evaluationId: "bad",
      policyFingerprint: "ABC123",
      rentalStartsOn: "2026-99-01",
      ageYears: 24,
      driverAgeBand: "25_plus",
      minimumAgeYears: 100,
      declaredEligibility: "ineligible",
    } as CarRentalCanonicalDriverPrivacyRecord;

    expect(validateCarRentalDriverPrivacyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Evaluation ID must be a stable opaque token.",
      "Policy fingerprint must be a lowercase 64-character digest.",
      "Rental start must be an exact ISO date.",
      "Driver age band must match the whole-year age.",
      "Minimum age must be a whole number from 18 through 99.",
    ]));
  });

  it("rejects conflicting license, residency, additional-driver, and geographic evidence", () => {
    const invalid = {
      ...validRecord,
      license: { ...validRecord.license, expiresOn: "2026-08-31" },
      residency: { state: "not_required", countryCode: "US", ruleReference: "residency_demo_0001" },
      additionalDrivers: { count: 2, state: "not_required" },
      geography: { pickupCountryCode: "US", returnCountryCode: "US", state: "allowed", ruleReference: "geo_rule_demo_0001" },
      declaredEligibility: "ineligible",
    } as CarRentalCanonicalDriverPrivacyRecord;

    expect(validateCarRentalDriverPrivacyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "A satisfied license rule cannot expire before rental start.",
      "A not-required residency rule cannot retain residency evidence.",
      "Additional drivers require an explicit rule outcome.",
      "Additional drivers require a stable sanitized rule reference.",
      "Same-country travel must use the not-required geographic state.",
      "Same-country travel cannot retain cross-border rule evidence.",
    ]));
  });

  it("rejects prohibited, unsupported, duplicate, missing, or extra collected-field inventory", () => {
    const invalid = {
      ...validRecord,
      privacy: {
        ...validRecord.privacy,
        collectedFields: [...minimizedFields, "license_number", "license_number"],
        prohibitedDataDetected: true,
      },
    } as CarRentalCanonicalDriverPrivacyRecord;

    expect(validateCarRentalDriverPrivacyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Collected-field inventory cannot contain duplicates.",
      "Collected-field inventory contains unsupported or prohibited fields.",
      "Prohibited driver data blocks privacy readiness.",
      "Collected-field inventory must exactly match the minimized fields used by the record.",
    ]));
  });

  it("fails closed for mismatched retention deadlines and overdue deletion", () => {
    const overdue = {
      ...validRecord,
      privacy: {
        ...validRecord.privacy,
        deletionDueAt: "2026-09-18T12:00:00.000Z",
        observedAt: "2026-09-20T12:00:00.000Z",
        deletionState: "overdue",
      },
    } as CarRentalCanonicalDriverPrivacyRecord;

    expect(validateCarRentalDriverPrivacyRecord(overdue)).toMatchObject({
      valid: false,
      calculatedDeletionState: "overdue",
      privacyControlsSatisfied: false,
      contractChecksSatisfied: false,
      reservationAuthorized: false,
    });
    expect(validateCarRentalDriverPrivacyRecord(overdue).errors).toEqual(expect.arrayContaining([
      "Deletion deadline must exactly match the declared retention period.",
      "Overdue deletion blocks privacy readiness.",
    ]));
  });

  it("accepts timely synthetic deletion evidence while keeping every live authority disabled", () => {
    const deleted = {
      ...validRecord,
      privacy: {
        ...validRecord.privacy,
        observedAt: "2026-08-22T12:00:00.000Z",
        deletionState: "completed",
        deletedAt: "2026-08-22T11:00:00.000Z",
      },
    } as const;

    expect(validateCarRentalDriverPrivacyRecord(deleted)).toMatchObject({
      valid: true,
      calculatedDeletionState: "completed",
      privacyControlsSatisfied: true,
      liveEligibilityVerificationAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
      errors: [],
    });
  });

  it("keeps the administrator workspace and roadmap read-only, network-free, and explicit about Phase 6", () => {
    const page = read("app/admin/cars/page.tsx");
    const phase = read("docs/CAR_RENTALS_PHASE_6.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 7");
    expect(page).toContain("Driver eligibility and privacy workspace");
    expect(page).toContain("Eight provider-neutral eligibility and privacy contracts");
    expect(page).toContain("Twelve separately owned eligibility and privacy gates");
    expect(page).toContain("No personal driver data is collected");
    expect(page).toContain("Phase 5 quote and reprice reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(phase).toContain("Driver Eligibility and Privacy");
    expect(packageRoadmap).toContain("evidence publication at `84f8b3ebde9f7830fabde7af99199e0e122813e4` are complete");
    expect(roadmap).toContain("Phase 6 driver eligibility and privacy software gates");
  });
});
