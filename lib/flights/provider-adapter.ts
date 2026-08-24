import { createHash } from "node:crypto";
import {
  type FlightCommerceSearchRequest,
  type FlightMoney,
  type FlightOfferSnapshot,
  type FlightOrderState,
  type FlightPaymentState,
  type FlightTicketState,
  validateFlightCommerceSearchRequest,
  validateFlightOfferSnapshot,
} from "./commerce-domain";
import {
  assertFlightRuntimeAuthorized,
  buildFlightIdempotencyIntent,
  canonicalFlightJson,
  digestFlightRuntimeSettlementBinding,
  type FlightCanonicalJsonValue,
  type FlightIdempotencyIntent,
  type FlightRuntimePolicy,
  type FlightRuntimeActionContext,
  type FlightRuntimeAuthorizationDecision,
  type FlightRuntimePaymentBinding,
  type FlightRuntimeProviderBinding,
  type FlightRuntimeSettlementBinding,
  type FlightRuntimeProvider,
  type FlightRuntimeOperation,
  type FlightWebhookVerificationResult,
  sha256FlightEvidence,
  snapshotFlightRuntimeActionContext,
} from "./runtime-safety";

export const FLIGHT_SYNTHETIC_ADAPTER_MODE = "disabled_by_default_synthetic_fixture" as const;
export const SYNTHETIC_FLIGHT_PROVIDER_ID = "synthetic_flight_fixture_v1" as const;

export type FlightProviderSource = FlightOfferSnapshot["source"];
export type FlightProviderAdapterMode = FlightProviderSource;
export type FlightProviderOrderState = Extract<FlightOrderState, "order_pending" | "order_confirmed" | "failed" | "manual_review">;
export type FlightProviderTicketingState = Extract<
  FlightTicketState,
  "issuance_pending" | "issued" | "void_pending" | "voided" | "exchange_pending" | "exchanged" | "failed" | "manual_review"
>;
export type FlightProviderCancellationState = Extract<FlightOrderState, "cancellation_pending" | "cancelled" | "failed" | "manual_review">;

export type FlightProviderSearchResult = {
  providerId: string;
  source: FlightProviderSource;
  requestDigest: string;
  offers: readonly FlightOfferSnapshot[];
  retrievedAt: string;
  externalSideEffect: boolean;
};

export type FlightProviderRepriceResult = {
  providerId: string;
  source: FlightProviderSource;
  originalOfferId: string;
  repricedOffer: FlightOfferSnapshot;
  priceChanged: boolean;
  repricedAt: string;
  externalSideEffect: boolean;
};

type FlightProviderCreateOrderResultEvidence = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  offerId: string;
  acceptedTermsDigest: string;
  offerRefreshReceiptDigest: string;
  total: FlightMoney;
  providerReferenceDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderCreateOrderResult = FlightProviderCreateOrderResultEvidence & (
  | {
    orderState: "order_pending";
    ticketState: "not_started" | "issuance_pending";
    ticketReferenceDigests: readonly [];
  }
  | {
    orderState: "order_confirmed";
    ticketState: "not_started" | "issuance_pending";
    ticketReferenceDigests: readonly [];
  }
  | {
    orderState: "order_confirmed";
    ticketState: "issued" | "exchanged";
    ticketReferenceDigests: readonly [string, ...string[]];
  }
  | {
    orderState: "failed";
    ticketState: "failed";
    ticketReferenceDigests: readonly [];
  }
  | {
    orderState: "manual_review";
    ticketState: "manual_review";
    ticketReferenceDigests: readonly [];
  }
);

export type FlightProviderChangeOrderResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  offerId: string;
  orderState: FlightProviderOrderState;
  ticketState: "not_started";
  providerReferenceDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderOrderResult = FlightProviderCreateOrderResult | FlightProviderChangeOrderResult;

export type FlightProviderTicketingResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  ticketState: FlightProviderTicketingState;
  ticketReferenceDigests: readonly string[];
  providerReferenceDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderCancellationResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  cancellationState: FlightProviderCancellationState;
  refundableAmount: FlightMoney | null;
  providerReferenceDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderPaymentResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  paymentState: Extract<FlightPaymentState, "authorized" | "captured" | "voided" | "partially_refunded" | "refunded" | "failed" | "manual_review">;
  amount: FlightMoney;
  processorReferenceDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderWebhookResult = {
  providerId: string;
  source: FlightProviderSource;
  eventId: string;
  bodyDigest: string;
  outcomeDigest: string;
  externalSideEffect: boolean;
};

export type FlightProviderCreateOrderReconciliationResult = {
  providerId: string;
  source: FlightProviderSource;
  offerId: string;
  orderId: string | null;
  operation: "create_order";
  originalOperationReceiptDigest: string;
  providerOperationRequestReceiptDigest: string;
  providerStatusReceiptDigest: string;
  resourceReceiptDigests: readonly string[];
  outcome: "order_confirmed" | "order_absent" | "order_ticketed" | "ambiguous";
  ticketOutcome: "no_active_ticket_documents" | "issued" | "exchanged" | "ambiguous" | null;
  externalSideEffect: boolean;
};

export type FlightProviderCancelOrderReconciliationResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  operation: "cancel_order";
  originalOperationReceiptDigest: string;
  providerOperationRequestReceiptDigest: string;
  originalTicketDocumentReceiptDigests: readonly string[];
  providerStatusReceiptDigest: string;
  resourceReceiptDigests: readonly string[];
  outcome: "order_cancelled" | "order_cancelled_ticket_active" | "order_confirmed" | "order_absent" | "ambiguous";
  ticketOutcome: "no_active_ticket_documents" | "issued" | "exchanged" | "voided" | "ambiguous";
  externalSideEffect: boolean;
};

export type FlightProviderReconciliationResult =
  | FlightProviderCreateOrderReconciliationResult
  | FlightProviderCancelOrderReconciliationResult;

export type FlightProviderPaymentReconciliationResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  operation: "authorize_payment" | "capture_payment" | "void_payment" | "refund_payment";
  originalOperationReceiptDigest: string;
  paymentAttemptReceiptDigest: string;
  processorOperationReferenceDigest: string | null;
  expectedAmount: FlightMoney;
  providerStatusReceiptDigest: string;
  resourceReceiptDigests: readonly string[];
  outcome:
    | "payment_authorized"
    | "payment_authorization_absent"
    | "payment_captured"
    | "payment_not_captured_no_authorization"
    | "payment_not_captured_authorization_active"
    | "payment_not_captured_authorization_voided"
    | "payment_voided"
    | "payment_authorization_active"
    | "payment_still_captured"
    | "payment_partially_refunded"
    | "payment_fully_refunded"
    | "ambiguous";
  externalSideEffect: boolean;
};

export type FlightProviderTicketReconciliationResult = {
  providerId: string;
  source: FlightProviderSource;
  orderId: string;
  operation: "issue_ticket" | "void_ticket" | "exchange_ticket";
  originalOperationReceiptDigest: string;
  originalTicketDocumentReceiptDigests: readonly string[];
  providerStatusReceiptDigest: string;
  ticketReferenceDigests: readonly string[];
  outcome:
    | "tickets_issued"
    | "tickets_exchanged"
    | "tickets_voided"
    | "original_issued_ticket_active"
    | "original_exchanged_ticket_active"
    | "no_active_ticket_documents"
    | "ambiguous";
  externalSideEffect: boolean;
};

export type FlightProviderTravelerBinding = Readonly<{
  travelerRef: string;
  piiRecordDigest: string;
}>;

export type FlightProviderSettlementIntent = Readonly<{
  method: "provider_balance";
  amount: FlightMoney;
  settlementBindingDigest: string;
}>;

