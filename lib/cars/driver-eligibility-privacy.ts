import { carDriverAgeBands, type CarDriverAgeBand } from "./search";

export const CAR_RENTAL_DRIVER_PRIVACY_MODE = "eligibility_privacy_contract_only" as const;

export const carRentalLicenseRuleStates = ["satisfied", "not_satisfied", "manual_review"] as const;
export const carRentalRequirementStates = ["not_required", "satisfied", "not_satisfied", "manual_review"] as const;
export const carRentalGeographicPermissionStates = ["not_required", "allowed", "restricted", "manual_review"] as const;
export const carRentalEligibilityStates = ["eligible", "ineligible", "manual_review"] as const;
export const carRentalDeletionStates = ["scheduled", "completed", "overdue"] as const;
export const carRentalLicenseClasses = ["standard", "commercial", "motorcycle", "unknown"] as const;

export const carRentalMinimizedDriverFields = [
  "age_years",
  "driver_age_band",
  "minimum_age_years",
  "license_country",
  "license_class",
  "license_expiry_date",
  "residency_country",
  "additional_driver_count",
  "pickup_country",
  "return_country",
  "policy_fingerprint",
] as const;

export const carRentalProhibitedDriverFields = [
  "full_name",
  "date_of_birth",
  "license_number",
  "license_image",
  "street_address",
  "email",
  "phone",
  "biometric_data",
] as const;

export type CarRentalLicenseRuleState = (typeof carRentalLicenseRuleStates)[number];
export type CarRentalRequirementState = (typeof carRentalRequirementStates)[number];
export type CarRentalGeographicPermissionState = (typeof carRentalGeographicPermissionStates)[number];
export type CarRentalEligibilityState = (typeof carRentalEligibilityStates)[number];
export type CarRentalDeletionState = (typeof carRentalDeletionStates)[number];
export type CarRentalLicenseClass = (typeof carRentalLicenseClasses)[number];
export type CarRentalMinimizedDriverField = (typeof carRentalMinimizedDriverFields)[number];

