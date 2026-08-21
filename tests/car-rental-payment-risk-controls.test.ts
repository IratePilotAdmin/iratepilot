import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalPaymentRiskPlan,
  CAR_RENTAL_PAYMENT_RISK_MODE,
  carRentalAuthorizationHoldStates,
  carRentalChargebackStates,
  carRentalDepositStates,
  carRentalFraudReviewStates,
  carRentalPaymentCollectionModels,
  carRentalPaymentRiskContracts,
  carRentalPaymentRiskFixtures,
  carRentalPaymentRiskGates,
  carRentalPaymentRiskProhibitedFields,
  carRentalPaymentRiskRecordedFields,
  carRentalReceiptReconciliationStates,
  carRentalRefundEvidenceStates,
  carRentalTaxDisclosureStates,
  validateCarRentalPaymentRiskRecord,
  type CarRentalCanonicalPaymentRiskRecord,
} from "../lib/cars/payment-risk-controls";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [payNowFixture, payAtCounterFixture, refundFixture] = carRentalPaymentRiskFixtures;

function cloneRecord(record: CarRentalCanonicalPaymentRiskRecord): CarRentalCanonicalPaymentRiskRecord {
  return structuredClone(record);
}

describe("car-rental payment and risk controls phase 8", () => {
  it("starts with every review gate incomplete and every external or transactional authority disabled", () => {
    const plan = buildCarRentalPaymentRiskPlan();
    expect(plan).toMatchObject({
      mode: "payment_risk_contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierContactAuthorized: false,
      providerMappingCreated: false,
      credentialAcceptanceAuthorized: false,
      externalTrafficAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentCollectionAuthorized: false,
      paymentCaptureAuthorized: false,
      authorizationHoldAuthorized: false,
      depositCollectionAuthorized: false,
      refundExecutionAuthorized: false,
      chargebackActionAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed contract review into supplier, traffic, reservation, or money-movement authority", () => {
    const allEvidence = Object.fromEntries(carRentalPaymentRiskGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalPaymentRiskPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.externalTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentCollectionAuthorized).toBe(false);
    expect(plan.paymentCaptureAuthorized).toBe(false);
    expect(plan.authorizationHoldAuthorized).toBe(false);
    expect(plan.depositCollectionAuthorized).toBe(false);
    expect(plan.refundExecutionAuthorized).toBe(false);
    expect(plan.chargebackActionAuthorized).toBe(false);
  });

  it("covers every Phase 8 roadmap area with controlled states and minimized fields", () => {
    expect(CAR_RENTAL_PAYMENT_RISK_MODE).toBe("payment_risk_contract_only");
    expect(carRentalPaymentRiskContracts.map((contract) => contract.id)).toEqual([
      "payment_timing", "deposit", "authorization_hold", "fraud", "chargeback", "refund", "currency", "tax", "receipt",
    ]);
    expect(carRentalPaymentCollectionModels).toEqual(["pay_now", "pay_at_counter"]);
    expect(carRentalDepositStates).toContain("unknown");
    expect(carRentalAuthorizationHoldStates).toContain("unknown");
    expect(carRentalFraudReviewStates).toContain("manual_review");
    expect(carRentalChargebackStates).toContain("open");
    expect(carRentalRefundEvidenceStates).toContain("pending");
    expect(carRentalTaxDisclosureStates).toContain("unknown");
    expect(carRentalReceiptReconciliationStates).toContain("mismatched");
    expect(carRentalPaymentRiskProhibitedFields).toContain("payment_card_number");
    expect(carRentalPaymentRiskRecordedFields).not.toContain("payment_card_number");
  });

  it("accepts all three sanitized fixtures while keeping every runtime authority disabled", () => {
    for (const fixture of carRentalPaymentRiskFixtures) {
      expect(validateCarRentalPaymentRiskRecord(fixture)).toMatchObject({
        valid: true,
        contractChecksSatisfied: true,
        supplierContactAuthorized: false,
        externalTrafficAuthorized: false,
        productionTrafficAuthorized: false,
        reservationAuthorized: false,
        paymentCollectionAuthorized: false,
        paymentCaptureAuthorized: false,
        authorizationHoldAuthorized: false,
        depositCollectionAuthorized: false,
        refundExecutionAuthorized: false,
        chargebackActionAuthorized: false,
        errors: [],
      });
    }
  });

  it("reconciles pay-now and pay-at-counter totals without performing a transaction", () => {
    expect(validateCarRentalPaymentRiskRecord(payNowFixture)).toMatchObject({ valid: true, contractChecksSatisfied: true });
    expect(validateCarRentalPaymentRiskRecord(payAtCounterFixture)).toMatchObject({ valid: true, contractChecksSatisfied: true });
    expect(payNowFixture.payableNowMinor + payNowFixture.payableAtCounterMinor).toBe(payNowFixture.quotedTotalMinor);
    expect(payAtCounterFixture.payableNowMinor + payAtCounterFixture.payableAtCounterMinor).toBe(payAtCounterFixture.quotedTotalMinor);
  });

  it("preserves explicit unknown, blocked, pending, and manual-review outcomes while failing readiness closed", () => {
    const unresolved = cloneRecord(payNowFixture);
    unresolved.depositState = "unknown";
    unresolved.depositMinor = null;
    unresolved.authorizationHoldState = "unknown";
    unresolved.authorizationHoldMinor = null;
    unresolved.fraudReviewState = "manual_review";
    unresolved.refundEvidenceState = "pending";
    unresolved.receiptReconciliationState = "pending";
    unresolved.receiptTotalMinor = null;
    unresolved.receiptTaxesMinor = null;

    expect(validateCarRentalPaymentRiskRecord(unresolved)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });

    const blocked = cloneRecord(payNowFixture);
    blocked.fraudReviewState = "blocked";
    expect(validateCarRentalPaymentRiskRecord(blocked)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });
  });

  it("validates bounded synthetic refund evidence without issuing money", () => {
    expect(validateCarRentalPaymentRiskRecord(refundFixture)).toMatchObject({
      valid: true,
      contractChecksSatisfied: true,
      refundExecutionAuthorized: false,
      paymentCaptureAuthorized: false,
      errors: [],
    });
  });

  it("rejects malformed identities, fingerprints, currency, field inventories, and prohibited-data evidence", () => {
    const invalid = cloneRecord(payNowFixture);
    invalid.paymentRiskId = "bad";
    invalid.lifecycleId = "bad";
    invalid.quoteId = "bad";
    invalid.policyFingerprint = "ABC";
    invalid.currency = "usd";
    invalid.recordedFields = [...carRentalPaymentRiskRecordedFields, "payment_card_number", "payment_card_number"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalPaymentRiskRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Payment-risk ID must be a stable opaque token.",
      "Lifecycle ID must be a stable opaque token.",
      "Quote ID must be a stable opaque token.",
      "Policy fingerprint must be a lowercase 64-character digest.",
      "Currency must be a three-letter uppercase code.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized payment-risk allowlist.",
      "Payment-card, bank, token, billing, identity, raw-reference, or credential data blocks payment-risk readiness.",
    ]));
  });

  it("rejects invalid minor-unit values, total splits, refundable bounds, and tax bounds", () => {
    const invalid = cloneRecord(payNowFixture);
    invalid.quotedTotalMinor = 100;
    invalid.payableNowMinor = 1.5;
    invalid.payableAtCounterMinor = 9;
    invalid.refundableTotalMinor = 100000;
    invalid.taxesMinor = 100001;

    expect(validateCarRentalPaymentRiskRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Payable-now total must be a non-negative integer in minor units.",
      "Pay-now records must allocate the full quoted total to payable now.",
      "Refundable total cannot exceed the quoted total.",
      "Itemized taxes cannot exceed the quoted total.",
    ]));
  });

  it("rejects inconsistent deposit and authorization-hold disclosures", () => {
    const invalid = cloneRecord(payAtCounterFixture);
    invalid.depositState = "not_required";
    invalid.depositMinor = 25000;
    invalid.authorizationHoldState = "unknown";
    invalid.authorizationHoldMinor = 50000;

    expect(validateCarRentalPaymentRiskRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Deposit amount must be zero when the disclosure state is not required.",
      "Authorization-hold amount must be null when the disclosure state is unknown.",
    ]));
  });

  it("rejects excessive or misplaced refund evidence and pay-at-counter chargeback claims", () => {
    const excessive = cloneRecord(refundFixture);
    excessive.refundEvidenceMinor = excessive.refundableTotalMinor + 1;
    expect(validateCarRentalPaymentRiskRecord(excessive).errors).toContain("Recorded refund evidence cannot exceed the refundable total.");

    const misplaced = cloneRecord(payNowFixture);
    misplaced.refundEvidenceMinor = 100;
    expect(validateCarRentalPaymentRiskRecord(misplaced).errors).toContain("Only a recorded refund state can contain a refund evidence amount.");

    const counterChargeback = cloneRecord(payAtCounterFixture);
    counterChargeback.chargebackState = "open";
    expect(validateCarRentalPaymentRiskRecord(counterChargeback).errors).toContain("Pay-at-counter records cannot claim a platform chargeback state.");
  });

  it("rejects contradictory tax and receipt evidence while preserving an explicit mismatch", () => {
    const unknownTax = cloneRecord(payNowFixture);
    unknownTax.taxDisclosureState = "unknown";
    expect(validateCarRentalPaymentRiskRecord(unknownTax).errors).toContain("Only itemized tax disclosure can contain a tax amount.");

    const falseMatch = cloneRecord(payNowFixture);
    falseMatch.receiptTotalMinor = (falseMatch.receiptTotalMinor ?? 0) + 1;
    expect(validateCarRentalPaymentRiskRecord(falseMatch).errors).toContain("Matched receipt total must equal the quoted total.");

    const falseMismatch = cloneRecord(payNowFixture);
    falseMismatch.receiptReconciliationState = "mismatched";
    expect(validateCarRentalPaymentRiskRecord(falseMismatch).errors).toContain("Mismatched receipt evidence must contain an actual total or tax mismatch.");

    const actualMismatch = cloneRecord(payNowFixture);
    actualMismatch.receiptReconciliationState = "mismatched";
    actualMismatch.receiptTotalMinor = (actualMismatch.receiptTotalMinor ?? 0) + 1;
    expect(validateCarRentalPaymentRiskRecord(actualMismatch)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });
  });

  it("keeps the administrator workspace and roadmaps read-only, network-free, and explicit about Phase 8", () => {
    const page = read("app/admin/cars/page.tsx");
    const phase = read("docs/CAR_RENTALS_PHASE_8.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 9");
    expect(page).toContain("Payment and risk controls workspace");
    expect(page).toContain("Nine provider-neutral payment and risk contracts");
    expect(page).toContain("Twelve separately owned payment and risk gates");
    expect(page).toContain("Phase 7 reservation lifecycle reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(phase).toContain("Payment and Risk Controls");
    expect(packageRoadmap).toContain("Phases 1–8 released, accepted, and documented");
    expect(roadmap).toContain("Phase 8 payment and risk-control software gates");
  });
});
