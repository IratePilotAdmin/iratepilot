import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalPricingPolicyPlan,
  CAR_RENTAL_PRICING_POLICY_MODE,
  carRentalFuelChargingPolicyKinds,
  carRentalMileagePolicyKinds,
  carRentalPricingPolicyContracts,
  carRentalPricingPolicyGates,
  carRentalProtectionSelections,
  validateCarRentalPricingPolicyRecord,
  type CarRentalCanonicalPricingPolicyRecord,
} from "../lib/cars/pricing-policy";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const validRecord: CarRentalCanonicalPricingPolicyRecord = {
  currency: "USD",
  rentalDays: 3,
  tripType: "one_way",
  pickupLocationKind: "airport",
  dropoffLocationKind: "neighborhood",
  lineItems: [
    { id: "base", label: "Three-day base rate", kind: "base_rate", amountMinor: 22000, includedInTotal: true },
    { id: "tax", label: "Synthetic tax", kind: "tax", amountMinor: 2500, includedInTotal: true },
    { id: "fee", label: "Synthetic mandatory fee", kind: "mandatory_fee", amountMinor: 750, includedInTotal: true },
    { id: "one-way", label: "Synthetic one-way fee", kind: "one_way_fee", amountMinor: 3500, includedInTotal: true },
    { id: "airport", label: "Synthetic airport surcharge", kind: "airport_surcharge", amountMinor: 1200, includedInTotal: true },
    { id: "protection", label: "Synthetic selected protection", kind: "protection_product", amountMinor: 1600, includedInTotal: true },
  ],
  advertisedTotalMinor: 31550,
  mileage: { kind: "limited", includedDistance: 600, distanceUnit: "mile", excessRateMinor: 35 },
  fuelOrCharging: { kind: "same_to_same", disclosure: "Return with the same recorded fuel or charge level." },
  deposit: { state: "known", amountMinor: 25000, dueAt: "counter", refundable: true, disclosure: "Synthetic refundable counter hold; not included in the rental total." },
  protectionProducts: [
    { id: "sample-protection", label: "Sample protection", selection: "selected", priceLineItemId: "protection", disclosure: "Synthetic product for contract testing only; no insurance or coverage claim." },
    { id: "sample-optional", label: "Optional sample product", selection: "optional", disclosure: "Not selected and not included in the total." },
  ],
  exclusions: [
    { id: "tolls", category: "tolls", disclosure: "Tolls and related service charges are excluded." },
    { id: "late-return", category: "late_return", disclosure: "Late-return charges are excluded." },
  ],
};

