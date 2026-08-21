import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalOperationsSupportPlan,
  CAR_RENTAL_OPERATIONS_SUPPORT_MODE,
  carRentalCounterDisputeStates,
  carRentalDamageClaimStates,
  carRentalEmergencyEscalationStates,
  carRentalOperationsCaseKinds,
  carRentalOperationsProhibitedFields,
  carRentalOperationsRecordedFields,
  carRentalOperationsSupportContracts,
  carRentalOperationsSupportFixtures,
  carRentalOperationsSupportGates,
  carRentalRoadsideAssistanceStates,
  carRentalUpgradeStates,
  carRentalVehicleClassResolutionStates,
  validateCarRentalOperationsSupportRecord,
  type CarRentalCanonicalOperationsSupportRecord,
} from "../lib/cars/operations-support";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [pickupFixture, breakdownFixture, accidentFixture] = carRentalOperationsSupportFixtures;

function cloneRecord(record: CarRentalCanonicalOperationsSupportRecord): CarRentalCanonicalOperationsSupportRecord {
  return structuredClone(record);
}

describe("car-rental operations and customer support phase 9", () => {
  it("starts with every review gate incomplete and every external or operational authority disabled", () => {
    const plan = buildCarRentalOperationsSupportPlan();
    expect(plan).toMatchObject({
      mode: "operations_support_contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierContactAuthorized: false,
      providerMappingCreated: false,
      credentialAcceptanceAuthorized: false,
      externalTrafficAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationMutationAuthorized: false,
      supportContactAuthorized: false,
      roadsideDispatchAuthorized: false,
      emergencyServiceContactAuthorized: false,
      replacementVehicleAuthorized: false,
      upgradeFulfillmentAuthorized: false,
      damageClaimSubmissionAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed contract review into live support, dispatch, claim, reservation, or payment authority", () => {
    const allEvidence = Object.fromEntries(carRentalOperationsSupportGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalOperationsSupportPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supportContactAuthorized).toBe(false);
    expect(plan.roadsideDispatchAuthorized).toBe(false);
    expect(plan.emergencyServiceContactAuthorized).toBe(false);
    expect(plan.damageClaimSubmissionAuthorized).toBe(false);
    expect(plan.reservationMutationAuthorized).toBe(false);
    expect(plan.refundExecutionAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers all nine Phase 9 roadmap areas with explicit controlled states and minimized fields", () => {
    expect(CAR_RENTAL_OPERATIONS_SUPPORT_MODE).toBe("operations_support_contract_only");
    expect(carRentalOperationsSupportContracts.map((contract) => contract.id)).toEqual([
      "pickup_failure",
      "counter_dispute",
      "unavailable_class",
      "upgrade",
      "breakdown",
      "accident",
      "roadside_assistance",
      "damage_claim",
      "emergency_escalation",
    ]);
    expect(carRentalOperationsCaseKinds).toHaveLength(9);
    expect(carRentalCounterDisputeStates).toContain("manual_review");
    expect(carRentalVehicleClassResolutionStates).toContain("unknown");
    expect(carRentalUpgradeStates).toContain("accepted_recorded");
    expect(carRentalRoadsideAssistanceStates).toContain("unavailable");
    expect(carRentalDamageClaimStates).toContain("disputed");
    expect(carRentalEmergencyEscalationStates).toContain("contact_recorded");
    expect(carRentalOperationsProhibitedFields).toContain("precise_location");
    expect(carRentalOperationsRecordedFields).not.toContain("precise_location");
  });

  it("accepts all three sanitized fixtures while keeping every runtime authority disabled", () => {
    for (const fixture of carRentalOperationsSupportFixtures) {
      expect(validateCarRentalOperationsSupportRecord(fixture)).toMatchObject({
        valid: true,
        contractChecksSatisfied: true,
        supplierContactAuthorized: false,
        externalTrafficAuthorized: false,
        productionTrafficAuthorized: false,
        reservationMutationAuthorized: false,
        supportContactAuthorized: false,
        roadsideDispatchAuthorized: false,
        emergencyServiceContactAuthorized: false,
        replacementVehicleAuthorized: false,
        upgradeFulfillmentAuthorized: false,
        damageClaimSubmissionAuthorized: false,
        refundExecutionAuthorized: false,
        paymentAuthorized: false,
        errors: [],
      });
    }
  });

  it("preserves explicit unknown and manual-review outcomes while failing contract readiness closed", () => {
    const unresolved = cloneRecord(pickupFixture);
    unresolved.caseState = "manual_review";
    unresolved.supportOutcome = "manual_review";
    unresolved.resolvedAt = null;
    unresolved.resolutionEvidenceDigest = null;
    unresolved.vehicleClassResolutionState = "unknown";

    expect(validateCarRentalOperationsSupportRecord(unresolved)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });
  });

  it("requires ordered UTC acknowledgement and resolution evidence for terminal cases", () => {
    const invalid = cloneRecord(pickupFixture);
    invalid.acknowledgedAt = "2026-08-21T11:59:00Z";
    invalid.resolvedAt = "2026-08-21T11:58:00Z";
    invalid.resolutionEvidenceDigest = null;

    expect(validateCarRentalOperationsSupportRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Acknowledged timestamp cannot precede the opened timestamp.",
      "Resolved timestamp cannot precede the opened timestamp.",
      "Resolved timestamp cannot precede the acknowledged timestamp.",
      "Resolved and closed cases require a lowercase 64-character resolution-evidence digest.",
    ]));
  });

  it("rejects acknowledgement and terminal evidence on a newly opened case", () => {
    const invalid = cloneRecord(pickupFixture);
    invalid.caseState = "opened";
    invalid.supportOutcome = "recorded_resolution";

    expect(validateCarRentalOperationsSupportRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Opened cases cannot contain acknowledgement or resolution timestamps.",
      "Opened cases must keep the support outcome pending.",
    ]));
  });

  it("enforces case-specific dispute, class, roadside, damage, and emergency states", () => {
    const invalidPickup = cloneRecord(pickupFixture);
    invalidPickup.counterDisputeState = "reported";
    expect(validateCarRentalOperationsSupportRecord(invalidPickup).errors).toContain("Counter-dispute state must be not applicable for the selected case kind.");

    const invalidBreakdown = cloneRecord(breakdownFixture);
    invalidBreakdown.roadsideAssistanceState = "not_applicable";
    expect(validateCarRentalOperationsSupportRecord(invalidBreakdown).errors).toContain("Roadside-assistance state must be explicit for the selected case kind.");

    const invalidAccident = cloneRecord(accidentFixture);
    invalidAccident.damageClaimState = "not_applicable";
    invalidAccident.emergencyEscalationState = "not_applicable";
    expect(validateCarRentalOperationsSupportRecord(invalidAccident).errors).toEqual(expect.arrayContaining([
      "Damage-claim state must be explicit for the selected case kind.",
      "Emergency-escalation state must be explicit for the selected case kind.",
    ]));
  });

  it("rejects inconsistent location contexts and emergency urgency", () => {
    const wrongPickupLocation = cloneRecord(pickupFixture);
    wrongPickupLocation.locationContext = "roadside";
    expect(validateCarRentalOperationsSupportRecord(wrongPickupLocation).errors).toContain("Pickup-failure cases require counter, pickup-site, or unknown location context.");

    const falseEmergency = cloneRecord(breakdownFixture);
    falseEmergency.urgency = "emergency";
    expect(validateCarRentalOperationsSupportRecord(falseEmergency).errors).toContain("Emergency urgency is reserved for accident and emergency-escalation cases.");
  });

  it("rejects malformed identities, timestamps, digests, field inventories, and prohibited-data evidence", () => {
    const invalid = cloneRecord(pickupFixture);
    invalid.operationsCaseId = "bad";
    invalid.lifecycleId = "bad";
    invalid.openedAt = "not-a-date";
    invalid.resolutionEvidenceDigest = "ABC";
    invalid.recordedFields = [...carRentalOperationsRecordedFields, "precise_location", "precise_location"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalOperationsSupportRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Operations-case ID must be a stable opaque token.",
      "Lifecycle ID must be a stable opaque token.",
      "Opened timestamp must be a valid UTC instant.",
      "Resolved and closed cases require a lowercase 64-character resolution-evidence digest.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized operations-support allowlist.",
      "Identity, license, vehicle, location, payment, medical, narrative, claim-document, raw-reference, or credential data blocks operations-support readiness.",
    ]));
  });

  it("keeps pending assistance, disputes, claims, and escalations structurally valid but not ready", () => {
    const pending = cloneRecord(accidentFixture);
    pending.caseState = "pending_external";
    pending.supportOutcome = "pending";
    pending.resolvedAt = null;
    pending.resolutionEvidenceDigest = null;
    pending.roadsideAssistanceState = "pending";
    pending.damageClaimState = "pending";
    pending.emergencyEscalationState = "pending";

    expect(validateCarRentalOperationsSupportRecord(pending)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });
  });

  it("records Phase 8 Preview evidence and reconciles the package roadmap before Phase 9", () => {
    const evidence = read("docs/CAR_RENTALS_PHASE_8_PREVIEW_EVIDENCE_2026-08-21.md");
    const phase = read("docs/CAR_RENTALS_PHASE_9.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(evidence).toContain("dpl_GsRUHDzPK4h2w5PWseMDNqX5jvhK");
    expect(evidence).toContain("437273d71d54132fe317cb35446e2d2b3566d45f");
    expect(phase).toContain("Operations and Customer Support");
    expect(packageRoadmap).toContain("Phases 1–8 released, accepted, and documented");
    expect(packageRoadmap).toContain("Phase 9 software is verified locally with release pending");
  });

  it("keeps the administrator workspace read-only, network-free, and explicit about Phase 9", () => {
    const page = read("app/admin/cars/page.tsx");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 9");
    expect(page).toContain("Operations and customer support workspace");
    expect(page).toContain("Nine provider-neutral operations and support contracts");
    expect(page).toContain("Twelve separately owned operations and support gates");
    expect(page).toContain("Phase 8 payment and risk reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(roadmap).toContain("Phase 9 operations and customer-support software gates");
  });
});
