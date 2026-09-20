export const CAR_RENTAL_RESERVATION_LIFECYCLE_MODE = "reservation_lifecycle_contract_only" as const;

export const carRentalReservationLifecycleStates = [
  "planning",
  "confirmation_pending",
  "confirmed",
  "modified",
  "cancelled",
  "no_show",
  "picked_up",
  "extended",
  "early_returned",
  "late_returned",
  "refunded",
] as const;

export const carRentalReservationEventKinds = [
  "create",
  "confirm",
  "modify",
  "cancel",
  "no_show",
  "pickup",
  "extend",
  "early_return",
  "late_return",
  "refund",
] as const;

export const carRentalReservationEventOutcomes = ["recorded", "rejected", "manual_review"] as const;
export const carRentalSupplierReferenceStates = ["not_available", "pending", "matched", "mismatched", "manual_review"] as const;

export const carRentalReservationRecordedFields = [
  "lifecycle_id",
  "quote_id",
  "search_request_fingerprint",
  "policy_fingerprint",
  "currency",
  "quoted_total_minor",
  "refundable_total_minor",
  "declared_state",
  "event_ids",
  "event_kinds",
  "event_outcomes",
  "event_timestamps",
  "event_state_transitions",
  "event_request_fingerprints",
  "supplier_reference_digests",
  "reference_reconciliation_state",
] as const;

export const carRentalReservationProhibitedFields = [
  "traveler_name",
  "traveler_email",
  "traveler_phone",
  "driver_license_number",
  "driver_license_image",
  "payment_card_number",
  "payment_security_code",
  "raw_supplier_reference",
  "supplier_credentials",
] as const;

export type CarRentalReservationLifecycleState = (typeof carRentalReservationLifecycleStates)[number];
export type CarRentalReservationEventKind = (typeof carRentalReservationEventKinds)[number];
export type CarRentalReservationEventOutcome = (typeof carRentalReservationEventOutcomes)[number];
export type CarRentalSupplierReferenceState = (typeof carRentalSupplierReferenceStates)[number];
export type CarRentalReservationRecordedField = (typeof carRentalReservationRecordedFields)[number];

