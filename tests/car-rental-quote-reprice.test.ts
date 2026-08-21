import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalQuoteRepricePlan,
  CAR_RENTAL_QUOTE_REPRICE_MODE,
  carRentalAvailabilityRecheckStates,
  carRentalPolicyChangeStates,
  carRentalPriceChangeKinds,
  carRentalPriceConsentStates,
  carRentalQuoteRepriceContracts,
  carRentalQuoteRepriceGates,
  validateCarRentalQuoteRepriceRecord,
  type CarRentalCanonicalQuoteRepriceRecord,
} from "../lib/cars/quote-reprice";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const validRecord: CarRentalCanonicalQuoteRepriceRecord = {
  quoteId: "quote_demo_0001",
  quoteVersion: 1,
  searchFingerprint: "a".repeat(64),
  currency: "USD",
  originalTotalMinor: 31550,
  repricedTotalMinor: 31550,
  declaredPriceChange: "unchanged",
  issuedAt: "2026-08-20T15:00:00.000Z",
  expiresAt: "2026-08-20T15:30:00.000Z",
  repricedAt: "2026-08-20T15:10:00.000Z",
  observedAt: "2026-08-20T15:12:00.000Z",
  availabilityRecheck: {
    state: "available",
    checkedAt: "2026-08-20T15:09:00.000Z",
    reference: "availability_demo_0001",
  },
  consent: { state: "not_required" },
  policySnapshot: {
    id: "policy_demo_0001",
    digest: "b".repeat(64),
    capturedAt: "2026-08-20T15:08:00.000Z",
    changeState: "unchanged",
  },
  noGuaranteeDisclosure: "Synthetic validation only; price, availability, vehicle class, and policies require a fresh supplier confirmation.",
};