export type CarRentalDriverPrivacyContract = {
  id:
    | "minimum_age"
    | "license_rules"
    | "residency"
    | "additional_drivers"
    | "geographic_restrictions"
    | "data_minimization"
    | "retention"
    | "deletion";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalDriverPrivacyContracts: readonly CarRentalDriverPrivacyContract[] = [
  {
    id: "minimum_age",
    label: "Minimum-age rule",
    requiredFields: ["Age in whole years", "Declared age band", "Minimum age"],
    validationRule: "Compare a synthetic whole-year age with the explicit minimum and reject a declared age band that does not match.",
    safetyBoundary: "An age-rule result is a local contract outcome, not a supplier eligibility decision or permission to reserve.",
  },
  {
    id: "license_rules",
    label: "Driver-license rule",
    requiredFields: ["Issuing country", "Controlled class", "Expiry date", "Rule reference"],
    validationRule: "Use only country, controlled class, expiry date, and a sanitized rule reference; never collect a license number or image.",
    safetyBoundary: "A satisfied synthetic license rule does not verify a real document, identity, driving privilege, or supplier acceptance.",
  },
  {
    id: "residency",
    label: "Residency requirement",
    requiredFields: ["Requirement state", "Country when required", "Rule reference"],
    validationRule: "Preserve not-required, satisfied, not-satisfied, and manual-review outcomes without inferring residency.",
    safetyBoundary: "Residency is not verified and no address, proof document, immigration status, or identity record is collected.",
  },
  {
    id: "additional_drivers",
    label: "Additional-driver rule",
    requiredFields: ["Driver count", "Requirement state", "Rule reference"],
    validationRule: "Record only a bounded count and rule outcome; do not collect names, licenses, contact details, or payment data.",
    safetyBoundary: "A count-level result cannot add, approve, price, or insure another driver.",
  },
  {
    id: "geographic_restrictions",
    label: "Geographic restriction",
    requiredFields: ["Pickup country", "Return country", "Permission state", "Rule reference"],
    validationRule: "Treat same-country travel as not required and preserve allowed, restricted, or manual-review outcomes for cross-border travel.",
    safetyBoundary: "A local geography result is not border, road, vehicle-use, insurance, or supplier authorization.",
  },
  {
    id: "data_minimization",
    label: "Driver-data minimization",
    requiredFields: ["Exact allowlist", "No prohibited fields", "No duplicate fields"],
    validationRule: "Require the collected-field inventory to match only the minimum fields needed by the synthetic rule record.",
    safetyBoundary: "The contract stores no real driver identity, license number, license image, date of birth, address, contact, or biometric data.",
  },
  {
    id: "retention",
    label: "Retention schedule",
    requiredFields: ["Collected at", "Retention days", "Deletion due at"],
    validationRule: "Use exact UTC instants and require the deletion deadline to equal the declared bounded retention period.",
    safetyBoundary: "A retention schedule does not authorize collection or override legal, contractual, or deletion obligations.",
  },
  {
    id: "deletion",
    label: "Deletion evidence",
    requiredFields: ["Observed at", "Deletion state", "Deleted at when completed"],
    validationRule: "Derive scheduled, completed, or overdue state from exact timestamps and fail closed for late, missing, or invented evidence.",
    safetyBoundary: "Synthetic deletion evidence is not proof that any external provider or Production system deleted personal data.",
  },
];

export type CarRentalDriverPrivacyGate = {
  id:
    | "contract_approved"
    | "minimum_age_reviewed"
    | "license_rules_reviewed"
    | "residency_reviewed"
    | "additional_driver_rules_reviewed"
    | "geography_reviewed"
    | "data_inventory_reviewed"
    | "minimization_reviewed"
    | "retention_reviewed"
    | "deletion_reviewed"
    | "fixtures_and_rejections_approved"
    | "live_eligibility_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalDriverPrivacyGates: readonly CarRentalDriverPrivacyGate[] = [
  { id: "contract_approved", label: "Eligibility and privacy contract approved", owner: "Engineering + Product", detail: "Approve the controlled fields, outcomes, minimization rules, and traveler wording before any live eligibility workflow." },
  { id: "minimum_age_reviewed", label: "Minimum-age logic reviewed", owner: "Product + Legal", detail: "Verify whole-year comparison, supported age bands, jurisdiction-specific rule references, and no date-of-birth collection." },
  { id: "license_rules_reviewed", label: "License rules reviewed", owner: "Legal + Operations", detail: "Approve controlled license metadata and rejection behavior without storing a number, image, or identity document." },
  { id: "residency_reviewed", label: "Residency rules reviewed", owner: "Legal + Privacy", detail: "Verify explicit not-required, satisfied, not-satisfied, and manual-review outcomes without collecting an address or proof document." },
  { id: "additional_driver_rules_reviewed", label: "Additional-driver rules reviewed", owner: "Product + Operations", detail: "Approve count-only handling, bounded limits, and the separate live-driver enrollment boundary." },
  { id: "geography_reviewed", label: "Geographic restrictions reviewed", owner: "Legal + Operations", detail: "Approve same-country and cross-border outcomes without representing permission from a supplier, insurer, or authority." },
  { id: "data_inventory_reviewed", label: "Driver-data inventory reviewed", owner: "Privacy + Security", detail: "Confirm the exact allowlist, prohibited categories, and absence of real identity or credential data in fixtures and logs." },
  { id: "minimization_reviewed", label: "Data minimization reviewed", owner: "Privacy + Product", detail: "Verify each retained field is necessary for the local contract and reject missing, extra, or duplicate inventory entries." },
  { id: "retention_reviewed", label: "Retention schedule reviewed", owner: "Privacy + Legal", detail: "Approve bounded retention, exact deadline calculation, and any later legal or contractual retention exceptions separately." },
  { id: "deletion_reviewed", label: "Deletion behavior reviewed", owner: "Privacy + Audit", detail: "Verify scheduled, completed, and overdue outcomes plus fail-closed handling for missing or late deletion evidence." },
  { id: "fixtures_and_rejections_approved", label: "Fixtures and rejection behavior approved", owner: "Engineering + Security", detail: "Record valid, ineligible, manual-review, malformed, over-retained, and prohibited-field outcomes using sanitized fixtures only." },
  { id: "live_eligibility_authorized", label: "Live eligibility separately authorized", owner: "Release approvers", detail: "Require separate supplier rights, legal basis, privacy review, credentials, sandbox certification, monitoring, and incident approval before external verification." },
];

export type CarRentalDriverPrivacyEvidence = Partial<Record<CarRentalDriverPrivacyGate["id"], boolean>>;

export function buildCarRentalDriverPrivacyPlan(evidence: CarRentalDriverPrivacyEvidence = {}) {
  const gates = carRentalDriverPrivacyGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_DRIVER_PRIVACY_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
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
  } as const;
}