export type CarRentalReservationLifecycleContract = {
  id:
    | "create"
    | "confirm"
    | "modify"
    | "cancel"
    | "no_show"
    | "pickup"
    | "extension"
    | "early_return"
    | "late_return"
    | "refund"
    | "supplier_reference_reconciliation";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalReservationLifecycleContracts: readonly CarRentalReservationLifecycleContract[] = [
  { id: "create", label: "Create intent", requiredFields: ["Lifecycle ID", "Quote ID", "Request fingerprint"], validationRule: "Start one synthetic timeline in planning and record a create intent only through the controlled pending-confirmation transition.", safetyBoundary: "A local create event is not a supplier request, hold, reservation, or confirmation." },
  { id: "confirm", label: "Confirmation evidence", requiredFields: ["Pending state", "Outcome", "Reference reconciliation"], validationRule: "Record confirmed only after a valid pending state and explicit sanitized reference-reconciliation evidence.", safetyBoundary: "A fictional digest is not a raw supplier confirmation number or proof of a reservation." },
  { id: "modify", label: "Append-only modification", requiredFields: ["Prior state", "New event ID", "New request fingerprint"], validationRule: "Append each accepted, rejected, or manual-review modification without mutating an earlier event.", safetyBoundary: "A local modification event does not change dates, vehicle, rate, policy, or inventory with a supplier." },
  { id: "cancel", label: "Cancellation finality", requiredFields: ["Eligible prior state", "Cancellation outcome", "Terminal state"], validationRule: "Allow cancellation only from a pending or confirmed lifecycle and reject later operational transitions.", safetyBoundary: "A synthetic cancelled state is not supplier cancellation evidence or a promise of waived charges." },
  { id: "no_show", label: "No-show handling", requiredFields: ["Confirmed prior state", "No-show outcome", "Reason code when unresolved"], validationRule: "Record no-show only from a confirmed or modified state and preserve rejected or manual-review outcomes without inference.", safetyBoundary: "A local no-show record does not determine supplier charges, traveler liability, or refund rights." },
  { id: "pickup", label: "Pickup transition", requiredFields: ["Confirmed prior state", "Pickup outcome", "Timestamp"], validationRule: "Move to picked-up only from a confirmed or modified timeline with strictly ordered sanitized evidence.", safetyBoundary: "A picked-up fixture does not prove identity, counter handoff, vehicle condition, or possession." },
  { id: "extension", label: "Extension handling", requiredFields: ["Active rental state", "Extension outcome", "Request fingerprint"], validationRule: "Permit append-only extension outcomes only after synthetic pickup and preserve rejected or manual-review results.", safetyBoundary: "An extended state is not supplier approval, inventory availability, repricing, or payment authorization." },
  { id: "early_return", label: "Early-return handling", requiredFields: ["Active rental state", "Return outcome", "Timestamp"], validationRule: "Record early return only from a picked-up or extended state and make it terminal for later operational events.", safetyBoundary: "An early-return fixture does not prove vehicle return, condition, charges, or refund eligibility." },
  { id: "late_return", label: "Late-return handling", requiredFields: ["Active rental state", "Return outcome", "Timestamp"], validationRule: "Record late return only from a picked-up or extended state without estimating fees or policy consequences.", safetyBoundary: "A late-return fixture is not a charge, penalty, extension, or supplier decision." },
  { id: "refund", label: "Refund reconciliation", requiredFields: ["Eligible terminal state", "Integer minor units", "Currency"], validationRule: "Bound a synthetic recorded refund to the refundable amount and reject missing, negative, excessive, or misplaced refund evidence.", safetyBoundary: "A refunded state does not move money, issue credit, settle a dispute, or prove supplier reimbursement." },
  { id: "supplier_reference_reconciliation", label: "Supplier-reference reconciliation", requiredFields: ["Digest state", "Observed at", "No raw reference"], validationRule: "Compare only lowercase digests and preserve not-available, pending, matched, mismatched, and manual-review states.", safetyBoundary: "Digest equality is sanitized fixture consistency only and never creates a provider mapping or supplier confirmation." },
];

export type CarRentalReservationLifecycleGate = {
  id:
    | "contract_approved"
    | "transition_model_reviewed"
    | "create_and_confirm_reviewed"
    | "modification_reviewed"
    | "cancellation_and_no_show_reviewed"
    | "pickup_and_return_reviewed"
    | "extension_reviewed"
    | "refund_reviewed"
    | "supplier_reference_reviewed"
    | "sanitized_fixtures_reviewed"
    | "audit_and_reconciliation_reviewed"
    | "live_reservations_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalReservationLifecycleGates: readonly CarRentalReservationLifecycleGate[] = [
  { id: "contract_approved", label: "Reservation lifecycle contract approved", owner: "Engineering + Product", detail: "Approve the provider-neutral states, append-only event shape, rejection behavior, and non-transactional wording." },
  { id: "transition_model_reviewed", label: "Transition model reviewed", owner: "Engineering + Operations", detail: "Verify every recorded transition, terminal state, rejected outcome, and manual-review boundary." },
  { id: "create_and_confirm_reviewed", label: "Create and confirm reviewed", owner: "Product + Operations", detail: "Approve pending and confirmed semantics without implying a supplier request, hold, or reservation." },
  { id: "modification_reviewed", label: "Modification behavior reviewed", owner: "Product + Audit", detail: "Require immutable history, unique request fingerprints, and no mutation of prior reservation facts." },
  { id: "cancellation_and_no_show_reviewed", label: "Cancellation and no-show reviewed", owner: "Operations + Legal", detail: "Approve terminal-state handling without claims about charges, liability, refunds, or supplier action." },
  { id: "pickup_and_return_reviewed", label: "Pickup and return reviewed", owner: "Operations + Support", detail: "Verify controlled pickup, early-return, and late-return states without identity or vehicle-condition claims." },
  { id: "extension_reviewed", label: "Extension behavior reviewed", owner: "Operations + Product", detail: "Preserve recorded, rejected, and manual-review outcomes without supplier approval, repricing, or payment." },
  { id: "refund_reviewed", label: "Refund behavior reviewed", owner: "Finance + Legal", detail: "Verify integer-minor-unit bounds and maintain a strict no-money-movement boundary." },
  { id: "supplier_reference_reviewed", label: "Supplier-reference reconciliation reviewed", owner: "Engineering + Security", detail: "Allow only sanitized digests and reject raw references, credentials, and unsupported reconciliation states." },
  { id: "sanitized_fixtures_reviewed", label: "Sanitized fixtures reviewed", owner: "Security + Privacy", detail: "Confirm fixture-only identifiers, exact field allowlists, prohibited-data rejection, and no traveler or provider data." },
  { id: "audit_and_reconciliation_reviewed", label: "Audit and reconciliation reviewed", owner: "Audit + Support", detail: "Verify ordered events, unique evidence, explicit outcomes, final-state agreement, and unresolved mismatch handling." },
  { id: "live_reservations_authorized", label: "Live reservations separately authorized", owner: "Release approvers", detail: "Require supplier rights, credentials, sandbox certification, monitoring, support, legal, payment, and incident approval before external action." },
];

export type CarRentalReservationLifecycleEvidence = Partial<Record<CarRentalReservationLifecycleGate["id"], boolean>>;

export function buildCarRentalReservationLifecyclePlan(evidence: CarRentalReservationLifecycleEvidence = {}) {
  const gates = carRentalReservationLifecycleGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_RESERVATION_LIFECYCLE_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
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
  } as const;
}

