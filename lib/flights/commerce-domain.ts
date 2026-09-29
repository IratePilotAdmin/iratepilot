import { canonicalFlightJson, sha256FlightEvidence, type FlightCanonicalJsonValue } from "./runtime-safety";

/**
 * Provider-neutral flight commerce primitives.
 *
 * This module deliberately contains no provider SDK, persistence, network, payment,
 * or ticketing side effect. The lifecycle helpers are immutable and fail closed so
 * the same rules can be reused by an API layer and by deterministic tests.
 */

export const flightCabinClasses = ["economy", "premium_economy", "business", "first"] as const;
export type FlightCabinClass = (typeof flightCabinClasses)[number];

export type FlightPassengerCounts = {
  adults: number;
  children: number;
  infantsInSeat: number;
  infantsOnLap: number;
};

export type FlightCommerceSearchRequest = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabin: FlightCabinClass;
  passengers: FlightPassengerCounts;
};

export type FlightMoney = {
  currency: string;
  amountMinor: number;
};

export type FlightSegment = {
  segmentId: string;
  marketingCarrier: string;
  marketingFlightNumber: string;
  origin: string;
  destination: string;
  departsAt: string;
  arrivesAt: string;
};

export type FlightOfferSnapshot = {
  offerId: string;
  providerId: string;
  searchDigest: string;
  termsDigest: string;
  expiresAt: string;
  total: FlightMoney;
  segments: readonly FlightSegment[];
  source: "synthetic_fixture" | "provider_sandbox" | "provider_production";
};

const airportCodePattern = /^[A-Z]{3}$/;
const carrierCodePattern = /^[A-Z0-9]{2,3}$/;
const currencyPattern = /^[A-Z]{3}$/;
const stableTokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isExactIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function parseExactUtcInstant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return undefined;
  return milliseconds;
}

export function isFlightSha256Digest(value: string) {
  return sha256Pattern.test(value);
}

export function isFlightStableToken(value: string) {
  return stableTokenPattern.test(value);
}

export function validateFlightCommerceSearchRequest(request: FlightCommerceSearchRequest) {
  const errors: string[] = [];
  if (!airportCodePattern.test(request.origin)) errors.push("Origin must be an uppercase three-letter airport code.");
  if (!airportCodePattern.test(request.destination)) errors.push("Destination must be an uppercase three-letter airport code.");
  if (request.origin === request.destination) errors.push("Origin and destination must differ.");
  if (!isExactIsoDate(request.departureDate)) errors.push("Departure date must be an exact calendar date.");
  if (request.returnDate !== null && !isExactIsoDate(request.returnDate)) errors.push("Return date must be null or an exact calendar date.");
  if (request.returnDate !== null && isExactIsoDate(request.departureDate) && request.returnDate <= request.departureDate) {
    errors.push("Return date must be after departure date.");
  }
  if (!flightCabinClasses.includes(request.cabin)) errors.push("Cabin is not supported.");

  const counts = Object.values(request.passengers);
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) errors.push("Passenger counts must be non-negative safe integers.");
  const totalPassengers = counts.reduce((sum, count) => sum + count, 0);
  if (request.passengers.adults < 1 || totalPassengers > 9) errors.push("Searches require one adult and no more than nine total passengers.");
  if (request.passengers.infantsOnLap > request.passengers.adults) errors.push("Lap infants cannot exceed adults.");

  return { valid: errors.length === 0, totalPassengers, errors } as const;
}

export function validateFlightOfferSnapshot(offer: FlightOfferSnapshot) {
  const errors: string[] = [];
  if (!isFlightStableToken(offer.offerId)) errors.push("Offer ID must be a stable opaque token.");
  if (!isFlightStableToken(offer.providerId)) errors.push("Provider ID must be a stable opaque token.");
  if (!isFlightSha256Digest(offer.searchDigest)) errors.push("Search digest must be a lowercase SHA-256 digest.");
  if (!isFlightSha256Digest(offer.termsDigest)) errors.push("Terms digest must be a lowercase SHA-256 digest.");
  if (parseExactUtcInstant(offer.expiresAt) === undefined) errors.push("Offer expiry must be an exact UTC instant.");
  if (!currencyPattern.test(offer.total.currency)) errors.push("Offer currency must be an uppercase three-letter code.");
  if (!Number.isSafeInteger(offer.total.amountMinor) || offer.total.amountMinor < 0) errors.push("Offer total must be a non-negative safe integer in minor units.");
  if (offer.segments.length < 1 || offer.segments.length > 12) errors.push("An offer must contain between one and twelve segments.");

  const segmentIds = new Set<string>();
  let priorArrival: number | undefined;
  let priorDestination: string | undefined;
  for (const segment of offer.segments) {
    if (!isFlightStableToken(segment.segmentId)) errors.push("Every segment ID must be a stable opaque token.");
    if (segmentIds.has(segment.segmentId)) errors.push("Segment IDs must be unique.");
    segmentIds.add(segment.segmentId);
    if (!carrierCodePattern.test(segment.marketingCarrier)) errors.push("Marketing carrier must be a two- or three-character uppercase code.");
    if (!/^[A-Z0-9]{1,4}$/.test(segment.marketingFlightNumber)) errors.push("Marketing flight number is invalid.");
    if (!airportCodePattern.test(segment.origin) || !airportCodePattern.test(segment.destination) || segment.origin === segment.destination) {
      errors.push("Every segment requires distinct uppercase airport codes.");
    }
    const departure = parseExactUtcInstant(segment.departsAt);
    const arrival = parseExactUtcInstant(segment.arrivesAt);
    if (departure === undefined || arrival === undefined || arrival <= departure) errors.push("Every segment requires exact, increasing UTC departure and arrival times.");
    if (priorArrival !== undefined && departure !== undefined && departure < priorArrival) errors.push("Offer segments cannot overlap or run backward.");
    if (priorDestination !== undefined && segment.origin !== priorDestination) errors.push("Adjacent offer segments must connect at the same airport.");
    if (arrival !== undefined) priorArrival = arrival;
    priorDestination = segment.destination;
  }

  return { valid: errors.length === 0, errors } as const;
}

export const flightOrderStates = [
  "draft",
  "offer_selected",
  "repricing",
  "priced",
  "payment_pending",
  "payment_authorized",
  "order_pending",
  "order_confirmed",
  "ticketing_pending",
  "ticketed",
  "servicing_pending",
  "cancellation_pending",
  "cancelled",
  "refund_pending",
  "refunded",
  "expired",
  "failed",
  "manual_review",
  "order_absent",
] as const;
export type FlightOrderState = (typeof flightOrderStates)[number];

export const flightOrderEvents = [
  "select_offer",
  "start_reprice",
  "accept_reprice",
  "reject_reprice",
  "expire_offer",
  "begin_payment",
  "authorize_payment",
  "reject_payment",
  "reject_payment_capture",
  "void_payment",
  "reject_payment_void",
  "submit_order",
  "confirm_order",
  "confirm_provider_order",
  "confirm_provider_order_ticketing_pending",
  "confirm_provider_order_ticketed",
  "reject_order",
  "begin_compensating_refund",
  "begin_ticketing",
  "issue_tickets",
  "reject_ticketing",
  "begin_servicing",
  "complete_servicing",
  "reject_servicing",
  "begin_cancellation",
  "confirm_cancellation",
  "reject_cancellation",
  "begin_refund",
  "complete_refund",
  "reject_refund",
  "reconcile_payment_capture_succeeded",
  "reconcile_payment_capture_absent",
  "reconcile_ticketing_succeeded",
  "reconcile_ticket_active",
  "reconcile_cancelled_order_active_ticket",
  "reconcile_cancellation_succeeded",
  "mark_payment_authorization_ambiguous",
  "reconcile_payment_authorized",
  "reconcile_payment_authorization_absent",
  "reconcile_payment_voided",
  "reconcile_payment_authorization_active",
  "reconcile_order_absent",
  "reconcile_order_confirmed",
  "reconcile_order_ticketed",
  "reconcile_refund_still_captured",
  "reconcile_refund_partially_completed",
  "reconcile_refund_fully_completed",
] as const;
export type FlightOrderEvent = (typeof flightOrderEvents)[number];

export const flightPaymentStates = [
  "not_started",
  "authorization_pending",
  "authorized",
  "capture_pending",
  "captured",
  "void_pending",
  "voided",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "failed",
  "manual_review",
  "not_captured",
] as const;
export type FlightPaymentState = (typeof flightPaymentStates)[number];

export const flightPaymentEvents = [
  "begin_authorization",
  "authorize",
  "reject_authorization",
  "begin_capture",
  "capture",
  "reject_capture",
  "begin_void",
  "void",
  "reject_void",
  "begin_refund",
  "partially_refund",
  "fully_refund",
  "reject_refund",
  "reconcile_capture_succeeded",
  "reconcile_capture_absent",
  "mark_authorization_ambiguous",
  "reconcile_authorized",
  "reconcile_authorization_absent",
  "reconcile_void_succeeded",
  "reconcile_authorization_active",
  "reconcile_refund_still_captured",
  "reconcile_refund_partially_completed",
  "reconcile_refund_fully_completed",
] as const;
export type FlightPaymentEvent = (typeof flightPaymentEvents)[number];

export const flightTicketStates = [
  "not_started",
  "issuance_pending",
  "issued",
  "void_pending",
  "voided",
  "no_active_ticket",
  "exchange_pending",
  "exchanged",
  "failed",
  "manual_review",
] as const;
export type FlightTicketState = (typeof flightTicketStates)[number];

export const flightTicketEvents = [
  "begin_issuance",
  "issue",
  "begin_provider_order_issuance",
  "issue_provider_order_tickets",
  "reject_issuance",
  "begin_void",
  "void",
  "reject_void",
  "begin_exchange",
  "exchange",
  "reject_exchange",
  "reconcile_no_active_ticket",
  "reconcile_issuance_succeeded",
  "reconcile_exchange_succeeded",
  "reconcile_issued_ticket_active",
  "reconcile_exchanged_ticket_active",
  "reconcile_void_succeeded",
  "reconcile_order_ticketed",
] as const;
export type FlightTicketEvent = (typeof flightTicketEvents)[number];

export type FlightLifecycleEvent<TState extends string, TEvent extends string> = {
  eventId: string;
  type: TEvent;
  fromState: TState;
  toState: TState;
  occurredAt: string;
  idempotencyDigest: string;
  coordinatedOperationReceipt: FlightCoordinatedOperationReceipt | null;
  providerOrderCompletionReceipt: FlightAuthenticatedProviderOrderCompletionReceipt | null;
  noActiveTicketReconciliation: FlightNoActiveTicketReconciliationEvidence | null;
  ambiguityReconciliation: FlightAmbiguityReconciliationEvidence | null;
};

export type FlightLifecycle<TState extends string, TEvent extends string> = {
  commerceId: string;
  state: TState;
  revision: number;
  history: readonly FlightLifecycleEvent<TState, TEvent>[];
};

export type FlightTransitionCommand<TEvent extends string> = {
  type: TEvent;
  eventId: string;
  occurredAt: string;
  idempotencyDigest: string;
  expectedRevision: number;
};

export const flightLifecycleKinds = ["order", "payment", "ticket"] as const;
export type FlightLifecycleKind = (typeof flightLifecycleKinds)[number];

export const flightCoordinatedOperations = [
  "begin_payment",
  "authorize_payment",
  "reject_payment",
  "begin_payment_capture",
  "complete_payment_capture",
  "reject_payment_capture",
  "begin_payment_void",
  "complete_payment_void",
  "reject_payment_void",
  "submit_order",
  "complete_order",
  "complete_provider_order_confirmed",
  "complete_provider_order_ticketing_pending",
  "complete_provider_order_ticketed",
  "reject_order",
  "begin_ticketing",
  "complete_ticketing",
  "reject_ticketing",
  "begin_ticket_exchange",
  "complete_ticket_exchange",
  "reject_ticket_exchange",
  "begin_unticketed_cancellation",
  "begin_ticketed_cancellation",
  "complete_unticketed_cancellation",
  "complete_ticketed_cancellation",
  "reject_unticketed_cancellation",
  "reject_ticketed_cancellation",
  "reconcile_no_active_ticket",
  "mark_payment_authorization_ambiguous",
  "reconcile_payment_authorized",
  "reconcile_payment_authorization_absent",
  "reconcile_capture_succeeded",
  "reconcile_capture_absent",
  "reconcile_payment_void_succeeded",
  "reconcile_payment_authorization_active",
  "reconcile_order_absent",
  "reconcile_order_confirmed",
  "reconcile_order_ticketed",
  "reconcile_order_active_tickets_voided",
  "reconcile_cancelled_order_issued_ticket_active",
  "reconcile_cancelled_order_exchanged_ticket_active",
  "reconcile_unticketed_cancellation_succeeded",
  "reconcile_refund_still_captured",
  "reconcile_refund_partially_completed",
  "reconcile_refund_fully_completed",
  "reconcile_issuance_succeeded",
  "reconcile_exchange_succeeded",
  "reconcile_issued_ticket_active",
  "reconcile_exchanged_ticket_active",
  "reconcile_void_succeeded",
  "begin_compensating_refund",
  "begin_refund",
  "partially_complete_refund",
  "continue_refund",
  "complete_refund",
  "reject_refund",
] as const;
export type FlightCoordinatedOperation = (typeof flightCoordinatedOperations)[number];

export type FlightLifecycleAnchor = {
  state: string;
  revision: number;
  historyDigest: string;
};

export type FlightCoordinatedEventBinding = {
  lifecycle: FlightLifecycleKind;
  eventType: string;
  eventId: string;
  idempotencyDigest: string;
  expectedRevision: number;
};

export type FlightCoordinatedOperationReceipt = {
  version: "flight-coordinated-operation-v1";
  operation: FlightCoordinatedOperation;
  commerceId: string;
  occurredAt: string;
  before: {
    order: FlightLifecycleAnchor;
    payment: FlightLifecycleAnchor;
    ticket: FlightLifecycleAnchor;
  };
  events: readonly FlightCoordinatedEventBinding[];
  providerOrderCompletionReceiptDigest: string | null;
  receiptDigest: string;
};

export const flightAuthenticatedProviderOrderCompletionOutcomes = [
  "order_confirmed",
  "ticketing_pending",
  "ticketed",
] as const;
export type FlightAuthenticatedProviderOrderCompletionOutcome =
  (typeof flightAuthenticatedProviderOrderCompletionOutcomes)[number];

/**
 * Exact, data-only evidence for one authenticated provider create-order result.
 *
 * `trustedReceiptDigest` is deliberately opaque here. The finalizer must verify
 * that it authenticates the supplied canonical evidence bytes before it
 * compare-and-swaps the aggregate. A caller-computed digest alone is not trust.
 */
export type FlightAuthenticatedProviderOrderCompletionReceipt = {
  version: "flight-authenticated-provider-order-completion-v1";
  operation: "create_order";
  commerceId: string;
  providerId: string;
  providerOrderId: string;
  providerOrderState: "order_confirmed";
  providerTicketState: "not_started" | "issuance_pending" | "issued";
  providerOperationRequestReceiptDigest: string;
  providerOperationReceiptDigest: string;
  outcome: FlightAuthenticatedProviderOrderCompletionOutcome;
  electronicTicketDocumentReceiptDigests: readonly string[];
  observedAt: string;
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix;
  transitions: {
    order: FlightTransitionEvidence;
    ticket: FlightTransitionEvidence | null;
  };
  canonicalEvidenceDigest: string;
  trustedReceiptId: string;
  trustedReceiptDigest: string;
};

export type FlightProviderOrderCompletionCanonicalEvidence = Omit<
  FlightAuthenticatedProviderOrderCompletionReceipt,
  "canonicalEvidenceDigest" | "trustedReceiptId" | "trustedReceiptDigest"
>;

export type FlightAuthenticatedProviderOrderCompletionFinalizationInput = {
  /** The finalizer must authenticate this receipt over canonicalEvidencePayload. */
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt;
  canonicalEvidencePayload: Uint8Array;
  /** Exact compare-and-swap prefix; it is also authenticated inside the receipt. */
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix;
  canonicalExpectedCurrentAggregatePayload: Uint8Array;
  nextLifecycle: FlightCommerceLifecycle;
  canonicalNextLifecyclePayload: Uint8Array;
  nextLifecycleDigest: string;
};

export type FlightAuthenticatedProviderOrderCompletionFinalizer = {
  finalizeAuthenticatedProviderOrderCompletion(
    input: FlightAuthenticatedProviderOrderCompletionFinalizationInput,
  ): Promise<FlightReconciliationFinalizationResult>;
};

export const flightNoActiveTicketFailureCauses = [
  "ticket_issuance_rejected",
  "ticket_void_rejected",
  "ticket_exchange_rejected",
] as const;
export type FlightNoActiveTicketFailureCause = (typeof flightNoActiveTicketFailureCauses)[number];

