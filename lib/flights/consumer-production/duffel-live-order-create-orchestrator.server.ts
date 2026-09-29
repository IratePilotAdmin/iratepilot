import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimeProviderBinding,
  digestFlightRuntimeSettlementBinding,
  evaluateFlightRuntimeAuthorization,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
  type FlightRuntimeSettlementBinding,
} from "../runtime-safety";
import type {
  FlightConsumerLiveDuffelOrderExecutionPersistence,
} from "./duffel-live-order-execution-persistence.server";
import {
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
} from "./duffel-live-offer-reprice.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const amountSchema = z.number().int().min(50).max(99_999_999);
const encryptedPayloadSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,16320}$/,
);
const encryptedReferenceSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/,
);
const providerOfferIdSchema = z.string().regex(/^off_[A-Za-z0-9]{8,252}$/);
const providerPassengerIdSchema = z.string().regex(/^pas_[A-Za-z0-9]{8,252}$/);
const providerOrderIdSchema = z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/);
const bookingReferenceSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 -]{0,127}$/);
const providerRequestIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);

const authorityFalseShape = {
  providerDispatchAuthorized: z.literal(false),
  stripeDispatchAuthorized: z.literal(false),
  bookingAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  settlementAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  servicingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  blindRetryAuthorized: z.literal(false),
} as const;

const encryptedCheckoutEvidenceSchema = z.object({
  travelerPayloadCiphertext: encryptedPayloadSchema,
  travelerPayloadSha256: sha256Schema,
  travelerEvidenceSha256: sha256Schema,
  contactPayloadCiphertext: encryptedReferenceSchema,
  contactPayloadSha256: sha256Schema,
  contactEvidenceSha256: sha256Schema,
  billingAddressPayloadCiphertext: encryptedReferenceSchema,
  billingAddressPayloadSha256: sha256Schema,
  billingAddressEvidenceSha256: sha256Schema,
}).strict().superRefine((value, context) => {
  const digests = [
    value.travelerPayloadSha256,
    value.travelerEvidenceSha256,
    value.contactPayloadSha256,
    value.contactEvidenceSha256,
    value.billingAddressPayloadSha256,
    value.billingAddressEvidenceSha256,
  ];
  if (new Set(digests).size !== digests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["travelerEvidenceSha256"],
      message: "Encrypted checkout evidence domains must be independent.",
    });
  }
});

const checkoutEvidenceSchema = z.object({
  aggregateId: uuidSchema,
  orderId: uuidSchema,
  customerId: uuidSchema,
  checkoutState: z.literal("finalized"),
  checkoutRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  preparedStateReceiptSha256: sha256Schema,
  finalizedStateReceiptSha256: sha256Schema,
  finalizationEvidenceSha256: sha256Schema,
  authorizationBridgeReceiptSha256: sha256Schema,
  offerRefreshAttemptId: uuidSchema,
  offerRefreshExecutionScopeSha256: sha256Schema,
  offerBindingSha256: sha256Schema,
  normalizedOfferSha256: sha256Schema,
  offerTerminalResponseSha256: sha256Schema,
  offerExpiresAt: instantSchema,
  stripeExecutionAttemptId: uuidSchema,
  stripeExecutionWorkflowSha256: sha256Schema,
  stripeExecutionPrerequisiteSha256: sha256Schema,
  stripeExecutionCompletedReceiptSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  encryptedEvidence: encryptedCheckoutEvidenceSchema,
  ...authorityFalseShape,
}).strict().superRefine((value, context) => {
  if (
    value.preparedStateReceiptSha256 === value.finalizedStateReceiptSha256
    || value.orderReferenceSha256 === value.customerReferenceSha256
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finalizedStateReceiptSha256"],
      message: "Checkout state and identity evidence must be independent.",
    });
  }
});

const offerRefreshEvidenceSchema = z.object({
  attemptId: uuidSchema,
  attemptState: z.literal("succeeded"),
  attemptRevision: z.literal(2),
  executionScopeSha256: sha256Schema,
  offerIdSha256: sha256Schema,
  sourceOfferEvidenceSha256: sha256Schema,
  sourceShoppingExecutionScopeSha256: sha256Schema,
  offerBindingSha256: sha256Schema,
  normalizedOfferSha256: sha256Schema,
  terminalResponseSha256: sha256Schema,
  stateReceiptSha256: sha256Schema,
  providerDispatchCount: z.literal(1),
  amountCents: amountSchema,
  currency: z.literal("USD"),
  offerExpiresAt: instantSchema,
  observedAt: instantSchema,
  orderAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  settlementAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  servicingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
}).strict();

const stripeAuthorizationEvidenceBaseShape = {
  attemptId: uuidSchema,
  checkoutAggregateId: uuidSchema,
  stripeExecutionAttemptId: uuidSchema,
  stripeExecutionWorkflowSha256: sha256Schema,
  stripeExecutionPrerequisiteSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  confirmationWorkflowSha256: sha256Schema,
  confirmationPrerequisiteSha256: sha256Schema,
  checkoutPreparedStateReceiptSha256: sha256Schema,
  stripeExecutionCompletedReceiptSha256: sha256Schema,
  stateReceiptSha256: sha256Schema,
  observedPaymentIntentStatus: z.literal("requires_capture"),
  amountCents: amountSchema,
  currency: z.literal("USD"),
  processorEnvironment: z.literal("stripe_live"),
  livemode: z.literal(true),
  captureMethod: z.literal("manual"),
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  observedAmountCents: amountSchema,
  observedCurrency: z.literal("usd"),
  observedLivemode: z.literal(true),
  observedPaymentIntentReferenceSha256: sha256Schema,
  providerResponseSha256: sha256Schema,
  confirmationEvidenceSha256: sha256Schema,
  webhookEventSha256: sha256Schema.nullable(),
  retrievalEvidenceSha256: sha256Schema.nullable(),
  authorizationEvidenceAt: instantSchema,
  authorizationNotAfter: instantSchema,
  confirmationHandoffAuthorized: z.literal(false),
  providerDispatchAuthorized: z.literal(false),
  stripeDispatchAuthorized: z.literal(false),
  bookingAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  settlementAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  servicingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  blindRetryAuthorized: z.literal(false),
} as const;

const stripeAuthorizationEvidenceSchema = z.discriminatedUnion(
  "confirmationState",
  [
    z.object({
      ...stripeAuthorizationEvidenceBaseShape,
      confirmationState: z.literal("authorized_requires_capture"),
      confirmationRevision: z.literal(2),
      confirmationReconciledOutcome: z.null(),
    }).strict(),
    z.object({
      ...stripeAuthorizationEvidenceBaseShape,
      confirmationState: z.literal("reconciled"),
      confirmationRevision: z.literal(3),
      confirmationReconciledOutcome: z.literal("authorized_requires_capture"),
    }).strict(),
  ],
).superRefine((value, context) => {
  if (value.webhookEventSha256 === null && value.retrievalEvidenceSha256 === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retrievalEvidenceSha256"],
      message: "Stripe authorization requires webhook or retrieval evidence.",
    });
  }
});

const providerBindingSchema = z.object({
  providerId: z.string().min(8).max(128),
  adapterVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/),
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  pointOfSaleScopeReceiptDigest: sha256Schema,
  contentScopeReceiptDigest: sha256Schema,
}).strict();

const settlementBindingSchema = z.object({
  providerId: z.string().min(8).max(128),
  method: z.literal("provider_balance"),
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
  currency: z.literal("USD"),
}).strict();