export type CarRentalCanonicalDriverPrivacyRecord = {
  evaluationId: string;
  policyFingerprint: string;
  rentalStartsOn: string;
  ageYears: number;
  driverAgeBand: CarDriverAgeBand;
  minimumAgeYears: number;
  license: {
    state: CarRentalLicenseRuleState;
    issuingCountryCode: string;
    licenseClass: CarRentalLicenseClass;
    expiresOn: string;
    ruleReference: string;
  };
  residency: {
    state: CarRentalRequirementState;
    countryCode?: string;
    ruleReference?: string;
  };
  additionalDrivers: {
    count: number;
    state: CarRentalRequirementState;
    ruleReference?: string;
  };
  geography: {
    pickupCountryCode: string;
    returnCountryCode: string;
    state: CarRentalGeographicPermissionState;
    ruleReference?: string;
  };
  declaredEligibility: CarRentalEligibilityState;
  privacy: {
    collectedFields: readonly string[];
    prohibitedDataDetected: boolean;
    collectedAt: string;
    retentionDays: number;
    deletionDueAt: string;
    observedAt: string;
    deletionState: CarRentalDeletionState;
    deletedAt?: string;
  };
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function isCountryCode(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

function isExactIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function parseExactUtcInstant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return undefined;
  return milliseconds;
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function expectedAgeBand(ageYears: number): CarDriverAgeBand | undefined {
  if (!Number.isSafeInteger(ageYears)) return undefined;
  if (ageYears >= 25) return "25_plus";
  if (ageYears >= 21) return "21_24";
  if (ageYears >= 18) return "18_20";
  return undefined;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export function validateCarRentalDriverPrivacyRecord(record: CarRentalCanonicalDriverPrivacyRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.evaluationId)) errors.push("Evaluation ID must be a stable opaque token.");
  if (!isSha256Digest(record.policyFingerprint)) errors.push("Policy fingerprint must be a lowercase 64-character digest.");
  if (!isExactIsoDate(record.rentalStartsOn)) errors.push("Rental start must be an exact ISO date.");
  if (!Number.isSafeInteger(record.ageYears) || record.ageYears < 18 || record.ageYears > 99) errors.push("Driver age must be a whole number from 18 through 99.");
  if (!carDriverAgeBands.includes(record.driverAgeBand)) errors.push("Driver age band is not supported.");
  const calculatedAgeBand = expectedAgeBand(record.ageYears);
  if (calculatedAgeBand !== undefined && record.driverAgeBand !== calculatedAgeBand) errors.push("Driver age band must match the whole-year age.");
  if (!Number.isSafeInteger(record.minimumAgeYears) || record.minimumAgeYears < 18 || record.minimumAgeYears > 99) errors.push("Minimum age must be a whole number from 18 through 99.");

  if (!carRentalLicenseRuleStates.includes(record.license.state)) errors.push("License-rule state is not supported.");
  if (!isCountryCode(record.license.issuingCountryCode)) errors.push("License country must be a two-letter uppercase ISO code.");
  if (!carRentalLicenseClasses.includes(record.license.licenseClass)) errors.push("License class is not supported.");
  if (!isExactIsoDate(record.license.expiresOn)) errors.push("License expiry must be an exact ISO date.");
  if (!isStableToken(record.license.ruleReference)) errors.push("License rule requires a stable sanitized reference.");
  if (record.license.state === "satisfied" && isExactIsoDate(record.license.expiresOn) && isExactIsoDate(record.rentalStartsOn) && record.license.expiresOn < record.rentalStartsOn) {
    errors.push("A satisfied license rule cannot expire before rental start.");
  }

  if (!carRentalRequirementStates.includes(record.residency.state)) errors.push("Residency-rule state is not supported.");
  if (record.residency.state === "not_required") {
    if (record.residency.countryCode !== undefined || record.residency.ruleReference !== undefined) errors.push("A not-required residency rule cannot retain residency evidence.");
  } else {
    if (!record.residency.countryCode || !isCountryCode(record.residency.countryCode)) errors.push("A required residency rule needs a two-letter uppercase country code.");
    if (!record.residency.ruleReference || !isStableToken(record.residency.ruleReference)) errors.push("A required residency rule needs a stable sanitized reference.");
  }

  if (!Number.isSafeInteger(record.additionalDrivers.count) || record.additionalDrivers.count < 0 || record.additionalDrivers.count > 8) errors.push("Additional-driver count must be a whole number from zero through eight.");
  if (!carRentalRequirementStates.includes(record.additionalDrivers.state)) errors.push("Additional-driver rule state is not supported.");
  if (record.additionalDrivers.count === 0) {
    if (record.additionalDrivers.state !== "not_required") errors.push("Zero additional drivers must use the not-required state.");
    if (record.additionalDrivers.ruleReference !== undefined) errors.push("Zero additional drivers cannot retain rule evidence.");
  } else {
    if (record.additionalDrivers.state === "not_required") errors.push("Additional drivers require an explicit rule outcome.");
    if (!record.additionalDrivers.ruleReference || !isStableToken(record.additionalDrivers.ruleReference)) errors.push("Additional drivers require a stable sanitized rule reference.");
  }

  if (!isCountryCode(record.geography.pickupCountryCode) || !isCountryCode(record.geography.returnCountryCode)) errors.push("Pickup and return countries must be two-letter uppercase ISO codes.");
  if (!carRentalGeographicPermissionStates.includes(record.geography.state)) errors.push("Geographic-permission state is not supported.");
  const sameCountry = record.geography.pickupCountryCode === record.geography.returnCountryCode;
  if (sameCountry) {
    if (record.geography.state !== "not_required") errors.push("Same-country travel must use the not-required geographic state.");
    if (record.geography.ruleReference !== undefined) errors.push("Same-country travel cannot retain cross-border rule evidence.");
  } else {
    if (record.geography.state === "not_required") errors.push("Cross-border travel requires an explicit geographic outcome.");
    if (!record.geography.ruleReference || !isStableToken(record.geography.ruleReference)) errors.push("Cross-border travel requires a stable sanitized rule reference.");
  }

  if (!carRentalEligibilityStates.includes(record.declaredEligibility)) errors.push("Declared eligibility state is not supported.");
  const ageSatisfied = Number.isSafeInteger(record.ageYears) && Number.isSafeInteger(record.minimumAgeYears) && record.ageYears >= record.minimumAgeYears;
  const negativeOutcome = !ageSatisfied
    || record.license.state === "not_satisfied"
    || record.residency.state === "not_satisfied"
    || record.additionalDrivers.state === "not_satisfied"
    || record.geography.state === "restricted";
  const positiveOutcome = ageSatisfied
    && record.license.state === "satisfied"
    && (record.residency.state === "not_required" || record.residency.state === "satisfied")
    && (record.additionalDrivers.state === "not_required" || record.additionalDrivers.state === "satisfied")
    && (record.geography.state === "not_required" || record.geography.state === "allowed");
  const calculatedEligibility: CarRentalEligibilityState = negativeOutcome ? "ineligible" : positiveOutcome ? "eligible" : "manual_review";
  if (record.declaredEligibility !== calculatedEligibility) errors.push("Declared eligibility must match the controlled rule outcomes.");

  if (hasDuplicates(record.privacy.collectedFields)) errors.push("Collected-field inventory cannot contain duplicates.");
  const unsupportedFields = record.privacy.collectedFields.filter((field) => !carRentalMinimizedDriverFields.includes(field as CarRentalMinimizedDriverField));
  if (unsupportedFields.length > 0) errors.push("Collected-field inventory contains unsupported or prohibited fields.");
  if (record.privacy.prohibitedDataDetected) errors.push("Prohibited driver data blocks privacy readiness.");

  const expectedFields: CarRentalMinimizedDriverField[] = [
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
  ];
  if (record.residency.countryCode !== undefined) expectedFields.push("residency_country");
  if (!sameValues(record.privacy.collectedFields, expectedFields)) errors.push("Collected-field inventory must exactly match the minimized fields used by the record.");

  const collectedAt = parseExactUtcInstant(record.privacy.collectedAt);
  const deletionDueAt = parseExactUtcInstant(record.privacy.deletionDueAt);
  const observedAt = parseExactUtcInstant(record.privacy.observedAt);
  const deletedAt = record.privacy.deletedAt === undefined ? undefined : parseExactUtcInstant(record.privacy.deletedAt);
  if (collectedAt === undefined || deletionDueAt === undefined || observedAt === undefined) errors.push("Privacy timestamps must be exact UTC instants.");
  if (!Number.isSafeInteger(record.privacy.retentionDays) || record.privacy.retentionDays < 1 || record.privacy.retentionDays > 3650) errors.push("Retention days must be a whole number from one through 3650.");
  if (collectedAt !== undefined && deletionDueAt !== undefined && Number.isSafeInteger(record.privacy.retentionDays)) {
    const expectedDeletionDueAt = collectedAt + record.privacy.retentionDays * 86_400_000;
    if (deletionDueAt !== expectedDeletionDueAt) errors.push("Deletion deadline must exactly match the declared retention period.");
  }
  if (collectedAt !== undefined && observedAt !== undefined && observedAt < collectedAt) errors.push("Privacy observation cannot precede collection.");

  let calculatedDeletionState: CarRentalDeletionState | undefined;
  if (collectedAt !== undefined && deletionDueAt !== undefined && observedAt !== undefined) {
    if (record.privacy.deletedAt !== undefined) {
      calculatedDeletionState = "completed";
      if (deletedAt === undefined) errors.push("Completed deletion requires an exact UTC deletion time.");
      if (deletedAt !== undefined && deletedAt < collectedAt) errors.push("Deletion cannot precede collection.");
      if (deletedAt !== undefined && deletedAt > observedAt) errors.push("Deletion cannot occur after observation.");
      if (deletedAt !== undefined && deletedAt > deletionDueAt) errors.push("Deletion must complete by the retention deadline.");
    } else {
      calculatedDeletionState = observedAt < deletionDueAt ? "scheduled" : "overdue";
    }
  }
  if (!carRentalDeletionStates.includes(record.privacy.deletionState)) errors.push("Deletion state is not supported.");
  if (calculatedDeletionState !== undefined && record.privacy.deletionState !== calculatedDeletionState) errors.push("Deletion state must match the exact retention timestamps.");
  if (calculatedDeletionState === "overdue") errors.push("Overdue deletion blocks privacy readiness.");

  const valid = errors.length === 0;
  const privacyControlsSatisfied = valid && !record.privacy.prohibitedDataDetected && calculatedDeletionState !== "overdue";

  return {
    valid,
    calculatedAgeBand,
    calculatedEligibility,
    calculatedDeletionState,
    eligibilityChecksSatisfied: valid && calculatedEligibility === "eligible",
    privacyControlsSatisfied,
    contractChecksSatisfied: valid && calculatedEligibility === "eligible" && privacyControlsSatisfied,
    liveEligibilityVerificationAuthorized: false,
    reservationAuthorized: false,
    paymentAuthorized: false,
    errors,
  } as const;
}
