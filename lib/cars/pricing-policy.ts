import {
  carRentalLocationKinds,
  type CarRentalLocationKind,
} from "./inventory-normalization";

export const CAR_RENTAL_PRICING_POLICY_MODE = "contract_only" as const;

export const carRentalPriceLineItemKinds = [
  "base_rate",
  "tax",
  "mandatory_fee",
  "one_way_fee",
  "airport_surcharge",
  "protection_product",
] as const;
export const carRentalTripTypes = ["same_location", "one_way"] as const;
export const carRentalMileagePolicyKinds = ["unlimited", "limited", "unknown"] as const;
export const carRentalDistanceUnits = ["mile", "kilometer"] as const;
export const carRentalFuelChargingPolicyKinds = [
  "same_to_same",
  "full_to_full",
  "prepurchase",
  "supplier_defined",
  "unknown",
] as const;
export const carRentalDepositStates = ["known", "unknown"] as const;
export const carRentalDepositDuePoints = ["reservation", "counter", "unknown"] as const;
export const carRentalProtectionSelections = ["included", "selected", "optional", "declined"] as const;
export const carRentalExclusionCategories = [
  "fuel_or_charging",
  "tolls",
  "parking",
  "fines",
  "damage",
  "late_return",
  "young_driver",
  "additional_driver",
  "cross_border",
  "other",
] as const;

export type CarRentalPriceLineItemKind = (typeof carRentalPriceLineItemKinds)[number];
export type CarRentalTripType = (typeof carRentalTripTypes)[number];
export type CarRentalMileagePolicyKind = (typeof carRentalMileagePolicyKinds)[number];
export type CarRentalDistanceUnit = (typeof carRentalDistanceUnits)[number];
export type CarRentalFuelChargingPolicyKind = (typeof carRentalFuelChargingPolicyKinds)[number];
export type CarRentalDepositState = (typeof carRentalDepositStates)[number];
export type CarRentalDepositDuePoint = (typeof carRentalDepositDuePoints)[number];
export type CarRentalProtectionSelection = (typeof carRentalProtectionSelections)[number];
export type CarRentalExclusionCategory = (typeof carRentalExclusionCategories)[number];

export type CarRentalPricingPolicyContract = {
  id:
    | "base_rate"
    | "taxes"
    | "mandatory_fees"
    | "one_way_fee"
    | "airport_surcharge"
    | "mileage"
    | "fuel_or_charging"
    | "deposit"
    | "protection_products"
    | "exclusions";
  label: string;
  requiredFields: readonly string[];
  normalizationRule: string;
  safetyBoundary: string;
};