const productionAuthorizationSchema = z.object({
  version: z.literal("flight-production-action-authorization-v2"),
  authorizationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/),
  operation: z.literal("create_order"),
  provider: z.literal("provider_production"),
  scopeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  requestDigest: sha256Schema,
  idempotencyRequestDigest: sha256Schema,
  providerBindingDigest: sha256Schema,
  paymentBindingDigest: z.null(),
  settlementBindingDigest: sha256Schema,
  nonce: z.string().regex(/^[0-9a-f]{32,128}$/),
  issuedAtSeconds: z.number().int().nonnegative(),
  expiresAtSeconds: z.number().int().positive(),
  signatureHex: sha256Schema,
}).strict();

const inputSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  checkoutEvidence: checkoutEvidenceSchema,
  offerRefreshEvidence: offerRefreshEvidenceSchema,
  stripeAuthorizationEvidence: stripeAuthorizationEvidenceSchema,
  providerBinding: providerBindingSchema,
  settlementBinding: settlementBindingSchema,
  productionAuthorization: productionAuthorizationSchema,
  dispatchNotAfter: instantSchema,
  dispatchTokenSha256: sha256Schema,
}).strict();

const decryptedMaterialSchema = z.object({
  version: z.literal("flight-consumer-live-duffel-order-decrypted-material-v1"),
  selectedOfferId: providerOfferIdSchema,
  passengers: z.array(z.object({
    id: providerPassengerIdSchema,
    title: z.enum(["mr", "mrs", "ms", "miss", "dr"]),
    gender: z.enum(["m", "f"]),
    given_name: z.string().trim().min(1).max(100),
    family_name: z.string().trim().min(1).max(100),
    born_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict()).min(1).max(9),
  contact: z.object({
    email: z.string().email().max(254),
    phone_number: z.string().regex(/^\+[1-9]\d{7,14}$/),
  }).strict(),
  travelerEvidenceSha256: sha256Schema,
  contactEvidenceSha256: sha256Schema,
  billingAddressEvidenceSha256: sha256Schema,
  decryptionEvidenceSha256: sha256Schema,
  selectedOfferReferenceSha256: sha256Schema,
  requestBodySha256: sha256Schema,
  requestEnvelopeSha256: sha256Schema,
}).strict();

const providerResponseSchema = z.object({
  data: z.object({
    id: providerOrderIdSchema,
    booking_reference: bookingReferenceSchema,
    offer_id: providerOfferIdSchema,
    live_mode: z.literal(true),
    type: z.literal("instant"),
    total_amount: z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/),
    total_currency: z.literal("USD"),
    payment_status: z.object({
      awaiting_payment: z.literal(false),
      paid_at: instantSchema,
    }).passthrough(),
  }).passthrough(),
}).passthrough();

const providerErrorSchema = z.object({
  errors: z.array(z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
    type: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
  }).passthrough()).min(1).max(16),
  meta: z.object({
    request_id: providerRequestIdSchema,
    status: z.number().int().min(400).max(599),
  }).passthrough(),
}).passthrough();

const transportResultSchema = z.object({
  kind: z.literal("http_response"),
  httpStatus: z.number().int().min(100).max(599),
  providerRequestId: providerRequestIdSchema,
  clientCorrelationId: providerRequestIdSchema,
  contentType: z.literal("application/json"),
  rawBody: z.instanceof(Uint8Array).refine(
    (value) => value.byteLength <= 2_097_152,
    "Duffel response exceeds the bounded two-megabyte evidence envelope.",
  ),
}).strict();

// A resolved transport means an HTTP exchange may have occurred. Preserve the
// provider's support identity before validating presentation fields/body
// shape, so malformed content metadata can never be persisted as a false
// "no response" outcome.
const transportResponseIdentitySchema = z.object({
  kind: z.literal("http_response"),
  httpStatus: z.number().int().min(100).max(599),
  providerRequestId: providerRequestIdSchema,
}).passthrough();

const transportNoResponseSchema = z.object({
  kind: z.literal("no_response"),
  clientCorrelationId: providerRequestIdSchema,
  failureKind: z.enum([
    "aborted_before_headers",
    "connection_refused",
    "dns_error",
    "timeout_before_headers",
    "tls_error",
  ]),
}).strict();

const boundedTransportBodySchema = z.instanceof(Uint8Array).refine(
  (value) => value.byteLength <= 2_097_152,
  "Duffel response exceeds the bounded two-megabyte evidence envelope.",
);

const encryptedReferenceResultSchema = z.object({
  version: z.literal("flight-consumer-live-duffel-reference-encryption-result-v1"),
  ciphertext: encryptedReferenceSchema,
  plaintextReferenceSha256: sha256Schema,
}).strict();

const AUTHORIZATION_REPLAY_REASON =
  "Per-call Production authorization nonce has already been consumed.";

export const FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_DECRYPTION_VERSION =
  "flight-consumer-live-duffel-order-decryption-v1" as const;
export const FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_TRANSPORT_VERSION =
  "flight-consumer-live-duffel-order-create-transport-v1" as const;
export const FLIGHT_CONSUMER_LIVE_DUFFEL_REFERENCE_ENCRYPTION_VERSION =
  "flight-consumer-live-duffel-reference-encryption-v1" as const;

export type FlightConsumerLiveDuffelOrderCreateRequest = Readonly<{
  data: Readonly<{
    type: "instant";
    selected_offers: readonly [string];
    payments: readonly [Readonly<{
      type: "balance";
      currency: "USD";
      amount: string;
    }>];
    passengers: readonly Readonly<{
      id: string;
      title: "mr" | "mrs" | "ms" | "miss" | "dr";
      gender: "m" | "f";
      given_name: string;
      family_name: string;
      born_on: string;
      email: string;
      phone_number: string;
    }>[];
  }>;
}>;

export type FlightConsumerLiveDuffelOrderDecryptionPort = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_DECRYPTION_VERSION;
  logsPlaintext: false;
  persistsPlaintext: false;
  buildsCanonicalRequestDigest: true;
  decryptCheckoutEvidence: (
    input: z.output<typeof encryptedCheckoutEvidenceSchema>,
  ) => Promise<unknown>;
}>;

export type FlightConsumerLiveDuffelOrderCreateTransport = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_TRANSPORT_VERSION;
  method: "POST";
  path: "/air/orders";
  duffelVersion: "v2";
  providerEnvironment: "duffel_live";
  livemode: true;
  requestTimeoutMs: number;
  clientCorrelationIdImplemented: true;
  retainsProviderRequestId: true;
  returnsExplicitOutcomeEnvelope: true;
  providerBindingDigest: string;
  settlementBindingDigest: string;
  retryImplemented: false;
  logsRequest: false;
  logsResponse: false;
  persistsRequest: false;
  persistsResponse: false;
  maxAirOrdersPosts: 1;
  createOrder: (
    request: FlightConsumerLiveDuffelOrderCreateRequest,
    options: Readonly<{
      clientCorrelationId: string;
      requestTimeoutMs: number;
    }>,
  ) => Promise<
    | Readonly<{
      kind: "no_response";
      clientCorrelationId: string;
      failureKind:
        | "aborted_before_headers"
        | "connection_refused"
        | "dns_error"
        | "timeout_before_headers"
        | "tls_error";
    }>
    | Readonly<{
      kind: "http_response";
      httpStatus: number;
      providerRequestId: string;
      clientCorrelationId: string;
      contentType: string;
      rawBody: Uint8Array;
    }>
  >;
}>;

export type FlightConsumerLiveDuffelReferenceEncryptionPort = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_DUFFEL_REFERENCE_ENCRYPTION_VERSION;
  encryptReference: (input: Readonly<{
    kind: "provider_order" | "provider_booking";
    plaintextReference: string;
    plaintextReferenceSha256: string;
    executionWorkflowSha256: string;
  }>) => Promise<unknown>;
}>;

