import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const encryptedReferenceSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/,
);
const nullableEncryptedReferenceSchema = encryptedReferenceSchema.nullable();
const nullableSha256Schema = sha256Schema.nullable();
const nullableErrorCodeSchema = z.string()
  .regex(/^[a-z0-9_]{1,96}$/)
  .nullable();
const stripeRequestIdSchema = z.string().regex(/^req_[A-Za-z0-9]{8,128}$/);
const clientCorrelationIdSchema = z.string().regex(
  /^flt_capture_[0-9a-f]{48}$/,
);

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalSha256(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

const authorityResultShape = {
  livemode: z.literal(true),
  provider_dispatch_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  order_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
  blind_retry_authorized: z.literal(false),
} as const;

const prepareInputSchema = z.object({
  checkoutAggregateId: uuidSchema,
  authorizationBridgeReceiptSha256: sha256Schema,
  stripeConfirmationAttemptId: uuidSchema,
  confirmationStateReceiptSha256: sha256Schema,
  duffelOrderExecutionId: uuidSchema,
  duffelOrderStateReceiptSha256: sha256Schema,
  providerOrderReferenceSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  duffelOrderExecutionBindingSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  idempotencySha256: sha256Schema,
  captureBindingSha256: sha256Schema,
  capturePrerequisiteSha256: sha256Schema,
  captureRequestSha256: sha256Schema,
  captureAuthorityScopeSha256: sha256Schema,
  captureAuthorityPayloadSha256: sha256Schema,
  captureAuthoritySignatureSha256: sha256Schema,
  captureAuthorityKeyId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  amountCents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  captureAuthorityNotAfter: z.string().datetime({ offset: true }),
  dispatchNotAfter: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (
    Date.parse(value.captureAuthorityNotAfter)
      < Date.parse(value.dispatchNotAfter)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["captureAuthorityNotAfter"],
      message: "Capture authority must outlive its bounded dispatch window.",
    });
  }
});

const claimInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(0),
  executionScopeSha256: sha256Schema,
  captureBindingSha256: sha256Schema,
  captureRequestSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
}).strict();

const completionInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  captureBindingSha256: sha256Schema,
  captureRequestSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
  terminalState: z.enum(["succeeded", "failed", "ambiguous"]),
  stripeCaptureRequestCount: z.union([z.literal(0), z.literal(1)]),
  stripeMutationCount: z.union([z.literal(0), z.literal(1)]),
  terminalErrorCode: nullableErrorCodeSchema,
  terminalHttpStatus: z.number().int().min(100).max(599).nullable(),
  terminalResponseSha256: nullableSha256Schema,
  completionEvidenceSha256: sha256Schema,
  ambiguityEvidenceSha256: nullableSha256Schema,
  observedPaymentIntentStatus: z.literal("succeeded").nullable(),
  observedPaymentIntentReferenceSha256: nullableSha256Schema,
  observedAmountReceivedCents: z.number()
    .int().min(50).max(99_999_999).nullable(),
  observedCurrency: z.literal("usd").nullable(),
  observedLivemode: z.literal(true).nullable(),
  observedCaptureMethod: z.literal("manual").nullable(),
  chargeReferenceCiphertext: nullableEncryptedReferenceSchema,
  chargeReferenceSha256: nullableSha256Schema,
  clientCorrelationId: clientCorrelationIdSchema.nullable(),
  clientCorrelationIdSha256: nullableSha256Schema,
  stripeRequestId: stripeRequestIdSchema.nullable(),
  stripeRequestIdSha256: nullableSha256Schema,
  transportOutcome: z.enum(["http_response", "no_response"]).nullable(),
}).strict().superRefine((value, context) => {
  const issue = (path: keyof typeof value, message: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  };
  if (value.stripeCaptureRequestCount !== value.stripeMutationCount) {
    issue("stripeMutationCount", "Capture request and mutation counts diverge.");
  }
  const chargePair = value.chargeReferenceCiphertext === null
    ? value.chargeReferenceSha256 === null
    : value.chargeReferenceSha256 !== null;
  if (!chargePair) {
    issue("chargeReferenceSha256", "Encrypted charge reference pair is incomplete.");
  }
  const clientIdentityPair = value.clientCorrelationId === null
    ? value.clientCorrelationIdSha256 === null
    : value.clientCorrelationIdSha256 !== null
      && equalSha256(
        sha256Utf8(value.clientCorrelationId),
        value.clientCorrelationIdSha256,
      );
  const stripeIdentityPair = value.stripeRequestId === null
    ? value.stripeRequestIdSha256 === null
    : value.stripeRequestIdSha256 !== null
      && equalSha256(
        sha256Utf8(value.stripeRequestId),
        value.stripeRequestIdSha256,
      );
  const supportIdentityShape = value.stripeCaptureRequestCount === 0
    ? value.clientCorrelationId === null
      && value.clientCorrelationIdSha256 === null
      && value.stripeRequestId === null
      && value.stripeRequestIdSha256 === null
      && value.transportOutcome === null
    : value.clientCorrelationId !== null
      && value.clientCorrelationIdSha256 !== null
      && (
        (value.transportOutcome === "no_response"
          && value.terminalHttpStatus === null
          && value.terminalResponseSha256 === null
          && value.stripeRequestId === null
          && value.stripeRequestIdSha256 === null)
        || (value.transportOutcome === "http_response"
          && value.terminalHttpStatus !== null
          && value.stripeRequestId !== null
          && value.stripeRequestIdSha256 !== null)
      );
  const deterministicClientCorrelation = value.clientCorrelationId === null
    || value.clientCorrelationId
      === `flt_capture_${value.captureRequestSha256.slice(0, 48)}`;
  if (
    !clientIdentityPair
    || !stripeIdentityPair
    || !supportIdentityShape
    || !deterministicClientCorrelation
  ) {
    issue(
      "clientCorrelationId",
      "Capture support identity does not match the resolved transport state.",
    );
  }

  const structuredSuccess = value.observedPaymentIntentStatus === "succeeded"
    && value.observedPaymentIntentReferenceSha256 !== null
    && value.observedAmountReceivedCents !== null
    && value.observedCurrency === "usd"
    && value.observedLivemode === true
    && value.observedCaptureMethod === "manual";
  const noStructuredResult = value.observedPaymentIntentStatus === null
    && value.observedPaymentIntentReferenceSha256 === null
    && value.observedAmountReceivedCents === null
    && value.observedCurrency === null
    && value.observedLivemode === null
    && value.observedCaptureMethod === null;

  if (value.terminalState === "succeeded") {
    if (
      value.stripeCaptureRequestCount !== 1
      || value.terminalErrorCode !== null
      || value.terminalHttpStatus !== 200
      || value.terminalResponseSha256 === null
      || value.ambiguityEvidenceSha256 !== null
      || !structuredSuccess
      || value.chargeReferenceCiphertext === null
      || value.chargeReferenceSha256 === null
    ) issue("terminalState", "Successful capture evidence is incomplete.");
  } else if (value.terminalState === "failed") {
    const localFailure = value.stripeCaptureRequestCount === 0
      && value.terminalHttpStatus === null
      && value.terminalResponseSha256 === null;
    const definitiveProviderFailure = value.stripeCaptureRequestCount === 1
      && value.terminalHttpStatus !== null
      && value.terminalHttpStatus >= 400
      && value.terminalHttpStatus <= 499
      && value.terminalResponseSha256 !== null;
    if (
      value.terminalErrorCode === null
      || (!localFailure && !definitiveProviderFailure)
      || value.ambiguityEvidenceSha256 !== null
      || !noStructuredResult
      || value.chargeReferenceSha256 !== null
    ) issue("terminalState", "Failed capture evidence is not definitive.");
  } else if (
    value.stripeCaptureRequestCount !== 1
    || value.terminalErrorCode === null
    || value.ambiguityEvidenceSha256 === null
    || value.ambiguityEvidenceSha256 === value.completionEvidenceSha256
    || !noStructuredResult
    || value.chargeReferenceSha256 !== null
  ) {
    issue(
      "terminalState",
      "Ambiguous capture evidence must remain identifier-free and terminal.",
    );
  }
});

const reconciliationInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(2),
  executionScopeSha256: sha256Schema,
  captureBindingSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
  reconciliationOutcome: z.enum(["succeeded", "failed"]),
  stripeRetrievalRequestCount: z.literal(1),
  retrievalResponseSha256: sha256Schema,
  reconciliationEvidenceSha256: sha256Schema,
  observedPaymentIntentStatus: z.enum([
    "succeeded",
    "requires_capture",
  ]).nullable(),
  observedPaymentIntentReferenceSha256: nullableSha256Schema,
  observedAmountReceivedCents: z.number()
    .int().min(0).max(99_999_999).nullable(),
  observedCurrency: z.literal("usd").nullable(),
  observedLivemode: z.literal(true).nullable(),
  observedCaptureMethod: z.literal("manual").nullable(),
  chargeReferenceCiphertext: nullableEncryptedReferenceSchema,
  chargeReferenceSha256: nullableSha256Schema,
}).strict().superRefine((value, context) => {
  const chargePair = value.chargeReferenceCiphertext === null
    ? value.chargeReferenceSha256 === null
    : value.chargeReferenceSha256 !== null;
  const structuredSuccess = value.observedPaymentIntentStatus === "succeeded"
    && value.observedPaymentIntentReferenceSha256 !== null
    && value.observedAmountReceivedCents !== null
    && value.observedCurrency === "usd"
    && value.observedLivemode === true
    && value.observedCaptureMethod === "manual";
  const structuredFailure =
    value.observedPaymentIntentStatus === "requires_capture"
    && value.observedPaymentIntentReferenceSha256 !== null
    && value.observedAmountReceivedCents === 0
    && value.observedCurrency === "usd"
    && value.observedLivemode === true
    && value.observedCaptureMethod === "manual";
  const valid = chargePair && (
    (value.reconciliationOutcome === "succeeded"
      && structuredSuccess
      && value.chargeReferenceCiphertext !== null
      && value.chargeReferenceSha256 !== null)
    || (value.reconciliationOutcome === "failed"
      && structuredFailure
      && value.chargeReferenceSha256 === null)
  );
  if (!valid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciliationOutcome"],
      message: "Retrieval-only reconciliation evidence is inconsistent.",
    });
  }
});

const supportIdentityInputSchema = z.object({
  attemptId: uuidSchema,
  executionScopeSha256: sha256Schema,
  captureBindingSha256: sha256Schema,
  captureRequestSha256: sha256Schema,
}).strict();

const attemptStateSchema = z.enum([
  "prepared",
  "dispatching",
  "succeeded",
  "failed",
  "ambiguous",
  "reconciled",
]);
const baseResultShape = {
  attempt_id: uuidSchema,
  attempt_state: attemptStateSchema,
  attempt_revision: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  ]),
  payment_intent_reference_sha256: sha256Schema,
  provider_order_reference_sha256: sha256Schema,
  charge_reference_sha256: nullableSha256Schema,
  stripe_capture_request_count: z.union([z.literal(0), z.literal(1)]),
  stripe_mutation_count: z.union([z.literal(0), z.literal(1)]),
  stripe_retrieval_request_count: z.union([z.literal(0), z.literal(1)]),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
} as const;