export type FlightProviderCreateOrderInput = {
  offerId: string;
  acceptedTermsDigest: string;
  offerRefreshReceiptDigest: string;
  total: FlightMoney;
  travelers: readonly FlightProviderTravelerBinding[];
  settlementIntent: FlightProviderSettlementIntent;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderChangeOrderInput = {
  orderId: string;
  changeRequestDigest: string;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderPaymentInput = {
  orderId: string;
  amount: FlightMoney;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderPaymentVoidInput = {
  orderId: string;
  authorizationReferenceDigest: string;
  expectedAmount: FlightMoney;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderIssueTicketsInput = {
  orderId: string;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderVoidTicketsInput = {
  orderId: string;
  ticketReferenceDigests: readonly string[];
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderExchangeTicketsInput = {
  orderId: string;
  ticketReferenceDigests: readonly string[];
  exchangeRequestDigest: string;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderCancelOrderInput = {
  orderId: string;
  idempotency: FlightIdempotencyIntent;
};

export type FlightProviderWebhookInput = { eventId: string; bodyDigest: string };
export type FlightProviderReconcileCreateOrderInput = {
  operation: "create_order";
  offerId: string;
  originalOperationReceiptDigest: string;
  providerOperationRequestReceiptDigest: string;
  requestDigest: string;
};
export type FlightProviderReconcileCancelOrderInput = {
  operation: "cancel_order";
  orderId: string;
  originalOperationReceiptDigest: string;
  providerOperationRequestReceiptDigest: string;
  originalTicketDocumentReceiptDigests: readonly string[];
  requestDigest: string;
};
export type FlightProviderReconcileOrderInput =
  | FlightProviderReconcileCreateOrderInput
  | FlightProviderReconcileCancelOrderInput;
export type FlightProviderReconcilePaymentInput = {
  orderId: string;
  operation: "authorize_payment" | "capture_payment" | "void_payment" | "refund_payment";
  originalOperationReceiptDigest: string;
  paymentAttemptReceiptDigest: string;
  processorOperationReferenceDigest: string | null;
  expectedAmount: FlightMoney;
  requestDigest: string;
};
export type FlightProviderReconcileTicketsInput = {
  orderId: string;
  operation: "issue_ticket" | "void_ticket" | "exchange_ticket";
  originalOperationReceiptDigest: string;
  originalTicketDocumentReceiptDigests: readonly string[];
  requestDigest: string;
};

export type FlightProviderOperationInputMap = {
  search: FlightCommerceSearchRequest;
  reprice: FlightOfferSnapshot;
  create_order: FlightProviderCreateOrderInput;
  change_order: FlightProviderChangeOrderInput;
  cancel_order: FlightProviderCancelOrderInput;
  authorize_payment: FlightProviderPaymentInput;
  capture_payment: FlightProviderPaymentInput;
  refund_payment: FlightProviderPaymentInput;
  void_payment: FlightProviderPaymentVoidInput;
  issue_ticket: FlightProviderIssueTicketsInput;
  void_ticket: FlightProviderVoidTicketsInput;
  exchange_ticket: FlightProviderExchangeTicketsInput;
  process_webhook: FlightProviderWebhookInput;
  reconcile_order: FlightProviderReconcileOrderInput;
  reconcile_payment: FlightProviderReconcilePaymentInput;
  reconcile_tickets: FlightProviderReconcileTicketsInput;
};

export type FlightProviderOperationResultMap = {
  search: FlightProviderSearchResult;
  reprice: FlightProviderRepriceResult;
  create_order: FlightProviderCreateOrderResult;
  change_order: FlightProviderChangeOrderResult;
  cancel_order: FlightProviderCancellationResult;
  authorize_payment: FlightProviderPaymentResult;
  capture_payment: FlightProviderPaymentResult;
  refund_payment: FlightProviderPaymentResult;
  void_payment: FlightProviderPaymentResult;
  issue_ticket: FlightProviderTicketingResult;
  void_ticket: FlightProviderTicketingResult;
  exchange_ticket: FlightProviderTicketingResult;
  process_webhook: FlightProviderWebhookResult;
  reconcile_order: FlightProviderReconciliationResult;
  reconcile_payment: FlightProviderPaymentReconciliationResult;
  reconcile_tickets: FlightProviderTicketReconciliationResult;
};

/** Only implementations constructed inside this module can satisfy this private runtime guard. */
const flightProviderAdapterGuard = Symbol("flight-provider-adapter-guard");
const guardedFlightProviderAdapters = new WeakSet<object>();

export interface FlightProviderAdapter {
  readonly [flightProviderAdapterGuard]: true;
  readonly providerId: string;
  readonly mode: FlightProviderAdapterMode;
  readonly externalNetworkAccess: boolean;
  readonly supportsLiveTraffic: boolean;
  readonly executionBinding: FlightRuntimeProviderBinding | null;
  readonly paymentExecutionBinding: FlightRuntimePaymentBinding | null;
  readonly settlementExecutionBinding: FlightRuntimeSettlementBinding | null;
  search(request: FlightCommerceSearchRequest, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderSearchResult>;
  reprice(offer: FlightOfferSnapshot, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderRepriceResult>;
  createOrder(input: FlightProviderCreateOrderInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderCreateOrderResult>;
  changeOrder(input: FlightProviderChangeOrderInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderChangeOrderResult>;
  authorizePayment(input: FlightProviderPaymentInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult>;
  capturePayment(input: FlightProviderPaymentInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult>;
  refundPayment(input: FlightProviderPaymentInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult>;
  voidPayment(input: FlightProviderPaymentVoidInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult>;
  issueTickets(input: FlightProviderIssueTicketsInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult>;
  voidTickets(input: FlightProviderVoidTicketsInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult>;
  exchangeTickets(input: FlightProviderExchangeTicketsInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult>;
  cancelOrder(input: FlightProviderCancelOrderInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderCancellationResult>;
  processWebhook(input: FlightProviderWebhookInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderWebhookResult>;
  reconcileOrder(input: FlightProviderReconcileOrderInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderReconciliationResult>;
  reconcilePayment(input: FlightProviderReconcilePaymentInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentReconciliationResult>;
  reconcileTickets(input: FlightProviderReconcileTicketsInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketReconciliationResult>;
}

export class FlightProviderAdapterDisabledError extends Error {
  constructor() {
    super("Synthetic flight adapter is disabled at construction time.");
    this.name = "FlightProviderAdapterDisabledError";
  }
}

export class FlightProviderFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightProviderFixtureError";
  }
}

export class FlightProviderRequestBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightProviderRequestBindingError";
  }
}

type FlightProviderAdapterIdentity = Pick<
  FlightProviderAdapter,
  | typeof flightProviderAdapterGuard
  | "providerId"
  | "mode"
  | "externalNetworkAccess"
  | "supportsLiveTraffic"
  | "executionBinding"
  | "paymentExecutionBinding"
  | "settlementExecutionBinding"
>;

type FlightProviderDigestIdentity = Pick<
  FlightProviderAdapter,
  "providerId" | "mode" | "executionBinding" | "paymentExecutionBinding"
> & Readonly<{
  settlementExecutionBinding?: FlightRuntimeSettlementBinding | null;
}>;

const providerIdempotentOperations = new Set<keyof FlightProviderOperationInputMap>([
  "create_order",
  "change_order",
  "cancel_order",
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "issue_ticket",
  "void_ticket",
  "exchange_ticket",
]);

const providerPaymentBindingOperations = new Set<keyof FlightProviderOperationInputMap>([
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "reconcile_payment",
]);

function exactProviderInputRecord(value: unknown, expectedKeys: readonly string[], label: string): Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const prototype = Object.getPrototypeOf(value) as object | null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actualKeys = Object.keys(value).sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    if (
      (prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor))
      || actualKeys.length !== sortedExpectedKeys.length
      || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
    ) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new FlightProviderRequestBindingError(`${label} contains malformed or unreviewed fields.`);
  }
}

function canonicalMoney(value: unknown): FlightCanonicalJsonValue {
  const money = exactProviderInputRecord(value, ["currency", "amountMinor"], "Flight money");
  if (
    typeof money.currency !== "string"
    || !/^[A-Z]{3}$/.test(money.currency)
    || typeof money.amountMinor !== "number"
    || !Number.isSafeInteger(money.amountMinor)
    || money.amountMinor < 0
  ) throw new FlightProviderRequestBindingError("Flight money is malformed.");
  return { currency: money.currency as string, amountMinor: money.amountMinor as number };
}

function canonicalSettlementBinding(value: unknown): FlightRuntimeSettlementBinding {
  const binding = exactProviderInputRecord(
    value,
    ["providerId", "method", "accountScopeReceiptDigest", "environmentScopeReceiptDigest", "currency"],
    "Flight settlement execution binding",
  );
  if (binding.method !== "provider_balance" || typeof binding.currency !== "string" || !/^[A-Z]{3}$/.test(binding.currency)) {
    throw new FlightProviderRequestBindingError("Flight settlement execution binding is malformed.");
  }
  return {
    providerId: stableProviderToken(binding.providerId, "Flight settlement provider ID"),
    method: "provider_balance",
    accountScopeReceiptDigest: providerDigest(binding.accountScopeReceiptDigest, "Flight settlement account-scope digest")!,
    environmentScopeReceiptDigest: providerDigest(binding.environmentScopeReceiptDigest, "Flight settlement environment-scope digest")!,
    currency: binding.currency,
  };
}

function stableProviderToken(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
    throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  }
  return value;
}

function providerDigest(value: unknown, label: string, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  }
  return value;
}

function providerDigestList(value: unknown, label: string, minimum = 0) {
  if (!Array.isArray(value)) throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  canonicalFlightJson(value as FlightCanonicalJsonValue);
  if (
    value.length < minimum
    || value.length > 12
    || value.some((item) => typeof item !== "string" || !/^[0-9a-f]{64}$/.test(item))
    || new Set(value).size !== value.length
    || value.some((item, index) => index > 0 && value[index - 1]! >= item)
  ) throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  return [...value] as string[];
}

function canonicalSearch(value: unknown): FlightCanonicalJsonValue {
  const search = exactProviderInputRecord(
    value,
    ["origin", "destination", "departureDate", "returnDate", "cabin", "passengers"],
    "Flight search",
  );
  const passengers = exactProviderInputRecord(
    search.passengers,
    ["adults", "children", "infantsInSeat", "infantsOnLap"],
    "Flight passenger counts",
  );
  const typed = value as FlightCommerceSearchRequest;
  const validation = validateFlightCommerceSearchRequest(typed);
  if (!validation.valid) throw new FlightProviderRequestBindingError(validation.errors.join(" "));
  return {
    origin: search.origin as string,
    destination: search.destination as string,
    departureDate: search.departureDate as string,
    returnDate: search.returnDate as string | null,
    cabin: search.cabin as string,
    passengers: {
      adults: passengers.adults as number,
      children: passengers.children as number,
      infantsInSeat: passengers.infantsInSeat as number,
      infantsOnLap: passengers.infantsOnLap as number,
    },
  };
}

function canonicalOffer(value: unknown): FlightCanonicalJsonValue {
  const offer = exactProviderInputRecord(
    value,
    ["offerId", "providerId", "searchDigest", "termsDigest", "expiresAt", "total", "segments", "source"],
    "Flight offer",
  );
  if (!Array.isArray(offer.segments)) throw new FlightProviderRequestBindingError("Flight offer segments are malformed.");
  const segments = offer.segments.map((segment) => {
    const record = exactProviderInputRecord(
      segment,
      ["segmentId", "marketingCarrier", "marketingFlightNumber", "origin", "destination", "departsAt", "arrivesAt"],
      "Flight segment",
    );
    return {
      segmentId: record.segmentId as string,
      marketingCarrier: record.marketingCarrier as string,
      marketingFlightNumber: record.marketingFlightNumber as string,
      origin: record.origin as string,
      destination: record.destination as string,
      departsAt: record.departsAt as string,
      arrivesAt: record.arrivesAt as string,
    };
  });
  const typed = value as FlightOfferSnapshot;
  const validation = validateFlightOfferSnapshot(typed);
  if (!validation.valid) throw new FlightProviderRequestBindingError(validation.errors.join(" "));
  return {
    offerId: offer.offerId as string,
    providerId: offer.providerId as string,
    searchDigest: offer.searchDigest as string,
    termsDigest: offer.termsDigest as string,
    expiresAt: offer.expiresAt as string,
    total: canonicalMoney(offer.total),
    segments,
    source: offer.source as string,
  };
}

function canonicalProviderOperationPayload(
  operation: keyof FlightProviderOperationInputMap,
  input: FlightProviderOperationInputMap[keyof FlightProviderOperationInputMap],
): FlightCanonicalJsonValue {
  if (operation === "search") return canonicalSearch(input);
  if (operation === "reprice") return canonicalOffer(input);
  const keysByOperation: Record<Exclude<keyof FlightProviderOperationInputMap, "search" | "reprice">, readonly string[]> = {
    create_order: [
      "offerId", "acceptedTermsDigest", "offerRefreshReceiptDigest", "total", "travelers", "settlementIntent", "idempotency",
    ],
    change_order: ["orderId", "changeRequestDigest", "idempotency"],
    cancel_order: ["orderId", "idempotency"],
    authorize_payment: ["orderId", "amount", "idempotency"],
    capture_payment: ["orderId", "amount", "idempotency"],
    refund_payment: ["orderId", "amount", "idempotency"],
    void_payment: ["orderId", "authorizationReferenceDigest", "expectedAmount", "idempotency"],
    issue_ticket: ["orderId", "idempotency"],
    void_ticket: ["orderId", "ticketReferenceDigests", "idempotency"],
    exchange_ticket: ["orderId", "ticketReferenceDigests", "exchangeRequestDigest", "idempotency"],
    process_webhook: ["eventId", "bodyDigest"],
    reconcile_order: ["operation"],
    reconcile_payment: ["orderId", "operation", "originalOperationReceiptDigest", "paymentAttemptReceiptDigest", "processorOperationReferenceDigest", "expectedAmount", "requestDigest"],
    reconcile_tickets: ["orderId", "operation", "originalOperationReceiptDigest", "originalTicketDocumentReceiptDigests", "requestDigest"],
  };
  const typedOperation = operation as Exclude<keyof FlightProviderOperationInputMap, "search" | "reprice">;
  let expectedKeys = keysByOperation[typedOperation];
  if (operation === "reconcile_order") {
    let discriminator: unknown;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(input as object, "operation");
      discriminator = descriptor && descriptor.enumerable && "value" in descriptor ? descriptor.value : undefined;
    } catch {
      discriminator = undefined;
    }
    expectedKeys = discriminator === "create_order"
      ? ["operation", "offerId", "originalOperationReceiptDigest", "providerOperationRequestReceiptDigest", "requestDigest"]
      : discriminator === "cancel_order"
        ? ["operation", "orderId", "originalOperationReceiptDigest", "providerOperationRequestReceiptDigest", "originalTicketDocumentReceiptDigests", "requestDigest"]
        : ["operation"];
  }
  const record = exactProviderInputRecord(input, expectedKeys, `Flight ${operation} request`);
  switch (operation) {
    case "create_order":
      if (!Array.isArray(record.travelers) || record.travelers.length < 1 || record.travelers.length > 9) {
        throw new FlightProviderRequestBindingError("Flight traveler bindings are malformed.");
      }
      canonicalFlightJson(record.travelers as FlightCanonicalJsonValue);
      const travelers = record.travelers.map((traveler) => {
        const binding = exactProviderInputRecord(traveler, ["travelerRef", "piiRecordDigest"], "Flight traveler binding");
        return {
          travelerRef: stableProviderToken(binding.travelerRef, "Flight traveler reference"),
          piiRecordDigest: providerDigest(binding.piiRecordDigest, "Flight traveler PII-record digest")!,
        };
      });
      if (
        new Set(travelers.map(({ travelerRef }) => travelerRef)).size !== travelers.length
        || new Set(travelers.map(({ piiRecordDigest }) => piiRecordDigest)).size !== travelers.length
      ) {
        throw new FlightProviderRequestBindingError("Flight traveler bindings are malformed.");
      }
      const total = canonicalMoney(record.total);
      const settlementIntent = exactProviderInputRecord(
        record.settlementIntent,
        ["method", "amount", "settlementBindingDigest"],
        "Flight settlement intent",
      );
      if (settlementIntent.method !== "provider_balance") {
        throw new FlightProviderRequestBindingError("Flight settlement intent method is malformed.");
      }
      const settlementAmount = canonicalMoney(settlementIntent.amount);
      if (canonicalFlightJson(total) !== canonicalFlightJson(settlementAmount)) {
        throw new FlightProviderRequestBindingError("Flight settlement intent amount does not match the exact order total.");
      }
      return {
        offerId: stableProviderToken(record.offerId, "Flight offer ID"),
        acceptedTermsDigest: providerDigest(record.acceptedTermsDigest, "Accepted flight terms digest")!,
        offerRefreshReceiptDigest: providerDigest(record.offerRefreshReceiptDigest, "Flight offer-refresh receipt digest")!,
        total,
        travelers,
        settlementIntent: {
          method: "provider_balance",
          amount: settlementAmount,
          settlementBindingDigest: providerDigest(settlementIntent.settlementBindingDigest, "Flight settlement-binding digest")!,
        },
      };
    case "change_order":
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        changeRequestDigest: providerDigest(record.changeRequestDigest, "Flight change-request digest")!,
      };
    case "cancel_order":
    case "issue_ticket":
      return { orderId: stableProviderToken(record.orderId, "Flight order ID") };
    case "authorize_payment":
    case "capture_payment":
    case "refund_payment":
      return { orderId: stableProviderToken(record.orderId, "Flight order ID"), amount: canonicalMoney(record.amount) };
    case "void_payment":
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        authorizationReferenceDigest: providerDigest(record.authorizationReferenceDigest, "Payment authorization-reference digest")!,
        expectedAmount: canonicalMoney(record.expectedAmount),
      };
    case "void_ticket":
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        ticketReferenceDigests: providerDigestList(record.ticketReferenceDigests, "Ticket-reference digests", 1),
      };
    case "exchange_ticket":
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        ticketReferenceDigests: providerDigestList(record.ticketReferenceDigests, "Ticket-reference digests", 1),
        exchangeRequestDigest: providerDigest(record.exchangeRequestDigest, "Ticket exchange-request digest")!,
      };
    case "process_webhook":
      return {
        eventId: stableProviderToken(record.eventId, "Flight webhook event ID"),
        bodyDigest: providerDigest(record.bodyDigest, "Flight webhook body digest")!,
      };
    case "reconcile_order":
      if (record.operation !== "create_order" && record.operation !== "cancel_order") {
        throw new FlightProviderRequestBindingError("Reconciled flight order operation is malformed.");
      }
      if (record.operation === "create_order") {
        return {
          operation: "create_order",
          offerId: stableProviderToken(record.offerId, "Flight offer ID"),
          originalOperationReceiptDigest: providerDigest(record.originalOperationReceiptDigest, "Original operation-receipt digest")!,
          providerOperationRequestReceiptDigest: providerDigest(record.providerOperationRequestReceiptDigest, "Provider operation-request receipt digest")!,
          requestDigest: providerDigest(record.requestDigest, "Reconciliation request digest")!,
        };
      }
      return {
        operation: "cancel_order",
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        originalOperationReceiptDigest: providerDigest(record.originalOperationReceiptDigest, "Original operation-receipt digest")!,
        providerOperationRequestReceiptDigest: providerDigest(record.providerOperationRequestReceiptDigest, "Provider operation-request receipt digest")!,
        originalTicketDocumentReceiptDigests: providerDigestList(record.originalTicketDocumentReceiptDigests, "Original ticket-document receipt digests"),
        requestDigest: providerDigest(record.requestDigest, "Reconciliation request digest")!,
      };
    case "reconcile_payment":
      if (!["authorize_payment", "capture_payment", "void_payment", "refund_payment"].includes(record.operation as string)) {
        throw new FlightProviderRequestBindingError("Payment reconciliation operation is malformed.");
      }
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        operation: record.operation as FlightProviderReconcilePaymentInput["operation"],
        originalOperationReceiptDigest: providerDigest(record.originalOperationReceiptDigest, "Original operation-receipt digest")!,
        paymentAttemptReceiptDigest: providerDigest(record.paymentAttemptReceiptDigest, "Payment attempt-receipt digest")!,
        processorOperationReferenceDigest: providerDigest(record.processorOperationReferenceDigest, "Processor operation-reference digest", true),
        expectedAmount: canonicalMoney(record.expectedAmount),
        requestDigest: providerDigest(record.requestDigest, "Reconciliation request digest")!,
      };
    case "reconcile_tickets":
      if (!["issue_ticket", "void_ticket", "exchange_ticket"].includes(record.operation as string)) {
        throw new FlightProviderRequestBindingError("Ticket reconciliation operation is malformed.");
      }
      return {
        orderId: stableProviderToken(record.orderId, "Flight order ID"),
        operation: record.operation as FlightProviderReconcileTicketsInput["operation"],
        originalOperationReceiptDigest: providerDigest(record.originalOperationReceiptDigest, "Original operation-receipt digest")!,
        originalTicketDocumentReceiptDigests: providerDigestList(record.originalTicketDocumentReceiptDigests, "Original ticket-document receipt digests"),
        requestDigest: providerDigest(record.requestDigest, "Reconciliation request digest")!,
      };
    default:
      throw new FlightProviderRequestBindingError("Flight provider operation is not recognized.");
  }
}

export type FlightProviderOperationRequestBinding = {
  requestDigest: string;
  idempotencyRequestDigest: string | null;
  settlementBindingDigest: string | null;
};

function reviewFlightProviderOperationRequest<K extends keyof FlightProviderOperationInputMap>(
  adapter: FlightProviderDigestIdentity,
  operation: K,
  input: FlightProviderOperationInputMap[K],
): { binding: FlightProviderOperationRequestBinding; input: FlightProviderOperationInputMap[K] } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(adapter.providerId)) {
    throw new FlightProviderRequestBindingError("Flight provider identity is malformed.");
  }
  const payload = canonicalProviderOperationPayload(operation, input);
  let idempotencyRequestDigest: string | null = null;
  let settlementBindingDigest: string | null = null;
  if (operation === "create_order" && adapter.mode !== "synthetic_fixture") {
    if (adapter.settlementExecutionBinding === null || adapter.settlementExecutionBinding === undefined) {
      throw new FlightProviderRequestBindingError("Flight create_order requires an exact settlement execution binding.");
    }
    const settlementBinding = canonicalSettlementBinding(adapter.settlementExecutionBinding);
    const createOrder = input as FlightProviderCreateOrderInput;
    settlementBindingDigest = digestFlightRuntimeSettlementBinding(settlementBinding);
    if (
      createOrder.settlementIntent.settlementBindingDigest !== settlementBindingDigest
      || createOrder.settlementIntent.method !== settlementBinding.method
      || createOrder.total.currency !== settlementBinding.currency
    ) {
      throw new FlightProviderRequestBindingError("Flight create_order settlement intent is bound to another exact settlement authority.");
    }
  }
  if (providerIdempotentOperations.has(operation)) {
    const actual = (input as { idempotency?: FlightIdempotencyIntent }).idempotency;
    if (actual === undefined) throw new FlightProviderRequestBindingError("Flight idempotency evidence is missing.");
    const expected = buildFlightIdempotencyIntent({
      operation: operation as FlightIdempotencyIntent["operation"],
      scopeId: actual.scopeId,
      requestId: actual.requestId,
      payload,
    });
    if (canonicalFlightJson(actual as unknown as FlightCanonicalJsonValue) !== canonicalFlightJson(expected)) {
      throw new FlightProviderRequestBindingError("Flight idempotency evidence is bound to another exact operation request.");
    }
    idempotencyRequestDigest = actual.requestDigest;
  }
  const binding = Object.freeze({
    requestDigest: sha256FlightEvidence({
      version: "flight-provider-operation-request-v1",
      operation,
      providerId: adapter.providerId,
      providerMode: adapter.mode,
      payload,
    }),
    idempotencyRequestDigest,
    settlementBindingDigest,
  });
  const canonicalInput = canonicalFlightJson(input as unknown as FlightCanonicalJsonValue);
  const inputSnapshot = deepFreezeFixture(JSON.parse(canonicalInput) as FlightProviderOperationInputMap[K]);
  return Object.freeze({ binding, input: inputSnapshot });
}

export function buildFlightProviderOperationRequestBinding<K extends keyof FlightProviderOperationInputMap>(
  adapter: FlightProviderDigestIdentity,
  operation: K,
  input: FlightProviderOperationInputMap[K],
): FlightProviderOperationRequestBinding {
  return reviewFlightProviderOperationRequest(adapter, operation, input).binding;
}

function runtimeProviderForAdapter(mode: FlightProviderAdapterMode): FlightRuntimeProvider {
  if (mode === "synthetic_fixture") return "synthetic";
  if (mode === "provider_sandbox" || mode === "provider_production") return mode;
  throw new FlightProviderRequestBindingError("Flight provider adapter mode is malformed.");
}

export async function assertFlightProviderOperationAuthorized<K extends keyof FlightProviderOperationInputMap>(
  adapter: FlightProviderAdapterIdentity,
  operation: K,
  input: FlightProviderOperationInputMap[K],
  policy: FlightRuntimePolicy,
  context: FlightRuntimeActionContext,
) {
  if (!guardedFlightProviderAdapters.has(adapter as object) || adapter[flightProviderAdapterGuard] !== true) {
    throw new FlightProviderRequestBindingError("Flight provider adapter is not a guarded implementation.");
  }
  const actionContext = snapshotFlightRuntimeActionContext(context);
  if (actionContext === null) throw new FlightProviderRequestBindingError("Flight action context is malformed.");
  const reviewed = reviewFlightProviderOperationRequest(adapter, operation, input);
  const binding = reviewed.binding;
  const runtimeProvider = runtimeProviderForAdapter(adapter.mode);
  if (runtimeProvider === "synthetic") {
    if (
      adapter.executionBinding !== null
      || adapter.paymentExecutionBinding !== null
      || adapter.settlementExecutionBinding !== null
      || adapter.externalNetworkAccess
      || adapter.supportsLiveTraffic
    ) {
      throw new FlightProviderRequestBindingError("Synthetic adapter identity cannot contain live execution bindings.");
    }
  } else {
    if (!adapter.externalNetworkAccess || !adapter.supportsLiveTraffic) {
      throw new FlightProviderRequestBindingError("Live provider adapter capability evidence is malformed.");
    }
    if (
      adapter.executionBinding === null
      || adapter.executionBinding.providerId !== adapter.providerId
      || actionContext.executionBinding === null
      || actionContext.executionBinding === undefined
      || canonicalFlightJson(adapter.executionBinding) !== canonicalFlightJson(actionContext.executionBinding)
    ) {
      throw new FlightProviderRequestBindingError("Action context is bound to another provider adapter.");
    }
    if (providerPaymentBindingOperations.has(operation)) {
      if (
        adapter.paymentExecutionBinding === null
        || actionContext.paymentExecutionBinding === null
        || actionContext.paymentExecutionBinding === undefined
        || canonicalFlightJson(adapter.paymentExecutionBinding) !== canonicalFlightJson(actionContext.paymentExecutionBinding)
      ) {
        throw new FlightProviderRequestBindingError("Action context is bound to another payment adapter.");
      }
    }
    if (operation === "create_order") {
      if (
        adapter.settlementExecutionBinding === null
        || actionContext.settlementExecutionBinding === null
        || actionContext.settlementExecutionBinding === undefined
        || canonicalFlightJson(adapter.settlementExecutionBinding) !== canonicalFlightJson(actionContext.settlementExecutionBinding)
        || binding.settlementBindingDigest !== digestFlightRuntimeSettlementBinding(adapter.settlementExecutionBinding)
      ) {
        throw new FlightProviderRequestBindingError("Action context is bound to another settlement authority.");
      }
    }
    if (actionContext.requestDigest !== binding.requestDigest) {
      throw new FlightProviderRequestBindingError("Action context request digest is bound to another exact provider input.");
    }
    if ((actionContext.idempotencyRequestDigest ?? null) !== binding.idempotencyRequestDigest) {
      throw new FlightProviderRequestBindingError("Action context idempotency digest is bound to another exact provider input.");
    }
  }
  const authorization = await assertFlightRuntimeAuthorized(
    policy,
    operation as FlightRuntimeOperation,
    runtimeProvider,
    actionContext,
  );
  return { authorization, binding, input: reviewed.input } as const;
}

export type FlightProviderOperation = keyof FlightProviderOperationInputMap;

export type FlightProviderExecutionRequest<K extends FlightProviderOperation = FlightProviderOperation> = {
  [Operation in K]: Readonly<{
    operation: Operation;
    input: FlightProviderOperationInputMap[Operation];
    requestBinding: FlightProviderOperationRequestBinding;
    authorization: FlightRuntimeAuthorizationDecision;
  }>;
}[K];

export type FlightProviderExecutionResult<K extends FlightProviderOperation = FlightProviderOperation> =
  FlightProviderOperationResultMap[K];

/** Correlates each reviewed operation request with only its legal result shape. */
export type FlightProviderExecutor = <K extends FlightProviderOperation>(
  request: FlightProviderExecutionRequest<K>,
) => Promise<FlightProviderExecutionResult<K>>;

export type FlightProviderAdapterConfiguration = Readonly<{
  providerId: string;
  mode: Extract<FlightProviderAdapterMode, "provider_sandbox" | "provider_production">;
  executionBinding: FlightRuntimeProviderBinding;
  paymentExecutionBinding: FlightRuntimePaymentBinding | null;
  settlementExecutionBinding: FlightRuntimeSettlementBinding | null;
  execute: FlightProviderExecutor;
}>;

const providerResultKeys: Record<keyof FlightProviderOperationResultMap, readonly string[]> = {
  search: ["providerId", "source", "requestDigest", "offers", "retrievedAt", "externalSideEffect"],
  reprice: ["providerId", "source", "originalOfferId", "repricedOffer", "priceChanged", "repricedAt", "externalSideEffect"],
  create_order: [
    "providerId", "source", "orderId", "offerId", "acceptedTermsDigest", "offerRefreshReceiptDigest", "total", "orderState",
    "ticketState", "ticketReferenceDigests", "providerReferenceDigest", "externalSideEffect",
  ],
  change_order: ["providerId", "source", "orderId", "offerId", "orderState", "ticketState", "providerReferenceDigest", "externalSideEffect"],
  cancel_order: ["providerId", "source", "orderId", "cancellationState", "refundableAmount", "providerReferenceDigest", "externalSideEffect"],
  authorize_payment: ["providerId", "source", "orderId", "paymentState", "amount", "processorReferenceDigest", "externalSideEffect"],
  capture_payment: ["providerId", "source", "orderId", "paymentState", "amount", "processorReferenceDigest", "externalSideEffect"],
  refund_payment: ["providerId", "source", "orderId", "paymentState", "amount", "processorReferenceDigest", "externalSideEffect"],
  void_payment: ["providerId", "source", "orderId", "paymentState", "amount", "processorReferenceDigest", "externalSideEffect"],
  issue_ticket: ["providerId", "source", "orderId", "ticketState", "ticketReferenceDigests", "providerReferenceDigest", "externalSideEffect"],
  void_ticket: ["providerId", "source", "orderId", "ticketState", "ticketReferenceDigests", "providerReferenceDigest", "externalSideEffect"],
  exchange_ticket: ["providerId", "source", "orderId", "ticketState", "ticketReferenceDigests", "providerReferenceDigest", "externalSideEffect"],
  process_webhook: ["providerId", "source", "eventId", "bodyDigest", "outcomeDigest", "externalSideEffect"],
  reconcile_order: ["operation"],
  reconcile_payment: [
    "providerId", "source", "orderId", "operation", "originalOperationReceiptDigest", "paymentAttemptReceiptDigest",
    "processorOperationReferenceDigest", "expectedAmount", "providerStatusReceiptDigest", "resourceReceiptDigests", "outcome",
    "externalSideEffect",
  ],
  reconcile_tickets: [
    "providerId", "source", "orderId", "operation", "originalOperationReceiptDigest", "originalTicketDocumentReceiptDigests",
    "providerStatusReceiptDigest", "ticketReferenceDigests", "outcome", "externalSideEffect",
  ],
};

const providerMutatingOperations = new Set<keyof FlightProviderOperationInputMap>([
  "create_order",
  "change_order",
  "cancel_order",
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "issue_ticket",
  "void_ticket",
  "exchange_ticket",
]);

const providerOrderStates = ["order_pending", "order_confirmed", "failed", "manual_review"] as const;
const providerPaymentStatesByOperation = {
  authorize_payment: ["authorized", "failed", "manual_review"],
  capture_payment: ["captured", "failed", "manual_review"],
  refund_payment: ["partially_refunded", "refunded", "failed", "manual_review"],
  void_payment: ["voided", "failed", "manual_review"],
} as const;
const providerTicketStatesByOperation = {
  issue_ticket: ["issuance_pending", "issued", "failed", "manual_review"],
  void_ticket: ["void_pending", "voided", "failed", "manual_review"],
  exchange_ticket: ["exchange_pending", "exchanged", "failed", "manual_review"],
} as const;
const providerCancellationStates = ["cancellation_pending", "cancelled", "failed", "manual_review"] as const;
const providerPaymentReconciliationOutcomesByOperation = {
  authorize_payment: ["payment_authorized", "payment_authorization_absent", "payment_authorization_active", "ambiguous"],
  capture_payment: [
    "payment_captured",
    "payment_not_captured_no_authorization",
    "payment_not_captured_authorization_active",
    "payment_not_captured_authorization_voided",
    "ambiguous",
  ],
  void_payment: ["payment_voided", "payment_authorization_active", "ambiguous"],
  refund_payment: ["payment_still_captured", "payment_partially_refunded", "payment_fully_refunded", "ambiguous"],
} as const;
const providerTicketReconciliationOutcomesByOperation = {
  issue_ticket: ["tickets_issued", "no_active_ticket_documents", "ambiguous"],
  void_ticket: ["tickets_voided", "original_issued_ticket_active", "no_active_ticket_documents", "ambiguous"],
  exchange_ticket: [
    "tickets_exchanged",
    "original_issued_ticket_active",
    "original_exchanged_ticket_active",
    "no_active_ticket_documents",
    "ambiguous",
  ],
} as const;

function exactProviderResultEnum(value: unknown, allowed: readonly string[], label: string) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  }
  return value;
}

function exactProviderResultBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  return value;
}

function exactProviderInstant(value: unknown, label: string) {
  if (typeof value !== "string") throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlightProviderRequestBindingError(`${label} is malformed.`);
  }
  return value;
}

function equalProviderCanonical(left: unknown, right: unknown) {
  return canonicalFlightJson(left as FlightCanonicalJsonValue) === canonicalFlightJson(right as FlightCanonicalJsonValue);
}

function validateFlightProviderOperationResult<K extends keyof FlightProviderOperationResultMap>(
  adapter: FlightProviderAdapterIdentity,
  operation: K,
  input: FlightProviderOperationInputMap[K],
  requestBinding: FlightProviderOperationRequestBinding,
  result: FlightProviderExecutionResult<K>,
): FlightProviderOperationResultMap[K] {
  try {
    let expectedKeys = providerResultKeys[operation];
    if (operation === "reconcile_order") {
      let discriminator: unknown;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(result as object, "operation");
        discriminator = descriptor && descriptor.enumerable && "value" in descriptor ? descriptor.value : undefined;
      } catch {
        discriminator = undefined;
      }
      expectedKeys = discriminator === "create_order"
        ? [
          "providerId", "source", "offerId", "orderId", "operation", "originalOperationReceiptDigest",
          "providerOperationRequestReceiptDigest", "providerStatusReceiptDigest", "resourceReceiptDigests", "outcome", "ticketOutcome",
          "externalSideEffect",
        ]
        : discriminator === "cancel_order"
          ? [
            "providerId", "source", "orderId", "operation", "originalOperationReceiptDigest",
            "providerOperationRequestReceiptDigest", "originalTicketDocumentReceiptDigests", "providerStatusReceiptDigest",
            "resourceReceiptDigests", "outcome", "ticketOutcome", "externalSideEffect",
          ]
          : ["operation"];
    }
    const record = exactProviderInputRecord(result, expectedKeys, `Flight ${operation} result`);
    if (record.providerId !== adapter.providerId || record.source !== adapter.mode) {
      throw new FlightProviderRequestBindingError("Flight provider result is bound to another exact adapter identity.");
    }
    const expectedSideEffect = providerMutatingOperations.has(operation);
    if (exactProviderResultBoolean(record.externalSideEffect, "Flight provider result side-effect evidence") !== expectedSideEffect) {
      throw new FlightProviderRequestBindingError("Flight provider result side-effect evidence does not match its exact operation.");
    }

    switch (operation) {
      case "search": {
        if (record.requestDigest !== requestBinding.requestDigest || !Array.isArray(record.offers) || record.offers.length > 100) {
          throw new FlightProviderRequestBindingError("Flight search result is bound to another exact request.");
        }
        exactProviderInstant(record.retrievedAt, "Flight search retrieval time");
        for (const candidate of record.offers) {
          canonicalOffer(candidate);
          const offer = candidate as FlightOfferSnapshot;
          if (offer.providerId !== adapter.providerId || offer.source !== adapter.mode || offer.searchDigest !== requestBinding.requestDigest) {
            throw new FlightProviderRequestBindingError("Flight search offer is bound to another exact provider or request.");
          }
        }
        break;
      }
      case "reprice": {
        const original = input as FlightProviderOperationInputMap["reprice"];
        if (record.originalOfferId !== original.offerId) {
          throw new FlightProviderRequestBindingError("Flight reprice result is bound to another original offer.");
        }
        canonicalOffer(record.repricedOffer);
        const offer = record.repricedOffer as FlightOfferSnapshot;
        if (offer.providerId !== adapter.providerId || offer.source !== adapter.mode) {
          throw new FlightProviderRequestBindingError("Flight repriced offer is bound to another provider.");
        }
        if (
          offer.searchDigest !== original.searchDigest
          || !equalProviderCanonical(offer.segments, original.segments)
        ) {
          throw new FlightProviderRequestBindingError("Flight repriced offer changed the reviewed search or immutable itinerary.");
        }
        if (adapter.mode === "synthetic_fixture" && offer.offerId !== original.offerId) {
          throw new FlightProviderRequestBindingError("Synthetic repricing cannot replace the reviewed offer identity.");
        }
        const priceChanged = exactProviderResultBoolean(record.priceChanged, "Flight reprice change evidence");
        const exactPriceChanged = !equalProviderCanonical(offer.total, original.total);
        if (priceChanged !== exactPriceChanged) {
          throw new FlightProviderRequestBindingError("Flight reprice change evidence does not match the exact old and new money.");
        }
        exactProviderInstant(record.repricedAt, "Flight reprice time");
        break;
      }
      case "create_order": {
        const request = input as FlightProviderCreateOrderInput;
        stableProviderToken(record.orderId, "Provider order ID");
        stableProviderToken(record.offerId, "Provider order offer ID");
        const orderState = exactProviderResultEnum(record.orderState, providerOrderStates, "Provider order state");
        const ticketState = exactProviderResultEnum(
          record.ticketState,
          ["not_started", "issuance_pending", "issued", "exchanged", "failed", "manual_review"],
          "Provider order ticket state",
        );
        const ticketReferenceDigests = providerDigestList(record.ticketReferenceDigests, "Provider order ticket-reference digests");
        providerDigest(record.acceptedTermsDigest, "Provider order accepted-terms digest");
        providerDigest(record.offerRefreshReceiptDigest, "Provider order offer-refresh receipt digest");
        canonicalMoney(record.total);
        providerDigest(record.providerReferenceDigest, "Provider order receipt digest");
        if (
          record.offerId !== request.offerId
          || record.acceptedTermsDigest !== request.acceptedTermsDigest
          || record.offerRefreshReceiptDigest !== request.offerRefreshReceiptDigest
          || !equalProviderCanonical(record.total, request.total)
        ) throw new FlightProviderRequestBindingError("Flight order result is bound to another exact request resource.");
        const exactStateMatrix = (
          (orderState === "order_pending" && (ticketState === "not_started" || ticketState === "issuance_pending"))
          || (
            orderState === "order_confirmed"
            && ["not_started", "issuance_pending", "issued", "exchanged"].includes(ticketState)
          )
          || (orderState === "failed" && ticketState === "failed")
          || (orderState === "manual_review" && ticketState === "manual_review")
        );
        const carriesTicketDocuments = ticketState === "issued" || ticketState === "exchanged";
        if (
          !exactStateMatrix
          || (carriesTicketDocuments ? ticketReferenceDigests.length === 0 : ticketReferenceDigests.length !== 0)
        ) {
          throw new FlightProviderRequestBindingError("Flight create_order result contradicts its exact order, ticket, or document state.");
        }
        break;
      }
      case "change_order": {
        const request = input as FlightProviderChangeOrderInput;
        stableProviderToken(record.orderId, "Provider order ID");
        stableProviderToken(record.offerId, "Provider order offer ID");
        exactProviderResultEnum(record.orderState, providerOrderStates, "Provider order state");
        exactProviderResultEnum(record.ticketState, ["not_started"], "Provider order ticket state");
        providerDigest(record.providerReferenceDigest, "Provider order receipt digest");
        if (record.orderId !== request.orderId) {
          throw new FlightProviderRequestBindingError("Flight order result is bound to another exact request resource.");
        }
        break;
      }
      case "authorize_payment":
      case "capture_payment":
      case "refund_payment":
      case "void_payment": {
        const request = input as FlightProviderPaymentInput | FlightProviderPaymentVoidInput;
        if (record.orderId !== request.orderId) throw new FlightProviderRequestBindingError("Flight payment result is bound to another order.");
        exactProviderResultEnum(
          record.paymentState,
          providerPaymentStatesByOperation[operation as keyof typeof providerPaymentStatesByOperation],
          `Provider ${operation} payment state`,
        );
        canonicalMoney(record.amount);
        providerDigest(record.processorReferenceDigest, "Payment processor receipt digest");
        const expectedAmount = operation === "void_payment"
          ? (request as FlightProviderPaymentVoidInput).expectedAmount
          : (request as FlightProviderPaymentInput).amount;
        if (!equalProviderCanonical(record.amount, expectedAmount)) {
          throw new FlightProviderRequestBindingError("Flight payment result is bound to another exact amount.");
        }
        break;
      }
      case "issue_ticket":
      case "void_ticket":
      case "exchange_ticket": {
        const request = input as FlightProviderIssueTicketsInput | FlightProviderVoidTicketsInput | FlightProviderExchangeTicketsInput;
        if (record.orderId !== request.orderId) throw new FlightProviderRequestBindingError("Flight ticket result is bound to another order.");
        const state = exactProviderResultEnum(
          record.ticketState,
          providerTicketStatesByOperation[operation as keyof typeof providerTicketStatesByOperation],
          `Provider ${operation} ticket state`,
        );
        const references = providerDigestList(record.ticketReferenceDigests, "Provider ticket-reference digests");
        providerDigest(record.providerReferenceDigest, "Provider ticket receipt digest");
        if (["issued", "voided", "exchanged"].includes(state) && references.length === 0) {
          throw new FlightProviderRequestBindingError("Successful flight ticket result requires exact document receipts.");
        }
        break;
      }
      case "cancel_order": {
        const request = input as FlightProviderCancelOrderInput;
        if (record.orderId !== request.orderId) throw new FlightProviderRequestBindingError("Flight cancellation result is bound to another order.");
        exactProviderResultEnum(record.cancellationState, providerCancellationStates, "Provider cancellation state");
        if (record.refundableAmount !== null) canonicalMoney(record.refundableAmount);
        providerDigest(record.providerReferenceDigest, "Provider cancellation receipt digest");
        break;
      }
      case "process_webhook": {
        const request = input as FlightProviderWebhookInput;
        if (record.eventId !== request.eventId || record.bodyDigest !== request.bodyDigest) {
          throw new FlightProviderRequestBindingError("Flight webhook result is bound to another exact event body.");
        }
        providerDigest(record.bodyDigest, "Flight webhook body digest");
        providerDigest(record.outcomeDigest, "Flight webhook outcome digest");
        break;
      }
      case "reconcile_order": {
        const request = input as FlightProviderReconcileOrderInput;
        providerDigest(record.providerStatusReceiptDigest, "Provider order-status receipt digest");
        const resourceReceipts = providerDigestList(record.resourceReceiptDigests, "Provider order resource-receipt digests");
        if (request.operation === "create_order") {
          if (
            record.operation !== "create_order"
            || record.offerId !== request.offerId
            || record.originalOperationReceiptDigest !== request.originalOperationReceiptDigest
            || record.providerOperationRequestReceiptDigest !== request.providerOperationRequestReceiptDigest
          ) {
            throw new FlightProviderRequestBindingError("Create-order reconciliation result is bound to another exact offer attempt.");
          }
          const orderId = record.orderId === null ? null : stableProviderToken(record.orderId, "Reconciled provider order ID");
          const outcome = exactProviderResultEnum(
            record.outcome,
            ["order_confirmed", "order_absent", "order_ticketed", "ambiguous"],
            "Create-order reconciliation outcome",
          );
          const ticketOutcome = record.ticketOutcome === null
            ? null
            : exactProviderResultEnum(
              record.ticketOutcome,
              ["no_active_ticket_documents", "issued", "exchanged", "ambiguous"],
              "Create-order reconciliation ticket outcome",
            );
          const exactCreateOutcome = (
            (outcome === "order_confirmed" && orderId !== null && ticketOutcome === null && resourceReceipts.length > 0)
            || (outcome === "order_absent" && orderId === null && ticketOutcome === "no_active_ticket_documents" && resourceReceipts.length === 0)
            || (
              outcome === "order_ticketed"
              && orderId !== null
              && (ticketOutcome === "issued" || ticketOutcome === "exchanged")
              && resourceReceipts.length > 0
            )
            || (outcome === "ambiguous" && ticketOutcome === "ambiguous")
          );
          if (!exactCreateOutcome) {
            throw new FlightProviderRequestBindingError("Create-order reconciliation outcome contradicts its exact ticket evidence.");
          }
        } else {
          if (
            record.operation !== "cancel_order"
            || record.orderId !== request.orderId
            || record.originalOperationReceiptDigest !== request.originalOperationReceiptDigest
            || record.providerOperationRequestReceiptDigest !== request.providerOperationRequestReceiptDigest
            || !equalProviderCanonical(record.originalTicketDocumentReceiptDigests, request.originalTicketDocumentReceiptDigests)
          ) {
            throw new FlightProviderRequestBindingError("Cancel-order reconciliation result is bound to another exact order attempt.");
          }
          const outcome = exactProviderResultEnum(
            record.outcome,
            ["order_cancelled", "order_cancelled_ticket_active", "order_confirmed", "order_absent", "ambiguous"],
            "Cancel-order reconciliation outcome",
          );
          const ticketOutcome = exactProviderResultEnum(
            record.ticketOutcome,
            ["no_active_ticket_documents", "issued", "exchanged", "voided", "ambiguous"],
            "Cancel-order reconciliation ticket outcome",
          );
          const originalTicketReceipts = request.originalTicketDocumentReceiptDigests;
          const hadActiveTicket = originalTicketReceipts.length > 0;
          const exactCancelOutcome = (
            (
              outcome === "order_cancelled"
              && (ticketOutcome === "no_active_ticket_documents" || (hadActiveTicket && ticketOutcome === "voided"))
            )
            || (
              outcome === "order_cancelled_ticket_active"
              && hadActiveTicket
              && (ticketOutcome === "issued" || ticketOutcome === "exchanged")
            )
            || (
              outcome === "order_confirmed"
              && (hadActiveTicket
                ? ticketOutcome === "issued" || ticketOutcome === "exchanged" || ticketOutcome === "voided"
                : ticketOutcome === "no_active_ticket_documents")
            )
            || (outcome === "order_absent" && ticketOutcome === "no_active_ticket_documents")
            || (outcome === "ambiguous" && ticketOutcome === "ambiguous")
          );
          if (
            !exactCancelOutcome
            || (outcome === "order_absent" && resourceReceipts.length !== 0)
            || (!["order_absent", "ambiguous"].includes(outcome) && resourceReceipts.length === 0)
          ) {
            throw new FlightProviderRequestBindingError("Cancel-order reconciliation outcome contradicts its exact ticket evidence.");
          }
        }
        break;
      }
      case "reconcile_payment": {
        const request = input as FlightProviderReconcilePaymentInput;
        if (
          record.orderId !== request.orderId
          || record.operation !== request.operation
          || record.originalOperationReceiptDigest !== request.originalOperationReceiptDigest
          || record.paymentAttemptReceiptDigest !== request.paymentAttemptReceiptDigest
          || record.processorOperationReferenceDigest !== request.processorOperationReferenceDigest
          || !equalProviderCanonical(record.expectedAmount, request.expectedAmount)
        ) throw new FlightProviderRequestBindingError("Flight payment reconciliation result is bound to another exact attempt or amount.");
        providerDigest(record.providerStatusReceiptDigest, "Payment status receipt digest");
        providerDigest(record.paymentAttemptReceiptDigest, "Payment attempt receipt digest");
        providerDigest(record.processorOperationReferenceDigest, "Processor operation-reference digest", true);
        canonicalMoney(record.expectedAmount);
        providerDigestList(record.resourceReceiptDigests, "Payment resource-receipt digests");
        exactProviderResultEnum(
          record.outcome,
          providerPaymentReconciliationOutcomesByOperation[request.operation],
          `Provider ${request.operation} reconciliation outcome`,
        );
        break;
      }
      case "reconcile_tickets": {
        const request = input as FlightProviderReconcileTicketsInput;
        if (
          record.orderId !== request.orderId
          || record.operation !== request.operation
          || record.originalOperationReceiptDigest !== request.originalOperationReceiptDigest
          || !equalProviderCanonical(record.originalTicketDocumentReceiptDigests, request.originalTicketDocumentReceiptDigests)
        ) throw new FlightProviderRequestBindingError("Flight ticket reconciliation result is bound to another exact attempt or document set.");
        providerDigest(record.providerStatusReceiptDigest, "Ticket status receipt digest");
        providerDigestList(record.originalTicketDocumentReceiptDigests, "Original ticket-document receipt digests");
        const references = providerDigestList(record.ticketReferenceDigests, "Reconciled ticket-reference digests");
        const outcome = exactProviderResultEnum(
          record.outcome,
          providerTicketReconciliationOutcomesByOperation[request.operation],
          `Provider ${request.operation} reconciliation outcome`,
        );
        if (outcome === "no_active_ticket_documents" ? references.length !== 0 : outcome !== "ambiguous" && references.length === 0) {
          throw new FlightProviderRequestBindingError("Flight ticket reconciliation outcome does not match its exact document receipts.");
        }
        break;
      }
      default:
        throw new FlightProviderRequestBindingError("Flight provider operation result is not recognized.");
    }
    const snapshot = JSON.parse(canonicalFlightJson(result as unknown as FlightCanonicalJsonValue)) as FlightProviderOperationResultMap[K];
    return deepFreezeFixture(snapshot);
  } catch (error) {
    if (error instanceof FlightProviderRequestBindingError) throw error;
    throw new FlightProviderRequestBindingError(`Flight ${operation} result contains malformed or unreviewed evidence.`);
  }
}

/**
 * Constructs the only live-capable adapter implementation. The returned object owns authorization,
 * immutable input review, transport dispatch, and exact result validation; the raw executor is closure-only.
 */
export function createGuardedFlightProviderAdapter(config: FlightProviderAdapterConfiguration): FlightProviderAdapter {
  const configuration = exactProviderInputRecord(
    config,
    ["providerId", "mode", "executionBinding", "paymentExecutionBinding", "settlementExecutionBinding", "execute"],
    "Guarded live flight provider configuration",
  );
  if (
    (configuration.mode !== "provider_sandbox" && configuration.mode !== "provider_production")
    || typeof configuration.execute !== "function"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(configuration.providerId as string)
  ) throw new FlightProviderRequestBindingError("Guarded live flight provider configuration is malformed.");
  const providerId = configuration.providerId as string;
  const mode = configuration.mode;
  const rawProviderBinding = exactProviderInputRecord(
    configuration.executionBinding,
    ["providerId", "adapterVersion", "adapterSourceDigest", "accountScopeReceiptDigest", "pointOfSaleScopeReceiptDigest", "contentScopeReceiptDigest"],
    "Guarded flight provider execution binding",
  );
  const rawPaymentBinding = configuration.paymentExecutionBinding === null
    ? null
    : exactProviderInputRecord(
      configuration.paymentExecutionBinding,
      ["processorId", "adapterVersion", "adapterSourceDigest", "accountScopeReceiptDigest", "environmentScopeReceiptDigest"],
      "Guarded flight payment execution binding",
    );
  const rawSettlementBinding = configuration.settlementExecutionBinding === null
    ? null
    : canonicalSettlementBinding(configuration.settlementExecutionBinding);
  stableProviderToken(rawProviderBinding.providerId, "Guarded flight provider binding ID");
  if (rawPaymentBinding !== null) stableProviderToken(rawPaymentBinding.processorId, "Guarded flight processor binding ID");
  if (
    typeof rawProviderBinding.adapterVersion !== "string"
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(rawProviderBinding.adapterVersion)
    || (
      rawPaymentBinding !== null
      && (
        typeof rawPaymentBinding.adapterVersion !== "string"
        || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(rawPaymentBinding.adapterVersion)
      )
    )
  ) throw new FlightProviderRequestBindingError("Guarded live flight adapter version binding is malformed.");
  const bindingDigests: readonly (readonly [string, unknown])[] = [
    ["Provider adapter-source digest", rawProviderBinding.adapterSourceDigest],
    ["Provider account-scope digest", rawProviderBinding.accountScopeReceiptDigest],
    ["Provider point-of-sale digest", rawProviderBinding.pointOfSaleScopeReceiptDigest],
    ["Provider content-scope digest", rawProviderBinding.contentScopeReceiptDigest],
    ...(rawPaymentBinding === null ? [] : [
      ["Payment adapter-source digest", rawPaymentBinding.adapterSourceDigest],
      ["Payment account-scope digest", rawPaymentBinding.accountScopeReceiptDigest],
      ["Payment environment-scope digest", rawPaymentBinding.environmentScopeReceiptDigest],
    ] as const),
  ];
  for (const [label, digest] of bindingDigests) providerDigest(digest, label);
  let executionBinding: FlightRuntimeProviderBinding;
  let paymentExecutionBinding: FlightRuntimePaymentBinding | null;
  let settlementExecutionBinding: FlightRuntimeSettlementBinding | null;
  try {
    executionBinding = deepFreezeFixture(JSON.parse(canonicalFlightJson(rawProviderBinding as FlightCanonicalJsonValue)) as FlightRuntimeProviderBinding);
    paymentExecutionBinding = rawPaymentBinding === null
      ? null
      : deepFreezeFixture(JSON.parse(canonicalFlightJson(rawPaymentBinding as FlightCanonicalJsonValue)) as FlightRuntimePaymentBinding);
    settlementExecutionBinding = rawSettlementBinding === null
      ? null
      : deepFreezeFixture(JSON.parse(canonicalFlightJson(rawSettlementBinding as unknown as FlightCanonicalJsonValue)) as FlightRuntimeSettlementBinding);
  } catch {
    throw new FlightProviderRequestBindingError("Guarded live flight provider bindings are malformed.");
  }
  if (executionBinding.providerId !== providerId) {
    throw new FlightProviderRequestBindingError("Guarded live flight provider identity does not match its execution binding.");
  }
  if (settlementExecutionBinding !== null && settlementExecutionBinding.providerId !== providerId) {
    throw new FlightProviderRequestBindingError("Guarded live flight provider identity does not match its settlement binding.");
  }
  const executeRaw = configuration.execute as FlightProviderExecutor;
  const execute = async <K extends keyof FlightProviderOperationInputMap>(
    operation: K,
    input: FlightProviderOperationInputMap[K],
    policy: FlightRuntimePolicy,
    context: FlightRuntimeActionContext,
  ): Promise<FlightProviderOperationResultMap[K]> => {
    const reviewed = await assertFlightProviderOperationAuthorized(adapter, operation, input, policy, context);
    const validatorBinding = Object.freeze({ ...reviewed.binding });
    const executorBinding = Object.freeze({ ...reviewed.binding });
    const executorAuthorization = deepFreezeFixture(
      JSON.parse(canonicalFlightJson(reviewed.authorization as unknown as FlightCanonicalJsonValue)) as FlightRuntimeAuthorizationDecision,
    );
    const rawRequest = Object.freeze({
      operation,
      input: reviewed.input,
      requestBinding: executorBinding,
      authorization: executorAuthorization,
    }) as FlightProviderExecutionRequest<K>;
    const rawResult = await executeRaw<K>(rawRequest);
    return validateFlightProviderOperationResult(adapter, operation, reviewed.input, validatorBinding, rawResult);
  };
  const adapter: FlightProviderAdapter = {
    [flightProviderAdapterGuard]: true,
    providerId,
    mode,
    externalNetworkAccess: true,
    supportsLiveTraffic: true,
    executionBinding,
    paymentExecutionBinding,
    settlementExecutionBinding,
    search: (input, policy, context) => execute("search", input, policy, context),
    reprice: (input, policy, context) => execute("reprice", input, policy, context),
    createOrder: (input, policy, context) => execute("create_order", input, policy, context),
    changeOrder: (input, policy, context) => execute("change_order", input, policy, context),
    authorizePayment: (input, policy, context) => execute("authorize_payment", input, policy, context),
    capturePayment: (input, policy, context) => execute("capture_payment", input, policy, context),
    refundPayment: (input, policy, context) => execute("refund_payment", input, policy, context),
    voidPayment: (input, policy, context) => execute("void_payment", input, policy, context),
    issueTickets: (input, policy, context) => execute("issue_ticket", input, policy, context),
    voidTickets: (input, policy, context) => execute("void_ticket", input, policy, context),
    exchangeTickets: (input, policy, context) => execute("exchange_ticket", input, policy, context),
    cancelOrder: (input, policy, context) => execute("cancel_order", input, policy, context),
    processWebhook: (input, policy, context) => execute("process_webhook", input, policy, context),
    reconcileOrder: (input, policy, context) => execute("reconcile_order", input, policy, context),
    reconcilePayment: (input, policy, context) => execute("reconcile_payment", input, policy, context),
    reconcileTickets: (input, policy, context) => execute("reconcile_tickets", input, policy, context),
  };
  guardedFlightProviderAdapters.add(adapter);
  return Object.freeze(adapter);
}

function deepFreezeFixture<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreezeFixture(child));
    Object.freeze(value);
  }
  return value;
}

