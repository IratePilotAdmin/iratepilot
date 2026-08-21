import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalReservationLifecyclePlan,
  CAR_RENTAL_RESERVATION_LIFECYCLE_MODE,
  carRentalReservationEventKinds,
  carRentalReservationEventOutcomes,
  carRentalReservationLifecycleContracts,
  carRentalReservationLifecycleFixtures,
  carRentalReservationLifecycleGates,
  carRentalReservationLifecycleStates,
  carRentalReservationProhibitedFields,
  carRentalReservationRecordedFields,
  carRentalSupplierReferenceStates,
  validateCarRentalReservationLifecycleRecord,
  type CarRentalCanonicalReservationLifecycleRecord,
  type CarRentalReservationLifecycleEvent,
} from "../lib/cars/reservation-lifecycle";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const [confirmedFixture, refundedFixture, lateReturnFixture] = carRentalReservationLifecycleFixtures;

function cloneRecord(record: CarRentalCanonicalReservationLifecycleRecord): CarRentalCanonicalReservationLifecycleRecord {
  return structuredClone(record);
}

function lifecycleEvent(
  eventId: string,
  kind: CarRentalReservationLifecycleEvent["kind"],
  occurredAt: string,
  fromState: CarRentalReservationLifecycleEvent["fromState"],
  toState: CarRentalReservationLifecycleEvent["toState"],
  requestFingerprint: string,
): CarRentalReservationLifecycleEvent {
  return { eventId, kind, outcome: "recorded", occurredAt, fromState, toState, requestFingerprint };
}