type ResultBase = Readonly<{
  version: "flight-consumer-live-duffel-order-create-result-v1";
  executionWorkflowSha256: string;
  executionPrerequisiteSha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  providerRequestCount: 0 | 1;
  airOrdersPostCount: 0 | 1;
  clientCorrelationId: string | null;
  clientCorrelationIdSha256: string | null;
  providerRequestId: string | null;
  providerRequestIdSha256: string | null;
  providerDispatchAuthorized: false;
  bookingAuthorized: false;
  orderAuthorized: false;
  paymentAuthorized: false;
  captureAuthorized: false;
  refundAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  servicingAuthorized: false;
  consumerReleaseEnabled: false;
  blindRetryAuthorized: false;
}>;

export type FlightConsumerLiveDuffelOrderCreateResult =
  | (ResultBase & Readonly<{
    decision: "succeeded";
    attemptId: string;
    attemptState: "succeeded";
    stateReceiptSha256: string;
    providerOrderReferenceSha256: string;
    providerBookingReferenceSha256: string | null;
    stripeCaptureRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "failed";
    failureCode: string;
    attemptId: string;
    attemptState: "failed";
    stateReceiptSha256: string;
    providerOrderReferenceSha256: null;
    providerBookingReferenceSha256: null;
    stripeCaptureRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "ambiguous";
    ambiguityCode: string;
    attemptId: string;
    attemptState: "ambiguous";
    stateReceiptSha256: string;
    providerOrderReferenceSha256: null;
    providerBookingReferenceSha256: null;
    stripeCaptureRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "replay";
    replayStage: "authority" | "prepare" | "claim" | "complete";
    attemptId: string | null;
    attemptState: "prepared" | "dispatching" | "succeeded" | "failed"
      | "ambiguous" | "reconciled" | null;
    stateReceiptSha256: string | null;
    providerOrderReferenceSha256: string | null;
    providerBookingReferenceSha256: string | null;
    stripeCaptureRemainsLaterGate: true;
  }>);

export class FlightConsumerLiveDuffelOrderCreateError extends Error {
  readonly reason:
    | "invalid_input"
    | "invalid_dependency"
    | "evidence_refused"
    | "decryption_refused"
    | "authority_refused"
    | "persistence_refused"
    | "terminal_persistence_failed";
  readonly blindRetryAuthorized = false as const;

  constructor(reason: FlightConsumerLiveDuffelOrderCreateError["reason"]) {
    super("Flight Consumer Live Duffel order creation was refused.");
    this.name = "FlightConsumerLiveDuffelOrderCreateError";
    this.reason = reason;
  }
}

export type FlightConsumerLiveDuffelOrderCreateOrchestrator = Readonly<{
  version: "flight-consumer-live-duffel-order-create-orchestrator-v1";
  routeExposed: false;
  consumerReachable: false;
  environmentReadImplemented: false;
  stripeCaptureImplemented: false;
  refundImplemented: false;
  ticketingImplemented: false;
  servicingImplemented: false;
  blindProviderRetryImplemented: false;
  maxAirOrdersPosts: 1;
  execute: (input: unknown) => Promise<FlightConsumerLiveDuffelOrderCreateResult>;
}>;