export const syntheticFlightSearchRequest: FlightCommerceSearchRequest = deepFreezeFixture({
  origin: "ORD",
  destination: "LAX",
  departureDate: "2027-02-10",
  returnDate: "2027-02-14",
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
});

function canonicalSearchRequest(request: FlightCommerceSearchRequest): FlightCanonicalJsonValue {
  return {
    tripType: request.returnDate === null ? "oneway" : "roundtrip",
    origin: request.origin,
    destination: request.destination,
    departureDate: request.departureDate,
    returnDate: request.returnDate,
    cabin: request.cabin,
    passengers: {
      adults: request.passengers.adults,
      children: request.passengers.children,
      infantsInSeat: request.passengers.infantsInSeat,
      infantsOnLap: request.passengers.infantsOnLap,
    },
  };
}

type SyntheticOfferTemplate = {
  carrierCode: string;
  departureTime: string;
  durationMinutes: number;
  baseAmountMinor: number;
};

const syntheticOfferTemplates: readonly SyntheticOfferTemplate[] = [
  { carrierCode: "T1", departureTime: "08:10", durationMinutes: 170, baseAmountMinor: 18_900 },
  { carrierCode: "T2", departureTime: "11:45", durationMinutes: 275, baseAmountMinor: 15_400 },
  { carrierCode: "T3", departureTime: "18:25", durationMinutes: 205, baseAmountMinor: 21_600 },
];

