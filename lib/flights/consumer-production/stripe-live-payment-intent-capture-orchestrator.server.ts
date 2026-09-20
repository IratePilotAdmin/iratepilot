import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  evaluateFlightRuntimeAuthorization,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePaymentBinding,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../runtime-safety";
import type {
  FlightConsumerLiveStripeCapturePersistence,
} from "./stripe-live-capture-execution-persistence.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const amountSchema = z.number().int().min(50).max(99_999_999);
const encryptedReferenceSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/,
);
const paymentIntentIdSchema = z.string().regex(/^pi_[A-Za-z0-9]{8,128}$/);
const chargeIdSchema = z.string().regex(/^ch_[A-Za-z0-9]{8,128}$/);
const stripeRequestIdSchema = z.string().regex(/^req_[A-Za-z0-9]{8,128}$/);
const clientCorrelationIdSchema = z.string().regex(
  /^flt_capture_[0-9a-f]{48}$/,
);

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

const stripeAuthorizationStateShape = {
  confirmationStateReceiptSha256: sha256Schema,
  observedPaymentIntentStatus: z.literal("requires_capture"),
  observedAmountCents: amountSchema,
  observedCurrency: z.literal("usd"),
  observedLivemode: z.literal(true),
  processorEnvironment: z.literal("stripe_live"),
  captureMethod: z.literal("manual"),
  paymentMethodType: z.literal("card"),
} as const;

const confirmationStateSchema = z.discriminatedUnion("confirmationState", [
  z.object({
    confirmationState: z.literal("authorized_requires_capture"),
    confirmationRevision: z.literal(2),
    confirmationReconciledOutcome: z.null(),
  }).strict(),
  z.object({
    confirmationState: z.literal("reconciled"),
    confirmationRevision: z.literal(3),
    confirmationReconciledOutcome: z.literal("authorized_requires_capture"),
  }).strict(),
]);

const bridgeEvidenceSchema = z.object({
  migrationVersion: z.literal("202608260110"),
  checkoutAggregateId: uuidSchema,
  customerId: uuidSchema,
  orderId: uuidSchema,
  checkoutExecutionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  checkoutFinalizedReceiptSha256: sha256Schema,
  authorizationBridgeReceiptSha256: sha256Schema,
  stripeConfirmationAttemptId: uuidSchema,
  stripeConfirmationStateReceiptSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  authorizationEvidenceAt: instantSchema,
  authorizationNotAfter: instantSchema,
  confirmationState: z.enum(["authorized_requires_capture", "reconciled"]),
  confirmationRevision: z.union([z.literal(2), z.literal(3)]),
  confirmationReconciledOutcome: z.literal("authorized_requires_capture")
    .nullable(),
  ...authorityFalseShape,
}).strict().superRefine((value, context) => {
  const direct = value.confirmationState === "authorized_requires_capture"
    && value.confirmationRevision === 2
    && value.confirmationReconciledOutcome === null;
  const reconciled = value.confirmationState === "reconciled"
    && value.confirmationRevision === 3
    && value.confirmationReconciledOutcome === "authorized_requires_capture";
  if (!direct && !reconciled) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmationState"],
      message: "The 110 bridge must bind an exact 109 authorization state.",
    });
  }
  if (value.orderReferenceSha256 === value.customerReferenceSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["orderReferenceSha256"],
      message: "Order and customer reference evidence must be independent.",
    });
  }
});

const stripeAuthorizationEvidenceSchema = z.object({
  migrationVersion: z.literal("202608260109"),
  attemptId: uuidSchema,
  checkoutAggregateId: uuidSchema,
  customerId: uuidSchema,
  orderId: uuidSchema,
  executionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  checkoutStateReceiptSha256: sha256Schema,
  state: confirmationStateSchema,
  ...stripeAuthorizationStateShape,
  paymentIntentReferenceCiphertext: encryptedReferenceSchema,
  paymentIntentReferenceSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  confirmationNotAfter: instantSchema,
  ...authorityFalseShape,
}).strict();

const duffelOrderStateSchema = z.discriminatedUnion("attemptState", [
  z.object({
    attemptState: z.literal("succeeded"),
    attemptRevision: z.literal(2),
    reconciliationOutcome: z.null(),
  }).strict(),
  z.object({
    attemptState: z.literal("reconciled"),
    attemptRevision: z.literal(3),
    reconciliationOutcome: z.literal("succeeded"),
  }).strict(),
]);

const duffelOrderEvidenceSchema = z.object({
  migrationVersion: z.literal("202608260108"),
  attemptId: uuidSchema,
  checkoutAggregateId: uuidSchema,
  checkoutExecutionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  checkoutStateReceiptSha256: sha256Schema,
  state: duffelOrderStateSchema,
  stateReceiptSha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  providerOrderReferenceSha256: sha256Schema,
  providerRequestCount: z.literal(1),
  airOrdersPostCount: z.literal(1),
  externalRequestMade: z.literal(true),
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  livemode: z.literal(true),
  ...authorityFalseShape,
}).strict();

const paymentBindingSchema = z.object({
  processorId: z.string().min(8).max(128),
  adapterVersion: z.string()
    .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/),
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
}).strict();

const productionAuthorizationSchema = z.object({
  version: z.literal("flight-production-action-authorization-v2"),
  authorizationId: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/,
  ),
  operation: z.literal("capture_payment"),
  provider: z.literal("provider_production"),
  scopeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  requestDigest: sha256Schema,
  idempotencyRequestDigest: sha256Schema,
  providerBindingDigest: sha256Schema,
  paymentBindingDigest: sha256Schema,
  settlementBindingDigest: z.null(),
  nonce: z.string().regex(/^[0-9a-f]{32,128}$/),
  issuedAtSeconds: z.number().int().nonnegative(),
  expiresAtSeconds: z.number().int().positive(),
  signatureHex: sha256Schema,
}).strict();

const inputSchema = z.object({
  bridgeEvidence: bridgeEvidenceSchema,
  stripeAuthorizationEvidence: stripeAuthorizationEvidenceSchema,
  duffelOrderEvidence: duffelOrderEvidenceSchema,
  paymentBinding: paymentBindingSchema,
  productionAuthorization: productionAuthorizationSchema,
  captureAuthorityKeyId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  dispatchNotAfter: instantSchema,
  dispatchTokenSha256: sha256Schema,
}).strict();

const decryptedReferenceSchema = z.object({
  version: z.literal(
    "flight-consumer-live-stripe-capture-reference-decryption-result-v1",
  ),
  paymentIntentId: paymentIntentIdSchema,
  plaintextReferenceSha256: sha256Schema,
  decryptionEvidenceSha256: sha256Schema,
}).strict();

const boundedRawBodySchema = z.instanceof(Uint8Array).refine(
  (value) => value.byteLength <= 2_097_152,
  "Stripe response exceeds the bounded two-megabyte evidence envelope.",
);

const httpResponseTransportResultSchema = z.object({
  outcome: z.literal("http_response"),
  httpStatus: z.number().int().min(100).max(599),
  stripeRequestId: stripeRequestIdSchema,
  clientCorrelationId: clientCorrelationIdSchema,
  contentType: z.literal("application/json"),
  rawBody: boundedRawBodySchema,
}).strict();

const noResponseTransportResultSchema = z.object({
  outcome: z.literal("no_response"),
  clientCorrelationId: clientCorrelationIdSchema,
}).strict();

export type FlightConsumerLiveStripeCaptureTransportOutcome =
  | z.output<typeof httpResponseTransportResultSchema>
  | z.output<typeof noResponseTransportResultSchema>;

// A resolved adapter result must carry the support identity that came from the
// HTTP exchange even when the remaining response envelope is malformed. This
// smaller parser prevents a resolved response from being misclassified as a
// no-response transport exception.
const resolvedTransportSupportIdentitySchema = z.object({
  outcome: z.literal("http_response"),
  httpStatus: z.number().int().min(100).max(599),
  stripeRequestId: stripeRequestIdSchema,
}).passthrough();