export type FlightNoActiveTicketReconciliationEvidence = {
  version: "flight-no-active-ticket-reconciliation-v1";
  commerceId: string;
  providerOrderId: string;
  providerId: string;
  reconciliationCaseId: string;
  failureCause: FlightNoActiveTicketFailureCause;
  originalOperationReceiptDigest: string;
  originalTicketDocumentReceiptDigests: readonly string[];
  originalProviderStatusReceiptDigest: string;
  outcome: "no_active_ticket_documents";
  reconciledProviderStatusReceiptDigest: string;
  observedAt: string;
  transition: FlightTransitionEvidence;
  canonicalEvidenceDigest: string;
  trustedReceiptId: string;
  trustedReceiptDigest: string;
};

export type FlightReconciliationFinalizationResult =
  | { status: "finalized" | "already_finalized"; persistedLifecycleDigest: string }
  | { status: "invalid" | "conflict" | "unavailable"; persistedLifecycleDigest: null };

export type FlightReconciliationAggregatePrefix = {
  version: "flight-reconciliation-aggregate-prefix-v1";
  commerceId: string;
  before: {
    order: FlightLifecycleAnchor;
    payment: FlightLifecycleAnchor;
    ticket: FlightLifecycleAnchor;
  };
  prefixDigest: string;
};

export type FlightReconciliationFinalizationInput<TEvidence> = {
  /** Immutable evidence snapshot authenticated by the provider receipt. */
  evidence: TEvidence;
  canonicalEvidencePayload: Uint8Array;
  /** Exact aggregate prefix that must still be current when a new completion is committed. */
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix;
  canonicalExpectedCurrentAggregatePayload: Uint8Array;
  /** Complete, prevalidated, deeply frozen lifecycle that must be persisted atomically with receipt consumption. */
  nextLifecycle: FlightCommerceLifecycle;
  canonicalNextLifecyclePayload: Uint8Array;
  nextLifecycleDigest: string;
};

export type FlightProviderReconciliationFinalizer = {
  /**
   * Must first look up an exact completion bound to receipt, evidence, expectedCurrentAggregate.prefixDigest, and
   * nextLifecycleDigest; only that exact match may return `already_finalized`. Otherwise it must authenticate the
   * receipt and, in one durable transaction, compare-and-swap the aggregate from expectedCurrentAggregate, consume
   * the receipt, persist nextLifecycle, and persist the digest-bound completion. A stale aggregate must return
   * `conflict`. A persistence failure must leave both aggregate and receipt unchanged and return `unavailable`.
   */
  finalizeNoActiveTicketReconciliation(
    input: FlightReconciliationFinalizationInput<FlightNoActiveTicketReconciliationEvidence>,
  ): Promise<FlightReconciliationFinalizationResult>;
  /** Uses the same atomic persistence contract for every ambiguity recovery. */
  finalizeAmbiguityReconciliation(
    input: FlightReconciliationFinalizationInput<FlightAmbiguityReconciliationEvidence>,
  ): Promise<FlightReconciliationFinalizationResult>;
};

export type FlightAmbiguityOperation =
  | "authorize_payment"
  | "capture_payment"
  | "void_payment"
  | "create_order"
  | "cancel_order"
  | "refund_payment"
  | "issue_ticket"
  | "exchange_ticket";
export type FlightAmbiguityOutcome =
  | "payment_authorized"
  | "payment_authorization_absent"
  | "payment_captured"
  | "payment_not_captured_no_authorization"
  | "payment_not_captured_authorization_active"
  | "payment_not_captured_authorization_voided"
  | "payment_voided"
  | "payment_authorization_active"
  | "order_absent"
  | "order_confirmed"
  | "order_ticketed"
  | "unticketed_order_cancelled"
  | "unticketed_order_active"
  | "ticketed_order_cancelled_tickets_voided"
  | "ticketed_order_cancelled_original_issued_ticket_active"
  | "ticketed_order_cancelled_original_exchanged_ticket_active"
  | "ticketed_order_active_original_issued_ticket_active"
  | "ticketed_order_active_original_exchanged_ticket_active"
  | "ticketed_order_active_tickets_voided"
  | "payment_still_captured"
  | "payment_partially_refunded"
  | "payment_fully_refunded"
  | "tickets_issued"
  | "tickets_exchanged"
  | "original_issued_ticket_active"
  | "original_exchanged_ticket_active";

export type FlightAmbiguityReconciliationEvidence = {
  version: "flight-ambiguity-reconciliation-v1";
  commerceId: string;
  providerOrderId: string;
  providerId: string;
  reconciliationCaseId: string;
  operation: FlightAmbiguityOperation;
  outcome: FlightAmbiguityOutcome;
  originalOperationReceiptDigest: string;
  originalProviderStatusReceiptDigest: string;
  resourceReceiptDigests: readonly string[];
  reconciledProviderStatusReceiptDigest: string;
  observedAt: string;
  transitions: {
    order: FlightTransitionEvidence;
    payment: FlightTransitionEvidence | null;
    ticket: FlightTransitionEvidence | null;
  };
  canonicalEvidenceDigest: string;
  trustedReceiptId: string;
  trustedReceiptDigest: string;
};

export class InvalidFlightTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFlightTransitionError";
  }
}

type TransitionTable<TState extends string, TEvent extends string> = Partial<Record<TState, Partial<Record<TEvent, TState>>>>;

type InternalFlightTransitionCommand<TEvent extends string> = FlightTransitionCommand<TEvent> & {
  coordinatedOperationReceipt?: FlightCoordinatedOperationReceipt | null;
  providerOrderCompletionReceipt?: FlightAuthenticatedProviderOrderCompletionReceipt | null;
  noActiveTicketReconciliation?: FlightNoActiveTicketReconciliationEvidence | null;
  ambiguityReconciliation?: FlightAmbiguityReconciliationEvidence | null;
};

const orderTransitions: TransitionTable<FlightOrderState, FlightOrderEvent> = {
  draft: { select_offer: "offer_selected" },
  offer_selected: { start_reprice: "repricing", expire_offer: "expired" },
  repricing: { accept_reprice: "priced", expire_offer: "expired", reject_reprice: "manual_review" },
  priced: { begin_payment: "payment_pending", expire_offer: "expired" },
  payment_pending: {
    authorize_payment: "payment_authorized",
    reject_payment: "failed",
    mark_payment_authorization_ambiguous: "manual_review",
  },
  payment_authorized: {
    submit_order: "order_pending",
    reject_payment_capture: "manual_review",
    void_payment: "failed",
    reject_payment_void: "manual_review",
  },
  order_pending: {
    confirm_order: "order_confirmed",
    confirm_provider_order: "order_confirmed",
    confirm_provider_order_ticketing_pending: "ticketing_pending",
    confirm_provider_order_ticketed: "ticketed",
    reject_order: "manual_review",
  },
  order_confirmed: { begin_ticketing: "ticketing_pending", begin_cancellation: "cancellation_pending" },
  ticketing_pending: { issue_tickets: "ticketed", reject_ticketing: "manual_review" },
  ticketed: { begin_servicing: "servicing_pending", begin_cancellation: "cancellation_pending" },
  servicing_pending: { complete_servicing: "ticketed", reject_servicing: "manual_review" },
  cancellation_pending: { confirm_cancellation: "cancelled", reject_cancellation: "manual_review" },
  cancelled: { begin_refund: "refund_pending" },
  refund_pending: { complete_refund: "refunded", reject_refund: "manual_review" },
  manual_review: {
    begin_compensating_refund: "refund_pending",
    reconcile_payment_capture_succeeded: "payment_authorized",
    reconcile_payment_capture_absent: "failed",
    reconcile_ticketing_succeeded: "ticketed",
    reconcile_ticket_active: "ticketed",
    reconcile_cancelled_order_active_ticket: "manual_review",
    reconcile_cancellation_succeeded: "cancelled",
    reconcile_payment_authorized: "payment_authorized",
    reconcile_payment_authorization_absent: "failed",
    reconcile_payment_voided: "failed",
    reconcile_payment_authorization_active: "payment_authorized",
    reconcile_order_absent: "order_absent",
    reconcile_order_confirmed: "order_confirmed",
    reconcile_order_ticketed: "ticketed",
    reconcile_refund_still_captured: "cancelled",
    reconcile_refund_partially_completed: "refund_pending",
    reconcile_refund_fully_completed: "refunded",
  },
  order_absent: { begin_compensating_refund: "refund_pending" },
};

const paymentTransitions: TransitionTable<FlightPaymentState, FlightPaymentEvent> = {
  not_started: { begin_authorization: "authorization_pending" },
  authorization_pending: { authorize: "authorized", reject_authorization: "failed", mark_authorization_ambiguous: "manual_review" },
  authorized: { begin_capture: "capture_pending", begin_void: "void_pending" },
  capture_pending: { capture: "captured", reject_capture: "manual_review" },
  captured: { begin_refund: "refund_pending" },
  void_pending: { void: "voided", reject_void: "manual_review" },
  refund_pending: { partially_refund: "partially_refunded", fully_refund: "refunded", reject_refund: "manual_review" },
  partially_refunded: { begin_refund: "refund_pending" },
  manual_review: {
    reconcile_capture_succeeded: "captured",
    reconcile_capture_absent: "not_captured",
    reconcile_authorized: "authorized",
    reconcile_authorization_absent: "failed",
    reconcile_void_succeeded: "voided",
    reconcile_authorization_active: "authorized",
    reconcile_refund_still_captured: "captured",
    reconcile_refund_partially_completed: "partially_refunded",
    reconcile_refund_fully_completed: "refunded",
  },
};

const ticketTransitions: TransitionTable<FlightTicketState, FlightTicketEvent> = {
  not_started: {
    begin_issuance: "issuance_pending",
    begin_provider_order_issuance: "issuance_pending",
    issue_provider_order_tickets: "issued",
    reconcile_order_ticketed: "issued",
  },
  issuance_pending: { issue: "issued", reject_issuance: "manual_review" },
  issued: { begin_void: "void_pending", begin_exchange: "exchange_pending", reconcile_no_active_ticket: "no_active_ticket" },
  void_pending: { void: "voided", reject_void: "manual_review" },
  exchange_pending: { exchange: "exchanged", reject_exchange: "manual_review" },
  exchanged: { begin_exchange: "exchange_pending", begin_void: "void_pending", reconcile_no_active_ticket: "no_active_ticket" },
  manual_review: {
    reconcile_no_active_ticket: "no_active_ticket",
    reconcile_issuance_succeeded: "issued",
    reconcile_exchange_succeeded: "exchanged",
    reconcile_issued_ticket_active: "issued",
    reconcile_exchanged_ticket_active: "exchanged",
    reconcile_void_succeeded: "voided",
  },
};

const coordinatedOperationSignatures: Record<FlightCoordinatedOperation, readonly (readonly [FlightLifecycleKind, string])[]> = {
  begin_payment: [["order", "begin_payment"], ["payment", "begin_authorization"]],
  authorize_payment: [["order", "authorize_payment"], ["payment", "authorize"]],
  reject_payment: [["order", "reject_payment"], ["payment", "reject_authorization"]],
  begin_payment_capture: [["payment", "begin_capture"]],
  complete_payment_capture: [["payment", "capture"]],
  reject_payment_capture: [["order", "reject_payment_capture"], ["payment", "reject_capture"]],
  begin_payment_void: [["payment", "begin_void"]],
  complete_payment_void: [["order", "void_payment"], ["payment", "void"]],
  reject_payment_void: [["order", "reject_payment_void"], ["payment", "reject_void"]],
  submit_order: [["order", "submit_order"]],
  complete_order: [["order", "confirm_order"]],
  complete_provider_order_confirmed: [["order", "confirm_provider_order"]],
  complete_provider_order_ticketing_pending: [
    ["order", "confirm_provider_order_ticketing_pending"],
    ["ticket", "begin_provider_order_issuance"],
  ],
  complete_provider_order_ticketed: [
    ["order", "confirm_provider_order_ticketed"],
    ["ticket", "issue_provider_order_tickets"],
  ],
  reject_order: [["order", "reject_order"]],
  begin_ticketing: [["order", "begin_ticketing"], ["ticket", "begin_issuance"]],
  complete_ticketing: [["order", "issue_tickets"], ["ticket", "issue"]],
  reject_ticketing: [["order", "reject_ticketing"], ["ticket", "reject_issuance"]],
  begin_ticket_exchange: [["order", "begin_servicing"], ["ticket", "begin_exchange"]],
  complete_ticket_exchange: [["order", "complete_servicing"], ["ticket", "exchange"]],
  reject_ticket_exchange: [["order", "reject_servicing"], ["ticket", "reject_exchange"]],
  begin_unticketed_cancellation: [["order", "begin_cancellation"]],
  begin_ticketed_cancellation: [["order", "begin_cancellation"], ["ticket", "begin_void"]],
  complete_unticketed_cancellation: [["order", "confirm_cancellation"]],
  complete_ticketed_cancellation: [["order", "confirm_cancellation"], ["ticket", "void"]],
  reject_unticketed_cancellation: [["order", "reject_cancellation"]],
  reject_ticketed_cancellation: [["order", "reject_cancellation"], ["ticket", "reject_void"]],
  reconcile_no_active_ticket: [["ticket", "reconcile_no_active_ticket"]],
  mark_payment_authorization_ambiguous: [["order", "mark_payment_authorization_ambiguous"], ["payment", "mark_authorization_ambiguous"]],
  reconcile_payment_authorized: [["order", "reconcile_payment_authorized"], ["payment", "reconcile_authorized"]],
  reconcile_payment_authorization_absent: [["order", "reconcile_payment_authorization_absent"], ["payment", "reconcile_authorization_absent"]],
  reconcile_capture_succeeded: [["order", "reconcile_payment_capture_succeeded"], ["payment", "reconcile_capture_succeeded"]],
  reconcile_capture_absent: [["order", "reconcile_payment_capture_absent"], ["payment", "reconcile_capture_absent"]],
  reconcile_payment_void_succeeded: [["order", "reconcile_payment_voided"], ["payment", "reconcile_void_succeeded"]],
  reconcile_payment_authorization_active: [["order", "reconcile_payment_authorization_active"], ["payment", "reconcile_authorization_active"]],
  reconcile_order_absent: [["order", "reconcile_order_absent"]],
  reconcile_order_confirmed: [["order", "reconcile_order_confirmed"]],
  reconcile_order_ticketed: [["order", "reconcile_order_ticketed"], ["ticket", "reconcile_order_ticketed"]],
  reconcile_order_active_tickets_voided: [["order", "reconcile_order_confirmed"], ["ticket", "reconcile_void_succeeded"]],
  reconcile_cancelled_order_issued_ticket_active: [["order", "reconcile_cancelled_order_active_ticket"], ["ticket", "reconcile_issued_ticket_active"]],
  reconcile_cancelled_order_exchanged_ticket_active: [["order", "reconcile_cancelled_order_active_ticket"], ["ticket", "reconcile_exchanged_ticket_active"]],
  reconcile_unticketed_cancellation_succeeded: [["order", "reconcile_cancellation_succeeded"]],
  reconcile_refund_still_captured: [["order", "reconcile_refund_still_captured"], ["payment", "reconcile_refund_still_captured"]],
  reconcile_refund_partially_completed: [["order", "reconcile_refund_partially_completed"], ["payment", "reconcile_refund_partially_completed"]],
  reconcile_refund_fully_completed: [["order", "reconcile_refund_fully_completed"], ["payment", "reconcile_refund_fully_completed"]],
  reconcile_issuance_succeeded: [["order", "reconcile_ticketing_succeeded"], ["ticket", "reconcile_issuance_succeeded"]],
  reconcile_exchange_succeeded: [["order", "reconcile_ticket_active"], ["ticket", "reconcile_exchange_succeeded"]],
  reconcile_issued_ticket_active: [["order", "reconcile_ticket_active"], ["ticket", "reconcile_issued_ticket_active"]],
  reconcile_exchanged_ticket_active: [["order", "reconcile_ticket_active"], ["ticket", "reconcile_exchanged_ticket_active"]],
  reconcile_void_succeeded: [["order", "reconcile_cancellation_succeeded"], ["ticket", "reconcile_void_succeeded"]],
  begin_compensating_refund: [["order", "begin_compensating_refund"], ["payment", "begin_refund"]],
  begin_refund: [["order", "begin_refund"], ["payment", "begin_refund"]],
  partially_complete_refund: [["payment", "partially_refund"]],
  continue_refund: [["payment", "begin_refund"]],
  complete_refund: [["order", "complete_refund"], ["payment", "fully_refund"]],
  reject_refund: [["order", "reject_refund"], ["payment", "reject_refund"]],
};

const authenticatedProviderOrderCompletionOperations = new Set<FlightCoordinatedOperation>([
  "complete_provider_order_confirmed",
  "complete_provider_order_ticketing_pending",
  "complete_provider_order_ticketed",
]);