const cabinPriceMultipliers: Record<FlightCommerceSearchRequest["cabin"], number> = {
  economy: 100,
  premium_economy: 145,
  business: 270,
  first: 410,
};

const syntheticOfferLifetimeMilliseconds = 15 * 60 * 1000;
const syntheticOfferIdPattern = /^offer_syn_([0-9a-f]{64})_([0-9]{13})_([1-3])$/;

function passengerCount(request: FlightCommerceSearchRequest) {
  return Object.values(request.passengers).reduce((total, count) => total + count, 0);
}

function exactSyntheticInstant(date: string, time: string, offsetMinutes = 0) {
  const instant = new Date(`${date}T${time}:00.000Z`);
  instant.setUTCMinutes(instant.getUTCMinutes() + offsetMinutes);
  return instant.toISOString();
}

function buildSyntheticSegment(input: {
  requestDigest: string;
  template: SyntheticOfferTemplate;
  templateIndex: number;
  direction: "outbound" | "return";
  origin: string;
  destination: string;
  date: string;
}) {
  return {
    segmentId: `segment_syn_${input.requestDigest.slice(0, 16)}_${input.templateIndex + 1}_${input.direction}`,
    marketingCarrier: input.template.carrierCode,
    marketingFlightNumber: String(410 + input.templateIndex * 37 + (input.direction === "return" ? 3 : 0)),
    origin: input.origin,
    destination: input.destination,
    departsAt: exactSyntheticInstant(input.date, input.template.departureTime),
    arrivesAt: exactSyntheticInstant(input.date, input.template.departureTime, input.template.durationMinutes),
  };
}

