export const CAR_RENTAL_QUOTE_REPRICE_MODE = "safety_contract_only" as const;

export const carRentalAvailabilityRecheckStates = ["not_checked", "available", "unavailable", "unknown"] as const;
export const carRentalPriceChangeKinds = ["unchanged", "decrease", "increase"] as const;
export const carRentalPriceConsentStates = ["not_required", "pending", "accepted", "declined", "expired"] as const;
export const carRentalPolicyChangeStates = ["unchanged", "changed", "unknown"] as const;

export type CarRentalAvailabilityRecheckState = (typeof carRentalAvailabilityRecheckStates)[number];
export type CarRentalPriceChangeKind = (typeof carRentalPriceChangeKinds)[number];
export type CarRentalPriceConsentState = (typeof carRentalPriceConsentStates)[number];
export type CarRentalPolicyChangeState = (typeof carRentalPolicyChangeStates)[number];

export type CarRentalQuoteRepriceContract = {
  id:
    | "quote_identity"
    | "request_fingerprint"
    | "expiry"
    | "availability_recheck"
    | "exact_reprice"
    | "price_change_classification"
    | "price_change_consent"
    | "policy_snapshot"
    | "supersession"
    | "no_guarantee";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalQuoteRepriceContracts: readonly CarRentalQuoteRepriceContract[] = [
  {
    id: "quote_identity",
    label: "Immutable quote identity",
    requiredFields: ["Opaque quote ID", "Positive version", "Issue time"],
    validationRule: "Bind each synthetic quote version to one stable opaque identifier and reject blank, malformed, or reused identity fields.",
    safetyBoundary: "A quote identifier is a contract key only; it is not a supplier confirmation or reservation reference.",
  },
  {
    id: "request_fingerprint",
    label: "Search-request fingerprint",
    requiredFields: ["64-character digest", "Original request binding"],
    validationRule: "Require one lowercase SHA-256-shaped fingerprint so a quote version cannot silently drift to another search request.",
    safetyBoundary: "The fingerprint proves internal fixture consistency only and contains no traveler or provider data.",
  },
  {
    id: "expiry",
    label: "Quote expiry",
    requiredFields: ["Issued at", "Expires at", "Observed at"],
    validationRule: "Require exact UTC instants, strictly ordered issue and expiry times, and fail closed when observation reaches expiry.",
    safetyBoundary: "A locally fresh synthetic quote does not establish a supplier hold, live availability, or guaranteed price.",
  },
  {
    id: "availability_recheck",
    label: "Availability recheck",
    requiredFields: ["Explicit state", "Checked at", "Sanitized reference"],
    validationRule: "Preserve not-checked, available, unavailable, and unknown states; any checked state requires a bounded timestamp and reference.",
    safetyBoundary: "Only a separately authorized live supplier recheck could establish current availability.",
  },
  {
    id: "exact_reprice",
    label: "Exact reprice",
    requiredFields: ["Currency", "Original total", "Repriced total", "Repriced at"],
    validationRule: "Use non-negative integer minor units, one currency, and a reprice instant before expiry.",
    safetyBoundary: "Synthetic arithmetic is not a live price, charge, payment request, or reservation authority.",
  },
  {
    id: "price_change_classification",
    label: "Price-change classification",
    requiredFields: ["Unchanged, decrease, or increase", "Exact amount comparison"],
    validationRule: "Derive the change direction from exact totals and reject a declared state that disagrees with the arithmetic.",
    safetyBoundary: "No tolerance, hidden increase, or inferred acceptance can replace an explicit traveler decision.",
  },
  {
    id: "price_change_consent",
    label: "Price-change consent",
    requiredFields: ["Consent state", "Accepted total", "Accepted at"],
    validationRule: "Require an explicit state for increases and bind accepted consent to the exact repriced total within the quote window.",
    safetyBoundary: "This contract validates a sanitized consent fact only; it provides no live consent-capture control or booking authority.",
  },
  {
    id: "policy_snapshot",
    label: "Policy snapshot",
    requiredFields: ["Snapshot ID", "64-character digest", "Captured at", "Change state"],
    validationRule: "Bind repricing to one immutable policy snapshot and require a disclosure when policies changed or remain unknown.",
    safetyBoundary: "A policy snapshot is not policy acceptance, coverage advice, eligibility approval, or a complete supplier contract.",
  },
  {
    id: "supersession",
    label: "Quote supersession",
    requiredFields: ["Version", "Superseded quote ID"],
    validationRule: "Version one has no predecessor; every later version names one different quote ID and never mutates the earlier version.",
    safetyBoundary: "Supersession preserves audit lineage but cannot refresh availability or revive an expired quote.",
  },
  {
    id: "no_guarantee",
    label: "No-guarantee handling",
    requiredFields: ["Traveler-facing disclosure", "Runtime hard stop"],
    validationRule: "Require a non-empty disclosure that pricing, availability, vehicle class, and policies require a fresh supplier confirmation.",
    safetyBoundary: "No synthetic or normalized record may be presented as guaranteed, reservable, payable, or Production-ready.",
  },
];

export type CarRentalQuoteRepriceGate = {
  id:
    | "contract_approved"
    | "identifier_versioning_reviewed"
    | "fingerprint_reviewed"
    | "clock_expiry_reviewed"
    | "availability_recheck_reviewed"
    | "reprice_math_reviewed"
    | "price_change_reviewed"
    | "consent_reviewed"
    | "policy_snapshot_reviewed"
    | "supersession_reviewed"
    | "fixtures_and_rejections_approved"
    | "quote_reprice_ingest_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalQuoteRepriceGates: readonly CarRentalQuoteRepriceGate[] = [
  { id: "contract_approved", label: "Quote and reprice contract approved", owner: "Engineering + Product", detail: "Approve canonical fields, controlled states, versioning, and traveler wording before any provider mapping or quote ingest." },
  { id: "identifier_versioning_reviewed", label: "Immutable identity reviewed", owner: "Engineering + Security", detail: "Verify quote IDs, versions, predecessor rules, and append-only lineage using sanitized fixtures." },
  { id: "fingerprint_reviewed", label: "Request binding reviewed", owner: "Engineering + Product", detail: "Confirm fingerprint format and rejection of quote-to-search drift without retaining traveler or provider data." },
  { id: "clock_expiry_reviewed", label: "Clock and expiry behavior reviewed", owner: "Engineering + Operations", detail: "Verify exact UTC timestamps, strict ordering, boundary behavior, and deterministic stale-quote rejection." },
  { id: "availability_recheck_reviewed", label: "Availability states reviewed", owner: "Product + Operations", detail: "Approve explicit not-checked, available, unavailable, and unknown handling without inventing live availability." },
  { id: "reprice_math_reviewed", label: "Reprice arithmetic reviewed", owner: "Engineering + Finance", detail: "Verify currency consistency, integer minor-unit totals, checked-at ordering, and overflow rejection." },
  { id: "price_change_reviewed", label: "Price-change classification reviewed", owner: "Product + Finance", detail: "Confirm exact unchanged, decrease, and increase classification without tolerance or hidden adjustments." },
  { id: "consent_reviewed", label: "Price-change consent reviewed", owner: "Product + Legal", detail: "Approve explicit increase-consent states, exact-total binding, expiry, and no-inferred-consent behavior." },
  { id: "policy_snapshot_reviewed", label: "Policy snapshot reviewed", owner: "Product + Legal", detail: "Verify snapshot identity, digest, timing, change states, disclosures, and the separate policy-acceptance boundary." },
  { id: "supersession_reviewed", label: "Supersession behavior reviewed", owner: "Engineering + Audit", detail: "Confirm append-only versions, distinct predecessor identity, and rejection of quote mutation or stale revival." },
  { id: "fixtures_and_rejections_approved", label: "Fixtures and rejection behavior approved", owner: "Engineering + Security", detail: "Record valid, stale, malformed, mismatched, unconfirmed, and inconsistent outcomes without supplier data, credentials, or personal data." },
  { id: "quote_reprice_ingest_authorized", label: "Quote and reprice ingest separately authorized", owner: "Release approvers", detail: "Require separate supplier rights, mapping, credentials, sandbox isolation, monitoring, and incident approval before any external request." },
];

export type CarRentalQuoteRepriceEvidence = Partial<Record<CarRentalQuoteRepriceGate["id"], boolean>>;

export function buildCarRentalQuoteRepricePlan(evidence: CarRentalQuoteRepriceEvidence = {}) {
  const gates = carRentalQuoteRepriceGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_QUOTE_REPRICE_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
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
  } as const;
}