const authenticatedProviderOrderCompletionEventTypes = new Set<string>([
  "confirm_provider_order",
  "confirm_provider_order_ticketing_pending",
  "confirm_provider_order_ticketed",
  "begin_provider_order_issuance",
  "issue_provider_order_tickets",
]);

const ambiguityReconciliationEventTypes = new Set<string>([
  "reconcile_payment_capture_succeeded",
  "reconcile_payment_capture_absent",
  "reconcile_capture_succeeded",
  "reconcile_capture_absent",
  "reconcile_payment_authorized",
  "reconcile_payment_authorization_absent",
  "reconcile_authorized",
  "reconcile_authorization_absent",
  "reconcile_payment_voided",
  "reconcile_payment_authorization_active",
  "reconcile_void_succeeded",
  "reconcile_authorization_active",
  "reconcile_order_absent",
  "reconcile_order_confirmed",
  "reconcile_order_ticketed",
  "reconcile_refund_still_captured",
  "reconcile_refund_partially_completed",
  "reconcile_refund_fully_completed",
  "reconcile_ticketing_succeeded",
  "reconcile_ticket_active",
  "reconcile_cancelled_order_active_ticket",
  "reconcile_cancellation_succeeded",
  "reconcile_issuance_succeeded",
  "reconcile_exchange_succeeded",
  "reconcile_issued_ticket_active",
  "reconcile_exchanged_ticket_active",
  "reconcile_void_succeeded",
]);

const lifecycleInitialStates = {
  order: "draft",
  payment: "not_started",
  ticket: "not_started",
} as const;

function lifecycleHistoryEvidence(
  kind: FlightLifecycleKind,
  commerceId: string,
  history: readonly FlightLifecycleEvent<string, string>[],
): FlightCanonicalJsonValue {
  return {
    version: "flight-lifecycle-history-v1",
    lifecycle: kind,
    commerceId,
    events: history.map((event) => ({
      eventId: event.eventId,
      type: event.type,
      fromState: event.fromState,
      toState: event.toState,
      occurredAt: event.occurredAt,
      idempotencyDigest: event.idempotencyDigest,
      coordinatedOperationReceiptDigest: event.coordinatedOperationReceipt?.receiptDigest ?? null,
      providerOrderCompletionReceiptDigest: event.providerOrderCompletionReceipt?.canonicalEvidenceDigest ?? null,
      noActiveTicketReconciliationDigest: event.noActiveTicketReconciliation?.trustedReceiptDigest ?? null,
      ambiguityReconciliationDigest: event.ambiguityReconciliation?.trustedReceiptDigest ?? null,
    })),
  };
}

function historyDigest(
  kind: FlightLifecycleKind,
  commerceId: string,
  history: readonly FlightLifecycleEvent<string, string>[],
) {
  return sha256FlightEvidence(lifecycleHistoryEvidence(kind, commerceId, history));
}

function lifecycleAnchorAtRevision(
  kind: FlightLifecycleKind,
  lifecycle: FlightLifecycle<string, string>,
  revision: number,
): FlightLifecycleAnchor {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > lifecycle.history.length) {
    throw new InvalidFlightTransitionError("Coordinated lifecycle anchor revision is invalid.");
  }
  const prefix = lifecycle.history.slice(0, revision);
  const state = revision === 0 ? lifecycleInitialStates[kind] : prefix.at(-1)!.toState;
  return {
    state,
    revision,
    historyDigest: historyDigest(kind, lifecycle.commerceId, prefix),
  };
}

function currentLifecycleAnchor(kind: FlightLifecycleKind, lifecycle: FlightLifecycle<string, string>) {
  return lifecycleAnchorAtRevision(kind, lifecycle, lifecycle.revision);
}

function coordinatedReceiptEvidence(receipt: Omit<FlightCoordinatedOperationReceipt, "receiptDigest">): FlightCanonicalJsonValue {
  return {
    version: receipt.version,
    operation: receipt.operation,
    commerceId: receipt.commerceId,
    occurredAt: receipt.occurredAt,
    before: {
      order: { ...receipt.before.order },
      payment: { ...receipt.before.payment },
      ticket: { ...receipt.before.ticket },
    },
    events: receipt.events.map((event) => ({ ...event })),
    providerOrderCompletionReceiptDigest: receipt.providerOrderCompletionReceiptDigest,
  };
}

function normalizedCoordinatedReceipt(receipt: FlightCoordinatedOperationReceipt): FlightCanonicalJsonValue {
  return {
    ...(coordinatedReceiptEvidence(receipt) as Record<string, FlightCanonicalJsonValue>),
    receiptDigest: receipt.receiptDigest,
  };
}

function assertCoordinatedReceiptStructure(receipt: FlightCoordinatedOperationReceipt) {
  try {
    if (
      receipt.version !== "flight-coordinated-operation-v1"
      || !flightCoordinatedOperations.includes(receipt.operation)
      || !isFlightStableToken(receipt.commerceId)
      || parseExactUtcInstant(receipt.occurredAt) === undefined
      || !isFlightSha256Digest(receipt.receiptDigest)
      || !Array.isArray(receipt.events)
    ) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt is malformed.");
    }
    const signature = coordinatedOperationSignatures[receipt.operation];
    const requiresProviderCompletion = authenticatedProviderOrderCompletionOperations.has(receipt.operation);
    if (
      (requiresProviderCompletion && (
        typeof receipt.providerOrderCompletionReceiptDigest !== "string"
        || !isFlightSha256Digest(receipt.providerOrderCompletionReceiptDigest)
      ))
      || (!requiresProviderCompletion && receipt.providerOrderCompletionReceiptDigest !== null)
    ) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt has invalid provider-order completion evidence.");
    }
    if (receipt.events.length !== signature.length) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt has the wrong event signature.");
    }
    for (const [index, binding] of receipt.events.entries()) {
      const expected = signature[index]!;
      if (
        binding.lifecycle !== expected[0]
        || binding.eventType !== expected[1]
        || !isFlightStableToken(binding.eventId)
        || !isFlightSha256Digest(binding.idempotencyDigest)
        || !Number.isSafeInteger(binding.expectedRevision)
        || binding.expectedRevision < 0
      ) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt has an invalid event binding.");
      }
    }
    for (const kind of flightLifecycleKinds) {
      const anchor = receipt.before[kind];
      if (
        !anchor
        || typeof anchor.state !== "string"
        || anchor.state.length === 0
        || !Number.isSafeInteger(anchor.revision)
        || anchor.revision < 0
        || !isFlightSha256Digest(anchor.historyDigest)
      ) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt has an invalid lifecycle anchor.");
      }
    }
    const expectedDigest = sha256FlightEvidence(coordinatedReceiptEvidence(receipt));
    if (receipt.receiptDigest !== expectedDigest) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt digest does not match its canonical evidence.");
    }
    if (canonicalFlightJson(receipt as unknown as FlightCanonicalJsonValue) !== canonicalFlightJson(normalizedCoordinatedReceipt(receipt))) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt contains unreviewed fields.");
    }
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("Coordinated operation receipt is malformed.");
  }
}

type CoordinatedEventInput = {
  lifecycle: FlightLifecycleKind;
  eventType: string;
  evidence: FlightTransitionEvidence;
};

function buildCoordinatedOperationReceipt(
  operation: FlightCoordinatedOperation,
  lifecycle: FlightCommerceLifecycle,
  eventInputs: readonly CoordinatedEventInput[],
  providerOrderCompletionReceiptDigest: string | null = null,
): FlightCoordinatedOperationReceipt {
  const signature = coordinatedOperationSignatures[operation];
  if (
    eventInputs.length !== signature.length
    || eventInputs.some((event, index) => event.lifecycle !== signature[index]![0] || event.eventType !== signature[index]![1])
  ) {
    throw new InvalidFlightTransitionError("Coordinator event signature does not match its operation.");
  }
  const occurredAt = eventInputs[0]?.evidence.occurredAt;
  if (occurredAt === undefined || eventInputs.some((event) => event.evidence.occurredAt !== occurredAt)) {
    throw new InvalidFlightTransitionError("Every event in a coordinated operation must share one exact occurrence time.");
  }
  for (const event of eventInputs) {
    const stream = lifecycleForKind(lifecycle, event.lifecycle);
    const table = event.lifecycle === "order"
      ? orderTransitions
      : event.lifecycle === "payment"
        ? paymentTransitions
        : ticketTransitions;
    const evidence = event.evidence;
    const eventTime = parseExactUtcInstant(evidence.occurredAt);
    const previousTime = stream.history.at(-1)?.occurredAt;
    if (
      evidence.expectedRevision !== stream.revision
      || !isFlightStableToken(evidence.eventId)
      || !isFlightSha256Digest(evidence.idempotencyDigest)
      || eventTime === undefined
      || (previousTime !== undefined && eventTime <= parseExactUtcInstant(previousTime)!)
      || stream.history.some((prior) => prior.eventId === evidence.eventId)
      || stream.history.some((prior) => prior.idempotencyDigest === evidence.idempotencyDigest)
      || (table as TransitionTable<string, string>)[stream.state]?.[event.eventType] === undefined
    ) {
      throw new InvalidFlightTransitionError("Coordinated operation evidence is stale or invalid for its exact lifecycle prefix.");
    }
  }
  const events = eventInputs.map((event) => ({
    lifecycle: event.lifecycle,
    eventType: event.eventType,
    eventId: event.evidence.eventId,
    idempotencyDigest: event.evidence.idempotencyDigest,
    expectedRevision: event.evidence.expectedRevision,
  }));
  const withoutDigest: Omit<FlightCoordinatedOperationReceipt, "receiptDigest"> = {
    version: "flight-coordinated-operation-v1",
    operation,
    commerceId: lifecycle.order.commerceId,
    occurredAt,
    before: {
      order: currentLifecycleAnchor("order", lifecycle.order),
      payment: currentLifecycleAnchor("payment", lifecycle.payment),
      ticket: currentLifecycleAnchor("ticket", lifecycle.ticket),
    },
    events,
    providerOrderCompletionReceiptDigest,
  };
  const receipt = { ...withoutDigest, receiptDigest: sha256FlightEvidence(coordinatedReceiptEvidence(withoutDigest)) };
  assertCoordinatedReceiptStructure(receipt);
  return receipt;
}

function lifecycleForKind(lifecycle: FlightCommerceLifecycle, kind: FlightLifecycleKind): FlightLifecycle<string, string> {
  return lifecycle[kind] as FlightLifecycle<string, string>;
}

function assertAggregateCoordinatedReceipts(lifecycle: FlightCommerceLifecycle) {
  const receiptCopies = new Map<string, FlightCoordinatedOperationReceipt[]>();
  for (const kind of flightLifecycleKinds) {
    const stream = lifecycleForKind(lifecycle, kind);
    for (const event of stream.history) {
      const receipt = event.coordinatedOperationReceipt;
      const mustBeCoordinated = kind !== "order" || coordinatedOrderEvents.has(event.type as FlightOrderEvent);
      if (mustBeCoordinated && receipt === null) {
        throw new InvalidFlightTransitionError("Commercial lifecycle event is missing its coordinated operation receipt.");
      }
      if (receipt === null) continue;
      const copies = receiptCopies.get(receipt.receiptDigest) ?? [];
      copies.push(receipt);
      receiptCopies.set(receipt.receiptDigest, copies);
    }
  }

  for (const [receiptDigest, copies] of receiptCopies) {
    const receipt = copies[0]!;
    const canonical = canonicalFlightJson(receipt as unknown as FlightCanonicalJsonValue);
    if (copies.some((copy) => canonicalFlightJson(copy as unknown as FlightCanonicalJsonValue) !== canonical)) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt copies do not contain identical canonical evidence.");
    }
    if (copies.length !== receipt.events.length) {
      throw new InvalidFlightTransitionError("Coordinated operation receipt is missing or duplicating a lifecycle event.");
    }
    for (const kind of flightLifecycleKinds) {
      const stream = lifecycleForKind(lifecycle, kind);
      const actualAnchor = lifecycleAnchorAtRevision(kind, stream, receipt.before[kind].revision);
      if (canonicalFlightJson(actualAnchor) !== canonicalFlightJson(receipt.before[kind])) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt is anchored to a different aggregate history prefix.");
      }
    }
    for (const binding of receipt.events) {
      const stream = lifecycleForKind(lifecycle, binding.lifecycle);
      const event = stream.history[binding.expectedRevision];
      if (
        !event
        || event.coordinatedOperationReceipt?.receiptDigest !== receiptDigest
        || event.type !== binding.eventType
        || event.eventId !== binding.eventId
        || event.idempotencyDigest !== binding.idempotencyDigest
        || event.occurredAt !== receipt.occurredAt
      ) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt event binding is absent from the exact aggregate history.");
      }
    }

    const attachedProviderReceipts = receipt.events.map((binding) => (
      lifecycleForKind(lifecycle, binding.lifecycle).history[binding.expectedRevision]?.providerOrderCompletionReceipt ?? null
    ));
    if (receipt.providerOrderCompletionReceiptDigest === null) {
      if (attachedProviderReceipts.some((providerReceipt) => providerReceipt !== null)) {
        throw new InvalidFlightTransitionError("Provider-order completion evidence is attached to another coordinated operation.");
      }
    } else {
      if (attachedProviderReceipts.some((providerReceipt) => providerReceipt === null)) {
        throw new InvalidFlightTransitionError("Atomic provider-order completion is missing authenticated receipt evidence.");
      }
      const providerReceipts = attachedProviderReceipts as FlightAuthenticatedProviderOrderCompletionReceipt[];
      const expectedProviderReceipt = canonicalFlightJson(providerReceipts[0]! as unknown as FlightCanonicalJsonValue);
      if (providerReceipts.some((providerReceipt) => (
        providerReceipt.canonicalEvidenceDigest !== receipt.providerOrderCompletionReceiptDigest
        || canonicalFlightJson(providerReceipt as unknown as FlightCanonicalJsonValue) !== expectedProviderReceipt
      ))) {
        throw new InvalidFlightTransitionError("Atomic provider-order completion contains spliced receipt evidence.");
      }
      const providerReceipt = providerReceipts[0]!;
      assertAuthenticatedProviderOrderCompletionReceiptStructure(providerReceipt);
      const expectedOperation: FlightCoordinatedOperation = providerReceipt.outcome === "order_confirmed"
        ? "complete_provider_order_confirmed"
        : providerReceipt.outcome === "ticketing_pending"
          ? "complete_provider_order_ticketing_pending"
          : "complete_provider_order_ticketed";
      if (
        receipt.operation !== expectedOperation
        || providerReceipt.commerceId !== receipt.commerceId
        || canonicalFlightJson(providerReceipt.expectedCurrentAggregate as unknown as FlightCanonicalJsonValue)
          !== canonicalFlightJson(receiptReconciliationAggregatePrefix(receipt) as unknown as FlightCanonicalJsonValue)
      ) {
        throw new InvalidFlightTransitionError("Atomic provider-order completion is bound to another operation or aggregate prefix.");
      }
    }
  }
}

function authenticatedProviderOrderCompletionReceiptEvidence(
  receipt: FlightProviderOrderCompletionCanonicalEvidence,
): FlightCanonicalJsonValue {
  return {
    version: receipt.version,
    operation: receipt.operation,
    commerceId: receipt.commerceId,
    providerId: receipt.providerId,
    providerOrderId: receipt.providerOrderId,
    providerOrderState: receipt.providerOrderState,
    providerTicketState: receipt.providerTicketState,
    providerOperationRequestReceiptDigest: receipt.providerOperationRequestReceiptDigest,
    providerOperationReceiptDigest: receipt.providerOperationReceiptDigest,
    outcome: receipt.outcome,
    electronicTicketDocumentReceiptDigests: [...receipt.electronicTicketDocumentReceiptDigests],
    observedAt: receipt.observedAt,
    expectedCurrentAggregate: {
      version: receipt.expectedCurrentAggregate.version,
      commerceId: receipt.expectedCurrentAggregate.commerceId,
      before: {
        order: { ...receipt.expectedCurrentAggregate.before.order },
        payment: { ...receipt.expectedCurrentAggregate.before.payment },
        ticket: { ...receipt.expectedCurrentAggregate.before.ticket },
      },
      prefixDigest: receipt.expectedCurrentAggregate.prefixDigest,
    },
    transitions: {
      order: { ...receipt.transitions.order },
      ticket: receipt.transitions.ticket === null ? null : { ...receipt.transitions.ticket },
    },
  };
}

/** Computes the canonical evidence digest only; it does not authenticate or trust the evidence. */
export function digestFlightProviderOrderCompletionCanonicalEvidence(
  evidence: FlightProviderOrderCompletionCanonicalEvidence,
) {
  return sha256FlightEvidence(authenticatedProviderOrderCompletionReceiptEvidence(evidence));
}

