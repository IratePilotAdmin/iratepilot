import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalInventoryNormalizationPlan,
  CAR_RENTAL_INVENTORY_NORMALIZATION_MODE,
  carRentalAccessibilityStates,
  carRentalInventoryContracts,
  carRentalNormalizationGates,
  carRentalOperatingDays,
  carRentalPowertrains,
  carRentalTransmissions,
  validateCarRentalInventoryRecord,
  type CarRentalCanonicalInventoryRecord,
} from "../lib/cars/inventory-normalization";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const validRecord: CarRentalCanonicalInventoryRecord = {
  location: {
    sourceId: "synthetic-location-001",
    name: "Sample Airport Location",
    kind: "airport",
    countryCode: "US",
    timeZone: "America/Chicago",
    pickupInstructions: "Follow the provider-neutral sample pickup instructions.",
    openingHours: carRentalOperatingDays.map((day) => ({ day, state: "open", opensAt: "08:00", closesAt: "18:00" })),
  },
  vehicle: {
    sourceClassCode: "SYNTHETIC-SUV",
    canonicalClass: "suv",
    passengerCapacity: 5,
    luggageCapacity: 3,
    transmission: "automatic",
    powertrain: "hybrid",
    accessibilityState: "confirmed",
    accessibilityFeatures: ["hand_controls"],
    features: ["air_conditioning", "gps_navigation"],
  },
};

describe("car-rental inventory normalization phase 3", () => {
  it("starts with every normalization gate incomplete and every runtime authority disabled", () => {
    const plan = buildCarRentalInventoryNormalizationPlan();
    expect(plan).toMatchObject({
      mode: "contract_only",
      completedCount: 0,
      totalCount: 10,
      contractReviewComplete: false,
      supplierDataIngested: false,
      providerMappingCreated: false,
      liveInventoryAvailable: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts completed contract evidence into provider, inventory, or transaction authority", () => {
    const allEvidence = Object.fromEntries(carRentalNormalizationGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalInventoryNormalizationPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.supplierDataIngested).toBe(false);
    expect(plan.providerMappingCreated).toBe(false);
    expect(plan.liveInventoryAvailable).toBe(false);
    expect(plan.credentialAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.reservationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers the eight roadmap normalization areas with unique provider-neutral contracts", () => {
    expect(CAR_RENTAL_INVENTORY_NORMALIZATION_MODE).toBe("contract_only");
    expect(carRentalInventoryContracts.map((contract) => contract.id)).toEqual([
      "location",
      "opening_hours",
      "vehicle_class",
      "capacity",
      "transmission",
      "powertrain",
      "accessibility",
      "features",
    ]);
    expect(new Set(carRentalInventoryContracts.map((contract) => contract.id)).size).toBe(carRentalInventoryContracts.length);
    expect(new Set(carRentalNormalizationGates.map((gate) => gate.id)).size).toBe(carRentalNormalizationGates.length);
  });

  it("keeps controlled values explicit and preserves unspecified or unknown states", () => {
    expect(carRentalTransmissions).toEqual(["automatic", "manual", "unspecified"]);
    expect(carRentalPowertrains).toContain("unspecified");
    expect(carRentalAccessibilityStates).toEqual(["confirmed", "unavailable", "unknown"]);
  });

  it("accepts a complete synthetic canonical record without contacting a provider", () => {
    expect(validateCarRentalInventoryRecord(validRecord)).toEqual({ valid: true, errors: [] });
  });

  it("rejects malformed, incomplete, conflicting, and duplicate inventory facts", () => {
    const invalidRecord = {
      location: {
        ...validRecord.location,
        sourceId: " ",
        countryCode: "usa",
        timeZone: "Not/A_Time_Zone",
        pickupInstructions: "",
        openingHours: [
          { day: "monday", state: "open", opensAt: "25:00", closesAt: "25:00" },
          { day: "monday", state: "closed", opensAt: "08:00" },
        ],
      },
      vehicle: {
        ...validRecord.vehicle,
        sourceClassCode: "",
        canonicalClass: "spaceship",
        passengerCapacity: 0,
        luggageCapacity: -1,
        transmission: "continuously_unknown",
        powertrain: "steam",
        accessibilityState: "unknown",
        accessibilityFeatures: ["hand_controls", "hand_controls", "unsupported_feature"],
        features: ["gps_navigation", "gps_navigation", "unsupported_feature"],
      },
    } as unknown as CarRentalCanonicalInventoryRecord;

    const result = validateCarRentalInventoryRecord(invalidRecord);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "Location source ID is required.",
      "Country code must be a two-letter uppercase ISO code.",
      "Time zone must be a supported IANA time zone.",
      "Pickup instructions are required.",
      "Opening hours must contain each operating day exactly once.",
      "Vehicle source class code is required.",
      "Canonical vehicle class is not supported.",
      "Passenger capacity must be a positive whole number.",
      "Luggage capacity must be a non-negative whole number.",
      "Transmission is not supported.",
      "Powertrain is not supported.",
      "Accessibility features contain an unsupported value.",
      "Vehicle features contain an unsupported value.",
      "Accessibility features cannot contain duplicates.",
      "Vehicle features cannot contain duplicates.",
      "Accessibility features require a confirmed accessibility state.",
    ]));
  });

  it("keeps the protected administrator workspace read-only, network-free, and explicit about its boundary", () => {
    const page = read("app/admin/cars/page.tsx");
    expect(page).toContain("Phase 3 normalization reference");
    expect(page).toContain("Provider-neutral inventory contracts");
    expect(page).toContain("No supplier inventory, quote, or policy is ingested or repriced");
    expect(page).toContain("Phase 2 activation reference");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("<form");
    expect(page).not.toContain('href="http');
  });
});