const stripePaymentIntentSchema = z.object({
  id: paymentIntentIdSchema,
  object: z.literal("payment_intent"),
  amount: amountSchema,
  amount_capturable: z.literal(0),
  amount_received: amountSchema,
  currency: z.literal("usd"),
  livemode: z.literal(true),
  capture_method: z.literal("manual"),
  status: z.literal("succeeded"),
  latest_charge: chargeIdSchema,
}).passthrough();

const stripeErrorSchema = z.object({
  error: z.object({
    type: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    code: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/).nullable().optional(),
  }).passthrough(),
}).passthrough();

const encryptedReferenceResultSchema = z.object({
  version: z.literal(
    "flight-consumer-live-stripe-charge-reference-encryption-result-v1",
  ),
  ciphertext: encryptedReferenceSchema,
  plaintextReferenceSha256: sha256Schema,
}).strict();

const durableEvidenceReceiptSchema = z.object({
  version: z.literal(
    "flight-consumer-live-stripe-capture-durable-evidence-receipt-v1",
  ),
  evidenceReceiptSha256: sha256Schema,
}).strict();

const AUTHORIZATION_REPLAY_REASON =
  "Per-call Production authorization nonce has already been consumed.";

export const FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_DECRYPTION_VERSION =
  "flight-consumer-live-stripe-capture-reference-decryption-v1" as const;
export const FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_TRANSPORT_VERSION =
  "flight-consumer-live-stripe-payment-intent-capture-transport-v1" as const;
export const FLIGHT_CONSUMER_LIVE_STRIPE_CHARGE_ENCRYPTION_VERSION =
  "flight-consumer-live-stripe-charge-reference-encryption-v1" as const;
export const FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_EVIDENCE_JOURNAL_VERSION =
  "flight-consumer-live-stripe-capture-durable-evidence-journal-v1" as const;

export type FlightConsumerLiveStripeCaptureRequest = Readonly<{
  method: "POST";
  path: string;
  stripeVersion: "2024-06-20";
  contentType: "application/x-www-form-urlencoded";
  paymentIntentId: string;
  body: Readonly<{ amount_to_capture: number }>;
}>;

export type FlightConsumerLiveStripeCaptureReferenceDecryptionPort = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_DECRYPTION_VERSION;
  logsPlaintext: false;
  persistsPlaintext: false;
  decryptPaymentIntentReference: (input: Readonly<{
    ciphertext: string;
    expectedPlaintextReferenceSha256: string;
  }>) => Promise<unknown>;
}>;

export type FlightConsumerLiveStripeCaptureTransport = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_TRANSPORT_VERSION;
  method: "POST";
  pathTemplate: "/v1/payment_intents/:id/capture";
  stripeVersion: "2024-06-20";
  processorEnvironment: "stripe_live";
  livemode: true;
  paymentBindingDigest: string;
  retryImplemented: false;
  logsRequest: false;
  logsResponse: false;
  persistsRequest: false;
  persistsResponse: false;
  retainsStripeRequestId: true;
  echoesClientCorrelationId: true;
  explicitOutcomeEnvelope: true;
  thrownOutcomeIsUnclassified: true;
  maxCaptureMutations: 1;
  capturePaymentIntent: (
    request: FlightConsumerLiveStripeCaptureRequest,
    options: Readonly<{
      idempotencyKey: string;
      clientCorrelationId: string;
    }>,
  ) => Promise<FlightConsumerLiveStripeCaptureTransportOutcome>;
}>;

export type FlightConsumerLiveStripeChargeReferenceEncryptionPort = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_STRIPE_CHARGE_ENCRYPTION_VERSION;
  encryptChargeReference: (input: Readonly<{
    plaintextReference: string;
    plaintextReferenceSha256: string;
    captureWorkflowSha256: string;
  }>) => Promise<unknown>;
}>;

/**
 * Adapter-owned durable evidence boundary. It stores digests only, never
 * Stripe identifiers, idempotency keys, response bodies, or card data.
 * Dispatch intent is committed before transport; outcome evidence is appended
 * after the one permitted mutation so a timeout can never justify a blind
 * capture retry.
 */
export type FlightConsumerLiveStripeCaptureEvidenceJournalPort = Readonly<{
  version:
    typeof FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_EVIDENCE_JOURNAL_VERSION;
  durable: true;
  appendOnly: true;
  storesPlaintextIdentifiers: false;
  storesRawProviderPayload: false;
  prepareDispatchEvidence: (input: Readonly<{
    attemptId: string;
    captureWorkflowSha256: string;
    requestEnvelopeSha256: string;
    idempotencyRequestSha256: string;
    idempotencyKeySha256: string;
    intendedClientCorrelationIdSha256: string;
  }>) => Promise<unknown>;
  appendTransportOutcomeEvidence: (input: Readonly<{
    attemptId: string;
    dispatchEvidenceReceiptSha256: string;
    outcome: "http_response" | "no_response" | "invalid_http_response";
    providerRequestCount: 1;
    terminalHttpStatus: number | null;
    terminalResponseSha256: string | null;
    stripeRequestIdSha256: string | null;
    observedClientCorrelationIdSha256: string | null;
    idempotencyKeySha256: string;
  }>) => Promise<unknown>;
}>;