function normalizedAuthenticatedProviderOrderCompletionReceipt(
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt,
): FlightCanonicalJsonValue {
  return {
    ...(authenticatedProviderOrderCompletionReceiptEvidence(receipt) as Record<string, FlightCanonicalJsonValue>),
    canonicalEvidenceDigest: receipt.canonicalEvidenceDigest,
    trustedReceiptId: receipt.trustedReceiptId,
    trustedReceiptDigest: receipt.trustedReceiptDigest,
  };
}

function assertExactReconciliationAggregatePrefix(prefix: FlightReconciliationAggregatePrefix) {
  if (
    prefix.version !== "flight-reconciliation-aggregate-prefix-v1"
    || !isFlightStableToken(prefix.commerceId)
    || !isFlightSha256Digest(prefix.prefixDigest)
  ) {
    throw new InvalidFlightTransitionError("Provider-order completion aggregate prefix is malformed.");
  }
  for (const kind of flightLifecycleKinds) {
    const anchor = prefix.before[kind];
    if (
      !anchor
      || typeof anchor.state !== "string"
      || !Number.isSafeInteger(anchor.revision)
      || anchor.revision < 0
      || !isFlightSha256Digest(anchor.historyDigest)
    ) {
      throw new InvalidFlightTransitionError("Provider-order completion aggregate prefix is malformed.");
    }
  }
  const rebuilt = buildReconciliationAggregatePrefix(prefix.commerceId, prefix.before);
  if (canonicalFlightJson(prefix as unknown as FlightCanonicalJsonValue) !== canonicalFlightJson(rebuilt as unknown as FlightCanonicalJsonValue)) {
    throw new InvalidFlightTransitionError("Provider-order completion aggregate prefix digest is invalid.");
  }
}

function assertAuthenticatedProviderOrderCompletionReceiptStructure(
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt,
) {
  try {
    if (
      receipt.version !== "flight-authenticated-provider-order-completion-v1"
      || receipt.operation !== "create_order"
      || !isFlightStableToken(receipt.commerceId)
      || !isFlightStableToken(receipt.providerId)
      || !isFlightStableToken(receipt.providerOrderId)
      || receipt.providerOrderState !== "order_confirmed"
      || !flightAuthenticatedProviderOrderCompletionOutcomes.includes(receipt.outcome)
      || !isFlightSha256Digest(receipt.providerOperationRequestReceiptDigest)
      || !isFlightSha256Digest(receipt.providerOperationReceiptDigest)
      || !Array.isArray(receipt.electronicTicketDocumentReceiptDigests)
      || parseExactUtcInstant(receipt.observedAt) === undefined
      || !isFlightSha256Digest(receipt.canonicalEvidenceDigest)
      || !isFlightStableToken(receipt.trustedReceiptId)
      || !isFlightSha256Digest(receipt.trustedReceiptDigest)
    ) {
      throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt is malformed.");
    }
    assertExactReconciliationAggregatePrefix(receipt.expectedCurrentAggregate);
    if (receipt.expectedCurrentAggregate.commerceId !== receipt.commerceId) {
      throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt is bound to another commerce lifecycle.");
    }

    const documents = receipt.electronicTicketDocumentReceiptDigests;
    if (
      documents.length > 36
      || documents.some((digest) => typeof digest !== "string" || !isFlightSha256Digest(digest))
      || documents.some((digest, index) => index > 0 && documents[index - 1]! >= digest)
    ) {
      throw new InvalidFlightTransitionError("Electronic-ticket document receipt digests must be exact, unique, and sorted.");
    }
    const exactOutcome = (
      receipt.outcome === "order_confirmed"
        ? receipt.providerTicketState === "not_started" && receipt.transitions.ticket === null && documents.length === 0
        : receipt.outcome === "ticketing_pending"
          ? receipt.providerTicketState === "issuance_pending" && receipt.transitions.ticket !== null && documents.length === 0
          : receipt.providerTicketState === "issued" && receipt.transitions.ticket !== null && documents.length > 0
    );
    if (!exactOutcome) {
      throw new InvalidFlightTransitionError("Provider-order completion outcome contradicts its exact ticket evidence.");
    }

    const transitions = [receipt.transitions.order, receipt.transitions.ticket].filter(
      (transition): transition is FlightTransitionEvidence => transition !== null,
    );
    if (transitions.some((transition) => (
      !isFlightStableToken(transition.eventId)
      || !isFlightSha256Digest(transition.idempotencyDigest)
      || !Number.isSafeInteger(transition.expectedRevision)
      || transition.expectedRevision < 0
      || transition.occurredAt !== receipt.observedAt
    ))) {
      throw new InvalidFlightTransitionError("Provider-order completion transition evidence is malformed.");
    }
    if (
      receipt.transitions.order.expectedRevision !== receipt.expectedCurrentAggregate.before.order.revision
      || (receipt.transitions.ticket !== null
        && receipt.transitions.ticket.expectedRevision !== receipt.expectedCurrentAggregate.before.ticket.revision)
    ) {
      throw new InvalidFlightTransitionError("Provider-order completion revisions do not match the authenticated aggregate prefix.");
    }
    if (
      digestFlightProviderOrderCompletionCanonicalEvidence(receipt) !== receipt.canonicalEvidenceDigest
    ) {
      throw new InvalidFlightTransitionError("Authenticated provider-order completion canonical evidence digest is invalid.");
    }
    if (
      canonicalFlightJson(receipt as unknown as FlightCanonicalJsonValue)
      !== canonicalFlightJson(normalizedAuthenticatedProviderOrderCompletionReceipt(receipt))
    ) {
      throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt contains unreviewed fields.");
    }
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt is malformed.");
  }
}

function noActiveTicketReconciliationReceiptEvidence(
  evidence: Omit<FlightNoActiveTicketReconciliationEvidence, "canonicalEvidenceDigest" | "trustedReceiptId" | "trustedReceiptDigest">,
): FlightCanonicalJsonValue {
  return {
    version: evidence.version,
    commerceId: evidence.commerceId,
    providerOrderId: evidence.providerOrderId,
    providerId: evidence.providerId,
    reconciliationCaseId: evidence.reconciliationCaseId,
    failureCause: evidence.failureCause,
    originalOperationReceiptDigest: evidence.originalOperationReceiptDigest,
    originalTicketDocumentReceiptDigests: [...evidence.originalTicketDocumentReceiptDigests],
    originalProviderStatusReceiptDigest: evidence.originalProviderStatusReceiptDigest,
    outcome: evidence.outcome,
    reconciledProviderStatusReceiptDigest: evidence.reconciledProviderStatusReceiptDigest,
    observedAt: evidence.observedAt,
    transition: { ...evidence.transition },
  };
}

function normalizedNoActiveTicketReconciliation(
  evidence: FlightNoActiveTicketReconciliationEvidence,
): FlightCanonicalJsonValue {
  return {
    ...(noActiveTicketReconciliationReceiptEvidence(evidence) as Record<string, FlightCanonicalJsonValue>),
    canonicalEvidenceDigest: evidence.canonicalEvidenceDigest,
    trustedReceiptId: evidence.trustedReceiptId,
    trustedReceiptDigest: evidence.trustedReceiptDigest,
  };
}

function assertNoActiveTicketReconciliationStructure(evidence: FlightNoActiveTicketReconciliationEvidence) {
  try {
    const documents = evidence.originalTicketDocumentReceiptDigests;
    if (
      evidence.version !== "flight-no-active-ticket-reconciliation-v1"
      || !isFlightStableToken(evidence.commerceId)
      || !isFlightStableToken(evidence.providerOrderId)
      || !isFlightStableToken(evidence.providerId)
      || !isFlightStableToken(evidence.reconciliationCaseId)
      || !flightNoActiveTicketFailureCauses.includes(evidence.failureCause)
      || !isFlightSha256Digest(evidence.originalOperationReceiptDigest)
      || !Array.isArray(documents)
      || documents.length > 12
      || documents.some((digest) => !isFlightSha256Digest(digest))
      || new Set(documents).size !== documents.length
      || documents.some((digest, index) => index > 0 && documents[index - 1]! >= digest)
      || !isFlightSha256Digest(evidence.originalProviderStatusReceiptDigest)
      || evidence.outcome !== "no_active_ticket_documents"
      || !isFlightSha256Digest(evidence.reconciledProviderStatusReceiptDigest)
      || evidence.originalProviderStatusReceiptDigest === evidence.reconciledProviderStatusReceiptDigest
      || parseExactUtcInstant(evidence.observedAt) === undefined
      || evidence.observedAt !== evidence.transition.occurredAt
      || !isFlightStableToken(evidence.transition.eventId)
      || !isFlightSha256Digest(evidence.transition.idempotencyDigest)
      || !Number.isSafeInteger(evidence.transition.expectedRevision)
      || evidence.transition.expectedRevision < 0
      || !isFlightSha256Digest(evidence.canonicalEvidenceDigest)
      || !isFlightStableToken(evidence.trustedReceiptId)
      || !isFlightSha256Digest(evidence.trustedReceiptDigest)
      || (evidence.failureCause === "ticket_issuance_rejected" ? documents.length !== 0 : documents.length < 1)
    ) {
      throw new InvalidFlightTransitionError("No-active-ticket provider reconciliation evidence is malformed.");
    }
    const expectedDigest = sha256FlightEvidence(noActiveTicketReconciliationReceiptEvidence(evidence));
    if (evidence.canonicalEvidenceDigest !== expectedDigest) {
      throw new InvalidFlightTransitionError("No-active-ticket canonical evidence digest does not match its evidence.");
    }
    if (
      canonicalFlightJson(evidence as unknown as FlightCanonicalJsonValue)
      !== canonicalFlightJson(normalizedNoActiveTicketReconciliation(evidence))
    ) {
      throw new InvalidFlightTransitionError("No-active-ticket reconciliation evidence contains unreviewed fields.");
    }
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("No-active-ticket provider reconciliation evidence is malformed.");
  }
}

const ambiguityOutcomesByOperation: Record<FlightAmbiguityOperation, readonly FlightAmbiguityOutcome[]> = {
  authorize_payment: ["payment_authorized", "payment_authorization_absent"],
  capture_payment: [
    "payment_captured",
    "payment_not_captured_no_authorization",
    "payment_not_captured_authorization_active",
    "payment_not_captured_authorization_voided",
  ],
  void_payment: ["payment_voided", "payment_authorization_active"],
  create_order: ["order_absent", "order_confirmed", "order_ticketed"],
  cancel_order: [
    "unticketed_order_cancelled",
    "unticketed_order_active",
    "ticketed_order_cancelled_tickets_voided",
    "ticketed_order_cancelled_original_issued_ticket_active",
    "ticketed_order_cancelled_original_exchanged_ticket_active",
    "ticketed_order_active_original_issued_ticket_active",
    "ticketed_order_active_original_exchanged_ticket_active",
    "ticketed_order_active_tickets_voided",
  ],
  refund_payment: ["payment_still_captured", "payment_partially_refunded", "payment_fully_refunded"],
  issue_ticket: ["tickets_issued"],
  exchange_ticket: ["tickets_exchanged", "original_issued_ticket_active", "original_exchanged_ticket_active"],
};

function ambiguityReconciliationReceiptEvidence(
  evidence: Omit<FlightAmbiguityReconciliationEvidence, "canonicalEvidenceDigest" | "trustedReceiptId" | "trustedReceiptDigest">,
): FlightCanonicalJsonValue {
  return {
    version: evidence.version,
    commerceId: evidence.commerceId,
    providerOrderId: evidence.providerOrderId,
    providerId: evidence.providerId,
    reconciliationCaseId: evidence.reconciliationCaseId,
    operation: evidence.operation,
    outcome: evidence.outcome,
    originalOperationReceiptDigest: evidence.originalOperationReceiptDigest,
    originalProviderStatusReceiptDigest: evidence.originalProviderStatusReceiptDigest,
    resourceReceiptDigests: [...evidence.resourceReceiptDigests],
    reconciledProviderStatusReceiptDigest: evidence.reconciledProviderStatusReceiptDigest,
    observedAt: evidence.observedAt,
    transitions: {
      order: { ...evidence.transitions.order },
      payment: evidence.transitions.payment ? { ...evidence.transitions.payment } : null,
      ticket: evidence.transitions.ticket ? { ...evidence.transitions.ticket } : null,
    },
  };
}

function normalizedAmbiguityReconciliation(evidence: FlightAmbiguityReconciliationEvidence): FlightCanonicalJsonValue {
  return {
    ...(ambiguityReconciliationReceiptEvidence(evidence) as Record<string, FlightCanonicalJsonValue>),
    canonicalEvidenceDigest: evidence.canonicalEvidenceDigest,
    trustedReceiptId: evidence.trustedReceiptId,
    trustedReceiptDigest: evidence.trustedReceiptDigest,
  };
}

function assertAmbiguityReconciliationStructure(evidence: FlightAmbiguityReconciliationEvidence) {
  try {
    const resources = evidence.resourceReceiptDigests;
    const transitions = [evidence.transitions.order, evidence.transitions.payment, evidence.transitions.ticket]
      .filter((transition): transition is FlightTransitionEvidence => transition !== null);
    const paymentOperation = ["authorize_payment", "capture_payment", "void_payment", "refund_payment"].includes(evidence.operation);
    if (
      evidence.version !== "flight-ambiguity-reconciliation-v1"
      || !isFlightStableToken(evidence.commerceId)
      || !isFlightStableToken(evidence.providerOrderId)
      || !isFlightStableToken(evidence.providerId)
      || !isFlightStableToken(evidence.reconciliationCaseId)
      || !ambiguityOutcomesByOperation[evidence.operation]?.includes(evidence.outcome)
      || !isFlightSha256Digest(evidence.originalOperationReceiptDigest)
      || !isFlightSha256Digest(evidence.originalProviderStatusReceiptDigest)
      || !Array.isArray(resources)
      || resources.length > 12
      || resources.some((digest) => !isFlightSha256Digest(digest))
      || new Set(resources).size !== resources.length
      || resources.some((digest, index) => index > 0 && resources[index - 1]! >= digest)
      || (["payment_not_captured_no_authorization", "payment_authorization_absent", "order_absent"].includes(evidence.outcome) ? resources.length !== 0 : resources.length < 1)
      || !isFlightSha256Digest(evidence.reconciledProviderStatusReceiptDigest)
      || evidence.originalProviderStatusReceiptDigest === evidence.reconciledProviderStatusReceiptDigest
      || parseExactUtcInstant(evidence.observedAt) === undefined
      || (paymentOperation ? evidence.transitions.payment === null || evidence.transitions.ticket !== null : false)
      || (["issue_ticket", "exchange_ticket"].includes(evidence.operation) ? evidence.transitions.payment !== null || evidence.transitions.ticket === null : false)
      || (evidence.operation === "create_order" ? evidence.transitions.payment !== null || (evidence.outcome === "order_ticketed" ? evidence.transitions.ticket === null : evidence.transitions.ticket !== null) : false)
      || (evidence.operation === "cancel_order" ? (
        evidence.transitions.payment !== null
        || (evidence.outcome.startsWith("ticketed_") ? evidence.transitions.ticket === null : evidence.transitions.ticket !== null)
      ) : false)
      || transitions.some((transition) => (
        !isFlightStableToken(transition.eventId)
        || transition.occurredAt !== evidence.observedAt
        || !isFlightSha256Digest(transition.idempotencyDigest)
        || !Number.isSafeInteger(transition.expectedRevision)
        || transition.expectedRevision < 0
      ))
      || !isFlightSha256Digest(evidence.canonicalEvidenceDigest)
      || !isFlightStableToken(evidence.trustedReceiptId)
      || !isFlightSha256Digest(evidence.trustedReceiptDigest)
    ) {
      throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence is malformed.");
    }
    if (evidence.canonicalEvidenceDigest !== sha256FlightEvidence(ambiguityReconciliationReceiptEvidence(evidence))) {
      throw new InvalidFlightTransitionError("Ambiguity reconciliation canonical digest does not match its evidence.");
    }
    if (
      canonicalFlightJson(evidence as unknown as FlightCanonicalJsonValue)
      !== canonicalFlightJson(normalizedAmbiguityReconciliation(evidence))
    ) {
      throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence contains unreviewed fields.");
    }
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence is malformed.");
  }
}

function reconciliationLifecycleDigest(lifecycle: FlightCommerceLifecycle) {
  return sha256FlightEvidence({
    version: "flight-reconciliation-finalized-lifecycle-v1",
    lifecycle: lifecycle as unknown as FlightCanonicalJsonValue,
  });
}

function reconciliationAggregatePrefixEvidence(
  prefix: Omit<FlightReconciliationAggregatePrefix, "prefixDigest">,
): FlightCanonicalJsonValue {
  return {
    version: prefix.version,
    commerceId: prefix.commerceId,
    before: {
      order: { ...prefix.before.order },
      payment: { ...prefix.before.payment },
      ticket: { ...prefix.before.ticket },
    },
  };
}