export const carRentalPricingPolicyContracts: readonly CarRentalPricingPolicyContract[] = [
  {
    id: "base_rate",
    label: "Base rental rate",
    requiredFields: ["Currency", "Rental days", "Base-rate amount", "Included in total"],
    normalizationRule: "Store exactly one non-negative base-rate line in integer minor units and keep the rental duration explicit.",
    safetyBoundary: "A normalized base rate is not a live quote, vehicle guarantee, or reservation authority.",
  },
  {
    id: "taxes",
    label: "Taxes",
    requiredFields: ["Tax label", "Tax amount", "Included in total"],
    normalizationRule: "Represent taxes as separate named lines, including an explicit zero-value line when the sanitized fixture has no tax.",
    safetyBoundary: "Tax treatment remains subject to supplier, jurisdiction, traveler, and transaction facts at reprice.",
  },
  {
    id: "mandatory_fees",
    label: "Mandatory fees",
    requiredFields: ["Fee label", "Fee amount", "Included in total"],
    normalizationRule: "Keep every unavoidable fee separate from the base rate and include each one in the displayed total.",
    safetyBoundary: "A fee cannot be hidden inside an optional product or excluded from a claimed total price.",
  },
  {
    id: "one_way_fee",
    label: "One-way fee",
    requiredFields: ["Trip type", "Fee amount when one-way", "Included in total"],
    normalizationRule: "Require exactly one explicit one-way fee line for a one-way trip, including zero when no fee applies, and none for a same-location return.",
    safetyBoundary: "One-way availability and fee accuracy require a fresh supplier recheck before reservation.",
  },
  {
    id: "airport_surcharge",
    label: "Airport surcharge",
    requiredFields: ["Pickup kind", "Drop-off kind", "Surcharge amount", "Included in total"],
    normalizationRule: "Require an explicit airport-surcharge line whenever pickup or return is at an airport, including zero when the sanitized fixture has no surcharge.",
    safetyBoundary: "Location normalization does not prove that every facility or concession charge is final.",
  },
  {
    id: "mileage",
    label: "Mileage allowance",
    requiredFields: ["Unlimited, limited, or unknown", "Distance unit", "Included distance", "Excess-distance rate"],
    normalizationRule: "Preserve unlimited, limited, and unknown states; limited mileage requires explicit distance and excess-rate terms.",
    safetyBoundary: "Mileage applicability can vary by vehicle, driver, residency, route, and supplier policy.",
  },
  {
    id: "fuel_or_charging",
    label: "Fuel or charging",
    requiredFields: ["Return rule", "Plain-language disclosure"],
    normalizationRule: "Map the return obligation to a controlled policy and retain a non-empty traveler disclosure without estimating an unknown future charge.",
    safetyBoundary: "Post-rental fuel, energy, service, or refueling charges are not part of the total unless explicitly priced and included.",
  },
  {
    id: "deposit",
    label: "Deposit or authorization hold",
    requiredFields: ["Known or unknown", "Amount", "Due point", "Refundability", "Disclosure"],
    normalizationRule: "Keep deposits outside the rental total and distinguish a known amount from an unknown supplier-controlled hold.",
    safetyBoundary: "A deposit is not a rental charge, and release timing or card acceptance cannot be guaranteed.",
  },
  {
    id: "protection_products",
    label: "Protection products",
    requiredFields: ["Product identity", "Selection state", "Price-line reference", "Coverage disclaimer"],
    normalizationRule: "Distinguish included, traveler-selected, optional, and declined products and price only included or selected products.",
    safetyBoundary: "Product names and prices never establish insurance status, coverage, exclusions, eligibility, or legal advice.",
  },
  {
    id: "exclusions",
    label: "Known exclusions",
    requiredFields: ["Exclusion category", "Plain-language disclosure"],
    normalizationRule: "List known amounts or events outside the displayed total with unique categories and explicit traveler-facing wording.",
    safetyBoundary: "An exclusion list is not exhaustive until a supplier reprice and policy snapshot are accepted.",
  },
];