function buildSyntheticOfferSnapshots(request: FlightCommerceSearchRequest, observedAt: Date): readonly FlightOfferSnapshot[] {
  const requestDigest = sha256FlightEvidence(canonicalSearchRequest(request));
  const travelers = passengerCount(request);
  const itineraryMultiplier = request.returnDate === null ? 100 : 182;
  const sliceCount = request.returnDate === null ? 1 : 2;
  const expiresAt = new Date(observedAt.getTime() + syntheticOfferLifetimeMilliseconds).toISOString();

  return deepFreezeFixture(syntheticOfferTemplates.map((template, templateIndex) => {
    const outbound = buildSyntheticSegment({
      requestDigest,
      template,
      templateIndex,
      direction: "outbound",
      origin: request.origin,
      destination: request.destination,
      date: request.departureDate,
    });
    const segments = request.returnDate === null
      ? [outbound]
      : [outbound, buildSyntheticSegment({
        requestDigest,
        template,
        templateIndex,
        direction: "return",
        origin: request.destination,
        destination: request.origin,
        date: request.returnDate,
      })];
    const subtotal = Math.round(
      template.baseAmountMinor * cabinPriceMultipliers[request.cabin] * itineraryMultiplier * travelers / 10_000,
    );
    const taxes = 3_900 * travelers * sliceCount;
    const offerBindingDigest = sha256FlightEvidence({
      version: "synthetic-flight-offer-binding-v1",
      search: canonicalSearchRequest(request),
      expiresAt,
      template: templateIndex + 1,
    });
    return {
      offerId: `offer_syn_${offerBindingDigest}_${Date.parse(expiresAt)}_${templateIndex + 1}`,
      providerId: SYNTHETIC_FLIGHT_PROVIDER_ID,
      searchDigest: requestDigest,
      termsDigest: sha256FlightEvidence({
        version: "synthetic-flight-terms-v1",
        template: templateIndex + 1,
        cabin: request.cabin,
        refundable: true,
        changeable: true,
      }),
      expiresAt,
      total: { currency: "USD", amountMinor: subtotal + taxes },
      segments,
      source: "synthetic_fixture",
    } satisfies FlightOfferSnapshot;
  }));
}