export type CarRentalReservationLifecycleEvent = {
  eventId: string;
  kind: CarRentalReservationEventKind;
  outcome: CarRentalReservationEventOutcome;
  occurredAt: string;
  fromState: CarRentalReservationLifecycleState;
  toState: CarRentalReservationLifecycleState;
  requestFingerprint: string;
  reasonCode?: string;
  refundAmountMinor?: number;
};

export type CarRentalCanonicalReservationLifecycleRecord = {
  lifecycleId: string;
  quoteId: string;
  searchRequestFingerprint: string;
  policyFingerprint: string;
  currency: string;
  quotedTotalMinor: number;
  refundableTotalMinor: number;
  declaredState: CarRentalReservationLifecycleState;
  events: readonly CarRentalReservationLifecycleEvent[];
  referenceReconciliation: {
    state: CarRentalSupplierReferenceState;
    observedAt: string;
    localReferenceDigest?: string;
    supplierReferenceDigest?: string;
  };
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

const recordedTransitions: Record<CarRentalReservationEventKind, readonly (readonly [CarRentalReservationLifecycleState, CarRentalReservationLifecycleState])[]> = {
  create: [["planning", "confirmation_pending"]],
  confirm: [["confirmation_pending", "confirmed"]],
  modify: [["confirmed", "modified"], ["modified", "modified"]],
  cancel: [["confirmation_pending", "cancelled"], ["confirmed", "cancelled"], ["modified", "cancelled"]],
  no_show: [["confirmed", "no_show"], ["modified", "no_show"]],
  pickup: [["confirmed", "picked_up"], ["modified", "picked_up"]],
  extend: [["picked_up", "extended"], ["extended", "extended"]],
  early_return: [["picked_up", "early_returned"], ["extended", "early_returned"]],
  late_return: [["picked_up", "late_returned"], ["extended", "late_returned"]],
  refund: [["cancelled", "refunded"], ["no_show", "refunded"], ["early_returned", "refunded"], ["late_returned", "refunded"]],
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function parseExactUtcInstant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return undefined;
  return milliseconds;
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function isAllowedRecordedTransition(event: CarRentalReservationLifecycleEvent) {
  return recordedTransitions[event.kind].some(([fromState, toState]) => fromState === event.fromState && toState === event.toState);
}

export function validateCarRentalReservationLifecycleRecord(record: CarRentalCanonicalReservationLifecycleRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.lifecycleId)) errors.push("Lifecycle ID must be a stable opaque token.");
  if (!isStableToken(record.quoteId)) errors.push("Quote ID must be a stable opaque token.");
  if (!isSha256Digest(record.searchRequestFingerprint)) errors.push("Search-request fingerprint must be a lowercase 64-character digest.");
  if (!isSha256Digest(record.policyFingerprint)) errors.push("Policy fingerprint must be a lowercase 64-character digest.");
  if (!/^[A-Z]{3}$/.test(record.currency)) errors.push("Currency must be a three-letter uppercase code.");
  if (!Number.isSafeInteger(record.quotedTotalMinor) || record.quotedTotalMinor < 0) errors.push("Quoted total must be a non-negative integer in minor units.");
  if (!Number.isSafeInteger(record.refundableTotalMinor) || record.refundableTotalMinor < 0 || record.refundableTotalMinor > record.quotedTotalMinor) errors.push("Refundable total must be a non-negative integer no greater than the quoted total.");
  if (!carRentalReservationLifecycleStates.includes(record.declaredState)) errors.push("Declared lifecycle state is not supported.");
  if (record.events.length < 1 || record.events.length > 32) errors.push("Lifecycle timeline must contain from one through 32 sanitized events.");
  if (record.prohibitedDataDetected) errors.push("Prohibited traveler, payment, credential, or raw supplier-reference data blocks lifecycle readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalReservationRecordedFields.includes(field as CarRentalReservationRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalReservationRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized lifecycle allowlist.");

  const eventIds = record.events.map((event) => event.eventId);
  const requestFingerprints = record.events.map((event) => event.requestFingerprint);
  if (hasDuplicates(eventIds)) errors.push("Lifecycle event IDs must be unique.");
  if (hasDuplicates(requestFingerprints)) errors.push("Lifecycle request fingerprints must be unique.");

  let calculatedState: CarRentalReservationLifecycleState = "planning";
  let previousOccurredAt: number | undefined;
  let totalRecordedRefundMinor = 0;
  let recordedConfirmation = false;

  for (const event of record.events) {
    if (!isStableToken(event.eventId)) errors.push("Every lifecycle event ID must be a stable opaque token.");
    if (!carRentalReservationEventKinds.includes(event.kind)) errors.push("Lifecycle event kind is not supported.");
    if (!carRentalReservationEventOutcomes.includes(event.outcome)) errors.push("Lifecycle event outcome is not supported.");
    if (!carRentalReservationLifecycleStates.includes(event.fromState) || !carRentalReservationLifecycleStates.includes(event.toState)) errors.push("Lifecycle event states are not supported.");
    if (!isSha256Digest(event.requestFingerprint)) errors.push("Every lifecycle request fingerprint must be a lowercase 64-character digest.");

    const occurredAt = parseExactUtcInstant(event.occurredAt);
    if (occurredAt === undefined) errors.push("Every lifecycle event time must be an exact UTC instant.");
    if (occurredAt !== undefined && previousOccurredAt !== undefined && occurredAt <= previousOccurredAt) errors.push("Lifecycle event times must be strictly increasing.");
    if (occurredAt !== undefined) previousOccurredAt = occurredAt;

    if (event.fromState !== calculatedState) errors.push("Lifecycle event from-state must match the current calculated state.");

    if (event.outcome === "recorded") {
      if (!isAllowedRecordedTransition(event)) errors.push("Recorded lifecycle transition is not allowed from the current state.");
      if (event.reasonCode !== undefined) errors.push("Recorded lifecycle events cannot retain a rejection or manual-review reason.");
      calculatedState = event.toState;
      if (event.kind === "confirm") recordedConfirmation = true;
    } else {
      if (event.fromState !== event.toState) errors.push("Rejected or manual-review events cannot change lifecycle state.");
      if (!event.reasonCode || !isStableToken(event.reasonCode)) errors.push("Rejected or manual-review events require a stable sanitized reason code.");
    }

    if (event.kind === "refund" && event.outcome === "recorded") {
      if (!Number.isSafeInteger(event.refundAmountMinor) || event.refundAmountMinor === undefined || event.refundAmountMinor <= 0) errors.push("A recorded refund requires a positive integer amount in minor units.");
      if (Number.isSafeInteger(event.refundAmountMinor) && event.refundAmountMinor !== undefined) totalRecordedRefundMinor += event.refundAmountMinor;
    } else if (event.refundAmountMinor !== undefined) {
      errors.push("Only a recorded refund event can contain a refund amount.");
    }
  }

  if (calculatedState !== record.declaredState) errors.push("Declared lifecycle state must match the append-only event timeline.");
  if (totalRecordedRefundMinor > record.refundableTotalMinor) errors.push("Recorded refund amount cannot exceed the refundable total.");

  if (!carRentalSupplierReferenceStates.includes(record.referenceReconciliation.state)) errors.push("Supplier-reference reconciliation state is not supported.");
  const reconciliationObservedAt = parseExactUtcInstant(record.referenceReconciliation.observedAt);
  if (reconciliationObservedAt === undefined) errors.push("Reference-reconciliation time must be an exact UTC instant.");
  if (reconciliationObservedAt !== undefined && previousOccurredAt !== undefined && reconciliationObservedAt < previousOccurredAt) errors.push("Reference reconciliation cannot precede the final lifecycle event.");

  const { localReferenceDigest, supplierReferenceDigest, state: reconciliationState } = record.referenceReconciliation;
  if (reconciliationState === "not_available") {
    if (localReferenceDigest !== undefined || supplierReferenceDigest !== undefined) errors.push("Not-available reference reconciliation cannot retain reference digests.");
  } else if (reconciliationState === "pending") {
    if (!localReferenceDigest || !isSha256Digest(localReferenceDigest)) errors.push("Pending reference reconciliation requires one local lowercase digest.");
    if (supplierReferenceDigest !== undefined) errors.push("Pending reference reconciliation cannot retain a supplier-reference digest.");
  } else {
    if (!localReferenceDigest || !isSha256Digest(localReferenceDigest) || !supplierReferenceDigest || !isSha256Digest(supplierReferenceDigest)) errors.push("Resolved or manual-review reconciliation requires local and supplier lowercase digests.");
    if (reconciliationState === "matched" && localReferenceDigest !== supplierReferenceDigest) errors.push("Matched reference reconciliation requires equal digests.");
    if (reconciliationState === "mismatched" && localReferenceDigest === supplierReferenceDigest) errors.push("Mismatched reference reconciliation requires different digests.");
  }
  if (recordedConfirmation && reconciliationState === "not_available") errors.push("A recorded confirmation requires explicit reference-reconciliation evidence.");

  const valid = errors.length === 0;
  const referenceReconciled = valid && reconciliationState === "matched";

  return {
    valid,
    calculatedState,
    totalRecordedRefundMinor,
    referenceReconciled,
    contractChecksSatisfied: valid && referenceReconciled,
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
    errors,
  } as const;
}