export type CarRentalPricingPolicyGate = {
  id:
    | "contract_approved"
    | "minor_unit_math_reviewed"
    | "base_rate_reviewed"
    | "taxes_and_fees_reviewed"
    | "route_surcharges_reviewed"
    | "mileage_reviewed"
    | "fuel_charging_reviewed"
    | "deposit_reviewed"
    | "protection_reviewed"
    | "exclusions_reviewed"
    | "fixtures_and_rejections_approved"
    | "quote_ingest_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalPricingPolicyGates: readonly CarRentalPricingPolicyGate[] = [
  { id: "contract_approved", label: "Pricing and policy contract approved", owner: "Engineering + Product", detail: "Approve the canonical fields, controlled states, versioning, and consumer wording before any provider mapping." },
  { id: "minor_unit_math_reviewed", label: "Minor-unit arithmetic reviewed", owner: "Engineering + Finance", detail: "Verify integer currency math, exact total reconciliation, non-negative amounts, and duplicate rejection using sanitized fixtures." },
  { id: "base_rate_reviewed", label: "Base-rate treatment reviewed", owner: "Product + Finance", detail: "Approve rental-duration treatment and the one-base-rate requirement without implying a live or guaranteed rate." },
  { id: "taxes_and_fees_reviewed", label: "Taxes and mandatory fees reviewed", owner: "Finance + Legal", detail: "Confirm separate labels, inclusion in total, zero-value handling, jurisdiction caveats, and traveler disclosures." },
  { id: "route_surcharges_reviewed", label: "One-way and airport rules reviewed", owner: "Product + Operations", detail: "Validate route- and location-dependent fee presence without inventing availability or a final supplier charge." },
  { id: "mileage_reviewed", label: "Mileage policy reviewed", owner: "Product + Operations", detail: "Approve unlimited, limited, and unknown states plus distance units and excess-rate handling." },
  { id: "fuel_charging_reviewed", label: "Fuel and charging policy reviewed", owner: "Product + Legal", detail: "Approve controlled return rules and wording for charges that may remain outside the displayed total." },
  { id: "deposit_reviewed", label: "Deposit and hold disclosure reviewed", owner: "Payments + Legal", detail: "Separate known or unknown deposits from rental charges and avoid promises about release timing or payment instruments." },
  { id: "protection_reviewed", label: "Protection-product treatment reviewed", owner: "Insurance + Legal", detail: "Approve product states, price linkage, coverage disclaimers, and the prohibition on insurance or coverage claims." },
  { id: "exclusions_reviewed", label: "Exclusions reviewed", owner: "Product + Legal", detail: "Approve known excluded categories and clear wording without presenting the list as exhaustive." },
  { id: "fixtures_and_rejections_approved", label: "Fixtures and rejection behavior approved", owner: "Engineering + Security", detail: "Record valid, incomplete, mismatched, duplicate, and malformed fixture results without supplier data, credentials, or personal data." },
  { id: "quote_ingest_authorized", label: "Quote ingest separately authorized", owner: "Release approvers", detail: "Require a separate approval after supplier rights, mapping, credentials, sandbox isolation, reprice design, and monitoring are complete." },
];

export type CarRentalPricingPolicyEvidence = Partial<Record<CarRentalPricingPolicyGate["id"], boolean>>;