export function syntheticFlightOfferObservedAt(offerId: string): Date | null {
  const match = syntheticOfferIdPattern.exec(offerId);
  if (!match) return null;
  const expiryMilliseconds = Number(match[2]);
  if (!Number.isSafeInteger(expiryMilliseconds)) return null;
  const observedAt = new Date(expiryMilliseconds - syntheticOfferLifetimeMilliseconds);
  return Number.isFinite(observedAt.getTime()) ? observedAt : null;
}

export const syntheticFlightOfferFixture: FlightOfferSnapshot = buildSyntheticOfferSnapshots(
  syntheticFlightSearchRequest,
  new Date("2027-02-01T00:00:00.000Z"),
)[0]!;

export const syntheticFlightWebhookEvent = {
  version: "synthetic-flight-webhook-v1",
  eventId: "event_synthetic_order_confirmed_0001",
  eventType: "order.confirmed",
  orderId: "order_synthetic_confirmed_0001",
  occurredAt: "2027-02-01T00:05:00.000Z",
} as const satisfies FlightCanonicalJsonValue;

export const syntheticFlightWebhookFixture = {
  timestampSeconds: 1_801_440_300,
  rawBody: new TextEncoder().encode(canonicalFlightJson(syntheticFlightWebhookEvent)),
  providerId: SYNTHETIC_FLIGHT_PROVIDER_ID,
  eventId: syntheticFlightWebhookEvent.eventId,
} as const;