describe("car-rental quote and reprice safety phase 5", () => {
  it("starts with every review gate incomplete and every runtime authority disabled", () => {
    const plan = buildCarRentalQuoteRepricePlan();
    expect(plan).toMatchObject({
      mode: "safety_contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierQuoteIngested: false,
      providerMappingCreated: false,
      liveAvailabilityRecheckAuthorized: false,
      liveRepriceAuthorized: false,
      priceConsentCaptureAuthorized: false,
      policyAcceptanceAuthorized: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts completed design evidence into quote, reprice, consent, traffic, reservation, or payment authority", () => {
    const allEvidence = Object.fromEntries(carRentalQuoteRepriceGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalQuoteRepricePlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supplierQuoteIngested).toBe(false);
    expect(plan.liveAvailabilityRecheckAuthorized).toBe(false);
    expect(plan.liveRepriceAuthorized).toBe(false);
    expect(plan.priceConsentCaptureAuthorized).toBe(false);
    expect(plan.policyAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers every roadmap quote and reprice area with explicit controlled states", () => {
    expect(CAR_RENTAL_QUOTE_REPRICE_MODE).toBe("safety_contract_only");
    expect(carRentalQuoteRepriceContracts.map((contract) => contract.id)).toEqual([
      "quote_identity",
      "request_fingerprint",
      "expiry",
      "availability_recheck",
      "exact_reprice",
      "price_change_classification",
      "price_change_consent",
      "policy_snapshot",
      "supersession",
      "no_guarantee",
    ]);
    expect(carRentalAvailabilityRecheckStates).toEqual(["not_checked", "available", "unavailable", "unknown"]);
    expect(carRentalPriceChangeKinds).toEqual(["unchanged", "decrease", "increase"]);
    expect(carRentalPriceConsentStates).toEqual(["not_required", "pending", "accepted", "declined", "expired"]);
    expect(carRentalPolicyChangeStates).toEqual(["unchanged", "changed", "unknown"]);
    expect(new Set(carRentalQuoteRepriceGates.map((gate) => gate.id)).size).toBe(carRentalQuoteRepriceGates.length);
  });

  it("accepts a complete fresh synthetic quote with unchanged pricing and stable policy", () => {
    expect(validateCarRentalQuoteRepriceRecord(validRecord)).toMatchObject({
      valid: true,
      quoteFresh: true,
      calculatedPriceChange: "unchanged",
      availabilityConfirmed: true,
      consentSatisfied: true,
      policyStable: true,
      contractChecksSatisfied: true,
      reservationAuthorized: false,
      paymentAuthorized: false,
      errors: [],
    });
  });

  it("accepts a versioned synthetic increase only when consent matches the exact repriced total", () => {
    const increased = {
      ...validRecord,
      quoteId: "quote_demo_0002",
      quoteVersion: 2,
      supersedesQuoteId: validRecord.quoteId,
      repricedTotalMinor: 32950,
      declaredPriceChange: "increase",
      consent: {
        state: "accepted",
        acceptedTotalMinor: 32950,
        acceptedAt: "2026-08-20T15:11:00.000Z",
      },
    } as const;

    expect(validateCarRentalQuoteRepriceRecord(increased)).toMatchObject({
      valid: true,
      calculatedPriceChange: "increase",
      consentSatisfied: true,
      contractChecksSatisfied: true,
      reservationAuthorized: false,
      paymentAuthorized: false,
      errors: [],
    });
  });

  it("rejects malformed identity, fingerprint, version, and supersession facts", () => {
    const invalid = {
      ...validRecord,
      quoteId: "bad",
      quoteVersion: 2,
      supersedesQuoteId: "bad",
      searchFingerprint: "ABC123",
    } as CarRentalCanonicalQuoteRepriceRecord;

    expect(validateCarRentalQuoteRepriceRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Quote ID must be a stable opaque token.",
      "A later quote version requires a stable predecessor quote ID.",
      "Search fingerprint must be a lowercase 64-character digest.",
    ]));

    const selfSuperseding = { ...validRecord, quoteVersion: 2, supersedesQuoteId: validRecord.quoteId };
    expect(validateCarRentalQuoteRepriceRecord(selfSuperseding).errors).toContain("A quote cannot supersede itself.");
  });

  it("fails closed for expired, out-of-order, and unchecked availability evidence", () => {
    const invalid = {
      ...validRecord,
      repricedAt: "2026-08-20T14:59:00.000Z",
      observedAt: "2026-08-20T15:30:00.000Z",
      availabilityRecheck: {
        state: "not_checked",
        checkedAt: "2026-08-20T15:09:00.000Z",
        reference: "availability_demo_0001",
      },
    } as CarRentalCanonicalQuoteRepriceRecord;

    expect(validateCarRentalQuoteRepriceRecord(invalid)).toMatchObject({
      valid: false,
      quoteFresh: false,
      availabilityConfirmed: false,
      contractChecksSatisfied: false,
    });
    expect(validateCarRentalQuoteRepriceRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Reprice cannot occur before quote issue.",
      "Quote is expired at the observation time.",
      "A not-checked availability state cannot include check evidence.",
    ]));
  });

  it("rejects invalid money, price-change classification, and unchecked price increases", () => {
    const invalid = {
      ...validRecord,
      originalTotalMinor: -1,
      repricedTotalMinor: 32950,
      declaredPriceChange: "unchanged",
      consent: { state: "not_required" },
    } as CarRentalCanonicalQuoteRepriceRecord;

    expect(validateCarRentalQuoteRepriceRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Quote totals must be non-negative integer minor-unit amounts.",
    ]));

    const increaseWithoutConsent = {
      ...validRecord,
      repricedTotalMinor: 32950,
      declaredPriceChange: "increase",
      consent: { state: "not_required" },
    } as CarRentalCanonicalQuoteRepriceRecord;
    expect(validateCarRentalQuoteRepriceRecord(increaseWithoutConsent).errors).toContain("A price increase requires an explicit consent outcome.");
  });

  it("rejects mismatched, premature, expired, or invented acceptance evidence", () => {
    const invalid = {
      ...validRecord,
      repricedTotalMinor: 32950,
      declaredPriceChange: "increase",
      consent: {
        state: "accepted",
        acceptedTotalMinor: 33000,
        acceptedAt: "2026-08-20T15:31:00.000Z",
      },
    } as CarRentalCanonicalQuoteRepriceRecord;

    expect(validateCarRentalQuoteRepriceRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Accepted price consent must match the exact repriced total.",
      "Price consent cannot occur after observation.",
      "Price consent must occur before quote expiry.",
    ]));

    const invented = {
      ...validRecord,
      consent: { state: "not_required", acceptedTotalMinor: 31550, acceptedAt: "2026-08-20T15:11:00.000Z" },
    } as CarRentalCanonicalQuoteRepriceRecord;
    expect(validateCarRentalQuoteRepriceRecord(invented).errors).toContain("A not-required consent state cannot include acceptance evidence.");
  });

  it("rejects malformed or late policy snapshots and missing safety disclosures", () => {
    const invalid = {
      ...validRecord,
      policySnapshot: {
        id: "bad",
        digest: "XYZ",
        capturedAt: "2026-08-20T15:11:00.000Z",
        changeState: "changed",
        disclosure: "",
      },
      noGuaranteeDisclosure: "",
    } as CarRentalCanonicalQuoteRepriceRecord;

    expect(validateCarRentalQuoteRepriceRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Policy snapshot ID must be a stable opaque token.",
      "Policy snapshot digest must be a lowercase 64-character digest.",
      "Policy snapshot cannot be captured after reprice.",
      "Changed or unknown policy state requires a traveler disclosure.",
      "Quote record requires a no-guarantee disclosure.",
    ]));
  });

  it("keeps the administrator workspace read-only, network-free, and explicit about the Phase 5 boundary", () => {
    const page = read("app/admin/cars/page.tsx");
    expect(page).toContain("Car Rentals · Phase 12");
    expect(page).toContain("Phase 5 quote and reprice safety");
    expect(page).toContain("Twelve separately owned quote and reprice gates");
    expect(page).toContain("No supplier inventory, quote, or policy is ingested or repriced");
    expect(page).toContain("Phase 4 pricing and policy reference");
    expect(page).toContain("Phase 3 normalization reference");
    expect(page).toContain("Phase 2 readiness reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
  });
});