const recordedFields = carRentalReservationRecordedFields;

export const carRentalReservationLifecycleFixtures: readonly CarRentalCanonicalReservationLifecycleRecord[] = [
  {
    lifecycleId: "lifecycle_demo_confirmed_0001",
    quoteId: "quote_demo_confirmed_0001",
    searchRequestFingerprint: "1".repeat(64),
    policyFingerprint: "a".repeat(64),
    currency: "USD",
    quotedTotalMinor: 45000,
    refundableTotalMinor: 40000,
    declaredState: "confirmed",
    events: [
      { eventId: "event_create_confirmed_0001", kind: "create", outcome: "recorded", occurredAt: "2026-08-20T15:00:00.000Z", fromState: "planning", toState: "confirmation_pending", requestFingerprint: "2".repeat(64) },
      { eventId: "event_confirm_confirmed_0001", kind: "confirm", outcome: "recorded", occurredAt: "2026-08-20T15:01:00.000Z", fromState: "confirmation_pending", toState: "confirmed", requestFingerprint: "3".repeat(64) },
    ],
    referenceReconciliation: { state: "matched", observedAt: "2026-08-20T15:02:00.000Z", localReferenceDigest: "b".repeat(64), supplierReferenceDigest: "b".repeat(64) },
    recordedFields,
    prohibitedDataDetected: false,
  },
  {
    lifecycleId: "lifecycle_demo_refunded_0002",
    quoteId: "quote_demo_refunded_0002",
    searchRequestFingerprint: "4".repeat(64),
    policyFingerprint: "c".repeat(64),
    currency: "USD",
    quotedTotalMinor: 52000,
    refundableTotalMinor: 50000,
    declaredState: "refunded",
    events: [
      { eventId: "event_create_refunded_0002", kind: "create", outcome: "recorded", occurredAt: "2026-08-20T16:00:00.000Z", fromState: "planning", toState: "confirmation_pending", requestFingerprint: "5".repeat(64) },
      { eventId: "event_confirm_refunded_0002", kind: "confirm", outcome: "recorded", occurredAt: "2026-08-20T16:01:00.000Z", fromState: "confirmation_pending", toState: "confirmed", requestFingerprint: "6".repeat(64) },
      { eventId: "event_cancel_refunded_0002", kind: "cancel", outcome: "recorded", occurredAt: "2026-08-20T16:02:00.000Z", fromState: "confirmed", toState: "cancelled", requestFingerprint: "7".repeat(64) },
      { eventId: "event_refund_refunded_0002", kind: "refund", outcome: "recorded", occurredAt: "2026-08-20T16:03:00.000Z", fromState: "cancelled", toState: "refunded", requestFingerprint: "8".repeat(64), refundAmountMinor: 50000 },
    ],
    referenceReconciliation: { state: "matched", observedAt: "2026-08-20T16:04:00.000Z", localReferenceDigest: "d".repeat(64), supplierReferenceDigest: "d".repeat(64) },
    recordedFields,
    prohibitedDataDetected: false,
  },
  {
    lifecycleId: "lifecycle_demo_late_return_0003",
    quoteId: "quote_demo_late_return_0003",
    searchRequestFingerprint: "9".repeat(64),
    policyFingerprint: "e".repeat(64),
    currency: "USD",
    quotedTotalMinor: 68000,
    refundableTotalMinor: 0,
    declaredState: "late_returned",
    events: [
      { eventId: "event_create_late_return_0003", kind: "create", outcome: "recorded", occurredAt: "2026-08-20T17:00:00.000Z", fromState: "planning", toState: "confirmation_pending", requestFingerprint: "a".repeat(64) },
      { eventId: "event_confirm_late_return_0003", kind: "confirm", outcome: "recorded", occurredAt: "2026-08-20T17:01:00.000Z", fromState: "confirmation_pending", toState: "confirmed", requestFingerprint: "b".repeat(64) },
      { eventId: "event_modify_late_return_0003", kind: "modify", outcome: "recorded", occurredAt: "2026-08-20T17:02:00.000Z", fromState: "confirmed", toState: "modified", requestFingerprint: "c".repeat(64) },
      { eventId: "event_pickup_late_return_0003", kind: "pickup", outcome: "recorded", occurredAt: "2026-08-20T17:03:00.000Z", fromState: "modified", toState: "picked_up", requestFingerprint: "d".repeat(64) },
      { eventId: "event_extend_late_return_0003", kind: "extend", outcome: "recorded", occurredAt: "2026-08-20T17:04:00.000Z", fromState: "picked_up", toState: "extended", requestFingerprint: "e".repeat(64) },
      { eventId: "event_late_return_0003", kind: "late_return", outcome: "recorded", occurredAt: "2026-08-20T17:05:00.000Z", fromState: "extended", toState: "late_returned", requestFingerprint: "f".repeat(64) },
    ],
    referenceReconciliation: { state: "matched", observedAt: "2026-08-20T17:06:00.000Z", localReferenceDigest: "f".repeat(64), supplierReferenceDigest: "f".repeat(64) },
    recordedFields,
    prohibitedDataDetected: false,
  },
];