export type CarRentalAvailabilityRecheck = {
  state: CarRentalAvailabilityRecheckState;
  checkedAt?: string;
  reference?: string;
};

export type CarRentalPriceChangeConsent = {
  state: CarRentalPriceConsentState;
  acceptedTotalMinor?: number;
  acceptedAt?: string;
};

export type CarRentalPolicySnapshot = {
  id: string;
  digest: string;
  capturedAt: string;
  changeState: CarRentalPolicyChangeState;
  disclosure?: string;
};

export type CarRentalCanonicalQuoteRepriceRecord = {
  quoteId: string;
  quoteVersion: number;
  supersedesQuoteId?: string;
  searchFingerprint: string;
  currency: string;
  originalTotalMinor: number;
  repricedTotalMinor: number;
  declaredPriceChange: CarRentalPriceChangeKind;
  issuedAt: string;
  expiresAt: string;
  repricedAt: string;
  observedAt: string;
  availabilityRecheck: CarRentalAvailabilityRecheck;
  consent: CarRentalPriceChangeConsent;
  policySnapshot: CarRentalPolicySnapshot;
  noGuaranteeDisclosure: string;
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function isNonNegativeMinorAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function parseExactUtcInstant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return undefined;
  return milliseconds;
}

function classifyPriceChange(originalTotalMinor: number, repricedTotalMinor: number): CarRentalPriceChangeKind {
  if (repricedTotalMinor === originalTotalMinor) return "unchanged";
  return repricedTotalMinor < originalTotalMinor ? "decrease" : "increase";
}