function assertFixtureId(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) throw new FlightProviderFixtureError(`${label} must be a stable opaque token.`);
}

function assertMatchingIdempotency(
  actual: FlightIdempotencyIntent,
  operation: FlightIdempotencyIntent["operation"],
  payload: FlightCanonicalJsonValue,
) {
  const expected = buildFlightIdempotencyIntent({
    operation,
    scopeId: actual.scopeId,
    requestId: actual.requestId,
    payload,
  });
  if (
    actual.operation !== operation
    || actual.version !== expected.version
    || actual.requestDigest !== expected.requestDigest
    || actual.idempotencyKey !== expected.idempotencyKey
  ) {
    throw new FlightProviderFixtureError("Idempotency evidence does not match the exact synthetic operation payload.");
  }
}

function assertSyntheticRuntimeContext(context: FlightRuntimeActionContext) {
  if (
    (context.executionBinding ?? null) !== null
    || (context.paymentExecutionBinding ?? null) !== null
    || (context.settlementExecutionBinding ?? null) !== null
    || (context.productionAuthorization ?? null) !== null
    || (context.productionAuthorizationVerifier ?? null) !== null
    || (context.scopeId ?? null) !== null
    || (context.requestDigest ?? null) !== null
    || (context.idempotencyRequestDigest ?? null) !== null
  ) {
    throw new FlightProviderFixtureError("Synthetic operations reject live execution or action-authorization context.");
  }
}

export class SyntheticFlightProviderAdapter implements FlightProviderAdapter {
  readonly [flightProviderAdapterGuard] = true as const;
  readonly providerId = SYNTHETIC_FLIGHT_PROVIDER_ID;
  readonly mode = "synthetic_fixture" as const;
  readonly externalNetworkAccess = false;
  readonly supportsLiveTraffic = false;
  readonly executionBinding = null;
  readonly paymentExecutionBinding = null;
  readonly settlementExecutionBinding = null;
  readonly #enabled: boolean;
  readonly #now: () => Date;