type Dependencies = Readonly<{
  runtimePolicy: FlightRuntimePolicy;
  providerExecutionBinding: FlightRuntimeProviderBinding;
  settlementExecutionBinding: FlightRuntimeSettlementBinding;
  productionAuthorizationVerifier: FlightProductionAuthorizationVerifier;
  executionPersistence: FlightConsumerLiveDuffelOrderExecutionPersistence;
  decryption: FlightConsumerLiveDuffelOrderDecryptionPort;
  duffelTransport: FlightConsumerLiveDuffelOrderCreateTransport;
  referenceEncryption: FlightConsumerLiveDuffelReferenceEncryptionPort;
}>;

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalSha256(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function amountString(amountCents: number) {
  const major = Math.floor(amountCents / 100);
  const minor = String(amountCents % 100).padStart(2, "0");
  return `${major}.${minor}`;
}

const definitiveDuffelAuthenticationCodes = new Set([
  "access_token_not_found",
  "expired_access_token",
  "invalid_authorization_header",
  "missing_authorization_header",
  "insufficient_permissions",
]);

const definitiveDuffelInvalidRequestCodes = new Set([
  "bad_request",
  "invalid_content_type_header",
  "missing_content_type_header",
  "invalid_version_header",
  "missing_version_header",
  "unsupported_version",
  "unavailable_in_version",
  "invalid_data_param",
  "malformed_data_param",
  "missing_data_param",
  "not_found",
  "unsupported_format",
]);

const definitiveDuffelCreateOrderCodes = new Set([
  "offer_no_longer_available",
  "price_changed",
  "payment_declined",
  "duplicate_passenger_names",
  "ancillary_service_not_available",
  "invalid_card_expiration_date",
  "ineligible_airline_credit",
  "invalid_email_address",
  "invalid_phone_number",
  "invalid_passenger_title",
  "invalid_passenger_name",
  "invalid_loyalty_card",
  "order_passengers_incompatible_with_offer",
  "offer_expired",
  "insufficient_balance",
  "three_d_secure_session_not_found",
  "three_d_secure_session_not_ready_for_payment",
  "three_d_secure_session_expired",
  "payment_amount_does_not_match_order_amount",
  "payment_currency_does_not_match_order_currency",
  "order_not_created",
  "high_fraud_risk",
  "validation_required",
  "validation_format",
  "validation_length",
  "validation_inclusion",
]);

function classifyDuffelNoBookingResponse(input: Readonly<{
  httpStatus: number;
  providerRequestId: string;
  body: unknown;
}>): "definitive" | "definitive_retryable" | "ambiguous" {
  const parsed = providerErrorSchema.safeParse(input.body);
  if (
    !parsed.success
    || parsed.data.meta.status !== input.httpStatus
    || parsed.data.meta.request_id !== input.providerRequestId
  ) return "ambiguous";

  if (
    input.httpStatus === 429
    && parsed.data.errors.every((error) =>
      error.code === "rate_limit_exceeded"
      && error.type === "rate_limit_error"
    )
  ) return "definitive_retryable";

  if (
    [400, 401, 403, 404, 406].includes(input.httpStatus)
    && parsed.data.errors.every((error) =>
      (definitiveDuffelAuthenticationCodes.has(error.code)
        && error.type === "authentication_error")
      || (definitiveDuffelInvalidRequestCodes.has(error.code)
        && error.type === "invalid_request_error")
    )
  ) return "definitive";

  if (
    input.httpStatus === 422
    && parsed.data.errors.every((error) =>
      (definitiveDuffelInvalidRequestCodes.has(error.code)
        && error.type === "invalid_request_error")
      || (definitiveDuffelCreateOrderCodes.has(error.code)
        && [
          "airline_error",
          "invalid_state_error",
          "validation_error",
          "fraud_error",
        ].includes(error.type))
    )
  ) return "definitive";

  return "ambiguous";
}

function resultBase(input: Readonly<{
  executionWorkflowSha256: string;
  executionPrerequisiteSha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  providerRequestCount: 0 | 1;
  clientCorrelationId?: string | null;
  providerRequestId?: string | null;
}>): ResultBase {
  const clientCorrelationId = input.clientCorrelationId ?? null;
  const providerRequestId = input.providerRequestId ?? null;
  return Object.freeze({
    version: "flight-consumer-live-duffel-order-create-result-v1" as const,
    ...input,
    clientCorrelationId,
    clientCorrelationIdSha256: clientCorrelationId === null
      ? null
      : sha256Utf8(clientCorrelationId),
    providerRequestId,
    providerRequestIdSha256: providerRequestId === null
      ? null
      : sha256Utf8(providerRequestId),
    airOrdersPostCount: input.providerRequestCount,
    providerDispatchAuthorized: false as const,
    bookingAuthorized: false as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    settlementAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
  });
}

function validateDependencies(dependencies: Dependencies) {
  const persistence = dependencies.executionPersistence;
  if (
    persistence.version !== "flight-consumer-live-duffel-order-execution-persistence-v1"
    || persistence.migrationVersion !== "202608260108"
    || persistence.supportIdentityMigrationVersion !== "202608260112"
    || persistence.providerEnvironment !== "duffel_live"
    || persistence.livemode !== true
    || persistence.routeExposed !== false
    || persistence.duffelTransportImplemented !== false
    || persistence.claimGrantsProviderDispatchAuthority !== false
    || persistence.stripeAuthorizedRequiresCaptureEvidenceRequired !== true
    || persistence.preTransportOfferFreshnessRecheckRequired !== true
    || persistence.providerDispatchAuthorized !== false
    || persistence.bookingAuthorized !== false
    || persistence.orderAuthorized !== false
    || persistence.paymentAuthorized !== false
    || persistence.captureAuthorized !== false
    || persistence.refundAuthorized !== false
    || persistence.settlementAuthorized !== false
    || persistence.ticketingAuthorized !== false
    || persistence.servicingAuthorized !== false
    || persistence.consumerReleaseEnabled !== false
    || persistence.blindRetryAuthorized !== false
    || persistence.maxAirOrdersPostRequests !== 1
    || dependencies.decryption.version !== FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_DECRYPTION_VERSION
    || dependencies.decryption.logsPlaintext !== false
    || dependencies.decryption.persistsPlaintext !== false
    || dependencies.decryption.buildsCanonicalRequestDigest !== true
    || dependencies.duffelTransport.version !== FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_TRANSPORT_VERSION
    || dependencies.duffelTransport.method !== "POST"
    || dependencies.duffelTransport.path !== "/air/orders"
    || dependencies.duffelTransport.duffelVersion !== "v2"
    || dependencies.duffelTransport.providerEnvironment !== "duffel_live"
    || dependencies.duffelTransport.livemode !== true
    || !Number.isSafeInteger(dependencies.duffelTransport.requestTimeoutMs)
    || dependencies.duffelTransport.requestTimeoutMs < 130_000
    || dependencies.duffelTransport.requestTimeoutMs > 180_000
    || dependencies.duffelTransport.clientCorrelationIdImplemented !== true
    || dependencies.duffelTransport.retainsProviderRequestId !== true
    || dependencies.duffelTransport.returnsExplicitOutcomeEnvelope !== true
    || dependencies.duffelTransport.providerBindingDigest
      !== digestFlightRuntimeProviderBinding(dependencies.providerExecutionBinding)
    || dependencies.duffelTransport.settlementBindingDigest
      !== digestFlightRuntimeSettlementBinding(dependencies.settlementExecutionBinding)
    || dependencies.duffelTransport.retryImplemented !== false
    || dependencies.duffelTransport.logsRequest !== false
    || dependencies.duffelTransport.logsResponse !== false
    || dependencies.duffelTransport.persistsRequest !== false
    || dependencies.duffelTransport.persistsResponse !== false
    || dependencies.duffelTransport.maxAirOrdersPosts !== 1
    || dependencies.referenceEncryption.version
      !== FLIGHT_CONSUMER_LIVE_DUFFEL_REFERENCE_ENCRYPTION_VERSION
  ) {
    throw new FlightConsumerLiveDuffelOrderCreateError("invalid_dependency");
  }
}

function verifyEvidenceBindings(input: z.output<typeof inputSchema>) {
  const checkout = input.checkoutEvidence;
  const offer = input.offerRefreshEvidence;
  const stripe = input.stripeAuthorizationEvidence;
  const exactOfferBindingSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-duffel-live-offer-binding-v1",
    providerCode: "duffel",
    providerEnvironment: "live",
    offerIdSha256: offer.offerIdSha256,
    sourceOfferEvidenceSha256: offer.sourceOfferEvidenceSha256,
    sourceShoppingExecutionScopeSha256:
      offer.sourceShoppingExecutionScopeSha256,
  });
  if (
    checkout.orderId !== input.orderId
    || checkout.customerId !== input.customerId
    || checkout.offerRefreshAttemptId !== offer.attemptId
    || checkout.offerRefreshExecutionScopeSha256 !== offer.executionScopeSha256
    || checkout.offerBindingSha256 !== offer.offerBindingSha256
    || offer.offerBindingSha256 !== exactOfferBindingSha256
    || checkout.normalizedOfferSha256 !== offer.normalizedOfferSha256
    || checkout.offerTerminalResponseSha256 !== offer.terminalResponseSha256
    || checkout.offerExpiresAt !== offer.offerExpiresAt
    || checkout.amountCents !== offer.amountCents
    || stripe.checkoutAggregateId !== checkout.aggregateId
    || stripe.stripeExecutionAttemptId !== checkout.stripeExecutionAttemptId
    || stripe.stripeExecutionWorkflowSha256
      !== checkout.stripeExecutionWorkflowSha256
    || stripe.stripeExecutionPrerequisiteSha256
      !== checkout.stripeExecutionPrerequisiteSha256
    || stripe.stripeExecutionCompletedReceiptSha256
      !== checkout.stripeExecutionCompletedReceiptSha256
    || stripe.paymentBindingSha256 !== checkout.paymentBindingSha256
    || stripe.orderReferenceSha256 !== checkout.orderReferenceSha256
    || stripe.customerReferenceSha256 !== checkout.customerReferenceSha256
    || stripe.paymentIntentReferenceSha256
      !== stripe.observedPaymentIntentReferenceSha256
    || stripe.checkoutPreparedStateReceiptSha256 !== checkout.preparedStateReceiptSha256
    || stripe.executionScopeSha256 !== checkout.executionScopeSha256
    || stripe.amountCents !== checkout.amountCents
    || stripe.observedAmountCents !== checkout.amountCents
    || input.providerBinding.providerId !== input.settlementBinding.providerId
    || input.productionAuthorization.scopeId !== input.orderId
    || input.productionAuthorization.providerBindingDigest
      !== digestFlightRuntimeProviderBinding(input.providerBinding)
    || input.productionAuthorization.settlementBindingDigest
      !== digestFlightRuntimeSettlementBinding(input.settlementBinding)
  ) {
    throw new FlightConsumerLiveDuffelOrderCreateError("evidence_refused");
  }
  const dispatch = Date.parse(input.dispatchNotAfter);
  const expiry = Date.parse(checkout.offerExpiresAt);
  const authorizationEvidenceAt = Date.parse(stripe.authorizationEvidenceAt);
  const authorizationNotAfter = Date.parse(stripe.authorizationNotAfter);
  if (
    !Number.isFinite(dispatch)
    || !Number.isFinite(expiry)
    || !Number.isFinite(authorizationEvidenceAt)
    || !Number.isFinite(authorizationNotAfter)
    || dispatch >= expiry
    || dispatch > authorizationNotAfter
    || authorizationEvidenceAt >= authorizationNotAfter
  ) {
    throw new FlightConsumerLiveDuffelOrderCreateError("evidence_refused");
  }
}

function authorizationEvidenceSha256(
  authorization: FlightProductionActionAuthorization,
) {
  return sha256FlightEvidence({
    version: "flight-consumer-live-duffel-order-create-authorization-evidence-v1",
    authorizationId: authorization.authorizationId,
    operation: authorization.operation,
    provider: authorization.provider,
    scopeId: authorization.scopeId,
    requestDigest: authorization.requestDigest,
    idempotencyRequestDigest: authorization.idempotencyRequestDigest,
    providerBindingDigest: authorization.providerBindingDigest,
    paymentBindingDigest: authorization.paymentBindingDigest,
    settlementBindingDigest: authorization.settlementBindingDigest,
    nonce: authorization.nonce,
    issuedAtSeconds: authorization.issuedAtSeconds,
    expiresAtSeconds: authorization.expiresAtSeconds,
    signatureHex: authorization.signatureHex,
  });
}