function buildReconciliationAggregatePrefix(
  commerceId: string,
  before: FlightReconciliationAggregatePrefix["before"],
): FlightReconciliationAggregatePrefix {
  const withoutDigest: Omit<FlightReconciliationAggregatePrefix, "prefixDigest"> = {
    version: "flight-reconciliation-aggregate-prefix-v1",
    commerceId,
    before: {
      order: { ...before.order },
      payment: { ...before.payment },
      ticket: { ...before.ticket },
    },
  };
  return deepFreezeFlightReconciliationData({
    ...withoutDigest,
    prefixDigest: sha256FlightEvidence(reconciliationAggregatePrefixEvidence(withoutDigest)),
  });
}

function currentReconciliationAggregatePrefix(lifecycle: FlightCommerceLifecycle) {
  return buildReconciliationAggregatePrefix(lifecycle.order.commerceId, {
    order: currentLifecycleAnchor("order", lifecycle.order),
    payment: currentLifecycleAnchor("payment", lifecycle.payment),
    ticket: currentLifecycleAnchor("ticket", lifecycle.ticket),
  });
}

/** Returns the exact immutable aggregate prefix a trusted provider receipt must bind. */
export function getFlightCommerceAggregatePrefix(lifecycle: FlightCommerceLifecycle) {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  return currentReconciliationAggregatePrefix(lifecycle);
}

function receiptReconciliationAggregatePrefix(receipt: FlightCoordinatedOperationReceipt) {
  return buildReconciliationAggregatePrefix(receipt.commerceId, receipt.before);
}

function parseFlightReconciliationFinalizationResult(value: unknown): FlightReconciliationFinalizationResult {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const prototype = Object.getPrototypeOf(value) as object | null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(value).sort();
    const record = value as Record<string, unknown>;
    if (
      (prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor))
      || keys.length !== 2
      || keys[0] !== "persistedLifecycleDigest"
      || keys[1] !== "status"
      || !["finalized", "already_finalized", "invalid", "conflict", "unavailable"].includes(record.status as string)
      || (["finalized", "already_finalized"].includes(record.status as string)
        ? typeof record.persistedLifecycleDigest !== "string" || !isFlightSha256Digest(record.persistedLifecycleDigest)
        : record.persistedLifecycleDigest !== null)
    ) throw new Error();
    canonicalFlightJson(value as FlightCanonicalJsonValue);
    return value as FlightReconciliationFinalizationResult;
  } catch {
    return { status: "unavailable", persistedLifecycleDigest: null };
  }
}

async function requireDurableFlightReconciliationFinalization(
  expectedLifecycleDigest: string,
  invoke: () => Promise<FlightReconciliationFinalizationResult>,
  label: string,
  acceptedSuccessStatuses: readonly ("finalized" | "already_finalized")[] = ["finalized", "already_finalized"],
) {
  let finalization: FlightReconciliationFinalizationResult = { status: "unavailable", persistedLifecycleDigest: null };
  try {
    finalization = parseFlightReconciliationFinalizationResult(await invoke());
  } catch {
    finalization = { status: "unavailable", persistedLifecycleDigest: null };
  }
  if (
    (finalization.status === "finalized" || finalization.status === "already_finalized")
    && acceptedSuccessStatuses.includes(finalization.status)
    && finalization.persistedLifecycleDigest === expectedLifecycleDigest
  ) return;
  const status = finalization.status === "finalized" || finalization.status === "already_finalized"
    ? "conflict"
    : finalization.status;
  throw new InvalidFlightTransitionError(`Trusted ${label} receipt and lifecycle finalization was not accepted: ${status}.`);
}

async function finalizeAmbiguityReconciliationEvidence(
  evidence: FlightAmbiguityReconciliationEvidence,
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix,
  nextLifecycle: FlightCommerceLifecycle,
  finalizer: FlightProviderReconciliationFinalizer,
  acceptedSuccessStatuses?: readonly ("finalized" | "already_finalized")[],
) {
  assertAmbiguityReconciliationStructure(evidence);
  const canonicalNextLifecycle = canonicalFlightJson(nextLifecycle as unknown as FlightCanonicalJsonValue);
  const nextLifecycleDigest = reconciliationLifecycleDigest(nextLifecycle);
  await requireDurableFlightReconciliationFinalization(
    nextLifecycleDigest,
    () => finalizer.finalizeAmbiguityReconciliation({
      evidence,
      canonicalEvidencePayload: new TextEncoder().encode(canonicalFlightJson(ambiguityReconciliationReceiptEvidence(evidence))),
      expectedCurrentAggregate,
      canonicalExpectedCurrentAggregatePayload: new TextEncoder().encode(
        canonicalFlightJson(expectedCurrentAggregate as unknown as FlightCanonicalJsonValue),
      ),
      nextLifecycle,
      canonicalNextLifecyclePayload: new TextEncoder().encode(canonicalNextLifecycle),
      nextLifecycleDigest,
    }),
    "ambiguity reconciliation",
    acceptedSuccessStatuses,
  );
}

async function finalizeNoActiveTicketReconciliationEvidence(
  evidence: FlightNoActiveTicketReconciliationEvidence,
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix,
  nextLifecycle: FlightCommerceLifecycle,
  finalizer: FlightProviderReconciliationFinalizer,
  acceptedSuccessStatuses?: readonly ("finalized" | "already_finalized")[],
) {
  assertNoActiveTicketReconciliationStructure(evidence);
  const canonicalNextLifecycle = canonicalFlightJson(nextLifecycle as unknown as FlightCanonicalJsonValue);
  const nextLifecycleDigest = reconciliationLifecycleDigest(nextLifecycle);
  await requireDurableFlightReconciliationFinalization(
    nextLifecycleDigest,
    () => finalizer.finalizeNoActiveTicketReconciliation({
      evidence,
      canonicalEvidencePayload: new TextEncoder().encode(canonicalFlightJson(noActiveTicketReconciliationReceiptEvidence(evidence))),
      expectedCurrentAggregate,
      canonicalExpectedCurrentAggregatePayload: new TextEncoder().encode(
        canonicalFlightJson(expectedCurrentAggregate as unknown as FlightCanonicalJsonValue),
      ),
      nextLifecycle,
      canonicalNextLifecyclePayload: new TextEncoder().encode(canonicalNextLifecycle),
      nextLifecycleDigest,
    }),
    "no-active-ticket reconciliation",
    acceptedSuccessStatuses,
  );
}

async function finalizeAuthenticatedProviderOrderCompletion(
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt,
  expectedCurrentAggregate: FlightReconciliationAggregatePrefix,
  nextLifecycle: FlightCommerceLifecycle,
  finalizer: FlightAuthenticatedProviderOrderCompletionFinalizer,
  acceptedSuccessStatuses?: readonly ("finalized" | "already_finalized")[],
) {
  assertAuthenticatedProviderOrderCompletionReceiptStructure(receipt);
  const canonicalNextLifecycle = canonicalFlightJson(nextLifecycle as unknown as FlightCanonicalJsonValue);
  const nextLifecycleDigest = reconciliationLifecycleDigest(nextLifecycle);
  await requireDurableFlightReconciliationFinalization(
    nextLifecycleDigest,
    () => finalizer.finalizeAuthenticatedProviderOrderCompletion({
      receipt,
      canonicalEvidencePayload: new TextEncoder().encode(
        canonicalFlightJson(authenticatedProviderOrderCompletionReceiptEvidence(receipt)),
      ),
      expectedCurrentAggregate,
      canonicalExpectedCurrentAggregatePayload: new TextEncoder().encode(
        canonicalFlightJson(expectedCurrentAggregate as unknown as FlightCanonicalJsonValue),
      ),
      nextLifecycle,
      canonicalNextLifecyclePayload: new TextEncoder().encode(canonicalNextLifecycle),
      nextLifecycleDigest,
    }),
    "authenticated provider-order completion",
    acceptedSuccessStatuses,
  );
}

function assertOriginalCoordinatedOperationReceipt(
  lifecycle: FlightCommerceLifecycle,
  expectedDigest: string,
  affectedLifecycles: readonly FlightLifecycleKind[],
) {
  const digests = affectedLifecycles.map((kind) => lifecycleForKind(lifecycle, kind).history.at(-1)?.coordinatedOperationReceipt?.receiptDigest ?? null);
  if (
    !isFlightSha256Digest(expectedDigest)
    || digests.some((digest) => digest === null || digest !== expectedDigest)
  ) {
    throw new InvalidFlightTransitionError("Reconciliation evidence is bound to another coordinated operation attempt.");
  }
}

function initialLifecycle<TState extends string, TEvent extends string>(
  commerceId: string,
  state: TState,
): FlightLifecycle<TState, TEvent> {
  if (!isFlightStableToken(commerceId)) {
    throw new InvalidFlightTransitionError("Commerce ID must be a stable opaque token.");
  }
  return { commerceId, state, revision: 0, history: [] };
}

export function createFlightOrderLifecycle(commerceId: string) {
  return initialLifecycle<FlightOrderState, FlightOrderEvent>(commerceId, "draft");
}

export function createFlightPaymentLifecycle(commerceId: string) {
  return initialLifecycle<FlightPaymentState, FlightPaymentEvent>(commerceId, "not_started");
}

export function createFlightTicketLifecycle(commerceId: string) {
  return initialLifecycle<FlightTicketState, FlightTicketEvent>(commerceId, "not_started");
}

export type FlightCommerceLifecycle = {
  order: FlightLifecycle<FlightOrderState, FlightOrderEvent>;
  payment: FlightLifecycle<FlightPaymentState, FlightPaymentEvent>;
  ticket: FlightLifecycle<FlightTicketState, FlightTicketEvent>;
};

export type FlightTransitionEvidence = {
  eventId: string;
  occurredAt: string;
  idempotencyDigest: string;
  expectedRevision: number;
};

export function createFlightCommerceLifecycle(commerceId: string): FlightCommerceLifecycle {
  return {
    order: createFlightOrderLifecycle(commerceId),
    payment: createFlightPaymentLifecycle(commerceId),
    ticket: createFlightTicketLifecycle(commerceId),
  };
}

function transitionLifecycle<TState extends string, TEvent extends string>(
  lifecycle: FlightLifecycle<TState, TEvent>,
  command: InternalFlightTransitionCommand<TEvent>,
  table: TransitionTable<TState, TEvent>,
  initialState: TState,
  kind: FlightLifecycleKind,
): FlightLifecycle<TState, TEvent> {
  assertLifecycleIntegrity(lifecycle, table, initialState, kind);
  if (command.expectedRevision !== lifecycle.revision) throw new InvalidFlightTransitionError("Lifecycle revision is stale.");
  if (!isFlightStableToken(command.eventId)) throw new InvalidFlightTransitionError("Event ID must be a stable opaque token.");
  if (!isFlightSha256Digest(command.idempotencyDigest)) throw new InvalidFlightTransitionError("Idempotency evidence must be a lowercase SHA-256 digest.");
  const occurredAt = parseExactUtcInstant(command.occurredAt);
  if (occurredAt === undefined) throw new InvalidFlightTransitionError("Event time must be an exact UTC instant.");
  if (lifecycle.history.some((event) => event.eventId === command.eventId)) throw new InvalidFlightTransitionError("Event ID has already been recorded.");
  if (lifecycle.history.some((event) => event.idempotencyDigest === command.idempotencyDigest)) throw new InvalidFlightTransitionError("Idempotency digest has already been recorded.");
  const previous = lifecycle.history.at(-1);
  const previousTime = previous ? parseExactUtcInstant(previous.occurredAt) : undefined;
  if (previousTime !== undefined && occurredAt <= previousTime) throw new InvalidFlightTransitionError("Event time must be strictly later than the current lifecycle history.");

  const nextState = table[lifecycle.state]?.[command.type];
  if (nextState === undefined) throw new InvalidFlightTransitionError(`Event ${command.type} is not allowed from ${lifecycle.state}.`);

  const event: FlightLifecycleEvent<TState, TEvent> = {
    eventId: command.eventId,
    type: command.type,
    fromState: lifecycle.state,
    toState: nextState,
    occurredAt: command.occurredAt,
    idempotencyDigest: command.idempotencyDigest,
    coordinatedOperationReceipt: command.coordinatedOperationReceipt ?? null,
    providerOrderCompletionReceipt: command.providerOrderCompletionReceipt ?? null,
    noActiveTicketReconciliation: command.noActiveTicketReconciliation ?? null,
    ambiguityReconciliation: command.ambiguityReconciliation ?? null,
  };
  return {
    commerceId: lifecycle.commerceId,
    state: nextState,
    revision: lifecycle.revision + 1,
    history: [...lifecycle.history, event],
  };
}

function assertLifecycleIntegrity<TState extends string, TEvent extends string>(
  lifecycle: FlightLifecycle<TState, TEvent>,
  table: TransitionTable<TState, TEvent>,
  initialState: TState,
  kind: FlightLifecycleKind,
) {
  if (!isFlightStableToken(lifecycle.commerceId)) {
    throw new InvalidFlightTransitionError("Lifecycle commerce ID is malformed.");
  }
  if (!Number.isSafeInteger(lifecycle.revision) || lifecycle.revision < 0 || !Array.isArray(lifecycle.history)) {
    throw new InvalidFlightTransitionError("Lifecycle revision and history are malformed.");
  }
  if (lifecycle.revision !== lifecycle.history.length) {
    throw new InvalidFlightTransitionError("Lifecycle revision does not match its history length.");
  }
  let expectedState = initialState;
  let previousTime: number | undefined;
  const eventIds = new Set<string>();
  const digests = new Set<string>();
  const typedHistory = lifecycle.history as readonly FlightLifecycleEvent<TState, TEvent>[];
  for (const [index, event] of typedHistory.entries()) {
    if (!isFlightStableToken(event.eventId) || eventIds.has(event.eventId)) {
      throw new InvalidFlightTransitionError("Lifecycle history contains an invalid or duplicate event ID.");
    }
    if (!isFlightSha256Digest(event.idempotencyDigest) || digests.has(event.idempotencyDigest)) {
      throw new InvalidFlightTransitionError("Lifecycle history contains invalid or duplicate idempotency evidence.");
    }
    const occurredAt = parseExactUtcInstant(event.occurredAt);
    if (occurredAt === undefined || (previousTime !== undefined && occurredAt <= previousTime)) {
      throw new InvalidFlightTransitionError("Lifecycle history timestamps are invalid or out of order.");
    }
    const expectedNextState = table[expectedState]?.[event.type];
    if (event.fromState !== expectedState || expectedNextState === undefined || event.toState !== expectedNextState) {
      throw new InvalidFlightTransitionError("Lifecycle history does not form an exact permitted transition chain.");
    }
    const receipt = event.coordinatedOperationReceipt;
    if (receipt !== null) {
      assertCoordinatedReceiptStructure(receipt);
      if (receipt.commerceId !== lifecycle.commerceId || receipt.occurredAt !== event.occurredAt) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt is bound to another commerce lifecycle or time.");
      }
      const bindings = receipt.events.filter((binding) => binding.lifecycle === kind);
      if (bindings.length !== 1) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt does not contain exactly one binding for this lifecycle event.");
      }
      const binding = bindings[0]!;
      if (
        binding.eventType !== event.type
        || binding.eventId !== event.eventId
        || binding.idempotencyDigest !== event.idempotencyDigest
        || binding.expectedRevision !== index
      ) {
        throw new InvalidFlightTransitionError("Lifecycle event does not match its coordinated operation receipt.");
      }
      const expectedAnchor = {
        state: expectedState,
        revision: index,
        historyDigest: historyDigest(kind, lifecycle.commerceId, typedHistory.slice(0, index)),
      };
      if (canonicalFlightJson(receipt.before[kind]) !== canonicalFlightJson(expectedAnchor)) {
        throw new InvalidFlightTransitionError("Coordinated operation receipt lifecycle anchor does not match the exact history prefix.");
      }
    }
    const providerOrderCompletion = event.providerOrderCompletionReceipt;
    if (authenticatedProviderOrderCompletionEventTypes.has(event.type)) {
      if (providerOrderCompletion === null || receipt === null) {
        throw new InvalidFlightTransitionError("Atomic provider-order transition requires exact authenticated provider receipt evidence.");
      }
      assertAuthenticatedProviderOrderCompletionReceiptStructure(providerOrderCompletion);
      const transition = kind === "order"
        ? providerOrderCompletion.transitions.order
        : kind === "ticket"
          ? providerOrderCompletion.transitions.ticket
          : null;
      if (
        transition === null
        || providerOrderCompletion.commerceId !== lifecycle.commerceId
        || providerOrderCompletion.canonicalEvidenceDigest !== receipt.providerOrderCompletionReceiptDigest
        || transition.eventId !== event.eventId
        || transition.occurredAt !== event.occurredAt
        || transition.idempotencyDigest !== event.idempotencyDigest
        || transition.expectedRevision !== index
      ) {
        throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt does not match its lifecycle event.");
      }
    } else if (providerOrderCompletion !== null) {
      throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt is attached to another event type.");
    }
    if (event.type === "reconcile_no_active_ticket") {
      if (kind !== "ticket" || event.noActiveTicketReconciliation === null) {
        throw new InvalidFlightTransitionError("No-active-ticket transition requires exact provider reconciliation evidence.");
      }
      assertNoActiveTicketReconciliationStructure(event.noActiveTicketReconciliation);
      if (
        event.noActiveTicketReconciliation.commerceId !== lifecycle.commerceId
        || event.noActiveTicketReconciliation.transition.eventId !== event.eventId
        || event.noActiveTicketReconciliation.transition.occurredAt !== event.occurredAt
        || event.noActiveTicketReconciliation.transition.idempotencyDigest !== event.idempotencyDigest
        || event.noActiveTicketReconciliation.transition.expectedRevision !== index
      ) {
        throw new InvalidFlightTransitionError("No-active-ticket reconciliation evidence does not match its lifecycle event.");
      }
    } else if (event.noActiveTicketReconciliation !== null) {
      throw new InvalidFlightTransitionError("No-active-ticket reconciliation evidence is attached to another event type.");
    }
    if (ambiguityReconciliationEventTypes.has(event.type)) {
      const ambiguity = event.ambiguityReconciliation;
      if (ambiguity === null) {
        throw new InvalidFlightTransitionError("Ambiguity recovery transition requires exact authenticated provider evidence.");
      }
      assertAmbiguityReconciliationStructure(ambiguity);
      const transition = ambiguity.transitions[kind];
      if (
        ambiguity.commerceId !== lifecycle.commerceId
        || transition === null
        || transition.eventId !== event.eventId
        || transition.occurredAt !== event.occurredAt
        || transition.idempotencyDigest !== event.idempotencyDigest
        || transition.expectedRevision !== index
      ) {
        throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence does not match its lifecycle event.");
      }
    } else if (event.ambiguityReconciliation !== null) {
      throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence is attached to another event type.");
    }
    eventIds.add(event.eventId);
    digests.add(event.idempotencyDigest);
    previousTime = occurredAt;
    expectedState = expectedNextState;
  }
  if (lifecycle.state !== expectedState) {
    throw new InvalidFlightTransitionError("Lifecycle state does not match its validated history.");
  }
}