describe("car-rental reservation lifecycle phase 7", () => {
  it("starts with every review gate incomplete and every runtime authority disabled", () => {
    const plan = buildCarRentalReservationLifecyclePlan();
    expect(plan).toMatchObject({
      mode: "reservation_lifecycle_contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierContactAuthorized: false,
      providerMappingCreated: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationCreateAuthorized: false,
      reservationConfirmationAuthorized: false,
      reservationModificationAuthorized: false,
      reservationCancellationAuthorized: false,
      refundAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed design review into supplier, reservation, refund, traffic, or payment authority", () => {
    const allEvidence = Object.fromEntries(carRentalReservationLifecycleGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalReservationLifecyclePlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supplierContactAuthorized).toBe(false);
    expect(plan.credentialAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.reservationCreateAuthorized).toBe(false);
    expect(plan.reservationConfirmationAuthorized).toBe(false);
    expect(plan.reservationModificationAuthorized).toBe(false);
    expect(plan.reservationCancellationAuthorized).toBe(false);
    expect(plan.refundAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers all eleven roadmap lifecycle areas with explicit controlled states", () => {
    expect(CAR_RENTAL_RESERVATION_LIFECYCLE_MODE).toBe("reservation_lifecycle_contract_only");
    expect(carRentalReservationLifecycleContracts.map((contract) => contract.id)).toEqual([
      "create",
      "confirm",
      "modify",
      "cancel",
      "no_show",
      "pickup",
      "extension",
      "early_return",
      "late_return",
      "refund",
      "supplier_reference_reconciliation",
    ]);
    expect(carRentalReservationEventKinds).toHaveLength(10);
    expect(carRentalReservationEventOutcomes).toEqual(["recorded", "rejected", "manual_review"]);
    expect(carRentalSupplierReferenceStates).toEqual(["not_available", "pending", "matched", "mismatched", "manual_review"]);
    expect(carRentalReservationLifecycleStates).toContain("confirmation_pending");
    expect(carRentalReservationLifecycleStates).toContain("refunded");
    expect(carRentalReservationProhibitedFields).toContain("raw_supplier_reference");
    expect(carRentalReservationRecordedFields).not.toContain("raw_supplier_reference");
    expect(new Set(carRentalReservationLifecycleGates.map((gate) => gate.id)).size).toBe(carRentalReservationLifecycleGates.length);
  });

  it("accepts every sanitized fixture while keeping all external and transactional authorities disabled", () => {
    for (const fixture of carRentalReservationLifecycleFixtures) {
      expect(validateCarRentalReservationLifecycleRecord(fixture)).toMatchObject({
        valid: true,
        referenceReconciled: true,
        contractChecksSatisfied: true,
        supplierContactAuthorized: false,
        credentialAcceptanceAuthorized: false,
        sandboxTrafficAuthorized: false,
        productionTrafficAuthorized: false,
        reservationCreateAuthorized: false,
        reservationConfirmationAuthorized: false,
        reservationModificationAuthorized: false,
        reservationCancellationAuthorized: false,
        refundAuthorized: false,
        paymentAuthorized: false,
        errors: [],
      });
    }
  });

  it("preserves rejected and manual-review outcomes without changing lifecycle state", () => {
    const pending = cloneRecord(confirmedFixture);
    pending.declaredState = "confirmation_pending";
    pending.events = [
      pending.events[0],
      {
        eventId: "event_confirm_manual_review_0004",
        kind: "confirm",
        outcome: "manual_review",
        occurredAt: "2026-08-20T15:01:00.000Z",
        fromState: "confirmation_pending",
        toState: "confirmation_pending",
        requestFingerprint: "c".repeat(64),
        reasonCode: "confirmation_evidence_incomplete",
      },
      {
        eventId: "event_modify_rejected_0004",
        kind: "modify",
        outcome: "rejected",
        occurredAt: "2026-08-20T15:02:00.000Z",
        fromState: "confirmation_pending",
        toState: "confirmation_pending",
        requestFingerprint: "d".repeat(64),
        reasonCode: "modification_requires_confirmation",
      },
    ];
    pending.referenceReconciliation = { state: "pending", observedAt: "2026-08-20T15:03:00.000Z", localReferenceDigest: "e".repeat(64) };

    expect(validateCarRentalReservationLifecycleRecord(pending)).toMatchObject({
      valid: true,
      calculatedState: "confirmation_pending",
      referenceReconciled: false,
      contractChecksSatisfied: false,
      errors: [],
    });
  });

  it("validates append-only modification, pickup, extension, and late-return transitions", () => {
    expect(validateCarRentalReservationLifecycleRecord(lateReturnFixture)).toMatchObject({
      valid: true,
      calculatedState: "late_returned",
      totalRecordedRefundMinor: 0,
      errors: [],
    });
  });

  it("validates bounded cancellation and refund evidence without moving money", () => {
    expect(validateCarRentalReservationLifecycleRecord(refundedFixture)).toMatchObject({
      valid: true,
      calculatedState: "refunded",
      totalRecordedRefundMinor: 50000,
      refundAuthorized: false,
      paymentAuthorized: false,
      errors: [],
    });
  });

  it("supports explicit no-show and early-return terminal timelines", () => {
    const noShow = cloneRecord(confirmedFixture);
    noShow.declaredState = "no_show";
    noShow.events = [
      ...noShow.events,
      lifecycleEvent("event_no_show_demo_0005", "no_show", "2026-08-20T15:02:00.000Z", "confirmed", "no_show", "d".repeat(64)),
    ];
    noShow.referenceReconciliation.observedAt = "2026-08-20T15:03:00.000Z";

    const earlyReturn = cloneRecord(confirmedFixture);
    earlyReturn.declaredState = "early_returned";
    earlyReturn.events = [
      ...earlyReturn.events,
      lifecycleEvent("event_pickup_early_return_0006", "pickup", "2026-08-20T15:02:00.000Z", "confirmed", "picked_up", "d".repeat(64)),
      lifecycleEvent("event_early_return_0006", "early_return", "2026-08-20T15:03:00.000Z", "picked_up", "early_returned", "e".repeat(64)),
    ];
    earlyReturn.referenceReconciliation.observedAt = "2026-08-20T15:04:00.000Z";

    expect(validateCarRentalReservationLifecycleRecord(noShow)).toMatchObject({ valid: true, calculatedState: "no_show", errors: [] });
    expect(validateCarRentalReservationLifecycleRecord(earlyReturn)).toMatchObject({ valid: true, calculatedState: "early_returned", errors: [] });
  });

  it("rejects malformed identity, fingerprints, currency, totals, field inventory, and prohibited data", () => {
    const invalid = cloneRecord(confirmedFixture);
    invalid.lifecycleId = "bad";
    invalid.quoteId = "bad";
    invalid.searchRequestFingerprint = "ABC";
    invalid.policyFingerprint = "123";
    invalid.currency = "usd";
    invalid.quotedTotalMinor = -1;
    invalid.refundableTotalMinor = 1;
    invalid.recordedFields = [...carRentalReservationRecordedFields, "traveler_email", "traveler_email"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalReservationLifecycleRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Lifecycle ID must be a stable opaque token.",
      "Quote ID must be a stable opaque token.",
      "Search-request fingerprint must be a lowercase 64-character digest.",
      "Policy fingerprint must be a lowercase 64-character digest.",
      "Currency must be a three-letter uppercase code.",
      "Quoted total must be a non-negative integer in minor units.",
      "Refundable total must be a non-negative integer no greater than the quoted total.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized lifecycle allowlist.",
      "Prohibited traveler, payment, credential, or raw supplier-reference data blocks lifecycle readiness.",
    ]));
  });

  it("rejects duplicate event evidence and out-of-order timestamps", () => {
    const invalid = cloneRecord(confirmedFixture);
    invalid.events = [
      invalid.events[0],
      { ...invalid.events[1], eventId: invalid.events[0].eventId, requestFingerprint: invalid.events[0].requestFingerprint, occurredAt: invalid.events[0].occurredAt },
    ];

    expect(validateCarRentalReservationLifecycleRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Lifecycle event IDs must be unique.",
      "Lifecycle request fingerprints must be unique.",
      "Lifecycle event times must be strictly increasing.",
    ]));
  });

  it("rejects illegal transitions, state disagreement, misplaced refund evidence, and excessive refunds", () => {
    const invalid = cloneRecord(refundedFixture);
    invalid.declaredState = "confirmed";
    invalid.events = [
      invalid.events[0],
      { ...invalid.events[1], fromState: "planning", toState: "picked_up", refundAmountMinor: 1 },
      invalid.events[2],
      { ...invalid.events[3], refundAmountMinor: invalid.refundableTotalMinor + 1 },
    ];

    expect(validateCarRentalReservationLifecycleRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Lifecycle event from-state must match the current calculated state.",
      "Recorded lifecycle transition is not allowed from the current state.",
      "Only a recorded refund event can contain a refund amount.",
      "Declared lifecycle state must match the append-only event timeline.",
      "Recorded refund amount cannot exceed the refundable total.",
    ]));
  });

  it("fails closed for missing or internally inconsistent reference-reconciliation evidence", () => {
    const unavailable = cloneRecord(confirmedFixture);
    unavailable.referenceReconciliation = { state: "not_available", observedAt: "2026-08-20T15:02:00.000Z" };

    const falseMatch = cloneRecord(confirmedFixture);
    falseMatch.referenceReconciliation = { state: "matched", observedAt: "2026-08-20T15:02:00.000Z", localReferenceDigest: "a".repeat(64), supplierReferenceDigest: "b".repeat(64) };

    const explicitMismatch = cloneRecord(confirmedFixture);
    explicitMismatch.referenceReconciliation = { state: "mismatched", observedAt: "2026-08-20T15:02:00.000Z", localReferenceDigest: "a".repeat(64), supplierReferenceDigest: "b".repeat(64) };

    expect(validateCarRentalReservationLifecycleRecord(unavailable).errors).toContain("A recorded confirmation requires explicit reference-reconciliation evidence.");
    expect(validateCarRentalReservationLifecycleRecord(falseMatch).errors).toContain("Matched reference reconciliation requires equal digests.");
    expect(validateCarRentalReservationLifecycleRecord(explicitMismatch)).toMatchObject({ valid: true, referenceReconciled: false, contractChecksSatisfied: false, errors: [] });
  });

  it("keeps the administrator workspace and roadmaps read-only, network-free, and explicit about Phase 7", () => {
    const page = read("app/admin/cars/page.tsx");
    const phase = read("docs/CAR_RENTALS_PHASE_7.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 9");
    expect(page).toContain("Reservation lifecycle safety workspace");
    expect(page).toContain("Eleven provider-neutral reservation lifecycle contracts");
    expect(page).toContain("Twelve separately owned reservation lifecycle gates");
    expect(page).toContain("Phase 6 driver eligibility and privacy reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(phase).toContain("Reservation Lifecycle Safety");
    expect(packageRoadmap).toContain("Phase 7 defines provider-neutral, append-only contracts");
    expect(roadmap).toContain("Phase 7 reservation lifecycle software gates");
  });
});