describe("car-rental pricing and policy phase 4", () => {
  it("starts with every review gate incomplete and every runtime authority disabled", () => {
    const plan = buildCarRentalPricingPolicyPlan();
    expect(plan).toMatchObject({
      mode: "contract_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierQuoteIngested: false,
      providerMappingCreated: false,
      liveTotalPriceAvailable: false,
      policyAcceptanceAuthorized: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts completed contract evidence into quote, policy, traffic, reservation, or payment authority", () => {
    const allEvidence = Object.fromEntries(carRentalPricingPolicyGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalPricingPolicyPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supplierQuoteIngested).toBe(false);
    expect(plan.providerMappingCreated).toBe(false);
    expect(plan.liveTotalPriceAvailable).toBe(false);
    expect(plan.policyAcceptanceAuthorized).toBe(false);
    expect(plan.credentialAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers every roadmap price and policy area with explicit controlled states", () => {
    expect(CAR_RENTAL_PRICING_POLICY_MODE).toBe("contract_only");
    expect(carRentalPricingPolicyContracts.map((contract) => contract.id)).toEqual([
      "base_rate",
      "taxes",
      "mandatory_fees",
      "one_way_fee",
      "airport_surcharge",
      "mileage",
      "fuel_or_charging",
      "deposit",
      "protection_products",
      "exclusions",
    ]);
    expect(carRentalMileagePolicyKinds).toEqual(["unlimited", "limited", "unknown"]);
    expect(carRentalFuelChargingPolicyKinds).toContain("unknown");
    expect(carRentalProtectionSelections).toEqual(["included", "selected", "optional", "declined"]);
    expect(new Set(carRentalPricingPolicyGates.map((gate) => gate.id)).size).toBe(carRentalPricingPolicyGates.length);
  });

  it("accepts a complete synthetic total-price and policy record using exact minor-unit arithmetic", () => {
    expect(validateCarRentalPricingPolicyRecord(validRecord)).toEqual({
      valid: true,
      calculatedTotalMinor: 31550,
      errors: [],
    });
  });

  it("rejects hidden mandatory amounts, duplicate lines, and a mismatched advertised total", () => {
    const invalid = {
      ...validRecord,
      advertisedTotalMinor: 29950,
      lineItems: [
        ...validRecord.lineItems,
        { id: "fee", label: "Hidden fee", kind: "mandatory_fee", amountMinor: 900, includedInTotal: false },
      ],
    } as CarRentalCanonicalPricingPolicyRecord;

    expect(validateCarRentalPricingPolicyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Price line-item IDs cannot contain duplicates.",
      "Every mandatory price line item must be included in the advertised total.",
      "Advertised total must equal the sum of included price line items.",
    ]));
  });

  it("rejects one-way and airport surcharge lines that conflict with the rental context", () => {
    const invalid = {
      ...validRecord,
      tripType: "same_location",
      pickupLocationKind: "neighborhood",
      dropoffLocationKind: "hotel",
    } as CarRentalCanonicalPricingPolicyRecord;

    expect(validateCarRentalPricingPolicyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "A same-location return cannot include a one-way-fee line item.",
      "A non-airport rental cannot include an airport-surcharge line item.",
    ]));
  });

  it("rejects malformed mileage, deposit, protection, and exclusion policies", () => {
    const invalid = {
      ...validRecord,
      mileage: { kind: "limited", includedDistance: 0, distanceUnit: "nautical_mile", excessRateMinor: -1 },
      deposit: { state: "unknown", amountMinor: 5000, dueAt: "counter", refundable: false, disclosure: "" },
      protectionProducts: [
        { id: "duplicate", label: "", selection: "optional", priceLineItemId: "protection", disclosure: "" },
        { id: "duplicate", label: "Duplicate", selection: "selected", priceLineItemId: "missing", disclosure: "Sample." },
      ],
      exclusions: [
        { id: "duplicate", category: "unsupported", disclosure: "" },
        { id: "duplicate", category: "tolls", disclosure: "Duplicate." },
      ],
    } as unknown as CarRentalCanonicalPricingPolicyRecord;

    expect(validateCarRentalPricingPolicyRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Limited mileage requires a positive whole-number included distance.",
      "Limited mileage requires a supported distance unit.",
      "Limited mileage requires a non-negative integer minor-unit excess rate.",
      "Deposit policy requires a disclosure.",
      "An unknown deposit cannot include an amount, known due point, or refundability state.",
      "Protection-product IDs cannot contain duplicates.",
      "Optional or declined protection products cannot reference an included price line item.",
      "Protection-product price references must point to included protection line items.",
      "Every protection price line must be linked to one included or selected product.",
      "Exclusion IDs cannot contain duplicates.",
      "Exclusion category is not supported.",
      "Every exclusion requires a disclosure.",
    ]));
  });

  it("keeps the Phase 4 reference read-only and explicit inside the current administrator workspace", () => {
    const page = read("app/admin/cars/page.tsx");
    expect(page).toContain("Car Rentals · Phase 9");
    expect(page).toContain("Phase 4 pricing and policy reference");
    expect(page).toContain("Twelve separately owned pricing and policy gates");
    expect(page).toContain("No supplier quote is ingested");
    expect(page).toContain("Phase 3 normalization reference");
    expect(page).toContain("Phase 2 readiness reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
  });
});