export function createFlightConsumerLiveDuffelOrderCreateOrchestrator(
  dependencies: Dependencies,
): FlightConsumerLiveDuffelOrderCreateOrchestrator {
  validateDependencies(dependencies);

  return Object.freeze({
    version: "flight-consumer-live-duffel-order-create-orchestrator-v1" as const,
    routeExposed: false as const,
    consumerReachable: false as const,
    environmentReadImplemented: false as const,
    stripeCaptureImplemented: false as const,
    refundImplemented: false as const,
    ticketingImplemented: false as const,
    servicingImplemented: false as const,
    blindProviderRetryImplemented: false as const,
    maxAirOrdersPosts: 1 as const,

    async execute(untrustedInput: unknown) {
      const accepted = inputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveDuffelOrderCreateError("invalid_input");
      }
      const input = accepted.data;
      verifyEvidenceBindings(input);
      if (
        input.productionAuthorization.providerBindingDigest
          !== digestFlightRuntimeProviderBinding(
            dependencies.providerExecutionBinding,
          )
        || input.productionAuthorization.settlementBindingDigest
          !== digestFlightRuntimeSettlementBinding(
            dependencies.settlementExecutionBinding,
          )
      ) {
        throw new FlightConsumerLiveDuffelOrderCreateError("evidence_refused");
      }

      let initialTrustedNow: number;
      try {
        initialTrustedNow = dependencies.productionAuthorizationVerifier
          .readTrustedTimeSeconds();
      } catch {
        throw new FlightConsumerLiveDuffelOrderCreateError("authority_refused");
      }
      const dispatchNotAfterMs = Date.parse(input.dispatchNotAfter);
      const offerExpiresAtMs = Date.parse(input.checkoutEvidence.offerExpiresAt);
      const authorizationNotAfterMs = Date.parse(
        input.stripeAuthorizationEvidence.authorizationNotAfter,
      );
      const observedAtMs = Date.parse(input.offerRefreshEvidence.observedAt);
      if (
        !Number.isSafeInteger(initialTrustedNow)
        || initialTrustedNow < 0
        || observedAtMs > initialTrustedNow * 1000
        || dispatchNotAfterMs <= initialTrustedNow * 1000 + 15_000
        || dispatchNotAfterMs > initialTrustedNow * 1000 + 120_000
        || dispatchNotAfterMs > input.productionAuthorization.expiresAtSeconds * 1000
        || dispatchNotAfterMs >= offerExpiresAtMs
        || dispatchNotAfterMs > authorizationNotAfterMs
      ) {
        throw new FlightConsumerLiveDuffelOrderCreateError("evidence_refused");
      }

      let decrypted: z.output<typeof decryptedMaterialSchema>;
      try {
        const raw = await dependencies.decryption.decryptCheckoutEvidence(
          input.checkoutEvidence.encryptedEvidence,
        );
        const parsed = decryptedMaterialSchema.safeParse(raw);
        if (!parsed.success) throw new Error("invalid_decryption_result");
        decrypted = parsed.data;
      } catch {
        throw new FlightConsumerLiveDuffelOrderCreateError("decryption_refused");
      }
      let selectedOfferIdSha256: string;
      try {
        selectedOfferIdSha256 =
          deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
            decrypted.selectedOfferId,
          );
      } catch {
        throw new FlightConsumerLiveDuffelOrderCreateError("decryption_refused");
      }
      if (
        decrypted.travelerEvidenceSha256
          !== input.checkoutEvidence.encryptedEvidence.travelerEvidenceSha256
        || decrypted.contactEvidenceSha256
          !== input.checkoutEvidence.encryptedEvidence.contactEvidenceSha256
        || decrypted.billingAddressEvidenceSha256
          !== input.checkoutEvidence.encryptedEvidence.billingAddressEvidenceSha256
        || decrypted.selectedOfferReferenceSha256
          !== sha256Utf8(decrypted.selectedOfferId)
        || !equalSha256(
          selectedOfferIdSha256,
          input.offerRefreshEvidence.offerIdSha256,
        )
        || new Set(decrypted.passengers.map((passenger) => passenger.id)).size
          !== decrypted.passengers.length
      ) {
        throw new FlightConsumerLiveDuffelOrderCreateError("decryption_refused");
      }

      const request = Object.freeze({
        data: Object.freeze({
          type: "instant" as const,
          selected_offers: Object.freeze([decrypted.selectedOfferId] as const),
          payments: Object.freeze([Object.freeze({
            type: "balance" as const,
            currency: "USD" as const,
            amount: amountString(input.checkoutEvidence.amountCents),
          })] as const),
          passengers: Object.freeze(decrypted.passengers.map((passenger) =>
            Object.freeze({
              ...passenger,
              email: decrypted.contact.email,
              phone_number: decrypted.contact.phone_number,
            })
          )),
        }),
      }) satisfies FlightConsumerLiveDuffelOrderCreateRequest;
      const requestBodySha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-create-request-body-v1",
        data: request.data,
      });
      if (!equalSha256(requestBodySha256, decrypted.requestBodySha256)) {
        throw new FlightConsumerLiveDuffelOrderCreateError(
          "decryption_refused",
        );
      }
      const selectedOfferReferenceSha256 =
        decrypted.selectedOfferReferenceSha256;
      const requestEnvelopeSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-create-request-envelope-v1",
        method: "POST",
        path: "/air/orders",
        contentType: "application/json",
        requestBodySha256,
        selectedOfferReferenceSha256,
      });
      if (requestEnvelopeSha256 !== decrypted.requestEnvelopeSha256) {
        throw new FlightConsumerLiveDuffelOrderCreateError(
          "decryption_refused",
        );
      }
      const idempotency = buildFlightIdempotencyIntent({
        operation: "create_order",
        scopeId: input.orderId,
        requestId: input.checkoutEvidence.aggregateId,
        payload: {
          version: "flight-consumer-live-duffel-order-create-idempotency-v1",
          requestEnvelopeSha256,
          checkoutAggregateId: input.checkoutEvidence.aggregateId,
          checkoutFinalizedStateReceiptSha256:
            input.checkoutEvidence.finalizedStateReceiptSha256,
          authorizationBridgeReceiptSha256:
            input.checkoutEvidence.authorizationBridgeReceiptSha256,
          offerRefreshStateReceiptSha256:
            input.offerRefreshEvidence.stateReceiptSha256,
          stripeAuthorizationStateReceiptSha256:
            input.stripeAuthorizationEvidence.stateReceiptSha256,
          paymentIntentReferenceSha256:
            input.stripeAuthorizationEvidence.observedPaymentIntentReferenceSha256,
        },
      });
      const clientCorrelationId =
        `flt_order_${requestEnvelopeSha256.slice(0, 48)}`;
      if (
        input.productionAuthorization.requestDigest !== requestEnvelopeSha256
        || input.productionAuthorization.idempotencyRequestDigest
          !== idempotency.requestDigest
      ) {
        throw new FlightConsumerLiveDuffelOrderCreateError("authority_refused");
      }

      const executionWorkflowSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-create-workflow-v1",
        migrationVersion: "202608260108",
        orderId: input.orderId,
        customerId: input.customerId,
        checkoutAggregateId: input.checkoutEvidence.aggregateId,
        checkoutBindingSha256: input.checkoutEvidence.checkoutBindingSha256,
        checkoutFinalizedStateReceiptSha256:
          input.checkoutEvidence.finalizedStateReceiptSha256,
        authorizationBridgeReceiptSha256:
          input.checkoutEvidence.authorizationBridgeReceiptSha256,
        offerRefreshAttemptId: input.offerRefreshEvidence.attemptId,
        offerRefreshStateReceiptSha256:
          input.offerRefreshEvidence.stateReceiptSha256,
        stripeAuthorizationAttemptId:
          input.stripeAuthorizationEvidence.attemptId,
        stripeAuthorizationStateReceiptSha256:
          input.stripeAuthorizationEvidence.stateReceiptSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        clientCorrelationIdSha256: sha256Utf8(clientCorrelationId),
        authorizationSha256: authorizationEvidenceSha256(
          input.productionAuthorization,
        ),
        decryptionEvidenceSha256: decrypted.decryptionEvidenceSha256,
      });
      const executionPrerequisiteSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-create-prerequisite-v1",
        executionWorkflowSha256,
        dispatchNotAfter: input.dispatchNotAfter,
        offerExpiresAt: input.checkoutEvidence.offerExpiresAt,
        authorizationNotAfter:
          input.stripeAuthorizationEvidence.authorizationNotAfter,
        dispatchTokenSha256: input.dispatchTokenSha256,
        decryptionVersion: dependencies.decryption.version,
        transportVersion: dependencies.duffelTransport.version,
        transportRequestTimeoutMs:
          dependencies.duffelTransport.requestTimeoutMs,
        transportProviderBindingSha256:
          dependencies.duffelTransport.providerBindingDigest,
        transportSettlementBindingSha256:
          dependencies.duffelTransport.settlementBindingDigest,
        referenceEncryptionVersion: dependencies.referenceEncryption.version,
      });
      const orderExecutionBindingSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-execution-binding-v1",
        executionWorkflowSha256,
        requestEnvelopeSha256,
        checkoutBindingSha256: input.checkoutEvidence.checkoutBindingSha256,
        offerBindingSha256: input.checkoutEvidence.offerBindingSha256,
        confirmationBindingSha256:
          input.stripeAuthorizationEvidence.confirmationBindingSha256,
        providerBindingSha256: digestFlightRuntimeProviderBinding(
          input.providerBinding,
        ),
        settlementBindingSha256: digestFlightRuntimeSettlementBinding(
          input.settlementBinding,
        ),
      });
      const zeroRequestBase = resultBase({
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        providerRequestCount: 0,
      });

      const decision = await evaluateFlightRuntimeAuthorization(
        dependencies.runtimePolicy,
        "create_order",
        "provider_production",
        {
          executionBinding: dependencies.providerExecutionBinding,
          paymentExecutionBinding: null,
          settlementExecutionBinding: dependencies.settlementExecutionBinding,
          productionAuthorization: input.productionAuthorization,
          productionAuthorizationVerifier:
            dependencies.productionAuthorizationVerifier,
          scopeId: input.orderId,
          requestDigest: requestEnvelopeSha256,
          idempotencyRequestDigest: idempotency.requestDigest,
        },
      );
      if (!decision.authorized) {
        if (
          decision.reasons.length === 1
          && decision.reasons[0] === AUTHORIZATION_REPLAY_REASON
        ) {
          return Object.freeze({
            ...zeroRequestBase,
            decision: "replay" as const,
            replayStage: "authority" as const,
            attemptId: null,
            attemptState: null,
            stateReceiptSha256: null,
            providerOrderReferenceSha256: null,
            providerBookingReferenceSha256: null,
            stripeCaptureRemainsLaterGate: true as const,
          });
        }
        throw new FlightConsumerLiveDuffelOrderCreateError("authority_refused");
      }

      let prepared: Awaited<ReturnType<
        FlightConsumerLiveDuffelOrderExecutionPersistence["prepare"]
      >>;
      try {
        prepared = await dependencies.executionPersistence.prepare({
          checkoutEvidenceAggregateId: input.checkoutEvidence.aggregateId,
          checkoutExecutionScopeSha256:
            input.checkoutEvidence.executionScopeSha256,
          checkoutBindingSha256: input.checkoutEvidence.checkoutBindingSha256,
          checkoutStateReceiptSha256:
            input.checkoutEvidence.finalizedStateReceiptSha256,
          offerRefreshAttemptId: input.offerRefreshEvidence.attemptId,
          offerRefreshExecutionScopeSha256:
            input.offerRefreshEvidence.executionScopeSha256,
          offerBindingSha256: input.offerRefreshEvidence.offerBindingSha256,
          normalizedOfferSha256:
            input.offerRefreshEvidence.normalizedOfferSha256,
          offerTerminalResponseSha256:
            input.offerRefreshEvidence.terminalResponseSha256,
          orderReferenceSha256: input.checkoutEvidence.orderReferenceSha256,
          customerReferenceSha256:
            input.checkoutEvidence.customerReferenceSha256,
          executionScopeSha256: input.checkoutEvidence.executionScopeSha256,
          idempotencySha256: idempotency.requestDigest,
          orderExecutionBindingSha256,
          orderExecutionPrerequisiteSha256: executionPrerequisiteSha256,
          orderRequestSha256: requestEnvelopeSha256,
          amountCents: input.checkoutEvidence.amountCents,
          currency: "USD",
          dispatchNotAfter: input.dispatchNotAfter,
        });
      } catch {
        throw new FlightConsumerLiveDuffelOrderCreateError("persistence_refused");
      }
      if (prepared.decision === "replay") {
        let supportIdentity: Awaited<ReturnType<
          FlightConsumerLiveDuffelOrderExecutionPersistence[
            "readSupportIdentity"
          ]
        >>;
        try {
          supportIdentity = await dependencies.executionPersistence
            .readSupportIdentity({
              attemptId: prepared.attempt_id,
              executionScopeSha256:
                input.checkoutEvidence.executionScopeSha256,
              orderExecutionBindingSha256,
              orderRequestSha256: requestEnvelopeSha256,
            });
        } catch {
          throw new FlightConsumerLiveDuffelOrderCreateError(
            "persistence_refused",
          );
        }
        const replayBase = resultBase({
          executionWorkflowSha256,
          executionPrerequisiteSha256,
          requestEnvelopeSha256,
          idempotencyRequestSha256: idempotency.requestDigest,
          providerRequestCount: supportIdentity.provider_request_count,
          clientCorrelationId: supportIdentity.client_correlation_id,
          providerRequestId: supportIdentity.provider_request_id,
        });
        if (
          supportIdentity.attempt_id !== prepared.attempt_id
          || supportIdentity.attempt_state !== prepared.attempt_state
          || supportIdentity.attempt_revision !== prepared.attempt_revision
          || supportIdentity.provider_request_count
            !== prepared.provider_request_count
          || supportIdentity.air_orders_post_count
            !== prepared.air_orders_post_count
          || supportIdentity.state_receipt_sha256
            !== prepared.state_receipt_sha256
          || supportIdentity.provider_order_reference_sha256
            !== prepared.provider_order_reference_sha256
          || supportIdentity.provider_booking_reference_sha256
            !== prepared.provider_booking_reference_sha256
          || replayBase.clientCorrelationIdSha256
            !== supportIdentity.client_correlation_id_sha256
          || replayBase.providerRequestIdSha256
            !== supportIdentity.provider_request_id_sha256
        ) {
          throw new FlightConsumerLiveDuffelOrderCreateError(
            "persistence_refused",
          );
        }
        return Object.freeze({
          ...replayBase,
          decision: "replay" as const,
          replayStage: "prepare" as const,
          attemptId: prepared.attempt_id,
          attemptState: prepared.attempt_state,
          stateReceiptSha256: prepared.state_receipt_sha256,
          providerOrderReferenceSha256: prepared.provider_order_reference_sha256,
          providerBookingReferenceSha256:
            prepared.provider_booking_reference_sha256,
          stripeCaptureRemainsLaterGate: true as const,
        });
      }

      let claimed: Awaited<ReturnType<
        FlightConsumerLiveDuffelOrderExecutionPersistence["claim"]
      >>;
      try {
        claimed = await dependencies.executionPersistence.claim({
          attemptId: prepared.attempt_id,
          expectedRevision: 0,
          executionScopeSha256: input.checkoutEvidence.executionScopeSha256,
          orderExecutionBindingSha256,
          orderRequestSha256: requestEnvelopeSha256,
          dispatchTokenSha256: input.dispatchTokenSha256,
        });
      } catch {
        throw new FlightConsumerLiveDuffelOrderCreateError("persistence_refused");
      }
      if (claimed.attempt_id !== prepared.attempt_id) {
        throw new FlightConsumerLiveDuffelOrderCreateError("persistence_refused");
      }
      if (claimed.decision === "replay") {
        return Object.freeze({
          ...zeroRequestBase,
          decision: "replay" as const,
          replayStage: "claim" as const,
          attemptId: claimed.attempt_id,
          attemptState: claimed.attempt_state,
          stateReceiptSha256: claimed.state_receipt_sha256,
          providerOrderReferenceSha256: null,
          providerBookingReferenceSha256: null,
          stripeCaptureRemainsLaterGate: true as const,
        });
      }

      const terminalize = async (terminal: Readonly<{
        state: "failed" | "ambiguous";
        code: string;
        providerRequestCount: 0 | 1;
        httpStatus: number | null;
        terminalResponseSha256: string | null;
        providerRequestId?: string | null;
        clientCorrelationId?: string | null;
      }>): Promise<FlightConsumerLiveDuffelOrderCreateResult> => {
        const providerRequestIdSha256 = terminal.providerRequestId === null
          || terminal.providerRequestId === undefined
          ? null
          : sha256Utf8(terminal.providerRequestId);
        const clientCorrelationIdSha256 = terminal.clientCorrelationId === null
          || terminal.clientCorrelationId === undefined
          ? null
          : sha256Utf8(terminal.clientCorrelationId);
        const completionEvidenceSha256 = sha256FlightEvidence({
          version: "flight-consumer-live-duffel-order-create-terminal-v1",
          attemptId: claimed.attempt_id,
          terminalState: terminal.state,
          terminalCode: terminal.code,
          providerRequestCount: terminal.providerRequestCount,
          httpStatus: terminal.httpStatus,
          terminalResponseSha256: terminal.terminalResponseSha256,
          providerRequestIdSha256,
          clientCorrelationIdSha256,
          executionWorkflowSha256,
          executionPrerequisiteSha256,
          requestEnvelopeSha256,
          blindRetryAuthorized: false,
        });
        const ambiguityEvidenceSha256 = terminal.state === "ambiguous"
          ? sha256FlightEvidence({
            version: "flight-consumer-live-duffel-order-create-ambiguity-v1",
            completionEvidenceSha256,
            terminalCode: terminal.code,
            attemptId: claimed.attempt_id,
            reconciliationRequired: true,
          })
          : null;
        try {
          const completed = await dependencies.executionPersistence.complete({
            attemptId: claimed.attempt_id,
            expectedRevision: 1,
            executionScopeSha256: input.checkoutEvidence.executionScopeSha256,
            orderExecutionBindingSha256,
            orderRequestSha256: requestEnvelopeSha256,
            dispatchTokenSha256: input.dispatchTokenSha256,
            terminalState: terminal.state,
            providerRequestCount: terminal.providerRequestCount,
            airOrdersPostCount: terminal.providerRequestCount,
            terminalErrorCode: terminal.code,
            terminalHttpStatus: terminal.httpStatus,
            terminalResponseSha256: terminal.terminalResponseSha256,
            providerOrderReferenceCiphertext: null,
            providerOrderReferenceSha256: null,
            providerBookingReferenceCiphertext: null,
            providerBookingReferenceSha256: null,
            completionEvidenceSha256,
            ambiguityEvidenceSha256,
            clientCorrelationId: terminal.clientCorrelationId ?? null,
            clientCorrelationIdSha256,
            providerRequestId: terminal.providerRequestId ?? null,
            providerRequestIdSha256,
          });
          if (completed.attempt_id !== claimed.attempt_id) {
            throw new Error("mismatched_attempt");
          }
          const base = resultBase({
            executionWorkflowSha256,
            executionPrerequisiteSha256,
            requestEnvelopeSha256,
            idempotencyRequestSha256: idempotency.requestDigest,
            providerRequestCount: terminal.providerRequestCount,
            clientCorrelationId: terminal.clientCorrelationId ?? null,
            providerRequestId: terminal.providerRequestId ?? null,
          });
          if (completed.decision === "replay") {
            return Object.freeze({
              ...base,
              decision: "replay" as const,
              replayStage: "complete" as const,
              attemptId: completed.attempt_id,
              attemptState: completed.attempt_state,
              stateReceiptSha256: completed.state_receipt_sha256,
              providerOrderReferenceSha256: null,
              providerBookingReferenceSha256: null,
              stripeCaptureRemainsLaterGate: true as const,
            });
          }
          if (terminal.state === "failed") {
            return Object.freeze({
              ...base,
              decision: "failed" as const,
              failureCode: terminal.code,
              attemptId: completed.attempt_id,
              attemptState: "failed" as const,
              stateReceiptSha256: completed.state_receipt_sha256,
              providerOrderReferenceSha256: null,
              providerBookingReferenceSha256: null,
              stripeCaptureRemainsLaterGate: true as const,
            });
          }
          return Object.freeze({
            ...base,
            decision: "ambiguous" as const,
            ambiguityCode: terminal.code,
            attemptId: completed.attempt_id,
            attemptState: "ambiguous" as const,
            stateReceiptSha256: completed.state_receipt_sha256,
            providerOrderReferenceSha256: null,
            providerBookingReferenceSha256: null,
            stripeCaptureRemainsLaterGate: true as const,
          });
        } catch {
          throw new FlightConsumerLiveDuffelOrderCreateError(
            "terminal_persistence_failed",
          );
        }
      };

      let dispatchNow: number;
      try {
        dispatchNow = dependencies.productionAuthorizationVerifier
          .readTrustedTimeSeconds();
      } catch {
        return terminalize({
          state: "failed",
          code: "trusted_time_unavailable",
          providerRequestCount: 0,
          httpStatus: null,
          terminalResponseSha256: null,
        });
      }
      const dispatchNowMs = dispatchNow * 1000;
      if (
        !Number.isSafeInteger(dispatchNow)
        || dispatchNow < 0
        || dispatchNowMs >= dispatchNotAfterMs
        || dispatchNow >= input.productionAuthorization.expiresAtSeconds
        || dispatchNowMs >= offerExpiresAtMs
        || dispatchNowMs >= authorizationNotAfterMs
      ) {
        return terminalize({
          state: "failed",
          code: "dispatch_window_expired",
          providerRequestCount: 0,
          httpStatus: null,
          terminalResponseSha256: null,
        });
      }

      let rawTransportResult: unknown;
      try {
        rawTransportResult = await dependencies.duffelTransport.createOrder(
          request,
          Object.freeze({
            clientCorrelationId,
            requestTimeoutMs: dependencies.duffelTransport.requestTimeoutMs,
          }),
        );
      } catch {
        // Throwing cannot distinguish pre-header network failure from a
        // body/read adapter failure after headers. The transport must return
        // an explicit outcome envelope; otherwise leave the claim for
        // operator reconciliation instead of writing false no-response data.
        throw new FlightConsumerLiveDuffelOrderCreateError(
          "terminal_persistence_failed",
        );
      }

      const noResponse = transportNoResponseSchema.safeParse(
        rawTransportResult,
      );
      if (noResponse.success) {
        if (noResponse.data.clientCorrelationId !== clientCorrelationId) {
          throw new FlightConsumerLiveDuffelOrderCreateError(
            "terminal_persistence_failed",
          );
        }
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_outcome_unknown",
          providerRequestCount: 1,
          httpStatus: null,
          terminalResponseSha256: null,
          clientCorrelationId,
        });
      }

      const responseIdentity = transportResponseIdentitySchema.safeParse(
        rawTransportResult,
      );
      if (!responseIdentity.success) {
        // The transport resolved, so recording a no-response terminal would
        // be factually wrong. Leave the claimed attempt for explicit
        // reconciliation when its required Duffel x-request-id is unusable.
        throw new FlightConsumerLiveDuffelOrderCreateError(
          "terminal_persistence_failed",
        );
      }
      const boundedBody = boundedTransportBodySchema.safeParse(
        typeof rawTransportResult === "object"
          && rawTransportResult !== null
          && "rawBody" in rawTransportResult
          ? rawTransportResult.rawBody
          : undefined,
      );
      const durableResponseSha256 = boundedBody.success
        ? createHash("sha256").update(boundedBody.data).digest("hex")
        : null;
      const parsedTransportResult = transportResultSchema.safeParse(
        rawTransportResult,
      );
      if (!parsedTransportResult.success) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_response_refused",
          providerRequestCount: 1,
          httpStatus: responseIdentity.data.httpStatus,
          terminalResponseSha256: durableResponseSha256,
          providerRequestId: responseIdentity.data.providerRequestId,
          clientCorrelationId,
        });
      }
      const transportResult = parsedTransportResult.data;

      const terminalResponseSha256 = createHash("sha256")
        .update(transportResult.rawBody)
        .digest("hex");
      const providerRequestIdSha256 = sha256Utf8(
        transportResult.providerRequestId,
      );
      const clientCorrelationIdSha256 = sha256Utf8(
        transportResult.clientCorrelationId,
      );
      if (transportResult.clientCorrelationId !== clientCorrelationId) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_correlation_mismatch",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }

      let providerBody: unknown;
      try {
        providerBody = JSON.parse(Buffer.from(transportResult.rawBody).toString("utf8"));
      } catch {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_response_refused",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }

      if (transportResult.httpStatus >= 400 && transportResult.httpStatus <= 499) {
        const classification = classifyDuffelNoBookingResponse({
          httpStatus: transportResult.httpStatus,
          providerRequestId: transportResult.providerRequestId,
          body: providerBody,
        });
        if (classification !== "ambiguous") {
          return terminalize({
            state: "failed",
            code: classification === "definitive_retryable"
              ? "duffel_order_rate_limited_no_booking"
              : "duffel_order_definitive_refusal",
            providerRequestCount: 1,
            httpStatus: transportResult.httpStatus,
            terminalResponseSha256,
            providerRequestId: transportResult.providerRequestId,
            clientCorrelationId,
          });
        }
      }
      if (transportResult.httpStatus !== 201) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_nonterminal_response",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }
      const provider = providerResponseSchema.safeParse(providerBody);
      if (
        !provider.success
        || provider.data.data.total_amount
          !== amountString(input.checkoutEvidence.amountCents)
        || provider.data.data.offer_id !== decrypted.selectedOfferId
      ) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_success_binding_mismatch",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }

      const providerOrderReferenceSha256 = sha256Utf8(provider.data.data.id);
      const bookingReference = provider.data.data.booking_reference;
      const providerBookingReferenceSha256 = sha256Utf8(bookingReference);
      if (providerBookingReferenceSha256 === providerOrderReferenceSha256) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_reference_collision",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }

      let encryptedOrder: z.output<typeof encryptedReferenceResultSchema>;
      let encryptedBooking: z.output<typeof encryptedReferenceResultSchema> | null = null;
      try {
        const orderResult = encryptedReferenceResultSchema.safeParse(
          await dependencies.referenceEncryption.encryptReference({
            kind: "provider_order",
            plaintextReference: provider.data.data.id,
            plaintextReferenceSha256: providerOrderReferenceSha256,
            executionWorkflowSha256,
          }),
        );
        if (
          !orderResult.success
          || !equalSha256(
            orderResult.data.plaintextReferenceSha256,
            providerOrderReferenceSha256,
          )
        ) throw new Error("order_reference_encryption_refused");
        encryptedOrder = orderResult.data;
        const bookingResult = encryptedReferenceResultSchema.safeParse(
          await dependencies.referenceEncryption.encryptReference({
            kind: "provider_booking",
            plaintextReference: bookingReference,
            plaintextReferenceSha256: providerBookingReferenceSha256,
            executionWorkflowSha256,
          }),
        );
        if (
          !bookingResult.success
          || !equalSha256(
            bookingResult.data.plaintextReferenceSha256,
            providerBookingReferenceSha256,
          )
        ) throw new Error("booking_reference_encryption_refused");
        encryptedBooking = bookingResult.data;
      } catch {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_reference_encryption_failed",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }

      const completionEvidenceSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-duffel-order-create-completion-v1",
        attemptId: claimed.attempt_id,
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        requestEnvelopeSha256,
        providerOrderReferenceSha256,
        providerBookingReferenceSha256,
        terminalResponseSha256,
        httpStatus: transportResult.httpStatus,
        providerRequestIdSha256,
        clientCorrelationIdSha256,
        livemode: true,
        paymentAwaiting: false,
        paymentPaidAt: provider.data.data.payment_status.paid_at,
        stripeCaptureAuthorized: false,
      });
      let completed: Awaited<ReturnType<
        FlightConsumerLiveDuffelOrderExecutionPersistence["complete"]
      >>;
      try {
        completed = await dependencies.executionPersistence.complete({
          attemptId: claimed.attempt_id,
          expectedRevision: 1,
          executionScopeSha256: input.checkoutEvidence.executionScopeSha256,
          orderExecutionBindingSha256,
          orderRequestSha256: requestEnvelopeSha256,
          dispatchTokenSha256: input.dispatchTokenSha256,
          terminalState: "succeeded",
          providerRequestCount: 1,
          airOrdersPostCount: 1,
          terminalErrorCode: null,
          terminalHttpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerOrderReferenceCiphertext: encryptedOrder.ciphertext,
          providerOrderReferenceSha256,
          providerBookingReferenceCiphertext: encryptedBooking?.ciphertext ?? null,
          providerBookingReferenceSha256,
          completionEvidenceSha256,
          ambiguityEvidenceSha256: null,
          clientCorrelationId,
          clientCorrelationIdSha256,
          providerRequestId: transportResult.providerRequestId,
          providerRequestIdSha256,
        });
      } catch {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_completion_persistence_unknown",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }
      if (
        completed.attempt_id !== claimed.attempt_id
        || completed.provider_order_reference_sha256
          !== providerOrderReferenceSha256
        || completed.provider_booking_reference_sha256
          !== providerBookingReferenceSha256
      ) {
        return terminalize({
          state: "ambiguous",
          code: "duffel_order_completion_persistence_unknown",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          providerRequestId: transportResult.providerRequestId,
          clientCorrelationId,
        });
      }
      const oneRequestBase = resultBase({
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        providerRequestCount: 1,
        clientCorrelationId,
        providerRequestId: transportResult.providerRequestId,
      });
      if (completed.decision === "replay") {
        return Object.freeze({
          ...oneRequestBase,
          decision: "replay" as const,
          replayStage: "complete" as const,
          attemptId: completed.attempt_id,
          attemptState: completed.attempt_state,
          stateReceiptSha256: completed.state_receipt_sha256,
          providerOrderReferenceSha256,
          providerBookingReferenceSha256,
          stripeCaptureRemainsLaterGate: true as const,
        });
      }
      return Object.freeze({
        ...oneRequestBase,
        decision: "succeeded" as const,
        attemptId: completed.attempt_id,
        attemptState: "succeeded" as const,
        stateReceiptSha256: completed.state_receipt_sha256,
        providerOrderReferenceSha256,
        providerBookingReferenceSha256,
        stripeCaptureRemainsLaterGate: true as const,
      });
    },
  });
}