export function buildCarRentalPricingPolicyPlan(evidence: CarRentalPricingPolicyEvidence = {}) {
  const gates = carRentalPricingPolicyGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_PRICING_POLICY_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
    supplierQuoteIngested: false,
    providerMappingCreated: false,
    liveTotalPriceAvailable: false,
    policyAcceptanceAuthorized: false,
    credentialAcceptanceAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

export type CarRentalPriceLineItem = {
  id: string;
  label: string;
  kind: CarRentalPriceLineItemKind;
  amountMinor: number;
  includedInTotal: boolean;
};

export type CarRentalMileagePolicy = {
  kind: CarRentalMileagePolicyKind;
  includedDistance?: number;
  distanceUnit?: CarRentalDistanceUnit;
  excessRateMinor?: number;
};

export type CarRentalFuelChargingPolicy = {
  kind: CarRentalFuelChargingPolicyKind;
  disclosure: string;
};

export type CarRentalDepositPolicy = {
  state: CarRentalDepositState;
  amountMinor?: number;
  dueAt: CarRentalDepositDuePoint;
  refundable?: boolean;
  disclosure: string;
};

export type CarRentalProtectionProduct = {
  id: string;
  label: string;
  selection: CarRentalProtectionSelection;
  priceLineItemId?: string;
  disclosure: string;
};

export type CarRentalPriceExclusion = {
  id: string;
  category: CarRentalExclusionCategory;
  disclosure: string;
};

export type CarRentalCanonicalPricingPolicyRecord = {
  currency: string;
  rentalDays: number;
  tripType: CarRentalTripType;
  pickupLocationKind: CarRentalLocationKind;
  dropoffLocationKind: CarRentalLocationKind;
  lineItems: readonly CarRentalPriceLineItem[];
  advertisedTotalMinor: number;
  mileage: CarRentalMileagePolicy;
  fuelOrCharging: CarRentalFuelChargingPolicy;
  deposit: CarRentalDepositPolicy;
  protectionProducts: readonly CarRentalProtectionProduct[];
  exclusions: readonly CarRentalPriceExclusion[];
};

const mandatoryPriceLineItemKinds: readonly CarRentalPriceLineItemKind[] = [
  "base_rate",
  "tax",
  "mandatory_fee",
  "one_way_fee",
  "airport_surcharge",
];

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function isNonNegativeMinorAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateCarRentalPricingPolicyRecord(record: CarRentalCanonicalPricingPolicyRecord) {
  const errors: string[] = [];

  if (!/^[A-Z]{3}$/.test(record.currency)) errors.push("Currency must be a three-letter uppercase code.");
  if (!Number.isSafeInteger(record.rentalDays) || record.rentalDays < 1) errors.push("Rental days must be a positive whole number.");
  if (!carRentalTripTypes.includes(record.tripType)) errors.push("Trip type is not supported.");
  if (!carRentalLocationKinds.includes(record.pickupLocationKind) || !carRentalLocationKinds.includes(record.dropoffLocationKind)) errors.push("Pickup and drop-off location kinds must be supported.");
  if (!isNonNegativeMinorAmount(record.advertisedTotalMinor)) errors.push("Advertised total must be a non-negative integer minor-unit amount.");

  const lineItemIds = record.lineItems.map((item) => item.id);
  if (hasDuplicates(lineItemIds)) errors.push("Price line-item IDs cannot contain duplicates.");
  record.lineItems.forEach((item) => {
    if (!item.id.trim()) errors.push("Every price line item requires an ID.");
    if (!item.label.trim()) errors.push("Every price line item requires a label.");
    if (!carRentalPriceLineItemKinds.includes(item.kind)) errors.push("Price line item kind is not supported.");
    if (!isNonNegativeMinorAmount(item.amountMinor)) errors.push("Price line-item amounts must be non-negative integer minor units.");
    if (mandatoryPriceLineItemKinds.includes(item.kind) && !item.includedInTotal) errors.push("Every mandatory price line item must be included in the advertised total.");
  });

  const countKind = (kind: CarRentalPriceLineItemKind) => record.lineItems.filter((item) => item.kind === kind).length;
  if (countKind("base_rate") !== 1) errors.push("Pricing requires exactly one base-rate line item.");
  if (countKind("tax") < 1) errors.push("Pricing requires at least one explicit tax line item, including zero when applicable.");
  if (countKind("mandatory_fee") < 1) errors.push("Pricing requires at least one explicit mandatory-fee line item, including zero when applicable.");
  if (record.tripType === "one_way" && countKind("one_way_fee") !== 1) errors.push("A one-way trip requires exactly one explicit one-way-fee line item.");
  if (record.tripType === "same_location" && countKind("one_way_fee") !== 0) errors.push("A same-location return cannot include a one-way-fee line item.");

  const touchesAirport = record.pickupLocationKind === "airport" || record.dropoffLocationKind === "airport";
  if (touchesAirport && countKind("airport_surcharge") !== 1) errors.push("An airport pickup or drop-off requires exactly one explicit airport-surcharge line item.");
  if (!touchesAirport && countKind("airport_surcharge") !== 0) errors.push("A non-airport rental cannot include an airport-surcharge line item.");

  const calculatedTotal = record.lineItems.reduce((total, item) => total + (item.includedInTotal ? item.amountMinor : 0), 0);
  if (Number.isSafeInteger(calculatedTotal) && calculatedTotal !== record.advertisedTotalMinor) errors.push("Advertised total must equal the sum of included price line items.");
  if (!Number.isSafeInteger(calculatedTotal)) errors.push("Included price line items exceed safe integer arithmetic.");

  if (!carRentalMileagePolicyKinds.includes(record.mileage.kind)) errors.push("Mileage policy kind is not supported.");
  if (record.mileage.kind === "limited") {
    if (!Number.isSafeInteger(record.mileage.includedDistance) || (record.mileage.includedDistance ?? 0) < 1) errors.push("Limited mileage requires a positive whole-number included distance.");
    if (!record.mileage.distanceUnit || !carRentalDistanceUnits.includes(record.mileage.distanceUnit)) errors.push("Limited mileage requires a supported distance unit.");
    if (record.mileage.excessRateMinor === undefined || !isNonNegativeMinorAmount(record.mileage.excessRateMinor)) errors.push("Limited mileage requires a non-negative integer minor-unit excess rate.");
  } else if (record.mileage.includedDistance !== undefined || record.mileage.distanceUnit !== undefined || record.mileage.excessRateMinor !== undefined) {
    errors.push("Unlimited or unknown mileage cannot include limited-mileage values.");
  }

  if (!carRentalFuelChargingPolicyKinds.includes(record.fuelOrCharging.kind)) errors.push("Fuel or charging policy kind is not supported.");
  if (!record.fuelOrCharging.disclosure.trim()) errors.push("Fuel or charging policy requires a disclosure.");

  if (!carRentalDepositStates.includes(record.deposit.state)) errors.push("Deposit state is not supported.");
  if (!carRentalDepositDuePoints.includes(record.deposit.dueAt)) errors.push("Deposit due point is not supported.");
  if (!record.deposit.disclosure.trim()) errors.push("Deposit policy requires a disclosure.");
  if (record.deposit.state === "known") {
    if (record.deposit.amountMinor === undefined || !isNonNegativeMinorAmount(record.deposit.amountMinor)) errors.push("A known deposit requires a non-negative integer minor-unit amount.");
    if (record.deposit.dueAt === "unknown") errors.push("A known deposit requires a known due point.");
    if (typeof record.deposit.refundable !== "boolean") errors.push("A known deposit requires an explicit refundability state.");
  } else if (record.deposit.amountMinor !== undefined || record.deposit.dueAt !== "unknown" || record.deposit.refundable !== undefined) {
    errors.push("An unknown deposit cannot include an amount, known due point, or refundability state.");
  }

  const productIds = record.protectionProducts.map((product) => product.id);
  if (hasDuplicates(productIds)) errors.push("Protection-product IDs cannot contain duplicates.");
  const referencedProtectionLineIds: string[] = [];
  record.protectionProducts.forEach((product) => {
    if (!product.id.trim()) errors.push("Every protection product requires an ID.");
    if (!product.label.trim()) errors.push("Every protection product requires a label.");
    if (!carRentalProtectionSelections.includes(product.selection)) errors.push("Protection-product selection is not supported.");
    if (!product.disclosure.trim()) errors.push("Every protection product requires a coverage disclaimer.");
    if (product.selection === "included" || product.selection === "selected") {
      if (!product.priceLineItemId) {
        errors.push("Included or selected protection products require a price-line reference.");
      } else {
        referencedProtectionLineIds.push(product.priceLineItemId);
        const priceLine = record.lineItems.find((item) => item.id === product.priceLineItemId);
        if (!priceLine || priceLine.kind !== "protection_product" || !priceLine.includedInTotal) errors.push("Protection-product price references must point to included protection line items.");
      }
    } else if (product.priceLineItemId !== undefined) {
      errors.push("Optional or declined protection products cannot reference an included price line item.");
    }
  });
  if (hasDuplicates(referencedProtectionLineIds)) errors.push("A protection price line cannot be referenced by more than one product.");
  const protectionPriceLineIds = record.lineItems.filter((item) => item.kind === "protection_product").map((item) => item.id);
  if (protectionPriceLineIds.some((id) => !referencedProtectionLineIds.includes(id))) errors.push("Every protection price line must be linked to one included or selected product.");

  if (record.exclusions.length < 1) errors.push("Pricing requires at least one explicit exclusion disclosure.");
  const exclusionIds = record.exclusions.map((exclusion) => exclusion.id);
  if (hasDuplicates(exclusionIds)) errors.push("Exclusion IDs cannot contain duplicates.");
  record.exclusions.forEach((exclusion) => {
    if (!exclusion.id.trim()) errors.push("Every exclusion requires an ID.");
    if (!carRentalExclusionCategories.includes(exclusion.category)) errors.push("Exclusion category is not supported.");
    if (!exclusion.disclosure.trim()) errors.push("Every exclusion requires a disclosure.");
  });

  return { valid: errors.length === 0, calculatedTotalMinor: calculatedTotal, errors } as const;
}