export function validateCarRentalQuoteRepriceRecord(record: CarRentalCanonicalQuoteRepriceRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.quoteId)) errors.push("Quote ID must be a stable opaque token.");
  if (!Number.isSafeInteger(record.quoteVersion) || record.quoteVersion < 1) errors.push("Quote version must be a positive whole number.");
  if (record.quoteVersion === 1 && record.supersedesQuoteId !== undefined) errors.push("Quote version one cannot supersede another quote.");
  if (record.quoteVersion > 1 && (!record.supersedesQuoteId || !isStableToken(record.supersedesQuoteId))) errors.push("A later quote version requires a stable predecessor quote ID.");
  if (record.supersedesQuoteId === record.quoteId) errors.push("A quote cannot supersede itself.");
  if (!isSha256Digest(record.searchFingerprint)) errors.push("Search fingerprint must be a lowercase 64-character digest.");
  if (!/^[A-Z]{3}$/.test(record.currency)) errors.push("Currency must be a three-letter uppercase code.");
  if (!isNonNegativeMinorAmount(record.originalTotalMinor) || !isNonNegativeMinorAmount(record.repricedTotalMinor)) errors.push("Quote totals must be non-negative integer minor-unit amounts.");
  if (!carRentalPriceChangeKinds.includes(record.declaredPriceChange)) errors.push("Declared price-change state is not supported.");

  const issuedAt = parseExactUtcInstant(record.issuedAt);
  const expiresAt = parseExactUtcInstant(record.expiresAt);
  const repricedAt = parseExactUtcInstant(record.repricedAt);
  const observedAt = parseExactUtcInstant(record.observedAt);
  if (issuedAt === undefined || expiresAt === undefined || repricedAt === undefined || observedAt === undefined) errors.push("Quote timestamps must be exact UTC instants.");
  if (issuedAt !== undefined && expiresAt !== undefined && issuedAt >= expiresAt) errors.push("Quote expiry must be after issue time.");
  if (issuedAt !== undefined && repricedAt !== undefined && repricedAt < issuedAt) errors.push("Reprice cannot occur before quote issue.");
  if (repricedAt !== undefined && expiresAt !== undefined && repricedAt >= expiresAt) errors.push("Reprice must complete before quote expiry.");
  if (repricedAt !== undefined && observedAt !== undefined && observedAt < repricedAt) errors.push("Observation cannot occur before reprice.");
  const quoteFresh = observedAt !== undefined && expiresAt !== undefined && observedAt < expiresAt;
  if (observedAt !== undefined && expiresAt !== undefined && !quoteFresh) errors.push("Quote is expired at the observation time.");

  if (!carRentalAvailabilityRecheckStates.includes(record.availabilityRecheck.state)) errors.push("Availability recheck state is not supported.");
  const availabilityCheckedAt = record.availabilityRecheck.checkedAt === undefined ? undefined : parseExactUtcInstant(record.availabilityRecheck.checkedAt);
  if (record.availabilityRecheck.state === "not_checked") {
    if (record.availabilityRecheck.checkedAt !== undefined || record.availabilityRecheck.reference !== undefined) errors.push("A not-checked availability state cannot include check evidence.");
  } else {
    if (availabilityCheckedAt === undefined) errors.push("A checked availability state requires an exact UTC check time.");
    if (!record.availabilityRecheck.reference || !isStableToken(record.availabilityRecheck.reference)) errors.push("A checked availability state requires a stable sanitized reference.");
    if (issuedAt !== undefined && availabilityCheckedAt !== undefined && availabilityCheckedAt < issuedAt) errors.push("Availability recheck cannot occur before quote issue.");
    if (availabilityCheckedAt !== undefined && repricedAt !== undefined && availabilityCheckedAt > repricedAt) errors.push("Availability recheck cannot occur after reprice.");
    if (availabilityCheckedAt !== undefined && expiresAt !== undefined && availabilityCheckedAt >= expiresAt) errors.push("Availability recheck must complete before quote expiry.");
  }

  const calculatedPriceChange = isNonNegativeMinorAmount(record.originalTotalMinor) && isNonNegativeMinorAmount(record.repricedTotalMinor)
    ? classifyPriceChange(record.originalTotalMinor, record.repricedTotalMinor)
    : undefined;
  if (calculatedPriceChange !== undefined && record.declaredPriceChange !== calculatedPriceChange) errors.push("Declared price-change state must match the exact totals.");

  if (!carRentalPriceConsentStates.includes(record.consent.state)) errors.push("Price-change consent state is not supported.");
  const acceptedAt = record.consent.acceptedAt === undefined ? undefined : parseExactUtcInstant(record.consent.acceptedAt);
  if (calculatedPriceChange === "increase") {
    if (record.consent.state === "not_required") errors.push("A price increase requires an explicit consent outcome.");
    if (record.consent.state === "accepted") {
      if (!isNonNegativeMinorAmount(record.consent.acceptedTotalMinor ?? Number.NaN) || record.consent.acceptedTotalMinor !== record.repricedTotalMinor) errors.push("Accepted price consent must match the exact repriced total.");
      if (acceptedAt === undefined) errors.push("Accepted price consent requires an exact UTC acceptance time.");
      if (repricedAt !== undefined && acceptedAt !== undefined && acceptedAt < repricedAt) errors.push("Price consent cannot precede reprice.");
      if (acceptedAt !== undefined && observedAt !== undefined && acceptedAt > observedAt) errors.push("Price consent cannot occur after observation.");
      if (acceptedAt !== undefined && expiresAt !== undefined && acceptedAt >= expiresAt) errors.push("Price consent must occur before quote expiry.");
    } else if (record.consent.acceptedTotalMinor !== undefined || record.consent.acceptedAt !== undefined) {
      errors.push("Unaccepted price consent cannot include acceptance evidence.");
    }
  } else {
    if (record.consent.state !== "not_required") errors.push("An unchanged or lower price must use the not-required consent state.");
    if (record.consent.acceptedTotalMinor !== undefined || record.consent.acceptedAt !== undefined) errors.push("A not-required consent state cannot include acceptance evidence.");
  }

  if (!isStableToken(record.policySnapshot.id)) errors.push("Policy snapshot ID must be a stable opaque token.");
  if (!isSha256Digest(record.policySnapshot.digest)) errors.push("Policy snapshot digest must be a lowercase 64-character digest.");
  if (!carRentalPolicyChangeStates.includes(record.policySnapshot.changeState)) errors.push("Policy change state is not supported.");
  const policyCapturedAt = parseExactUtcInstant(record.policySnapshot.capturedAt);
  if (policyCapturedAt === undefined) errors.push("Policy snapshot requires an exact UTC capture time.");
  if (issuedAt !== undefined && policyCapturedAt !== undefined && policyCapturedAt < issuedAt) errors.push("Policy snapshot cannot precede quote issue.");
  if (policyCapturedAt !== undefined && repricedAt !== undefined && policyCapturedAt > repricedAt) errors.push("Policy snapshot cannot be captured after reprice.");
  if (policyCapturedAt !== undefined && expiresAt !== undefined && policyCapturedAt >= expiresAt) errors.push("Policy snapshot must be captured before quote expiry.");
  if ((record.policySnapshot.changeState === "changed" || record.policySnapshot.changeState === "unknown") && !record.policySnapshot.disclosure?.trim()) errors.push("Changed or unknown policy state requires a traveler disclosure.");
  if (!record.noGuaranteeDisclosure.trim()) errors.push("Quote record requires a no-guarantee disclosure.");

  const consentSatisfied = calculatedPriceChange !== "increase" || record.consent.state === "accepted";
  const availabilityConfirmed = record.availabilityRecheck.state === "available";
  const policyStable = record.policySnapshot.changeState === "unchanged";
  const valid = errors.length === 0;

  return {
    valid,
    quoteFresh,
    calculatedPriceChange,
    availabilityConfirmed,
    consentSatisfied,
    policyStable,
    contractChecksSatisfied: valid && quoteFresh && availabilityConfirmed && consentSatisfied && policyStable,
    reservationAuthorized: false,
    paymentAuthorized: false,
    errors,
  } as const;
}