function assertFlightCommerceLifecycleIntegrity(lifecycle: FlightCommerceLifecycle) {
  assertLifecycleIntegrity(lifecycle.order, orderTransitions, "draft", "order");
  assertLifecycleIntegrity(lifecycle.payment, paymentTransitions, "not_started", "payment");
  assertLifecycleIntegrity(lifecycle.ticket, ticketTransitions, "not_started", "ticket");
  if (lifecycle.order.commerceId !== lifecycle.payment.commerceId
    || lifecycle.order.commerceId !== lifecycle.ticket.commerceId) {
    throw new InvalidFlightTransitionError("Order, payment, and ticket lifecycles must share one commerce ID.");
  }
  assertAggregateCoordinatedReceipts(lifecycle);
}

function deepFreezeFlightReconciliationData<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreezeFlightReconciliationData(child));
    Object.freeze(value);
  }
  return value;
}

function snapshotFlightReconciliationInputs<TEvidence>(
  lifecycle: FlightCommerceLifecycle,
  evidence: TEvidence,
): { lifecycle: FlightCommerceLifecycle; evidence: TEvidence } {
  try {
    const canonical = canonicalFlightJson({ lifecycle, evidence } as unknown as FlightCanonicalJsonValue);
    return deepFreezeFlightReconciliationData(JSON.parse(canonical) as {
      lifecycle: FlightCommerceLifecycle;
      evidence: TEvidence;
    });
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("Flight reconciliation inputs must be exact deep data-only evidence.");
  }
}

function prepareFlightReconciliationResult(lifecycle: FlightCommerceLifecycle): FlightCommerceLifecycle {
  let snapshot: FlightCommerceLifecycle;
  try {
    snapshot = deepFreezeFlightReconciliationData(
      JSON.parse(canonicalFlightJson(lifecycle as unknown as FlightCanonicalJsonValue)) as FlightCommerceLifecycle,
    );
  } catch (error) {
    if (error instanceof InvalidFlightTransitionError) throw error;
    throw new InvalidFlightTransitionError("Flight reconciliation result must be exact deep data-only evidence.");
  }
  assertFlightCommerceLifecycleIntegrity(snapshot);
  return snapshot;
}

function exactPersistedAmbiguityReceipt(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
): FlightCoordinatedOperationReceipt | null {
  const expectedEvidence = canonicalFlightJson(evidence as unknown as FlightCanonicalJsonValue);
  const affectedKinds: FlightLifecycleKind[] = ["order"];
  if (evidence.transitions.payment !== null) affectedKinds.push("payment");
  if (evidence.transitions.ticket !== null) affectedKinds.push("ticket");
  let receipt: FlightCoordinatedOperationReceipt | null = null;
  for (const kind of affectedKinds) {
    const event = lifecycleForKind(lifecycle, kind).history.at(-1);
    if (
      event?.ambiguityReconciliation === null
      || event?.ambiguityReconciliation === undefined
      || canonicalFlightJson(event.ambiguityReconciliation as unknown as FlightCanonicalJsonValue) !== expectedEvidence
      || event.coordinatedOperationReceipt === null
    ) return null;
    if (receipt === null) receipt = event.coordinatedOperationReceipt;
    else if (receipt.receiptDigest !== event.coordinatedOperationReceipt.receiptDigest) return null;
  }
  if (receipt === null) return null;
  const affected = new Set(affectedKinds);
  for (const kind of flightLifecycleKinds) {
    const stream = lifecycleForKind(lifecycle, kind);
    const expectedRevision = receipt.before[kind].revision + (affected.has(kind) ? 1 : 0);
    if (stream.revision !== expectedRevision) return null;
    if (!affected.has(kind) && canonicalFlightJson(currentLifecycleAnchor(kind, stream)) !== canonicalFlightJson(receipt.before[kind])) {
      return null;
    }
  }
  return receipt;
}

function exactPersistedNoActiveTicketReceipt(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightNoActiveTicketReconciliationEvidence,
): FlightCoordinatedOperationReceipt | null {
  const event = lifecycle.ticket.history.at(-1);
  if (
    event?.noActiveTicketReconciliation === null
    || event?.noActiveTicketReconciliation === undefined
    || canonicalFlightJson(event.noActiveTicketReconciliation as unknown as FlightCanonicalJsonValue)
      !== canonicalFlightJson(evidence as unknown as FlightCanonicalJsonValue)
    || event.coordinatedOperationReceipt === null
  ) return null;
  const receipt = event.coordinatedOperationReceipt;
  for (const kind of flightLifecycleKinds) {
    const stream = lifecycleForKind(lifecycle, kind);
    const expectedRevision = receipt.before[kind].revision + (kind === "ticket" ? 1 : 0);
    if (stream.revision !== expectedRevision) return null;
    if (kind !== "ticket" && canonicalFlightJson(currentLifecycleAnchor(kind, stream)) !== canonicalFlightJson(receipt.before[kind])) {
      return null;
    }
  }
  return receipt;
}

function exactPersistedAuthenticatedProviderOrderCompletion(
  lifecycle: FlightCommerceLifecycle,
  providerReceipt: FlightAuthenticatedProviderOrderCompletionReceipt,
): FlightCoordinatedOperationReceipt | null {
  const expectedProviderReceipt = canonicalFlightJson(providerReceipt as unknown as FlightCanonicalJsonValue);
  const affectedKinds: FlightLifecycleKind[] = providerReceipt.transitions.ticket === null
    ? ["order"]
    : ["order", "ticket"];
  let coordinatedReceipt: FlightCoordinatedOperationReceipt | null = null;
  for (const kind of affectedKinds) {
    const event = lifecycleForKind(lifecycle, kind).history.at(-1);
    if (
      event?.providerOrderCompletionReceipt === null
      || event?.providerOrderCompletionReceipt === undefined
      || canonicalFlightJson(event.providerOrderCompletionReceipt as unknown as FlightCanonicalJsonValue) !== expectedProviderReceipt
      || event.coordinatedOperationReceipt === null
    ) return null;
    if (coordinatedReceipt === null) coordinatedReceipt = event.coordinatedOperationReceipt;
    else if (coordinatedReceipt.receiptDigest !== event.coordinatedOperationReceipt.receiptDigest) return null;
  }
  if (coordinatedReceipt === null) return null;
  const affected = new Set(affectedKinds);
  for (const kind of flightLifecycleKinds) {
    const stream = lifecycleForKind(lifecycle, kind);
    const expectedRevision = coordinatedReceipt.before[kind].revision + (affected.has(kind) ? 1 : 0);
    if (stream.revision !== expectedRevision) return null;
    if (!affected.has(kind) && (
      canonicalFlightJson(currentLifecycleAnchor(kind, stream)) !== canonicalFlightJson(coordinatedReceipt.before[kind])
    )) return null;
  }
  return coordinatedReceipt;
}