const prepareResultSchema = z.object({
  decision: z.enum(["created", "replay"]),
  ...baseResultShape,
}).strict().superRefine((value, context) => {
  const expectedRevision = {
    prepared: 0,
    dispatching: 1,
    succeeded: 2,
    failed: 2,
    ambiguous: 2,
    reconciled: 3,
  }[value.attempt_state];
  if (
    value.attempt_revision !== expectedRevision
    || (value.decision === "created" && value.attempt_state !== "prepared")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attempt_state"],
      message: "Preparation receipt state is invalid.",
    });
  }
});
const claimResultSchema = z.object({
  decision: z.enum(["claimed", "replay"]),
  ...baseResultShape,
  attempt_state: z.literal("dispatching"),
  attempt_revision: z.literal(1),
  stripe_capture_request_count: z.literal(0),
  stripe_mutation_count: z.literal(0),
  stripe_retrieval_request_count: z.literal(0),
}).strict();
const completionResultSchema = z.object({
  decision: z.enum(["succeeded", "failed", "ambiguous", "replay"]),
  ...baseResultShape,
  attempt_state: z.enum(["succeeded", "failed", "ambiguous"]),
  attempt_revision: z.literal(2),
  stripe_retrieval_request_count: z.literal(0),
}).strict().superRefine((value, context) => {
  if (
    value.decision !== "replay"
    && value.decision !== value.attempt_state
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decision"],
      message: "Completion receipt decision is inconsistent.",
    });
  }
  if (
    value.stripe_capture_request_count !== value.stripe_mutation_count
    || (value.attempt_state !== "failed"
      && value.stripe_capture_request_count !== 1)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stripe_capture_request_count"],
      message: "Capture mutation count is invalid.",
    });
  }
});
const reconciliationResultSchema = z.object({
  decision: z.enum(["reconciled", "replay"]),
  ...baseResultShape,
  attempt_state: z.literal("reconciled"),
  attempt_revision: z.literal(3),
  stripe_capture_request_count: z.literal(1),
  stripe_mutation_count: z.literal(1),
  stripe_retrieval_request_count: z.literal(1),
}).strict();
const supportIdentityResultSchema = z.object({
  decision: z.literal("observed"),
  ...baseResultShape,
  terminal_http_status: z.number().int().min(100).max(599).nullable(),
  terminal_response_sha256: nullableSha256Schema,
  client_correlation_id: clientCorrelationIdSchema.nullable(),
  client_correlation_id_sha256: nullableSha256Schema,
  stripe_request_id: stripeRequestIdSchema.nullable(),
  stripe_request_id_sha256: nullableSha256Schema,
  stripe_transport_outcome: z.enum(["http_response", "no_response"])
    .nullable(),
}).strict().superRefine((value, context) => {
  const expectedRevision = {
    prepared: 0,
    dispatching: 1,
    succeeded: 2,
    failed: 2,
    ambiguous: 2,
    reconciled: 3,
  }[value.attempt_state];
  const clientPair = value.client_correlation_id === null
    ? value.client_correlation_id_sha256 === null
    : value.client_correlation_id_sha256 !== null
      && equalSha256(
        sha256Utf8(value.client_correlation_id),
        value.client_correlation_id_sha256,
      );
  const stripePair = value.stripe_request_id === null
    ? value.stripe_request_id_sha256 === null
    : value.stripe_request_id_sha256 !== null
      && equalSha256(
        sha256Utf8(value.stripe_request_id),
        value.stripe_request_id_sha256,
      );
  const identityShape = value.stripe_capture_request_count === 0
    ? value.client_correlation_id === null
      && value.client_correlation_id_sha256 === null
      && value.stripe_request_id === null
      && value.stripe_request_id_sha256 === null
      && value.terminal_http_status === null
      && value.terminal_response_sha256 === null
      && value.stripe_transport_outcome === null
    : value.client_correlation_id !== null
      && value.client_correlation_id_sha256 !== null
      && (
        (value.stripe_transport_outcome === "no_response"
          && value.terminal_http_status === null
          && value.terminal_response_sha256 === null
          && value.stripe_request_id === null
          && value.stripe_request_id_sha256 === null)
        || (value.stripe_transport_outcome === "http_response"
          && value.terminal_http_status !== null
          && value.stripe_request_id !== null
          && value.stripe_request_id_sha256 !== null)
      );
  if (
    value.attempt_revision !== expectedRevision
    || value.stripe_capture_request_count !== value.stripe_mutation_count
    || !clientPair
    || !stripePair
    || !identityShape
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["client_correlation_id"],
      message: "Stored capture support identity is inconsistent.",
    });
  }
});

export const FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_MIGRATION_VERSION =
  "202608260114" as const;

export const FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_stripe_capture_v1",
  claim: "claim_flight_consumer_live_stripe_capture_v1",
  complete: "complete_flight_consumer_live_stripe_capture_v2",
  reconcile: "reconcile_flight_consumer_live_stripe_capture_v1",
  readSupportIdentity:
    "read_flight_consumer_live_stripe_capture_support_identity_v1",
} as const);

export type FlightConsumerLiveStripeCaptureRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveStripeCapturePersistence = Readonly<{
  version: "flight-consumer-live-stripe-capture-persistence-v2";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_MIGRATION_VERSION;
  processorEnvironment: "stripe_live";
  livemode: true;
  captureMethod: "manual";
  paymentMethodType: "card";
  routeExposed: false;
  stripeTransportImplemented: false;
  databaseApplyAuthorized: false;
  signedOneShotAuthorityRequired: true;
  exact109AuthorizationRequired: true;
  exact110FinalizationBridgeRequired: true;
  exact108SuccessfulOrderRequired: true;
  exact113BookingSettlementPredecessorRequired: true;
  plaintextSupportIdentityRetained: true;
  supportIdentityLookupRequired: true;
  claimGrantsCaptureAuthority: false;
  reconciliationIsRetrievalOnly: true;
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
  maxStripeCaptureMutations: 1;
  prepare: (
    input: z.input<typeof prepareInputSchema>,
  ) => Promise<z.output<typeof prepareResultSchema>>;
  claim: (
    input: z.input<typeof claimInputSchema>,
  ) => Promise<z.output<typeof claimResultSchema>>;
  complete: (
    input: z.input<typeof completionInputSchema>,
  ) => Promise<z.output<typeof completionResultSchema>>;
  reconcile: (
    input: z.input<typeof reconciliationInputSchema>,
  ) => Promise<z.output<typeof reconciliationResultSchema>>;
  readSupportIdentity: (
    input: z.input<typeof supportIdentityInputSchema>,
  ) => Promise<z.output<typeof supportIdentityResultSchema>>;
}>;