type ResultBase = Readonly<{
  version: "flight-consumer-live-stripe-payment-intent-capture-result-v1";
  captureWorkflowSha256: string;
  capturePrerequisiteSha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  idempotencyKeySha256: string;
  dispatchEvidenceReceiptSha256: string | null;
  transportEvidenceReceiptSha256: string | null;
  stripeRequestIdSha256: string | null;
  clientCorrelationIdSha256: string | null;
  providerRequestCount: 0 | 1;
  stripeCaptureRequestCount: 0 | 1;
  stripeMutationCount: 0 | 1;
  providerDispatchAuthorized: false;
  stripeDispatchAuthorized: false;
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

export type FlightConsumerLiveStripePaymentIntentCaptureResult =
  | (ResultBase & Readonly<{
    decision: "succeeded";
    attemptId: string;
    attemptState: "succeeded";
    stateReceiptSha256: string;
    paymentIntentReferenceSha256: string;
    chargeReferenceSha256: string;
    ticketingRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "failed";
    failureCode: string;
    attemptId: string;
    attemptState: "failed";
    stateReceiptSha256: string;
    paymentIntentReferenceSha256: string;
    chargeReferenceSha256: null;
    ticketingRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "ambiguous";
    ambiguityCode: string;
    attemptId: string;
    attemptState: "ambiguous";
    stateReceiptSha256: string;
    paymentIntentReferenceSha256: string;
    chargeReferenceSha256: null;
    ticketingRemainsLaterGate: true;
  }>)
  | (ResultBase & Readonly<{
    decision: "replay";
    replayStage: "authority" | "prepare" | "claim" | "complete";
    attemptId: string | null;
    attemptState: "prepared" | "dispatching" | "succeeded" | "failed"
      | "ambiguous" | "reconciled" | null;
    stateReceiptSha256: string | null;
    paymentIntentReferenceSha256: string;
    chargeReferenceSha256: string | null;
    ticketingRemainsLaterGate: true;
  }>);

export class FlightConsumerLiveStripePaymentIntentCaptureError extends Error {
  readonly reason:
    | "invalid_input"
    | "invalid_dependency"
    | "evidence_refused"
    | "decryption_refused"
    | "authority_refused"
    | "persistence_refused"
    | "terminal_persistence_failed";
  readonly blindRetryAuthorized = false as const;

  constructor(
    reason: FlightConsumerLiveStripePaymentIntentCaptureError["reason"],
  ) {
    super("Flight Consumer Live Stripe PaymentIntent capture was refused.");
    this.name = "FlightConsumerLiveStripePaymentIntentCaptureError";
    this.reason = reason;
  }
}

export type FlightConsumerLiveStripePaymentIntentCaptureOrchestrator =
  Readonly<{
    version:
      "flight-consumer-live-stripe-payment-intent-capture-orchestrator-v2";
    routeExposed: false;
    consumerReachable: false;
    environmentReadImplemented: false;
    providerClientImplemented: false;
    refundImplemented: false;
    ticketingImplemented: false;
    servicingImplemented: false;
    blindProviderRetryImplemented: false;
    maxStripeCaptureMutations: 1;
    execute: (
      input: unknown,
    ) => Promise<FlightConsumerLiveStripePaymentIntentCaptureResult>;
  }>;

type Dependencies = Readonly<{
  runtimePolicy: FlightRuntimePolicy;
  providerExecutionBinding: FlightRuntimeProviderBinding;
  paymentExecutionBinding: FlightRuntimePaymentBinding;
  productionAuthorizationVerifier: FlightProductionAuthorizationVerifier;
  executionPersistence: FlightConsumerLiveStripeCapturePersistence;
  referenceDecryption: FlightConsumerLiveStripeCaptureReferenceDecryptionPort;
  stripeTransport: FlightConsumerLiveStripeCaptureTransport;
  referenceEncryption: FlightConsumerLiveStripeChargeReferenceEncryptionPort;
  evidenceJournal: FlightConsumerLiveStripeCaptureEvidenceJournalPort;
}>;

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalSha256(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function authorityPayloadSha256(
  authorization: FlightProductionActionAuthorization,
  captureAuthorityKeyId: string,
) {
  return sha256FlightEvidence({
    version: "flight-consumer-live-stripe-capture-authority-payload-v1",
    captureAuthorityKeyId,
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
  });
}

function resultBase(input: Readonly<{
  captureWorkflowSha256: string;
  capturePrerequisiteSha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  idempotencyKeySha256: string;
  providerRequestCount: 0 | 1;
  dispatchEvidenceReceiptSha256?: string | null;
  transportEvidenceReceiptSha256?: string | null;
  stripeRequestIdSha256?: string | null;
  clientCorrelationIdSha256?: string | null;
}>): ResultBase {
  return Object.freeze({
    version:
      "flight-consumer-live-stripe-payment-intent-capture-result-v1" as const,
    ...input,
    dispatchEvidenceReceiptSha256:
      input.dispatchEvidenceReceiptSha256 ?? null,
    transportEvidenceReceiptSha256:
      input.transportEvidenceReceiptSha256 ?? null,
    stripeRequestIdSha256: input.stripeRequestIdSha256 ?? null,
    clientCorrelationIdSha256: input.clientCorrelationIdSha256 ?? null,
    stripeCaptureRequestCount: input.providerRequestCount,
    stripeMutationCount: input.providerRequestCount,
    providerDispatchAuthorized: false as const,
    stripeDispatchAuthorized: false as const,
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
    persistence.version !== "flight-consumer-live-stripe-capture-persistence-v2"
    || persistence.migrationVersion !== "202608260114"
    || persistence.processorEnvironment !== "stripe_live"
    || persistence.livemode !== true
    || persistence.captureMethod !== "manual"
    || persistence.paymentMethodType !== "card"
    || persistence.routeExposed !== false
    || persistence.stripeTransportImplemented !== false
    || persistence.databaseApplyAuthorized !== false
    || persistence.signedOneShotAuthorityRequired !== true
    || persistence.exact109AuthorizationRequired !== true
    || persistence.exact110FinalizationBridgeRequired !== true
    || persistence.exact108SuccessfulOrderRequired !== true
    || persistence.exact113BookingSettlementPredecessorRequired !== true
    || persistence.plaintextSupportIdentityRetained !== true
    || persistence.supportIdentityLookupRequired !== true
    || persistence.claimGrantsCaptureAuthority !== false
    || persistence.providerDispatchAuthorized !== false
    || persistence.stripeDispatchAuthorized !== false
    || persistence.captureAuthorized !== false
    || persistence.refundAuthorized !== false
    || persistence.ticketingAuthorized !== false
    || persistence.consumerReleaseEnabled !== false
    || persistence.blindRetryAuthorized !== false
    || persistence.maxStripeCaptureMutations !== 1
    || dependencies.referenceDecryption.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_DECRYPTION_VERSION
    || dependencies.referenceDecryption.logsPlaintext !== false
    || dependencies.referenceDecryption.persistsPlaintext !== false
    || dependencies.stripeTransport.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_TRANSPORT_VERSION
    || dependencies.stripeTransport.method !== "POST"
    || dependencies.stripeTransport.pathTemplate
      !== "/v1/payment_intents/:id/capture"
    || dependencies.stripeTransport.stripeVersion !== "2024-06-20"
    || dependencies.stripeTransport.processorEnvironment !== "stripe_live"
    || dependencies.stripeTransport.livemode !== true
    || dependencies.stripeTransport.paymentBindingDigest
      !== digestFlightRuntimePaymentBinding(
        dependencies.paymentExecutionBinding,
      )
    || dependencies.stripeTransport.retryImplemented !== false
    || dependencies.stripeTransport.logsRequest !== false
    || dependencies.stripeTransport.logsResponse !== false
    || dependencies.stripeTransport.persistsRequest !== false
    || dependencies.stripeTransport.persistsResponse !== false
    || dependencies.stripeTransport.retainsStripeRequestId !== true
    || dependencies.stripeTransport.echoesClientCorrelationId !== true
    || dependencies.stripeTransport.explicitOutcomeEnvelope !== true
    || dependencies.stripeTransport.thrownOutcomeIsUnclassified !== true
    || dependencies.stripeTransport.maxCaptureMutations !== 1
    || dependencies.referenceEncryption.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CHARGE_ENCRYPTION_VERSION
    || dependencies.evidenceJournal.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_EVIDENCE_JOURNAL_VERSION
    || dependencies.evidenceJournal.durable !== true
    || dependencies.evidenceJournal.appendOnly !== true
    || dependencies.evidenceJournal.storesPlaintextIdentifiers !== false
    || dependencies.evidenceJournal.storesRawProviderPayload !== false
  ) {
    throw new FlightConsumerLiveStripePaymentIntentCaptureError(
      "invalid_dependency",
    );
  }
}

function verifyEvidenceBindings(input: z.output<typeof inputSchema>) {
  const bridge = input.bridgeEvidence;
  const stripe = input.stripeAuthorizationEvidence;
  const order = input.duffelOrderEvidence;
  const paymentBindingSha256 = digestFlightRuntimePaymentBinding(
    input.paymentBinding,
  );
  if (
    bridge.checkoutAggregateId !== stripe.checkoutAggregateId
    || bridge.checkoutAggregateId !== order.checkoutAggregateId
    || bridge.customerId !== stripe.customerId
    || bridge.orderId !== stripe.orderId
    || bridge.checkoutExecutionScopeSha256
      !== stripe.executionScopeSha256
    || bridge.checkoutExecutionScopeSha256
      !== order.checkoutExecutionScopeSha256
    || bridge.checkoutBindingSha256 !== stripe.checkoutBindingSha256
    || bridge.checkoutBindingSha256 !== order.checkoutBindingSha256
    || bridge.checkoutFinalizedReceiptSha256
      !== stripe.checkoutStateReceiptSha256
    || bridge.checkoutFinalizedReceiptSha256
      !== order.checkoutStateReceiptSha256
    || bridge.stripeConfirmationAttemptId !== stripe.attemptId
    || bridge.stripeConfirmationStateReceiptSha256
      !== stripe.confirmationStateReceiptSha256
    || bridge.confirmationState !== stripe.state.confirmationState
    || bridge.confirmationRevision !== stripe.state.confirmationRevision
    || bridge.confirmationReconciledOutcome
      !== stripe.state.confirmationReconciledOutcome
    || bridge.paymentIntentReferenceSha256
      !== stripe.paymentIntentReferenceSha256
    || bridge.paymentBindingSha256 !== stripe.paymentBindingSha256
    || bridge.paymentBindingSha256 !== paymentBindingSha256
    || bridge.orderReferenceSha256 !== stripe.orderReferenceSha256
    || bridge.orderReferenceSha256 !== order.orderReferenceSha256
    || bridge.customerReferenceSha256 !== stripe.customerReferenceSha256
    || bridge.customerReferenceSha256 !== order.customerReferenceSha256
    || bridge.amountCents !== stripe.amountCents
    || bridge.amountCents !== stripe.observedAmountCents
    || bridge.amountCents !== order.amountCents
    || bridge.currency !== stripe.currency
    || bridge.currency !== order.currency
    || order.providerRequestCount !== order.airOrdersPostCount
    || input.productionAuthorization.scopeId !== bridge.orderId
    || input.productionAuthorization.paymentBindingDigest
      !== paymentBindingSha256
  ) {
    throw new FlightConsumerLiveStripePaymentIntentCaptureError(
      "evidence_refused",
    );
  }

  const bridgeAt = Date.parse(bridge.authorizationEvidenceAt);
  const bridgeNotAfter = Date.parse(bridge.authorizationNotAfter);
  const confirmationNotAfter = Date.parse(stripe.confirmationNotAfter);
  const dispatchNotAfter = Date.parse(input.dispatchNotAfter);
  const captureAuthorityNotAfter =
    input.productionAuthorization.expiresAtSeconds * 1000;
  if (
    !Number.isFinite(bridgeAt)
    || !Number.isFinite(bridgeNotAfter)
    || !Number.isFinite(confirmationNotAfter)
    || !Number.isFinite(dispatchNotAfter)
    || bridgeAt >= bridgeNotAfter
    || bridgeNotAfter < captureAuthorityNotAfter
    || confirmationNotAfter < dispatchNotAfter
    || dispatchNotAfter > captureAuthorityNotAfter
  ) {
    throw new FlightConsumerLiveStripePaymentIntentCaptureError(
      "evidence_refused",
    );
  }
}

const definitiveInvalidRequestCodes = new Set([
  "amount_too_large",
  "amount_too_small",
  "parameter_invalid_integer",
  "parameter_missing",
  "resource_missing",
]);

function isDefinitiveStripeNoCaptureResponse(
  httpStatus: number,
  body: unknown,
) {
  if ([408, 409, 425, 429].includes(httpStatus)) return false;
  const parsed = stripeErrorSchema.safeParse(body);
  if (!parsed.success) return false;
  const { type, code = null } = parsed.data.error;
  if (httpStatus === 401 && type === "authentication_error") return true;
  if (httpStatus === 403 && type === "permission_error") return true;
  if (httpStatus === 402 && type === "card_error") return true;
  return (httpStatus === 400 || httpStatus === 404)
    && type === "invalid_request_error"
    && code !== null
    && definitiveInvalidRequestCodes.has(code);
}

export function createFlightConsumerLiveStripePaymentIntentCaptureOrchestrator(
  dependencies: Dependencies,
): FlightConsumerLiveStripePaymentIntentCaptureOrchestrator {
  validateDependencies(dependencies);

  return Object.freeze({
    version:
      "flight-consumer-live-stripe-payment-intent-capture-orchestrator-v2" as const,
    routeExposed: false as const,
    consumerReachable: false as const,
    environmentReadImplemented: false as const,
    providerClientImplemented: false as const,
    refundImplemented: false as const,
    ticketingImplemented: false as const,
    servicingImplemented: false as const,
    blindProviderRetryImplemented: false as const,
    maxStripeCaptureMutations: 1 as const,

    async execute(untrustedInput: unknown) {
      const accepted = inputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "invalid_input",
        );
      }
      const input = accepted.data;
      verifyEvidenceBindings(input);

      const providerBindingSha256 = digestFlightRuntimeProviderBinding(
        dependencies.providerExecutionBinding,
      );
      const paymentBindingSha256 = digestFlightRuntimePaymentBinding(
        dependencies.paymentExecutionBinding,
      );
      if (
        input.productionAuthorization.providerBindingDigest
          !== providerBindingSha256
        || input.productionAuthorization.paymentBindingDigest
          !== paymentBindingSha256
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "evidence_refused",
        );
      }

      let initialTrustedNow: number;
      try {
        initialTrustedNow = dependencies.productionAuthorizationVerifier
          .readTrustedTimeSeconds();
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "authority_refused",
        );
      }
      const dispatchNotAfterMs = Date.parse(input.dispatchNotAfter);
      const bridgeNotAfterMs = Date.parse(
        input.bridgeEvidence.authorizationNotAfter,
      );
      const confirmationNotAfterMs = Date.parse(
        input.stripeAuthorizationEvidence.confirmationNotAfter,
      );
      if (
        !Number.isSafeInteger(initialTrustedNow)
        || initialTrustedNow < 0
        || dispatchNotAfterMs <= initialTrustedNow * 1000 + 15_000
        || dispatchNotAfterMs > initialTrustedNow * 1000 + 120_000
        || dispatchNotAfterMs
          > input.productionAuthorization.expiresAtSeconds * 1000
        || dispatchNotAfterMs > bridgeNotAfterMs
        || dispatchNotAfterMs > confirmationNotAfterMs
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "evidence_refused",
        );
      }

      let decrypted: z.output<typeof decryptedReferenceSchema>;
      try {
        const raw = await dependencies.referenceDecryption
          .decryptPaymentIntentReference({
            ciphertext: input.stripeAuthorizationEvidence
              .paymentIntentReferenceCiphertext,
            expectedPlaintextReferenceSha256:
              input.bridgeEvidence.paymentIntentReferenceSha256,
          });
        const parsed = decryptedReferenceSchema.safeParse(raw);
        if (!parsed.success) throw new Error("invalid_decryption_result");
        decrypted = parsed.data;
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "decryption_refused",
        );
      }
      const paymentIntentReferenceSha256 = sha256Utf8(
        decrypted.paymentIntentId,
      );
      if (
        !equalSha256(
          paymentIntentReferenceSha256,
          decrypted.plaintextReferenceSha256,
        )
        || !equalSha256(
          paymentIntentReferenceSha256,
          input.bridgeEvidence.paymentIntentReferenceSha256,
        )
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "decryption_refused",
        );
      }

      const request = Object.freeze({
        method: "POST" as const,
        path: `/v1/payment_intents/${decrypted.paymentIntentId}/capture`,
        stripeVersion: "2024-06-20" as const,
        contentType: "application/x-www-form-urlencoded" as const,
        paymentIntentId: decrypted.paymentIntentId,
        body: Object.freeze({
          amount_to_capture: input.bridgeEvidence.amountCents,
        }),
      }) satisfies FlightConsumerLiveStripeCaptureRequest;
      const requestBodySha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-request-body-v1",
        amount_to_capture: request.body.amount_to_capture,
      });
      const requestEnvelopeSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-request-envelope-v1",
        method: request.method,
        path: request.path,
        stripeVersion: request.stripeVersion,
        contentType: request.contentType,
        requestBodySha256,
        paymentIntentReferenceSha256,
      });
      const idempotency = buildFlightIdempotencyIntent({
        operation: "capture_payment",
        scopeId: input.bridgeEvidence.orderId,
        requestId: input.bridgeEvidence.checkoutAggregateId,
        payload: {
          version: "flight-consumer-live-stripe-capture-idempotency-v1",
          requestEnvelopeSha256,
          authorizationBridgeReceiptSha256:
            input.bridgeEvidence.authorizationBridgeReceiptSha256,
          stripeConfirmationStateReceiptSha256:
            input.stripeAuthorizationEvidence
              .confirmationStateReceiptSha256,
          duffelOrderStateReceiptSha256:
            input.duffelOrderEvidence.stateReceiptSha256,
          paymentIntentReferenceSha256,
          providerOrderReferenceSha256:
            input.duffelOrderEvidence.providerOrderReferenceSha256,
          amountCents: input.bridgeEvidence.amountCents,
          currency: input.bridgeEvidence.currency,
        },
      });
      if (
        input.productionAuthorization.requestDigest
          !== requestEnvelopeSha256
        || input.productionAuthorization.idempotencyRequestDigest
          !== idempotency.requestDigest
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "authority_refused",
        );
      }

      const clientCorrelationId =
        `flt_capture_${requestEnvelopeSha256.slice(0, 48)}`;
      const intendedClientCorrelationIdSha256 = sha256Utf8(
        clientCorrelationId,
      );
      const captureAuthorityPayloadSha256 = authorityPayloadSha256(
        input.productionAuthorization,
        input.captureAuthorityKeyId,
      );
      const captureAuthoritySignatureSha256 = sha256Utf8(
        input.productionAuthorization.signatureHex,
      );
      const captureAuthorityScopeSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-authority-scope-v1",
        operation: "capture_payment",
        scopeId: input.bridgeEvidence.orderId,
        providerBindingSha256,
        paymentBindingSha256,
        captureAuthorityKeyId: input.captureAuthorityKeyId,
      });
      const captureWorkflowSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-workflow-v1",
        migrationVersion: "202608260114",
        checkoutAggregateId: input.bridgeEvidence.checkoutAggregateId,
        authorizationBridgeReceiptSha256:
          input.bridgeEvidence.authorizationBridgeReceiptSha256,
        stripeConfirmationAttemptId:
          input.stripeAuthorizationEvidence.attemptId,
        stripeConfirmationStateReceiptSha256:
          input.stripeAuthorizationEvidence.confirmationStateReceiptSha256,
        duffelOrderExecutionId: input.duffelOrderEvidence.attemptId,
        duffelOrderStateReceiptSha256:
          input.duffelOrderEvidence.stateReceiptSha256,
        paymentIntentReferenceSha256,
        providerOrderReferenceSha256:
          input.duffelOrderEvidence.providerOrderReferenceSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        captureAuthorityPayloadSha256,
        captureAuthoritySignatureSha256,
        decryptionEvidenceSha256: decrypted.decryptionEvidenceSha256,
      });
      const capturePrerequisiteSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-prerequisite-v1",
        captureWorkflowSha256,
        dispatchNotAfter: input.dispatchNotAfter,
        captureAuthorityNotAfter: new Date(
          input.productionAuthorization.expiresAtSeconds * 1000,
        ).toISOString(),
        bridgeAuthorizationNotAfter:
          input.bridgeEvidence.authorizationNotAfter,
        confirmationNotAfter:
          input.stripeAuthorizationEvidence.confirmationNotAfter,
        dispatchTokenSha256: input.dispatchTokenSha256,
        decryptionVersion: dependencies.referenceDecryption.version,
        transportVersion: dependencies.stripeTransport.version,
        stripeVersion: dependencies.stripeTransport.stripeVersion,
        referenceEncryptionVersion: dependencies.referenceEncryption.version,
      });
      const captureBindingSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-binding-v1",
        captureWorkflowSha256,
        requestEnvelopeSha256,
        checkoutBindingSha256:
          input.bridgeEvidence.checkoutBindingSha256,
        authorizationBridgeReceiptSha256:
          input.bridgeEvidence.authorizationBridgeReceiptSha256,
        stripeConfirmationStateReceiptSha256:
          input.stripeAuthorizationEvidence.confirmationStateReceiptSha256,
        duffelOrderExecutionBindingSha256:
          input.duffelOrderEvidence.orderExecutionBindingSha256,
        duffelOrderStateReceiptSha256:
          input.duffelOrderEvidence.stateReceiptSha256,
        providerBindingSha256,
        paymentBindingSha256,
      });
      const executionScopeSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-execution-scope-v1",
        checkoutExecutionScopeSha256:
          input.bridgeEvidence.checkoutExecutionScopeSha256,
        captureBindingSha256,
      });
      const idempotencyKeySha256 = sha256Utf8(idempotency.idempotencyKey);
      const zeroRequestBase = resultBase({
        captureWorkflowSha256,
        capturePrerequisiteSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        idempotencyKeySha256,
        providerRequestCount: 0,
      });

      const decision = await evaluateFlightRuntimeAuthorization(
        dependencies.runtimePolicy,
        "capture_payment",
        "provider_production",
        {
          executionBinding: dependencies.providerExecutionBinding,
          paymentExecutionBinding: dependencies.paymentExecutionBinding,
          settlementExecutionBinding: null,
          productionAuthorization: input.productionAuthorization,
          productionAuthorizationVerifier:
            dependencies.productionAuthorizationVerifier,
          scopeId: input.bridgeEvidence.orderId,
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
            paymentIntentReferenceSha256,
            chargeReferenceSha256: null,
            ticketingRemainsLaterGate: true as const,
          });
        }
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "authority_refused",
        );
      }

      let prepared: Awaited<ReturnType<
        FlightConsumerLiveStripeCapturePersistence["prepare"]
      >>;
      try {
        prepared = await dependencies.executionPersistence.prepare({
          checkoutAggregateId: input.bridgeEvidence.checkoutAggregateId,
          authorizationBridgeReceiptSha256:
            input.bridgeEvidence.authorizationBridgeReceiptSha256,
          stripeConfirmationAttemptId:
            input.stripeAuthorizationEvidence.attemptId,
          confirmationStateReceiptSha256:
            input.stripeAuthorizationEvidence.confirmationStateReceiptSha256,
          duffelOrderExecutionId: input.duffelOrderEvidence.attemptId,
          duffelOrderStateReceiptSha256:
            input.duffelOrderEvidence.stateReceiptSha256,
          providerOrderReferenceSha256:
            input.duffelOrderEvidence.providerOrderReferenceSha256,
          paymentIntentReferenceSha256,
          duffelOrderExecutionBindingSha256:
            input.duffelOrderEvidence.orderExecutionBindingSha256,
          executionScopeSha256,
          idempotencySha256: idempotency.requestDigest,
          captureBindingSha256,
          capturePrerequisiteSha256,
          captureRequestSha256: requestEnvelopeSha256,
          captureAuthorityScopeSha256,
          captureAuthorityPayloadSha256,
          captureAuthoritySignatureSha256,
          captureAuthorityKeyId: input.captureAuthorityKeyId,
          amountCents: input.bridgeEvidence.amountCents,
          currency: "USD",
          captureAuthorityNotAfter: new Date(
            input.productionAuthorization.expiresAtSeconds * 1000,
          ).toISOString(),
          dispatchNotAfter: input.dispatchNotAfter,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "persistence_refused",
        );
      }
      if (prepared.decision === "replay") {
        let stored: Awaited<ReturnType<
          FlightConsumerLiveStripeCapturePersistence["readSupportIdentity"]
        >>;
        try {
          stored = await dependencies.executionPersistence
            .readSupportIdentity({
              attemptId: prepared.attempt_id,
              executionScopeSha256,
              captureBindingSha256,
              captureRequestSha256: requestEnvelopeSha256,
            });
        } catch {
          throw new FlightConsumerLiveStripePaymentIntentCaptureError(
            "persistence_refused",
          );
        }
        if (
          stored.attempt_id !== prepared.attempt_id
          || stored.attempt_state !== prepared.attempt_state
          || stored.attempt_revision !== prepared.attempt_revision
          || stored.state_receipt_sha256 !== prepared.state_receipt_sha256
          || stored.payment_intent_reference_sha256
            !== prepared.payment_intent_reference_sha256
          || stored.provider_order_reference_sha256
            !== prepared.provider_order_reference_sha256
          || stored.charge_reference_sha256
            !== prepared.charge_reference_sha256
          || stored.stripe_capture_request_count
            !== prepared.stripe_capture_request_count
          || stored.stripe_mutation_count !== prepared.stripe_mutation_count
          || stored.stripe_retrieval_request_count
            !== prepared.stripe_retrieval_request_count
          || (stored.stripe_capture_request_count === 0
            ? stored.client_correlation_id !== null
              || stored.client_correlation_id_sha256 !== null
            : stored.client_correlation_id !== clientCorrelationId
              || stored.client_correlation_id_sha256
                !== intendedClientCorrelationIdSha256)
        ) {
          throw new FlightConsumerLiveStripePaymentIntentCaptureError(
            "persistence_refused",
          );
        }
        const replayBase = resultBase({
          captureWorkflowSha256,
          capturePrerequisiteSha256,
          requestEnvelopeSha256,
          idempotencyRequestSha256: idempotency.requestDigest,
          idempotencyKeySha256,
          providerRequestCount: stored.stripe_capture_request_count,
          stripeRequestIdSha256: stored.stripe_request_id_sha256,
          clientCorrelationIdSha256:
            stored.client_correlation_id_sha256,
        });
        return Object.freeze({
          ...replayBase,
          decision: "replay" as const,
          replayStage: "prepare" as const,
          attemptId: prepared.attempt_id,
          attemptState: prepared.attempt_state,
          stateReceiptSha256: prepared.state_receipt_sha256,
          paymentIntentReferenceSha256,
          chargeReferenceSha256: prepared.charge_reference_sha256,
          ticketingRemainsLaterGate: true as const,
        });
      }

      let claimed: Awaited<ReturnType<
        FlightConsumerLiveStripeCapturePersistence["claim"]
      >>;
      try {
        claimed = await dependencies.executionPersistence.claim({
          attemptId: prepared.attempt_id,
          expectedRevision: 0,
          executionScopeSha256,
          captureBindingSha256,
          captureRequestSha256: requestEnvelopeSha256,
          dispatchTokenSha256: input.dispatchTokenSha256,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "persistence_refused",
        );
      }
      if (claimed.attempt_id !== prepared.attempt_id) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "persistence_refused",
        );
      }
      if (claimed.decision === "replay") {
        return Object.freeze({
          ...zeroRequestBase,
          decision: "replay" as const,
          replayStage: "claim" as const,
          attemptId: claimed.attempt_id,
          attemptState: claimed.attempt_state,
          stateReceiptSha256: claimed.state_receipt_sha256,
          paymentIntentReferenceSha256,
          chargeReferenceSha256: null,
          ticketingRemainsLaterGate: true as const,
        });
      }

      const terminalize = async (terminal: Readonly<{
        state: "failed" | "ambiguous";
        code: string;
        providerRequestCount: 0 | 1;
        httpStatus: number | null;
        terminalResponseSha256: string | null;
        dispatchEvidenceReceiptSha256?: string | null;
        transportEvidenceReceiptSha256?: string | null;
        clientCorrelationId: string | null;
        stripeRequestIdSha256?: string | null;
        clientCorrelationIdSha256?: string | null;
        stripeRequestId: string | null;
      }>): Promise<FlightConsumerLiveStripePaymentIntentCaptureResult> => {
        const completionEvidenceSha256 = sha256FlightEvidence({
          version: "flight-consumer-live-stripe-capture-terminal-v1",
          attemptId: claimed.attempt_id,
          terminalState: terminal.state,
          terminalCode: terminal.code,
          providerRequestCount: terminal.providerRequestCount,
          httpStatus: terminal.httpStatus,
          terminalResponseSha256: terminal.terminalResponseSha256,
          dispatchEvidenceReceiptSha256:
            terminal.dispatchEvidenceReceiptSha256 ?? null,
          transportEvidenceReceiptSha256:
            terminal.transportEvidenceReceiptSha256 ?? null,
          stripeRequestIdSha256: terminal.stripeRequestIdSha256 ?? null,
          clientCorrelationIdSha256:
            terminal.clientCorrelationIdSha256 ?? null,
          idempotencyKeySha256,
          captureWorkflowSha256,
          capturePrerequisiteSha256,
          requestEnvelopeSha256,
          blindRetryAuthorized: false,
        });
        const ambiguityEvidenceSha256 = terminal.state === "ambiguous"
          ? sha256FlightEvidence({
            version: "flight-consumer-live-stripe-capture-ambiguity-v1",
            completionEvidenceSha256,
            terminalCode: terminal.code,
            attemptId: claimed.attempt_id,
            retrievalOnlyReconciliationRequired: true,
          })
          : null;
        let completed: Awaited<ReturnType<
          FlightConsumerLiveStripeCapturePersistence["complete"]
        >>;
        try {
          completed = await dependencies.executionPersistence.complete({
            attemptId: claimed.attempt_id,
            expectedRevision: 1,
            executionScopeSha256,
            captureBindingSha256,
            captureRequestSha256: requestEnvelopeSha256,
            dispatchTokenSha256: input.dispatchTokenSha256,
            terminalState: terminal.state,
            stripeCaptureRequestCount: terminal.providerRequestCount,
            stripeMutationCount: terminal.providerRequestCount,
            terminalErrorCode: terminal.code,
            terminalHttpStatus: terminal.httpStatus,
            terminalResponseSha256: terminal.terminalResponseSha256,
            completionEvidenceSha256,
            ambiguityEvidenceSha256,
            observedPaymentIntentStatus: null,
            observedPaymentIntentReferenceSha256: null,
            observedAmountReceivedCents: null,
            observedCurrency: null,
            observedLivemode: null,
            observedCaptureMethod: null,
            chargeReferenceCiphertext: null,
            chargeReferenceSha256: null,
            clientCorrelationId: terminal.clientCorrelationId,
            clientCorrelationIdSha256:
              terminal.clientCorrelationIdSha256 ?? null,
            stripeRequestId: terminal.stripeRequestId,
            stripeRequestIdSha256: terminal.stripeRequestIdSha256 ?? null,
            transportOutcome: terminal.providerRequestCount === 0
              ? null
              : terminal.httpStatus === null
                ? "no_response"
                : "http_response",
          });
        } catch {
          throw new FlightConsumerLiveStripePaymentIntentCaptureError(
            "terminal_persistence_failed",
          );
        }
        if (
          completed.attempt_id !== claimed.attempt_id
          || completed.attempt_state !== terminal.state
          || completed.attempt_revision !== 2
          || (completed.decision !== "replay"
            && completed.decision !== terminal.state)
          || completed.payment_intent_reference_sha256
            !== paymentIntentReferenceSha256
          || completed.provider_order_reference_sha256
            !== input.duffelOrderEvidence.providerOrderReferenceSha256
          || completed.charge_reference_sha256 !== null
          || completed.stripe_capture_request_count
            !== terminal.providerRequestCount
          || completed.stripe_mutation_count !== terminal.providerRequestCount
          || completed.stripe_retrieval_request_count !== 0
        ) {
          throw new FlightConsumerLiveStripePaymentIntentCaptureError(
            "terminal_persistence_failed",
          );
        }
        const base = resultBase({
          captureWorkflowSha256,
          capturePrerequisiteSha256,
          requestEnvelopeSha256,
          idempotencyRequestSha256: idempotency.requestDigest,
          idempotencyKeySha256,
          providerRequestCount: terminal.providerRequestCount,
          dispatchEvidenceReceiptSha256:
            terminal.dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256:
            terminal.transportEvidenceReceiptSha256,
          stripeRequestIdSha256: terminal.stripeRequestIdSha256,
          clientCorrelationIdSha256: terminal.clientCorrelationIdSha256,
        });
        if (completed.decision === "replay") {
          return Object.freeze({
            ...base,
            decision: "replay" as const,
            replayStage: "complete" as const,
            attemptId: completed.attempt_id,
            attemptState: completed.attempt_state,
            stateReceiptSha256: completed.state_receipt_sha256,
            paymentIntentReferenceSha256,
            chargeReferenceSha256: completed.charge_reference_sha256,
            ticketingRemainsLaterGate: true as const,
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
            paymentIntentReferenceSha256,
            chargeReferenceSha256: null,
            ticketingRemainsLaterGate: true as const,
          });
        }
        return Object.freeze({
          ...base,
          decision: "ambiguous" as const,
          ambiguityCode: terminal.code,
          attemptId: completed.attempt_id,
          attemptState: "ambiguous" as const,
          stateReceiptSha256: completed.state_receipt_sha256,
          paymentIntentReferenceSha256,
          chargeReferenceSha256: null,
          ticketingRemainsLaterGate: true as const,
        });
      };

      let dispatchEvidenceReceiptSha256: string;
      try {
        const receipt = durableEvidenceReceiptSchema.safeParse(
          await dependencies.evidenceJournal.prepareDispatchEvidence({
            attemptId: claimed.attempt_id,
            captureWorkflowSha256,
            requestEnvelopeSha256,
            idempotencyRequestSha256: idempotency.requestDigest,
            idempotencyKeySha256,
            intendedClientCorrelationIdSha256,
          }),
        );
        if (!receipt.success) throw new Error("invalid_evidence_receipt");
        dispatchEvidenceReceiptSha256 = receipt.data.evidenceReceiptSha256;
      } catch {
        return terminalize({
          state: "failed",
          code: "dispatch_evidence_persistence_failed",
          providerRequestCount: 0,
          httpStatus: null,
          terminalResponseSha256: null,
          clientCorrelationId: null,
          clientCorrelationIdSha256: null,
          stripeRequestId: null,
          stripeRequestIdSha256: null,
        });
      }

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
          dispatchEvidenceReceiptSha256,
          clientCorrelationId: null,
          clientCorrelationIdSha256: null,
          stripeRequestId: null,
          stripeRequestIdSha256: null,
        });
      }
      const dispatchNowMs = dispatchNow * 1000;
      if (
        !Number.isSafeInteger(dispatchNow)
        || dispatchNow < 0
        || dispatchNowMs >= dispatchNotAfterMs
        || dispatchNow >= input.productionAuthorization.expiresAtSeconds
        || dispatchNowMs >= bridgeNotAfterMs
        || dispatchNowMs >= confirmationNotAfterMs
      ) {
        return terminalize({
          state: "failed",
          code: "dispatch_window_expired",
          providerRequestCount: 0,
          httpStatus: null,
          terminalResponseSha256: null,
          dispatchEvidenceReceiptSha256,
          clientCorrelationId: null,
          clientCorrelationIdSha256: null,
          stripeRequestId: null,
          stripeRequestIdSha256: null,
        });
      }

      const appendTransportEvidence = async (evidence: Readonly<{
        outcome: "http_response" | "no_response" | "invalid_http_response";
        terminalHttpStatus: number | null;
        terminalResponseSha256: string | null;
        stripeRequestIdSha256: string | null;
        observedClientCorrelationIdSha256: string | null;
      }>): Promise<string | null> => {
        try {
          const receipt = durableEvidenceReceiptSchema.safeParse(
            await dependencies.evidenceJournal
              .appendTransportOutcomeEvidence({
                attemptId: claimed.attempt_id,
                dispatchEvidenceReceiptSha256,
                outcome: evidence.outcome,
                providerRequestCount: 1,
                terminalHttpStatus: evidence.terminalHttpStatus,
                terminalResponseSha256: evidence.terminalResponseSha256,
                stripeRequestIdSha256: evidence.stripeRequestIdSha256,
                observedClientCorrelationIdSha256:
                  evidence.observedClientCorrelationIdSha256,
                idempotencyKeySha256,
              }),
          );
          return receipt.success ? receipt.data.evidenceReceiptSha256 : null;
        } catch {
          return null;
        }
      };

      let rawTransportResult: unknown;
      try {
        rawTransportResult = await dependencies.stripeTransport
          .capturePaymentIntent(
            request,
            Object.freeze({
              idempotencyKey: idempotency.idempotencyKey,
              clientCorrelationId,
            }),
          );
      } catch {
        // A thrown adapter exception is intentionally unclassified: the
        // adapter might already have received Stripe headers. Only an explicit
        // no_response envelope may persist null Stripe support identity.
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "terminal_persistence_failed",
        );
      }

      if ((rawTransportResult as { outcome?: unknown })?.outcome
        === "no_response") {
        const noResponse = noResponseTransportResultSchema.safeParse(
          rawTransportResult,
        );
        if (!noResponse.success) {
          throw new FlightConsumerLiveStripePaymentIntentCaptureError(
            "terminal_persistence_failed",
          );
        }
        const observedClientCorrelationIdSha256 = sha256Utf8(
          noResponse.data.clientCorrelationId,
        );
        const transportEvidenceReceiptSha256 = await appendTransportEvidence({
          outcome: "no_response",
          terminalHttpStatus: null,
          terminalResponseSha256: null,
          stripeRequestIdSha256: null,
          observedClientCorrelationIdSha256,
        });
        return terminalize({
          state: "ambiguous",
          code: transportEvidenceReceiptSha256 === null
            ? "stripe_capture_evidence_journal_failed"
            : noResponse.data.clientCorrelationId === clientCorrelationId
              ? "stripe_capture_outcome_unknown"
              : "stripe_capture_correlation_mismatch",
          providerRequestCount: 1,
          httpStatus: null,
          terminalResponseSha256: null,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
          stripeRequestId: null,
          stripeRequestIdSha256: null,
        });
      }

      const resolvedSupportIdentity =
        resolvedTransportSupportIdentitySchema.safeParse(rawTransportResult);
      if (!resolvedSupportIdentity.success) {
        // A resolved adapter value without the mandatory HTTP support identity
        // cannot safely be persisted as a transport exception. Leave the
        // attempt dispatching for retrieval-only operator recovery.
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "terminal_persistence_failed",
        );
      }
      const resolvedStripeRequestId =
        resolvedSupportIdentity.data.stripeRequestId;
      const resolvedStripeRequestIdSha256 = sha256Utf8(
        resolvedStripeRequestId,
      );
      const observedResolvedCorrelation = clientCorrelationIdSchema.safeParse(
        (rawTransportResult as { clientCorrelationId?: unknown })
          .clientCorrelationId,
      );
      const observedResolvedCorrelationSha256 =
        observedResolvedCorrelation.success
          ? sha256Utf8(observedResolvedCorrelation.data)
          : null;
      const parsedTransportResult = httpResponseTransportResultSchema.safeParse(
        rawTransportResult,
      );
      if (!parsedTransportResult.success) {
        const rawBody = boundedRawBodySchema.safeParse(
          (rawTransportResult as { rawBody?: unknown }).rawBody,
        );
        const terminalResponseSha256 = rawBody.success
          ? createHash("sha256").update(rawBody.data).digest("hex")
          : null;
        const transportEvidenceReceiptSha256 =
          await appendTransportEvidence({
            outcome: "invalid_http_response",
            terminalHttpStatus: resolvedSupportIdentity.data.httpStatus,
            terminalResponseSha256,
            stripeRequestIdSha256: resolvedStripeRequestIdSha256,
            observedClientCorrelationIdSha256:
              observedResolvedCorrelationSha256,
          });
        return terminalize({
          state: "ambiguous",
          code: transportEvidenceReceiptSha256 === null
            ? "stripe_capture_evidence_journal_failed"
            : "stripe_capture_response_refused",
          providerRequestCount: 1,
          httpStatus: resolvedSupportIdentity.data.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
          stripeRequestId: resolvedStripeRequestId,
          stripeRequestIdSha256: resolvedStripeRequestIdSha256,
        });
      }
      const transportResult = parsedTransportResult.data;

      const terminalResponseSha256 = createHash("sha256")
        .update(transportResult.rawBody)
        .digest("hex");
      const stripeRequestIdSha256 = sha256Utf8(
        transportResult.stripeRequestId,
      );
      const clientCorrelationIdSha256 = sha256Utf8(
        transportResult.clientCorrelationId,
      );
      const transportEvidenceReceiptSha256 = await appendTransportEvidence({
        outcome: "http_response",
        terminalHttpStatus: transportResult.httpStatus,
        terminalResponseSha256,
        stripeRequestIdSha256,
        observedClientCorrelationIdSha256: clientCorrelationIdSha256,
      });
      if (transportEvidenceReceiptSha256 === null) {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_evidence_journal_failed",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }
      if (transportResult.clientCorrelationId !== clientCorrelationId) {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_correlation_mismatch",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      let responseBody: unknown;
      try {
        responseBody = JSON.parse(
          Buffer.from(transportResult.rawBody).toString("utf8"),
        );
      } catch {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_response_refused",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      if (
        transportResult.httpStatus >= 400
        && transportResult.httpStatus <= 499
        && isDefinitiveStripeNoCaptureResponse(
          transportResult.httpStatus,
          responseBody,
        )
      ) {
        return terminalize({
          state: "failed",
          code: "stripe_capture_definitive_refusal",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }
      if (transportResult.httpStatus !== 200) {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_nonterminal_response",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      const paymentIntent = stripePaymentIntentSchema.safeParse(responseBody);
      if (
        !paymentIntent.success
        || paymentIntent.data.id !== decrypted.paymentIntentId
        || paymentIntent.data.amount !== input.bridgeEvidence.amountCents
        || paymentIntent.data.amount_received
          !== input.bridgeEvidence.amountCents
      ) {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_success_binding_mismatch",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      const chargeReferenceSha256 = sha256Utf8(
        paymentIntent.data.latest_charge,
      );
      if (
        chargeReferenceSha256 === paymentIntentReferenceSha256
        || chargeReferenceSha256
          === input.duffelOrderEvidence.providerOrderReferenceSha256
      ) {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_reference_collision",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      let encryptedCharge: z.output<typeof encryptedReferenceResultSchema>;
      try {
        const encrypted = encryptedReferenceResultSchema.safeParse(
          await dependencies.referenceEncryption.encryptChargeReference({
            plaintextReference: paymentIntent.data.latest_charge,
            plaintextReferenceSha256: chargeReferenceSha256,
            captureWorkflowSha256,
          }),
        );
        if (
          !encrypted.success
          || !equalSha256(
            encrypted.data.plaintextReferenceSha256,
            chargeReferenceSha256,
          )
        ) throw new Error("charge_reference_encryption_refused");
        encryptedCharge = encrypted.data;
      } catch {
        return terminalize({
          state: "ambiguous",
          code: "stripe_capture_reference_encryption_failed",
          providerRequestCount: 1,
          httpStatus: transportResult.httpStatus,
          terminalResponseSha256,
          dispatchEvidenceReceiptSha256,
          transportEvidenceReceiptSha256,
          clientCorrelationId,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
        });
      }

      const completionEvidenceSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-capture-completion-v1",
        attemptId: claimed.attempt_id,
        captureWorkflowSha256,
        capturePrerequisiteSha256,
        requestEnvelopeSha256,
        idempotencyKeySha256,
        dispatchEvidenceReceiptSha256,
        transportEvidenceReceiptSha256,
        terminalResponseSha256,
        stripeRequestIdSha256,
        clientCorrelationIdSha256,
        paymentIntentReferenceSha256,
        chargeReferenceSha256,
        observedStatus: paymentIntent.data.status,
        observedAmountReceivedCents: paymentIntent.data.amount_received,
        observedCurrency: paymentIntent.data.currency,
        observedLivemode: paymentIntent.data.livemode,
        observedCaptureMethod: paymentIntent.data.capture_method,
        blindRetryAuthorized: false,
      });
      let completed: Awaited<ReturnType<
        FlightConsumerLiveStripeCapturePersistence["complete"]
      >>;
      try {
        completed = await dependencies.executionPersistence.complete({
          attemptId: claimed.attempt_id,
          expectedRevision: 1,
          executionScopeSha256,
          captureBindingSha256,
          captureRequestSha256: requestEnvelopeSha256,
          dispatchTokenSha256: input.dispatchTokenSha256,
          terminalState: "succeeded",
          stripeCaptureRequestCount: 1,
          stripeMutationCount: 1,
          terminalErrorCode: null,
          terminalHttpStatus: 200,
          terminalResponseSha256,
          completionEvidenceSha256,
          ambiguityEvidenceSha256: null,
          observedPaymentIntentStatus: "succeeded",
          observedPaymentIntentReferenceSha256:
            paymentIntentReferenceSha256,
          observedAmountReceivedCents: paymentIntent.data.amount_received,
          observedCurrency: "usd",
          observedLivemode: true,
          observedCaptureMethod: "manual",
          chargeReferenceCiphertext: encryptedCharge.ciphertext,
          chargeReferenceSha256,
          clientCorrelationId,
          clientCorrelationIdSha256: intendedClientCorrelationIdSha256,
          stripeRequestId: transportResult.stripeRequestId,
          stripeRequestIdSha256,
          transportOutcome: "http_response",
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "terminal_persistence_failed",
        );
      }
      if (
        completed.attempt_id !== claimed.attempt_id
        || completed.attempt_state !== "succeeded"
        || completed.attempt_revision !== 2
        || (completed.decision !== "succeeded"
          && completed.decision !== "replay")
        || completed.payment_intent_reference_sha256
          !== paymentIntentReferenceSha256
        || completed.provider_order_reference_sha256
          !== input.duffelOrderEvidence.providerOrderReferenceSha256
        || completed.charge_reference_sha256 !== chargeReferenceSha256
        || completed.stripe_capture_request_count !== 1
        || completed.stripe_mutation_count !== 1
        || completed.stripe_retrieval_request_count !== 0
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCaptureError(
          "terminal_persistence_failed",
        );
      }
      const oneRequestBase = resultBase({
        captureWorkflowSha256,
        capturePrerequisiteSha256,
        requestEnvelopeSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        idempotencyKeySha256,
        providerRequestCount: 1,
        dispatchEvidenceReceiptSha256,
        transportEvidenceReceiptSha256,
        stripeRequestIdSha256,
        clientCorrelationIdSha256,
      });
      if (completed.decision === "replay") {
        return Object.freeze({
          ...oneRequestBase,
          decision: "replay" as const,
          replayStage: "complete" as const,
          attemptId: completed.attempt_id,
          attemptState: completed.attempt_state,
          stateReceiptSha256: completed.state_receipt_sha256,
          paymentIntentReferenceSha256,
          chargeReferenceSha256: completed.charge_reference_sha256,
          ticketingRemainsLaterGate: true as const,
        });
      }
      return Object.freeze({
        ...oneRequestBase,
        decision: "succeeded" as const,
        attemptId: completed.attempt_id,
        attemptState: "succeeded" as const,
        stateReceiptSha256: completed.state_receipt_sha256,
        paymentIntentReferenceSha256,
        chargeReferenceSha256,
        ticketingRemainsLaterGate: true as const,
      });
    },
  });
}