async function resumePersistedAmbiguityReconciliation(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  expectedOperation: FlightAmbiguityOperation,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle | null> {
  if (evidence.operation !== expectedOperation) {
    throw new InvalidFlightTransitionError("Ambiguity reconciliation evidence is routed to another operation handler.");
  }
  const receipt = exactPersistedAmbiguityReceipt(lifecycle, evidence);
  if (receipt === null) return null;
  const persistedLifecycle = prepareFlightReconciliationResult(lifecycle);
  await finalizeAmbiguityReconciliationEvidence(
    evidence,
    receiptReconciliationAggregatePrefix(receipt),
    persistedLifecycle,
    finalizer,
    ["already_finalized"],
  );
  return persistedLifecycle;
}

async function resumePersistedNoActiveTicketReconciliation(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightNoActiveTicketReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle | null> {
  const receipt = exactPersistedNoActiveTicketReceipt(lifecycle, evidence);
  if (receipt === null) return null;
  const persistedLifecycle = prepareFlightReconciliationResult(lifecycle);
  await finalizeNoActiveTicketReconciliationEvidence(
    evidence,
    receiptReconciliationAggregatePrefix(receipt),
    persistedLifecycle,
    finalizer,
    ["already_finalized"],
  );
  return persistedLifecycle;
}

async function resumePersistedAuthenticatedProviderOrderCompletion(
  lifecycle: FlightCommerceLifecycle,
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt,
  finalizer: FlightAuthenticatedProviderOrderCompletionFinalizer,
): Promise<FlightCommerceLifecycle | null> {
  const coordinatedReceipt = exactPersistedAuthenticatedProviderOrderCompletion(lifecycle, receipt);
  if (coordinatedReceipt === null) return null;
  const persistedLifecycle = prepareFlightReconciliationResult(lifecycle);
  await finalizeAuthenticatedProviderOrderCompletion(
    receipt,
    receiptReconciliationAggregatePrefix(coordinatedReceipt),
    persistedLifecycle,
    finalizer,
    ["already_finalized"],
  );
  return persistedLifecycle;
}

export function transitionFlightOrder(
  lifecycle: FlightLifecycle<FlightOrderState, FlightOrderEvent>,
  command: FlightTransitionCommand<FlightOrderEvent>,
) {
  if (coordinatedOrderEvents.has(command.type)) {
    throw new InvalidFlightTransitionError(`Event ${command.type} requires the coordinated flight-commerce lifecycle.`);
  }
  return transitionLifecycle(lifecycle, command, orderTransitions, "draft", "order");
}

function transitionFlightPayment(
  lifecycle: FlightLifecycle<FlightPaymentState, FlightPaymentEvent>,
  command: FlightTransitionCommand<FlightPaymentEvent>,
) {
  return transitionLifecycle(lifecycle, command, paymentTransitions, "not_started", "payment");
}

function transitionFlightTicket(
  lifecycle: FlightLifecycle<FlightTicketState, FlightTicketEvent>,
  command: FlightTransitionCommand<FlightTicketEvent>,
) {
  return transitionLifecycle(lifecycle, command, ticketTransitions, "not_started", "ticket");
}

const coordinatedOrderEvents = new Set<FlightOrderEvent>([
  "begin_payment",
  "authorize_payment",
  "reject_payment",
  "reject_payment_capture",
  "void_payment",
  "reject_payment_void",
  "submit_order",
  "confirm_order",
  "confirm_provider_order",
  "confirm_provider_order_ticketing_pending",
  "confirm_provider_order_ticketed",
  "reject_order",
  "begin_compensating_refund",
  "begin_ticketing",
  "issue_tickets",
  "reject_ticketing",
  "begin_servicing",
  "complete_servicing",
  "reject_servicing",
  "begin_cancellation",
  "confirm_cancellation",
  "reject_cancellation",
  "begin_refund",
  "complete_refund",
  "reject_refund",
  "reconcile_payment_capture_succeeded",
  "reconcile_payment_capture_absent",
  "reconcile_ticketing_succeeded",
  "reconcile_ticket_active",
  "reconcile_cancellation_succeeded",
  "mark_payment_authorization_ambiguous",
  "reconcile_payment_authorized",
  "reconcile_payment_authorization_absent",
  "reconcile_payment_voided",
  "reconcile_payment_authorization_active",
  "reconcile_order_absent",
  "reconcile_order_confirmed",
  "reconcile_order_ticketed",
  "reconcile_cancelled_order_active_ticket",
  "reconcile_refund_still_captured",
  "reconcile_refund_partially_completed",
  "reconcile_refund_fully_completed",
]);

function command<TEvent extends string>(
  type: TEvent,
  evidence: FlightTransitionEvidence,
  coordinatedOperationReceipt?: FlightCoordinatedOperationReceipt,
  noActiveTicketReconciliation?: FlightNoActiveTicketReconciliationEvidence,
  ambiguityReconciliation?: FlightAmbiguityReconciliationEvidence,
  providerOrderCompletionReceipt?: FlightAuthenticatedProviderOrderCompletionReceipt,
): InternalFlightTransitionCommand<TEvent> {
  return {
    type,
    ...evidence,
    coordinatedOperationReceipt,
    providerOrderCompletionReceipt,
    noActiveTicketReconciliation,
    ambiguityReconciliation,
  };
}

function coordinatedOrderTransition(
  lifecycle: FlightLifecycle<FlightOrderState, FlightOrderEvent>,
  type: FlightOrderEvent,
  evidence: FlightTransitionEvidence,
  receipt: FlightCoordinatedOperationReceipt,
  ambiguityReconciliation?: FlightAmbiguityReconciliationEvidence,
  providerOrderCompletionReceipt?: FlightAuthenticatedProviderOrderCompletionReceipt,
) {
  return transitionLifecycle(
    lifecycle,
    command(type, evidence, receipt, undefined, ambiguityReconciliation, providerOrderCompletionReceipt),
    orderTransitions,
    "draft",
    "order",
  );
}

function requireState(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new InvalidFlightTransitionError(`${label} must be ${expected}; received ${actual}.`);
  }
}

export function beginFlightCommercePayment(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "priced", "Order state");
  requireState(lifecycle.payment.state, "not_started", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("begin_payment", lifecycle, [
    { lifecycle: "order", eventType: "begin_payment", evidence: evidence.order },
    { lifecycle: "payment", eventType: "begin_authorization", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_authorization", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "begin_payment", evidence.order, receipt),
  };
}

export function authorizeFlightCommercePayment(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_pending", "Order state");
  requireState(lifecycle.payment.state, "authorization_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("authorize_payment", lifecycle, [
    { lifecycle: "order", eventType: "authorize_payment", evidence: evidence.order },
    { lifecycle: "payment", eventType: "authorize", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("authorize", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "authorize_payment", evidence.order, receipt),
  };
}

export function rejectFlightCommercePayment(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_pending", "Order state");
  requireState(lifecycle.payment.state, "authorization_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("reject_payment", lifecycle, [
    { lifecycle: "order", eventType: "reject_payment", evidence: evidence.order },
    { lifecycle: "payment", eventType: "reject_authorization", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("reject_authorization", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_payment", evidence.order, receipt),
  };
}

export function markFlightCommercePaymentAuthorizationAmbiguous(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_pending", "Order state");
  requireState(lifecycle.payment.state, "authorization_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("mark_payment_authorization_ambiguous", lifecycle, [
    { lifecycle: "order", eventType: "mark_payment_authorization_ambiguous", evidence: evidence.order },
    { lifecycle: "payment", eventType: "mark_authorization_ambiguous", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "mark_payment_authorization_ambiguous", evidence.order, receipt),
    payment: transitionFlightPayment(lifecycle.payment, command("mark_authorization_ambiguous", evidence.payment, receipt)),
  };
}

export async function reconcileFlightCommercePaymentAuthorization(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "authorize_payment", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "manual_review", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "mark_payment_authorization_ambiguous"
    || lifecycle.payment.history.at(-1)?.type !== "mark_authorization_ambiguous"
    || evidence.operation !== "authorize_payment"
    || !["payment_authorized", "payment_authorization_absent"].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Payment-authorization reconciliation does not match the ambiguous authorization lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "payment"]);
  const authorized = evidence.outcome === "payment_authorized";
  const orderEvent = authorized ? "reconcile_payment_authorized" : "reconcile_payment_authorization_absent";
  const paymentEvent = authorized ? "reconcile_authorized" : "reconcile_authorization_absent";
  const operation = authorized ? "reconcile_payment_authorized" : "reconcile_payment_authorization_absent";
  const paymentEvidence = evidence.transitions.payment!;
  const receipt = buildCoordinatedOperationReceipt(operation, lifecycle, [
    { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
    { lifecycle: "payment", eventType: paymentEvent, evidence: paymentEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    payment: transitionFlightPayment(lifecycle.payment, command(paymentEvent, paymentEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function beginFlightCommercePaymentCapture(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "authorized", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("begin_payment_capture", lifecycle, [
    { lifecycle: "payment", eventType: "begin_capture", evidence },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_capture", evidence, receipt)),
  };
}

export function completeFlightCommercePaymentCapture(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "capture_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("complete_payment_capture", lifecycle, [
    { lifecycle: "payment", eventType: "capture", evidence },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("capture", evidence, receipt)),
  };
}

export function rejectFlightCommercePaymentCapture(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "capture_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("reject_payment_capture", lifecycle, [
    { lifecycle: "order", eventType: "reject_payment_capture", evidence: evidence.order },
    { lifecycle: "payment", eventType: "reject_capture", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("reject_capture", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_payment_capture", evidence.order, receipt),
  };
}

export async function reconcileFlightCommercePaymentCapture(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "capture_payment", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "manual_review", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_payment_capture"
    || lifecycle.payment.history.at(-1)?.type !== "reject_capture"
    || evidence.operation !== "capture_payment"
    || ![
      "payment_captured",
      "payment_not_captured_no_authorization",
      "payment_not_captured_authorization_active",
      "payment_not_captured_authorization_voided",
    ].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Payment-capture reconciliation evidence does not match the ambiguous capture lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "payment"]);
  const orderEvent: FlightOrderEvent = evidence.outcome === "payment_captured"
    ? "reconcile_payment_capture_succeeded"
    : evidence.outcome === "payment_not_captured_no_authorization"
      ? "reconcile_payment_capture_absent"
      : evidence.outcome === "payment_not_captured_authorization_active"
        ? "reconcile_payment_authorization_active"
        : "reconcile_payment_voided";
  const paymentEvent: FlightPaymentEvent = evidence.outcome === "payment_captured"
    ? "reconcile_capture_succeeded"
    : evidence.outcome === "payment_not_captured_no_authorization"
      ? "reconcile_capture_absent"
      : evidence.outcome === "payment_not_captured_authorization_active"
        ? "reconcile_authorization_active"
        : "reconcile_void_succeeded";
  const operation: FlightCoordinatedOperation = evidence.outcome === "payment_captured"
    ? "reconcile_capture_succeeded"
    : evidence.outcome === "payment_not_captured_no_authorization"
      ? "reconcile_capture_absent"
      : evidence.outcome === "payment_not_captured_authorization_active"
        ? "reconcile_payment_authorization_active"
        : "reconcile_payment_void_succeeded";
  const paymentEvidence = evidence.transitions.payment!;
  const receipt = buildCoordinatedOperationReceipt(operation, lifecycle, [
    { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
    { lifecycle: "payment", eventType: paymentEvent, evidence: paymentEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    payment: transitionFlightPayment(lifecycle.payment, command(paymentEvent, paymentEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function beginFlightCommercePaymentVoid(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "authorized", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("begin_payment_void", lifecycle, [
    { lifecycle: "payment", eventType: "begin_void", evidence },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_void", evidence, receipt)),
  };
}

export function completeFlightCommercePaymentVoid(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "void_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("complete_payment_void", lifecycle, [
    { lifecycle: "order", eventType: "void_payment", evidence: evidence.order },
    { lifecycle: "payment", eventType: "void", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("void", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "void_payment", evidence.order, receipt),
  };
}

export function rejectFlightCommercePaymentVoid(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "void_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("reject_payment_void", lifecycle, [
    { lifecycle: "order", eventType: "reject_payment_void", evidence: evidence.order },
    { lifecycle: "payment", eventType: "reject_void", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("reject_void", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_payment_void", evidence.order, receipt),
  };
}

export async function reconcileFlightCommercePaymentVoid(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "void_payment", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "manual_review", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_payment_void"
    || lifecycle.payment.history.at(-1)?.type !== "reject_void"
    || evidence.operation !== "void_payment"
    || !["payment_voided", "payment_authorization_active"].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Payment-void reconciliation does not match the ambiguous void lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "payment"]);
  const voided = evidence.outcome === "payment_voided";
  const orderEvent = voided ? "reconcile_payment_voided" : "reconcile_payment_authorization_active";
  const paymentEvent = voided ? "reconcile_void_succeeded" : "reconcile_authorization_active";
  const operation = voided ? "reconcile_payment_void_succeeded" : "reconcile_payment_authorization_active";
  const paymentEvidence = evidence.transitions.payment!;
  const receipt = buildCoordinatedOperationReceipt(operation, lifecycle, [
    { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
    { lifecycle: "payment", eventType: paymentEvent, evidence: paymentEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    payment: transitionFlightPayment(lifecycle.payment, command(paymentEvent, paymentEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function submitFlightCommerceOrder(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "payment_authorized", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("submit_order", lifecycle, [
    { lifecycle: "order", eventType: "submit_order", evidence },
  ]);
  return {
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "submit_order", evidence, receipt),
  };
}

/**
 * Completes one provider create-order mutation from one authenticated receipt.
 *
 * The provider operation may have confirmed only the order, begun ticketing as
 * part of that same operation, or already issued electronic tickets atomically.
 * No provider call occurs here. The supplied finalizer is the trust and durable
 * compare-and-swap boundary; no lifecycle is returned unless it authenticates
 * the exact canonical receipt and persists the exact resulting aggregate.
 */
export async function completeFlightCommerceProviderOrderAtomically(
  lifecycle: FlightCommerceLifecycle,
  receipt: FlightAuthenticatedProviderOrderCompletionReceipt,
  finalizer: FlightAuthenticatedProviderOrderCompletionFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence: receipt } = snapshotFlightReconciliationInputs(lifecycle, receipt));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAuthenticatedProviderOrderCompletionReceiptStructure(receipt);
  const persistedRetry = await resumePersistedAuthenticatedProviderOrderCompletion(lifecycle, receipt, finalizer);
  if (persistedRetry !== null) return persistedRetry;

  requireState(lifecycle.order.state, "order_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  const expectedCurrentAggregate = currentReconciliationAggregatePrefix(lifecycle);
  if (
    canonicalFlightJson(receipt.expectedCurrentAggregate as unknown as FlightCanonicalJsonValue)
    !== canonicalFlightJson(expectedCurrentAggregate as unknown as FlightCanonicalJsonValue)
  ) {
    throw new InvalidFlightTransitionError("Authenticated provider-order completion receipt is stale or bound to another aggregate prefix.");
  }

  const operation: FlightCoordinatedOperation = receipt.outcome === "order_confirmed"
    ? "complete_provider_order_confirmed"
    : receipt.outcome === "ticketing_pending"
      ? "complete_provider_order_ticketing_pending"
      : "complete_provider_order_ticketed";
  const orderEvent: FlightOrderEvent = receipt.outcome === "order_confirmed"
    ? "confirm_provider_order"
    : receipt.outcome === "ticketing_pending"
      ? "confirm_provider_order_ticketing_pending"
      : "confirm_provider_order_ticketed";
  const ticketEvent: FlightTicketEvent | null = receipt.outcome === "order_confirmed"
    ? null
    : receipt.outcome === "ticketing_pending"
      ? "begin_provider_order_issuance"
      : "issue_provider_order_tickets";
  const eventInputs: CoordinatedEventInput[] = [
    { lifecycle: "order", eventType: orderEvent, evidence: receipt.transitions.order },
  ];
  if (ticketEvent !== null) {
    eventInputs.push({ lifecycle: "ticket", eventType: ticketEvent, evidence: receipt.transitions.ticket! });
  }
  const coordinatedReceipt = buildCoordinatedOperationReceipt(
    operation,
    lifecycle,
    eventInputs,
    receipt.canonicalEvidenceDigest,
  );
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(
      lifecycle.order,
      orderEvent,
      receipt.transitions.order,
      coordinatedReceipt,
      undefined,
      receipt,
    ),
    ticket: ticketEvent === null
      ? lifecycle.ticket
      : transitionFlightTicket(
        lifecycle.ticket,
        command(ticketEvent, receipt.transitions.ticket!, coordinatedReceipt, undefined, undefined, receipt),
      ),
  });
  await finalizeAuthenticatedProviderOrderCompletion(
    receipt,
    expectedCurrentAggregate,
    nextLifecycle,
    finalizer,
  );
  return nextLifecycle;
}

export function completeFlightCommerceOrder(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "order_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("complete_order", lifecycle, [
    { lifecycle: "order", eventType: "confirm_order", evidence },
  ]);
  return {
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "confirm_order", evidence, receipt),
  };
}

export function rejectFlightCommerceOrder(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "order_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("reject_order", lifecycle, [
    { lifecycle: "order", eventType: "reject_order", evidence },
  ]);
  return {
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "reject_order", evidence, receipt),
  };
}

export async function reconcileFlightCommerceOrderCreation(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "create_order", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_order"
    || evidence.operation !== "create_order"
    || !["order_absent", "order_confirmed", "order_ticketed"].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Order-creation reconciliation does not match the ambiguous create-order lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order"]);
  const orderEvent = evidence.outcome === "order_absent"
    ? "reconcile_order_absent"
    : evidence.outcome === "order_confirmed"
      ? "reconcile_order_confirmed"
      : "reconcile_order_ticketed";
  const operation = orderEvent;
  const ticketEvidence = evidence.transitions.ticket;
  const receipt = buildCoordinatedOperationReceipt(
    operation,
    lifecycle,
    evidence.outcome === "order_ticketed"
      ? [
        { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
        { lifecycle: "ticket", eventType: "reconcile_order_ticketed", evidence: ticketEvidence! },
      ]
      : [{ lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order }],
  );
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    ticket: evidence.outcome === "order_ticketed"
      ? transitionFlightTicket(lifecycle.ticket, command("reconcile_order_ticketed", ticketEvidence!, receipt, undefined, evidence))
      : lifecycle.ticket,
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function beginFlightCommerceTicketing(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "order_confirmed", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "not_started", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("begin_ticketing", lifecycle, [
    { lifecycle: "order", eventType: "begin_ticketing", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "begin_issuance", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("begin_issuance", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "begin_ticketing", evidence.order, receipt),
  };
}

export function completeFlightCommerceTicketing(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "ticketing_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "issuance_pending", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("complete_ticketing", lifecycle, [
    { lifecycle: "order", eventType: "issue_tickets", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "issue", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("issue", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "issue_tickets", evidence.order, receipt),
  };
}

export function rejectFlightCommerceTicketing(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "ticketing_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "issuance_pending", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("reject_ticketing", lifecycle, [
    { lifecycle: "order", eventType: "reject_ticketing", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "reject_issuance", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("reject_issuance", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_ticketing", evidence.order, receipt),
  };
}

export async function reconcileFlightCommerceTicketIssuance(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "issue_ticket", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "manual_review", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_ticketing"
    || lifecycle.ticket.history.at(-1)?.type !== "reject_issuance"
    || evidence.operation !== "issue_ticket"
    || evidence.outcome !== "tickets_issued"
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Ticket-issuance reconciliation evidence does not match the ambiguous issuance lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "ticket"]);
  const ticketEvidence = evidence.transitions.ticket!;
  const receipt = buildCoordinatedOperationReceipt("reconcile_issuance_succeeded", lifecycle, [
    { lifecycle: "order", eventType: "reconcile_ticketing_succeeded", evidence: evidence.transitions.order },
    { lifecycle: "ticket", eventType: "reconcile_issuance_succeeded", evidence: ticketEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "reconcile_ticketing_succeeded", evidence.transitions.order, receipt, evidence),
    ticket: transitionFlightTicket(lifecycle.ticket, command("reconcile_issuance_succeeded", ticketEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function beginFlightCommerceTicketExchange(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "ticketed", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  if (lifecycle.ticket.state !== "issued" && lifecycle.ticket.state !== "exchanged") {
    throw new InvalidFlightTransitionError(`Ticket state must be issued or exchanged; received ${lifecycle.ticket.state}.`);
  }
  const receipt = buildCoordinatedOperationReceipt("begin_ticket_exchange", lifecycle, [
    { lifecycle: "order", eventType: "begin_servicing", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "begin_exchange", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("begin_exchange", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "begin_servicing", evidence.order, receipt),
  };
}

export function completeFlightCommerceTicketExchange(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "servicing_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "exchange_pending", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("complete_ticket_exchange", lifecycle, [
    { lifecycle: "order", eventType: "complete_servicing", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "exchange", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("exchange", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "complete_servicing", evidence.order, receipt),
  };
}

export function rejectFlightCommerceTicketExchange(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "servicing_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "exchange_pending", "Ticket state");
  const receipt = buildCoordinatedOperationReceipt("reject_ticket_exchange", lifecycle, [
    { lifecycle: "order", eventType: "reject_servicing", evidence: evidence.order },
    { lifecycle: "ticket", eventType: "reject_exchange", evidence: evidence.ticket },
  ]);
  return {
    ...lifecycle,
    ticket: transitionFlightTicket(lifecycle.ticket, command("reject_exchange", evidence.ticket, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_servicing", evidence.order, receipt),
  };
}

export async function reconcileFlightCommerceTicketExchange(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "exchange_ticket", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  requireState(lifecycle.ticket.state, "manual_review", "Ticket state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_servicing"
    || lifecycle.ticket.history.at(-1)?.type !== "reject_exchange"
    || evidence.operation !== "exchange_ticket"
    || !["tickets_exchanged", "original_issued_ticket_active", "original_exchanged_ticket_active"].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Ticket-exchange reconciliation evidence does not match the ambiguous exchange lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "ticket"]);
  const ticketEvent = evidence.outcome === "tickets_exchanged"
    ? "reconcile_exchange_succeeded"
    : evidence.outcome === "original_issued_ticket_active"
      ? "reconcile_issued_ticket_active"
      : "reconcile_exchanged_ticket_active";
  const operation = ticketEvent;
  const ticketEvidence = evidence.transitions.ticket!;
  const receipt = buildCoordinatedOperationReceipt(operation, lifecycle, [
    { lifecycle: "order", eventType: "reconcile_ticket_active", evidence: evidence.transitions.order },
    { lifecycle: "ticket", eventType: ticketEvent, evidence: ticketEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, "reconcile_ticket_active", evidence.transitions.order, receipt, evidence),
    ticket: transitionFlightTicket(lifecycle.ticket, command(ticketEvent, ticketEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

export function beginFlightCommerceCancellation(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket?: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.payment.state, "captured", "Payment state");
  const unticketed = lifecycle.order.state === "order_confirmed"
    && (lifecycle.ticket.state === "not_started" || lifecycle.ticket.state === "voided");
  const ticketed = lifecycle.order.state === "ticketed"
    && (lifecycle.ticket.state === "issued" || lifecycle.ticket.state === "exchanged");
  if (!unticketed && !ticketed) {
    throw new InvalidFlightTransitionError("Cancellation requires an unticketed confirmed order or an active issued ticket.");
  }
  if (ticketed && evidence.ticket === undefined) {
    throw new InvalidFlightTransitionError("Ticketed cancellation requires ticket-void evidence.");
  }
  if (unticketed && evidence.ticket !== undefined) {
    throw new InvalidFlightTransitionError("Unticketed cancellation cannot contain ticket-void evidence.");
  }
  const receipt = buildCoordinatedOperationReceipt(
    ticketed ? "begin_ticketed_cancellation" : "begin_unticketed_cancellation",
    lifecycle,
    ticketed
      ? [
        { lifecycle: "order", eventType: "begin_cancellation", evidence: evidence.order },
        { lifecycle: "ticket", eventType: "begin_void", evidence: evidence.ticket! },
      ]
      : [{ lifecycle: "order", eventType: "begin_cancellation", evidence: evidence.order }],
  );
  return {
    ...lifecycle,
    ticket: ticketed
      ? transitionFlightTicket(lifecycle.ticket, command("begin_void", evidence.ticket!, receipt))
      : lifecycle.ticket,
    order: coordinatedOrderTransition(lifecycle.order, "begin_cancellation", evidence.order, receipt),
  };
}

export function completeFlightCommerceCancellation(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket?: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "cancellation_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  const unticketed = lifecycle.ticket.state === "not_started" || lifecycle.ticket.state === "voided";
  const ticketed = lifecycle.ticket.state === "void_pending";
  if (!unticketed && !ticketed) throw new InvalidFlightTransitionError("Cancellation ticket evidence is inconsistent.");
  if (ticketed && evidence.ticket === undefined) throw new InvalidFlightTransitionError("Ticket void completion evidence is required.");
  if (unticketed && evidence.ticket !== undefined) throw new InvalidFlightTransitionError("Unticketed cancellation cannot contain ticket evidence.");
  const receipt = buildCoordinatedOperationReceipt(
    ticketed ? "complete_ticketed_cancellation" : "complete_unticketed_cancellation",
    lifecycle,
    ticketed
      ? [
        { lifecycle: "order", eventType: "confirm_cancellation", evidence: evidence.order },
        { lifecycle: "ticket", eventType: "void", evidence: evidence.ticket! },
      ]
      : [{ lifecycle: "order", eventType: "confirm_cancellation", evidence: evidence.order }],
  );
  return {
    ...lifecycle,
    ticket: ticketed
      ? transitionFlightTicket(lifecycle.ticket, command("void", evidence.ticket!, receipt))
      : lifecycle.ticket,
    order: coordinatedOrderTransition(lifecycle.order, "confirm_cancellation", evidence.order, receipt),
  };
}

export function rejectFlightCommerceCancellation(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; ticket?: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "cancellation_pending", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  const unticketed = lifecycle.ticket.state === "not_started" || lifecycle.ticket.state === "voided";
  const ticketed = lifecycle.ticket.state === "void_pending";
  if (!unticketed && !ticketed) throw new InvalidFlightTransitionError("Cancellation ticket evidence is inconsistent.");
  if (ticketed && evidence.ticket === undefined) throw new InvalidFlightTransitionError("Ticket void rejection evidence is required.");
  if (unticketed && evidence.ticket !== undefined) throw new InvalidFlightTransitionError("Unticketed cancellation cannot contain ticket evidence.");
  const receipt = buildCoordinatedOperationReceipt(
    ticketed ? "reject_ticketed_cancellation" : "reject_unticketed_cancellation",
    lifecycle,
    ticketed
      ? [
        { lifecycle: "order", eventType: "reject_cancellation", evidence: evidence.order },
        { lifecycle: "ticket", eventType: "reject_void", evidence: evidence.ticket! },
      ]
      : [{ lifecycle: "order", eventType: "reject_cancellation", evidence: evidence.order }],
  );
  return {
    ...lifecycle,
    ticket: ticketed
      ? transitionFlightTicket(lifecycle.ticket, command("reject_void", evidence.ticket!, receipt))
      : lifecycle.ticket,
    order: coordinatedOrderTransition(lifecycle.order, "reject_cancellation", evidence.order, receipt),
  };
}

export async function reconcileFlightCommerceCancellation(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "cancel_order", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "captured", "Payment state");
  const unticketed = lifecycle.ticket.state === "not_started" || lifecycle.ticket.state === "voided";
  const ticketed = lifecycle.ticket.state === "manual_review";
  const allowedUnticketedOutcomes = ["unticketed_order_cancelled", "unticketed_order_active"];
  const allowedTicketedOutcomes = [
    "ticketed_order_cancelled_tickets_voided",
    "ticketed_order_cancelled_original_issued_ticket_active",
    "ticketed_order_cancelled_original_exchanged_ticket_active",
    "ticketed_order_active_original_issued_ticket_active",
    "ticketed_order_active_original_exchanged_ticket_active",
    "ticketed_order_active_tickets_voided",
  ];
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_cancellation"
    || (!unticketed && !ticketed)
    || (ticketed && lifecycle.ticket.history.at(-1)?.type !== "reject_void")
    || evidence.operation !== "cancel_order"
    || (unticketed ? !allowedUnticketedOutcomes.includes(evidence.outcome) : !allowedTicketedOutcomes.includes(evidence.outcome))
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Cancellation reconciliation evidence does not match the exact ambiguous order-cancel lifecycle.");
  }
  assertOriginalCoordinatedOperationReceipt(
    lifecycle,
    evidence.originalOperationReceiptDigest,
    ticketed ? ["order", "ticket"] : ["order"],
  );
  const cancelled = evidence.outcome === "unticketed_order_cancelled"
    || evidence.outcome === "ticketed_order_cancelled_tickets_voided";
  const cancelledWithActiveTicket = evidence.outcome === "ticketed_order_cancelled_original_issued_ticket_active"
    || evidence.outcome === "ticketed_order_cancelled_original_exchanged_ticket_active";
  const activeWithTicket = evidence.outcome === "ticketed_order_active_original_issued_ticket_active"
    || evidence.outcome === "ticketed_order_active_original_exchanged_ticket_active";
  const orderEvent: FlightOrderEvent = cancelledWithActiveTicket
    ? "reconcile_cancelled_order_active_ticket"
    : cancelled
    ? "reconcile_cancellation_succeeded"
    : activeWithTicket
      ? "reconcile_ticket_active"
      : "reconcile_order_confirmed";
  const ticketEvent: FlightTicketEvent | null = unticketed
    ? null
    : evidence.outcome === "ticketed_order_active_original_issued_ticket_active"
      || evidence.outcome === "ticketed_order_cancelled_original_issued_ticket_active"
      ? "reconcile_issued_ticket_active"
      : evidence.outcome === "ticketed_order_active_original_exchanged_ticket_active"
        || evidence.outcome === "ticketed_order_cancelled_original_exchanged_ticket_active"
        ? "reconcile_exchanged_ticket_active"
        : "reconcile_void_succeeded";
  const operation: FlightCoordinatedOperation = unticketed
    ? cancelled ? "reconcile_unticketed_cancellation_succeeded" : "reconcile_order_confirmed"
    : evidence.outcome === "ticketed_order_cancelled_original_issued_ticket_active"
      ? "reconcile_cancelled_order_issued_ticket_active"
      : evidence.outcome === "ticketed_order_cancelled_original_exchanged_ticket_active"
        ? "reconcile_cancelled_order_exchanged_ticket_active"
    : evidence.outcome === "ticketed_order_active_tickets_voided"
      ? "reconcile_order_active_tickets_voided"
      : ticketEvent!;
  const ticketEvidence = evidence.transitions.ticket;
  const receipt = buildCoordinatedOperationReceipt(
    operation,
    lifecycle,
    ticketEvent === null
      ? [{ lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order }]
      : [
        { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
        { lifecycle: "ticket", eventType: ticketEvent, evidence: ticketEvidence! },
      ],
  );
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    ticket: ticketEvent === null
      ? lifecycle.ticket
      : transitionFlightTicket(lifecycle.ticket, command(ticketEvent, ticketEvidence!, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}

/** @deprecated Cancellation recovery requires compound provider-order and ticket evidence. */
export async function reconcileFlightCommerceTicketVoid(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
) {
  return reconcileFlightCommerceCancellation(lifecycle, evidence, finalizer);
}

export async function reconcileFlightCommerceNoActiveTicket(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightNoActiveTicketReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertNoActiveTicketReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedNoActiveTicketReconciliation(lifecycle, evidence, finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  if (lifecycle.payment.state !== "captured" && lifecycle.payment.state !== "partially_refunded") {
    throw new InvalidFlightTransitionError(`Payment state must be captured or partially_refunded; received ${lifecycle.payment.state}.`);
  }
  if (lifecycle.ticket.state !== "manual_review" && lifecycle.ticket.state !== "issued" && lifecycle.ticket.state !== "exchanged") {
    throw new InvalidFlightTransitionError(
      `Ticket state must be manual_review, issued, or exchanged; received ${lifecycle.ticket.state}.`,
    );
  }
  if (evidence.commerceId !== lifecycle.order.commerceId) {
    throw new InvalidFlightTransitionError("No-active-ticket reconciliation evidence is bound to another commerce ID.");
  }
  const expectedFailureCause: Partial<Record<FlightTicketEvent, FlightNoActiveTicketFailureCause>> = {
    reject_issuance: "ticket_issuance_rejected",
    reject_void: "ticket_void_rejected",
    reject_exchange: "ticket_exchange_rejected",
    reconcile_issued_ticket_active: "ticket_void_rejected",
    reconcile_exchanged_ticket_active: "ticket_void_rejected",
  };
  const priorTicketEvent = lifecycle.ticket.history.at(-1)?.type;
  const originalReceiptDigest = lifecycle.ticket.history.at(-1)?.coordinatedOperationReceipt?.receiptDigest;
  if (
    priorTicketEvent === undefined
    || expectedFailureCause[priorTicketEvent] !== evidence.failureCause
    || originalReceiptDigest === undefined
    || evidence.originalOperationReceiptDigest !== originalReceiptDigest
  ) {
    throw new InvalidFlightTransitionError("No-active-ticket reconciliation failure cause does not match the ambiguous ticket operation.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "ticket"]);
  const receipt = buildCoordinatedOperationReceipt("reconcile_no_active_ticket", lifecycle, [
    { lifecycle: "ticket", eventType: "reconcile_no_active_ticket", evidence: evidence.transition },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    ticket: transitionFlightTicket(
      lifecycle.ticket,
      command("reconcile_no_active_ticket", evidence.transition, receipt, evidence),
    ),
  });
  await finalizeNoActiveTicketReconciliationEvidence(
    evidence,
    currentReconciliationAggregatePrefix(lifecycle),
    nextLifecycle,
    finalizer,
  );
  return nextLifecycle;
}

export function beginFlightCommerceCompensatingRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  if (lifecycle.payment.state !== "captured" && lifecycle.payment.state !== "partially_refunded") {
    throw new InvalidFlightTransitionError(`Payment state must be captured or partially_refunded; received ${lifecycle.payment.state}.`);
  }
  const reconciledOrderAbsent = lifecycle.order.state === "order_absent" && lifecycle.ticket.state === "not_started";
  const latestTicketAbsence = lifecycle.ticket.history.at(-1)?.noActiveTicketReconciliation;
  const latestOrderReconciliation = lifecycle.order.history.at(-1)?.ambiguityReconciliation;
  const cancelledOrderWithPreviouslyActiveTicket = latestOrderReconciliation?.operation === "cancel_order"
    && [
      "ticketed_order_cancelled_original_issued_ticket_active",
      "ticketed_order_cancelled_original_exchanged_ticket_active",
    ].includes(latestOrderReconciliation.outcome);
  const reconciledTicketAbsent = lifecycle.order.state === "manual_review"
    && lifecycle.ticket.state === "no_active_ticket"
    && latestTicketAbsence != null
    && (latestTicketAbsence.failureCause !== "ticket_void_rejected" || cancelledOrderWithPreviouslyActiveTicket);
  if (!reconciledOrderAbsent && !reconciledTicketAbsent) {
    throw new InvalidFlightTransitionError(
      "Compensating refund requires authenticated reconciliation proving either that the provider order is absent or that no active ticket document remains.",
    );
  }
  const receipt = buildCoordinatedOperationReceipt("begin_compensating_refund", lifecycle, [
    { lifecycle: "order", eventType: "begin_compensating_refund", evidence: evidence.order },
    { lifecycle: "payment", eventType: "begin_refund", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_refund", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "begin_compensating_refund", evidence.order, receipt),
  };
}

export function beginFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "cancelled", "Order state");
  if (lifecycle.payment.state !== "captured" && lifecycle.payment.state !== "partially_refunded") {
    throw new InvalidFlightTransitionError(`Payment state must be captured or partially_refunded; received ${lifecycle.payment.state}.`);
  }
  if (lifecycle.ticket.state !== "not_started" && lifecycle.ticket.state !== "voided") {
    throw new InvalidFlightTransitionError(`Ticket state must be not_started or voided; received ${lifecycle.ticket.state}.`);
  }
  const receipt = buildCoordinatedOperationReceipt("begin_refund", lifecycle, [
    { lifecycle: "order", eventType: "begin_refund", evidence: evidence.order },
    { lifecycle: "payment", eventType: "begin_refund", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_refund", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "begin_refund", evidence.order, receipt),
  };
}

export function partiallyCompleteFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "refund_pending", "Order state");
  requireState(lifecycle.payment.state, "refund_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("partially_complete_refund", lifecycle, [
    { lifecycle: "payment", eventType: "partially_refund", evidence },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("partially_refund", evidence, receipt)),
  };
}

export function continueFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightTransitionEvidence,
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "refund_pending", "Order state");
  requireState(lifecycle.payment.state, "partially_refunded", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("continue_refund", lifecycle, [
    { lifecycle: "payment", eventType: "begin_refund", evidence },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("begin_refund", evidence, receipt)),
  };
}

export function completeFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "refund_pending", "Order state");
  requireState(lifecycle.payment.state, "refund_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("complete_refund", lifecycle, [
    { lifecycle: "order", eventType: "complete_refund", evidence: evidence.order },
    { lifecycle: "payment", eventType: "fully_refund", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("fully_refund", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "complete_refund", evidence.order, receipt),
  };
}

export function rejectFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: { order: FlightTransitionEvidence; payment: FlightTransitionEvidence },
): FlightCommerceLifecycle {
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  requireState(lifecycle.order.state, "refund_pending", "Order state");
  requireState(lifecycle.payment.state, "refund_pending", "Payment state");
  const receipt = buildCoordinatedOperationReceipt("reject_refund", lifecycle, [
    { lifecycle: "order", eventType: "reject_refund", evidence: evidence.order },
    { lifecycle: "payment", eventType: "reject_refund", evidence: evidence.payment },
  ]);
  return {
    ...lifecycle,
    payment: transitionFlightPayment(lifecycle.payment, command("reject_refund", evidence.payment, receipt)),
    order: coordinatedOrderTransition(lifecycle.order, "reject_refund", evidence.order, receipt),
  };
}

export async function reconcileFlightCommerceRefund(
  lifecycle: FlightCommerceLifecycle,
  evidence: FlightAmbiguityReconciliationEvidence,
  finalizer: FlightProviderReconciliationFinalizer,
): Promise<FlightCommerceLifecycle> {
  ({ lifecycle, evidence } = snapshotFlightReconciliationInputs(lifecycle, evidence));
  assertFlightCommerceLifecycleIntegrity(lifecycle);
  assertAmbiguityReconciliationStructure(evidence);
  const persistedRetry = await resumePersistedAmbiguityReconciliation(lifecycle, evidence, "refund_payment", finalizer);
  if (persistedRetry !== null) return persistedRetry;
  requireState(lifecycle.order.state, "manual_review", "Order state");
  requireState(lifecycle.payment.state, "manual_review", "Payment state");
  if (
    lifecycle.order.history.at(-1)?.type !== "reject_refund"
    || lifecycle.payment.history.at(-1)?.type !== "reject_refund"
    || evidence.operation !== "refund_payment"
    || ![
      "payment_still_captured",
      "payment_partially_refunded",
      "payment_fully_refunded",
    ].includes(evidence.outcome)
    || evidence.commerceId !== lifecycle.order.commerceId
  ) {
    throw new InvalidFlightTransitionError("Refund reconciliation does not match the ambiguous refund attempt.");
  }
  assertOriginalCoordinatedOperationReceipt(lifecycle, evidence.originalOperationReceiptDigest, ["order", "payment"]);
  const orderEvent = evidence.outcome === "payment_still_captured"
    ? "reconcile_refund_still_captured"
    : evidence.outcome === "payment_partially_refunded"
      ? "reconcile_refund_partially_completed"
      : "reconcile_refund_fully_completed";
  const paymentEvent = orderEvent;
  const operation = orderEvent;
  const paymentEvidence = evidence.transitions.payment!;
  const receipt = buildCoordinatedOperationReceipt(operation, lifecycle, [
    { lifecycle: "order", eventType: orderEvent, evidence: evidence.transitions.order },
    { lifecycle: "payment", eventType: paymentEvent, evidence: paymentEvidence },
  ]);
  const nextLifecycle = prepareFlightReconciliationResult({
    ...lifecycle,
    order: coordinatedOrderTransition(lifecycle.order, orderEvent, evidence.transitions.order, receipt, evidence),
    payment: transitionFlightPayment(lifecycle.payment, command(paymentEvent, paymentEvidence, receipt, undefined, evidence)),
  });
  await finalizeAmbiguityReconciliationEvidence(evidence, currentReconciliationAggregatePrefix(lifecycle), nextLifecycle, finalizer);
  return nextLifecycle;
}