export class FlightConsumerLiveStripeCapturePersistenceError extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveStripeCapturePersistenceError["reason"],
  ) {
    super("Flight Consumer Live Stripe capture persistence was refused.");
    this.name = "FlightConsumerLiveStripeCapturePersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeCapturePersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveStripeCaptureRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveStripeCapturePersistenceError("rpc_refused");
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveStripeCapturePersistenceError("rpc_refused");
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveStripeCapturePersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeCapturePersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveStripeCapturePersistence(
  client: FlightConsumerLiveStripeCaptureRpcClient,
): FlightConsumerLiveStripeCapturePersistence {
  return Object.freeze({
    version: "flight-consumer-live-stripe-capture-persistence-v2" as const,
    migrationVersion: FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_MIGRATION_VERSION,
    processorEnvironment: "stripe_live" as const,
    livemode: true as const,
    captureMethod: "manual" as const,
    paymentMethodType: "card" as const,
    routeExposed: false as const,
    stripeTransportImplemented: false as const,
    databaseApplyAuthorized: false as const,
    signedOneShotAuthorityRequired: true as const,
    exact109AuthorizationRequired: true as const,
    exact110FinalizationBridgeRequired: true as const,
    exact108SuccessfulOrderRequired: true as const,
    exact113BookingSettlementPredecessorRequired: true as const,
    plaintextSupportIdentityRetained: true as const,
    supportIdentityLookupRequired: true as const,
    claimGrantsCaptureAuthority: false as const,
    reconciliationIsRetrievalOnly: true as const,
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
    maxStripeCaptureMutations: 1 as const,
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.prepare,
        {
          p_checkout_aggregate_id: value.checkoutAggregateId,
          p_authorization_bridge_receipt_sha256:
            value.authorizationBridgeReceiptSha256,
          p_stripe_confirmation_attempt_id:
            value.stripeConfirmationAttemptId,
          p_confirmation_state_receipt_sha256:
            value.confirmationStateReceiptSha256,
          p_duffel_order_execution_id: value.duffelOrderExecutionId,
          p_duffel_order_state_receipt_sha256:
            value.duffelOrderStateReceiptSha256,
          p_provider_order_reference_sha256:
            value.providerOrderReferenceSha256,
          p_payment_intent_reference_sha256:
            value.paymentIntentReferenceSha256,
          p_duffel_order_execution_binding_sha256:
            value.duffelOrderExecutionBindingSha256,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_idempotency_sha256: value.idempotencySha256,
          p_capture_binding_sha256: value.captureBindingSha256,
          p_capture_prerequisite_sha256:
            value.capturePrerequisiteSha256,
          p_capture_request_sha256: value.captureRequestSha256,
          p_capture_authority_scope_sha256:
            value.captureAuthorityScopeSha256,
          p_capture_authority_payload_sha256:
            value.captureAuthorityPayloadSha256,
          p_capture_authority_signature_sha256:
            value.captureAuthoritySignatureSha256,
          p_capture_authority_key_id: value.captureAuthorityKeyId,
          p_amount_cents: value.amountCents,
          p_currency: value.currency,
          p_capture_authority_not_after: value.captureAuthorityNotAfter,
          p_dispatch_not_after: value.dispatchNotAfter,
        },
        prepareResultSchema,
      );
    },
    async claim(input) {
      const value = parseInput(claimInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.claim,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_capture_binding_sha256: value.captureBindingSha256,
          p_capture_request_sha256: value.captureRequestSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
        },
        claimResultSchema,
      );
    },
    async complete(input) {
      const value = parseInput(completionInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.complete,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_capture_binding_sha256: value.captureBindingSha256,
          p_capture_request_sha256: value.captureRequestSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
          p_terminal_state: value.terminalState,
          p_stripe_capture_request_count: value.stripeCaptureRequestCount,
          p_stripe_mutation_count: value.stripeMutationCount,
          p_terminal_error_code: value.terminalErrorCode,
          p_terminal_http_status: value.terminalHttpStatus,
          p_terminal_response_sha256: value.terminalResponseSha256,
          p_completion_evidence_sha256: value.completionEvidenceSha256,
          p_ambiguity_evidence_sha256: value.ambiguityEvidenceSha256,
          p_observed_payment_intent_status:
            value.observedPaymentIntentStatus,
          p_observed_payment_intent_reference_sha256:
            value.observedPaymentIntentReferenceSha256,
          p_observed_amount_received_cents:
            value.observedAmountReceivedCents,
          p_observed_currency: value.observedCurrency,
          p_observed_livemode: value.observedLivemode,
          p_observed_capture_method: value.observedCaptureMethod,
          p_charge_reference_ciphertext: value.chargeReferenceCiphertext,
          p_charge_reference_sha256: value.chargeReferenceSha256,
          p_client_correlation_id: value.clientCorrelationId,
          p_client_correlation_id_sha256:
            value.clientCorrelationIdSha256,
          p_stripe_request_id: value.stripeRequestId,
          p_stripe_request_id_sha256: value.stripeRequestIdSha256,
          p_stripe_transport_outcome: value.transportOutcome,
        },
        completionResultSchema,
      );
    },
    async reconcile(input) {
      const value = parseInput(reconciliationInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.reconcile,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_capture_binding_sha256: value.captureBindingSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
          p_reconciliation_outcome: value.reconciliationOutcome,
          p_stripe_retrieval_request_count:
            value.stripeRetrievalRequestCount,
          p_retrieval_response_sha256: value.retrievalResponseSha256,
          p_reconciliation_evidence_sha256:
            value.reconciliationEvidenceSha256,
          p_observed_payment_intent_status:
            value.observedPaymentIntentStatus,
          p_observed_payment_intent_reference_sha256:
            value.observedPaymentIntentReferenceSha256,
          p_observed_amount_received_cents:
            value.observedAmountReceivedCents,
          p_observed_currency: value.observedCurrency,
          p_observed_livemode: value.observedLivemode,
          p_observed_capture_method: value.observedCaptureMethod,
          p_charge_reference_ciphertext: value.chargeReferenceCiphertext,
          p_charge_reference_sha256: value.chargeReferenceSha256,
        },
        reconciliationResultSchema,
      );
    },
    async readSupportIdentity(input) {
      const value = parseInput(supportIdentityInputSchema, input);
      const observed = await executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.readSupportIdentity,
        {
          p_attempt_id: value.attemptId,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_capture_binding_sha256: value.captureBindingSha256,
          p_capture_request_sha256: value.captureRequestSha256,
        },
        supportIdentityResultSchema,
      );
      const expectedClientCorrelationId =
        `flt_capture_${value.captureRequestSha256.slice(0, 48)}`;
      if (
        observed.stripe_capture_request_count === 1
        && observed.client_correlation_id !== expectedClientCorrelationId
      ) {
        throw new FlightConsumerLiveStripeCapturePersistenceError(
          "invalid_result",
        );
      }
      return observed;
    },
  });
}