  constructor(options: { enabled?: boolean; now?: () => Date } = {}) {
    if (new.target !== SyntheticFlightProviderAdapter) {
      throw new FlightProviderFixtureError("Synthetic flight provider adapter cannot be subclassed.");
    }
    this.#enabled = options.enabled === true;
    this.#now = options.now ?? (() => new Date());
    guardedFlightProviderAdapters.add(this);
    Object.freeze(this);
  }

  #assertEnabled() {
    if (!this.#enabled) throw new FlightProviderAdapterDisabledError();
  }

  #readClock() {
    const now = this.#now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new FlightProviderFixtureError("Synthetic adapter clock is invalid.");
    return new Date(now.getTime());
  }

  async #refuseUnsupportedOperation<K extends "change_order" | "authorize_payment" | "capture_payment" | "refund_payment" | "void_payment" | "void_ticket" | "exchange_ticket" | "process_webhook" | "reconcile_order" | "reconcile_payment" | "reconcile_tickets">(
    operation: K,
    input: FlightProviderOperationInputMap[K],
    policy: FlightRuntimePolicy,
    context: FlightRuntimeActionContext,
  ): Promise<never> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    await assertFlightProviderOperationAuthorized(this, operation, input, policy, context);
    throw new FlightProviderFixtureError(`Synthetic ${operation} is intentionally not implemented.`);
  }

  async search(request: FlightCommerceSearchRequest, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderSearchResult> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    const reviewed = await assertFlightProviderOperationAuthorized(this, "search", request, policy, context);
    request = reviewed.input;
    const validation = validateFlightCommerceSearchRequest(request);
    if (!validation.valid) throw new FlightProviderFixtureError(validation.errors.join(" "));
    const requestDigest = sha256FlightEvidence(canonicalSearchRequest(request));
    const observedAt = this.#readClock();
    const offers = buildSyntheticOfferSnapshots(request, observedAt);
    for (const offer of offers) {
      const offerValidation = validateFlightOfferSnapshot(offer);
      if (!offerValidation.valid) throw new FlightProviderFixtureError(offerValidation.errors.join(" "));
    }
    return {
      providerId: this.providerId,
      source: "synthetic_fixture",
      requestDigest,
      offers,
      retrievedAt: observedAt.toISOString(),
      externalSideEffect: false,
    };
  }

  async reprice(offer: FlightOfferSnapshot, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderRepriceResult> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    const reviewed = await assertFlightProviderOperationAuthorized(this, "reprice", offer, policy, context);
    offer = reviewed.input;
    if (offer.providerId !== this.providerId || offer.source !== "synthetic_fixture") throw new FlightProviderFixtureError("Synthetic offer is not available.");
    const validation = validateFlightOfferSnapshot(offer);
    if (!validation.valid) throw new FlightProviderFixtureError(validation.errors.join(" "));
    const repricedAt = this.#readClock();
    if (Date.parse(offer.expiresAt) <= repricedAt.getTime()) throw new FlightProviderFixtureError("Synthetic offer has expired.");
    return {
      providerId: this.providerId,
      source: "synthetic_fixture",
      originalOfferId: offer.offerId,
      repricedOffer: offer,
      priceChanged: false,
      repricedAt: repricedAt.toISOString(),
      externalSideEffect: false,
    };
  }

  async createOrder(
    input: FlightProviderCreateOrderInput,
    policy: FlightRuntimePolicy,
    context: FlightRuntimeActionContext,
  ): Promise<FlightProviderCreateOrderResult> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    const reviewed = await assertFlightProviderOperationAuthorized(this, "create_order", input, policy, context);
    input = reviewed.input;
    if (input.offerId !== syntheticFlightOfferFixture.offerId) throw new FlightProviderFixtureError("Synthetic offer is not available.");
    if (input.travelers.length !== 1) throw new FlightProviderFixtureError("Synthetic fixture requires exactly one traveler binding.");
    input.travelers.forEach(({ travelerRef }) => assertFixtureId(travelerRef, "Traveler reference"));
    if (
      input.acceptedTermsDigest !== syntheticFlightOfferFixture.termsDigest
      || !equalProviderCanonical(input.total, syntheticFlightOfferFixture.total)
    ) {
      throw new FlightProviderFixtureError("Synthetic order is not bound to the exact reviewed offer terms and total.");
    }
    assertMatchingIdempotency(input.idempotency, "create_order", {
      offerId: input.offerId,
      acceptedTermsDigest: input.acceptedTermsDigest,
      offerRefreshReceiptDigest: input.offerRefreshReceiptDigest,
      total: input.total,
      travelers: input.travelers,
      settlementIntent: input.settlementIntent,
    });
    return {
      providerId: this.providerId,
      source: "synthetic_fixture",
      orderId: "order_synthetic_confirmed_0001",
      offerId: input.offerId,
      acceptedTermsDigest: input.acceptedTermsDigest,
      offerRefreshReceiptDigest: input.offerRefreshReceiptDigest,
      total: input.total,
      orderState: "order_confirmed",
      ticketState: "not_started",
      ticketReferenceDigests: [],
      providerReferenceDigest: sha256FlightEvidence({ reference: "synthetic-order-reference-v1" }),
      externalSideEffect: false,
    };
  }

  async changeOrder(input: {
    orderId: string;
    changeRequestDigest: string;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderChangeOrderResult> {
    return this.#refuseUnsupportedOperation("change_order", input, policy, context);
  }

  async authorizePayment(input: {
    orderId: string;
    amount: FlightMoney;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult> {
    return this.#refuseUnsupportedOperation("authorize_payment", input, policy, context);
  }

  async capturePayment(input: {
    orderId: string;
    amount: FlightMoney;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult> {
    return this.#refuseUnsupportedOperation("capture_payment", input, policy, context);
  }

  async refundPayment(input: {
    orderId: string;
    amount: FlightMoney;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult> {
    return this.#refuseUnsupportedOperation("refund_payment", input, policy, context);
  }

  async voidPayment(input: {
    orderId: string;
    authorizationReferenceDigest: string;
    expectedAmount: FlightMoney;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentResult> {
    return this.#refuseUnsupportedOperation("void_payment", input, policy, context);
  }

  async issueTickets(input: {
    orderId: string;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    const reviewed = await assertFlightProviderOperationAuthorized(this, "issue_ticket", input, policy, context);
    input = reviewed.input;
    if (input.orderId !== "order_synthetic_confirmed_0001") throw new FlightProviderFixtureError("Synthetic order is not available.");
    assertMatchingIdempotency(input.idempotency, "issue_ticket", { orderId: input.orderId });
    return {
      providerId: this.providerId,
      source: "synthetic_fixture",
      orderId: input.orderId,
      ticketState: "issued",
      ticketReferenceDigests: [sha256FlightEvidence({ reference: "synthetic-ticket-reference-v1" })],
      providerReferenceDigest: sha256FlightEvidence({ reference: "synthetic-ticket-reference-v1" }),
      externalSideEffect: false,
    };
  }

  async voidTickets(input: {
    orderId: string;
    ticketReferenceDigests: readonly string[];
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult> {
    return this.#refuseUnsupportedOperation("void_ticket", input, policy, context);
  }

  async exchangeTickets(input: {
    orderId: string;
    ticketReferenceDigests: readonly string[];
    exchangeRequestDigest: string;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketingResult> {
    return this.#refuseUnsupportedOperation("exchange_ticket", input, policy, context);
  }

  async cancelOrder(input: {
    orderId: string;
    idempotency: FlightIdempotencyIntent;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderCancellationResult> {
    this.#assertEnabled();
    assertSyntheticRuntimeContext(context);
    const reviewed = await assertFlightProviderOperationAuthorized(this, "cancel_order", input, policy, context);
    input = reviewed.input;
    if (input.orderId !== "order_synthetic_confirmed_0001") throw new FlightProviderFixtureError("Synthetic order is not available.");
    assertMatchingIdempotency(input.idempotency, "cancel_order", { orderId: input.orderId });
    return {
      providerId: this.providerId,
      source: "synthetic_fixture",
      orderId: input.orderId,
      cancellationState: "cancelled",
      refundableAmount: syntheticFlightOfferFixture.total,
      providerReferenceDigest: sha256FlightEvidence({ reference: "synthetic-cancellation-reference-v1" }),
      externalSideEffect: false,
    };
  }

  async processWebhook(input: {
    eventId: string;
    bodyDigest: string;
  }, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderWebhookResult> {
    return this.#refuseUnsupportedOperation("process_webhook", input, policy, context);
  }

  async reconcileOrder(input: FlightProviderReconcileOrderInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderReconciliationResult> {
    return this.#refuseUnsupportedOperation("reconcile_order", input, policy, context);
  }

  async reconcilePayment(input: FlightProviderReconcilePaymentInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderPaymentReconciliationResult> {
    return this.#refuseUnsupportedOperation("reconcile_payment", input, policy, context);
  }

  async reconcileTickets(input: FlightProviderReconcileTicketsInput, policy: FlightRuntimePolicy, context: FlightRuntimeActionContext): Promise<FlightProviderTicketReconciliationResult> {
    return this.#refuseUnsupportedOperation("reconcile_tickets", input, policy, context);
  }
}

Object.freeze(SyntheticFlightProviderAdapter.prototype);
Object.freeze(SyntheticFlightProviderAdapter);

/** Shared application instance. It cannot execute until replaced by an explicitly enabled fixture instance. */
export const disabledSyntheticFlightProviderAdapter = new SyntheticFlightProviderAdapter();

export function parseVerifiedSyntheticFlightWebhook(
  rawBody: Uint8Array,
  verification: FlightWebhookVerificationResult,
) {
  if (!verification.verified || verification.bodyDigest === null) throw new FlightProviderFixtureError("Synthetic webhook was not cryptographically verified.");
  const actualBodyDigest = createHash("sha256").update(rawBody).digest("hex");
  const pinnedBodyDigest = createHash("sha256").update(syntheticFlightWebhookFixture.rawBody).digest("hex");
  if (actualBodyDigest !== verification.bodyDigest) throw new FlightProviderFixtureError("Webhook verification evidence is bound to a different payload.");
  if (actualBodyDigest !== pinnedBodyDigest) throw new FlightProviderFixtureError("Synthetic webhook payload does not match the pinned fixture.");
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as unknown;
  if (canonicalFlightJson(parsed as FlightCanonicalJsonValue) !== canonicalFlightJson(syntheticFlightWebhookEvent)) {
    throw new FlightProviderFixtureError("Synthetic webhook payload is not canonical or contains unsupported fields.");
  }
  return syntheticFlightWebhookEvent;
}
