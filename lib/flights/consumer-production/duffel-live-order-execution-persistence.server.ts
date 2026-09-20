import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const encryptedReferenceSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/,
);
const nullableEncryptedReferenceSchema = encryptedReferenceSchema.nullable();
const nullableSha256Schema = sha256Schema.nullable();
const errorCodeSchema = z.string().regex(/^[a-z0-9_]{1,96}$/);
const supportIdentitySchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/,
);

const authorityResultShape = {
  livemode: z.literal(true),
  provider_dispatch_authorized: z.literal(false),
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
  checkoutEvidenceAggregateId: uuidSchema,
  checkoutExecutionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  checkoutStateReceiptSha256: sha256Schema,
  offerRefreshAttemptId: uuidSchema,
  offerRefreshExecutionScopeSha256: sha256Schema,
  offerBindingSha256: sha256Schema,
  normalizedOfferSha256: sha256Schema,
  offerTerminalResponseSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  idempotencySha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  orderExecutionPrerequisiteSha256: sha256Schema,
  orderRequestSha256: sha256Schema,
  amountCents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  dispatchNotAfter: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.orderReferenceSha256 === value.customerReferenceSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["orderReferenceSha256"],
      message: "Order and customer reference digests must be independent.",
    });
  }
});

const claimInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(0),
  executionScopeSha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  orderRequestSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
}).strict();

const supportIdentityReadInputSchema = z.object({
  attemptId: uuidSchema,
  executionScopeSha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  orderRequestSha256: sha256Schema,
}).strict();

const completeInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  orderRequestSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
  terminalState: z.enum(["succeeded", "failed", "ambiguous"]),
  providerRequestCount: z.union([z.literal(0), z.literal(1)]),
  airOrdersPostCount: z.union([z.literal(0), z.literal(1)]),
  terminalErrorCode: errorCodeSchema.nullable(),
  terminalHttpStatus: z.number().int().min(100).max(599).nullable(),
  terminalResponseSha256: nullableSha256Schema,
  providerOrderReferenceCiphertext: nullableEncryptedReferenceSchema,
  providerOrderReferenceSha256: nullableSha256Schema,
  providerBookingReferenceCiphertext: nullableEncryptedReferenceSchema,
  providerBookingReferenceSha256: nullableSha256Schema,
  completionEvidenceSha256: sha256Schema,
  ambiguityEvidenceSha256: nullableSha256Schema,
  clientCorrelationId: supportIdentitySchema.nullable(),
  clientCorrelationIdSha256: nullableSha256Schema,
  providerRequestId: supportIdentitySchema.nullable(),
  providerRequestIdSha256: nullableSha256Schema,
}).strict().superRefine((value, context) => {
  const issue = (path: keyof typeof value, message: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  };
  if (value.providerRequestCount !== value.airOrdersPostCount) {
    issue("airOrdersPostCount", "Exactly one counter represents POST /air/orders.");
  }
  const orderPair = value.providerOrderReferenceCiphertext === null
    ? value.providerOrderReferenceSha256 === null
    : value.providerOrderReferenceSha256 !== null;
  const bookingPair = value.providerBookingReferenceCiphertext === null
    ? value.providerBookingReferenceSha256 === null
    : value.providerBookingReferenceSha256 !== null;
  if (!orderPair) issue("providerOrderReferenceSha256", "Provider reference pair is incomplete.");
  if (!bookingPair) issue("providerBookingReferenceSha256", "Booking reference pair is incomplete.");
  const clientCorrelationPair = value.clientCorrelationId === null
    ? value.clientCorrelationIdSha256 === null
    : value.clientCorrelationIdSha256 !== null;
  const providerRequestPair = value.providerRequestId === null
    ? value.providerRequestIdSha256 === null
    : value.providerRequestIdSha256 !== null;
  if (!clientCorrelationPair) {
    issue("clientCorrelationIdSha256", "Client correlation evidence pair is incomplete.");
  }
  if (!providerRequestPair) {
    issue("providerRequestIdSha256", "Provider request evidence pair is incomplete.");
  }
  if (value.providerRequestCount === 0 && (
    value.clientCorrelationId !== null
    || value.providerRequestId !== null
  )) {
    issue("clientCorrelationId", "Local outcomes cannot carry provider support identity.");
  }
  if (value.providerRequestCount === 1 && value.clientCorrelationId === null) {
    issue("clientCorrelationId", "Every provider call requires durable client correlation.");
  }
  if (
    value.providerRequestCount === 1
    && ((value.terminalHttpStatus === null) !== (value.providerRequestId === null))
  ) {
    issue(
      "providerRequestId",
      "Duffel x-request-id is required exactly when an HTTP response exists.",
    );
  }
  if (
    value.providerBookingReferenceSha256 !== null
    && value.providerBookingReferenceSha256
      === value.providerOrderReferenceSha256
  ) {
    issue("providerBookingReferenceSha256", "Provider reference digests must be independent.");
  }

  if (value.terminalState === "succeeded") {
    if (
      value.providerRequestCount !== 1
      || value.terminalErrorCode !== null
      || value.terminalHttpStatus === null
      || value.terminalHttpStatus < 200
      || value.terminalHttpStatus > 299
      || value.terminalResponseSha256 === null
      || value.providerOrderReferenceCiphertext === null
      || value.providerOrderReferenceSha256 === null
      || value.ambiguityEvidenceSha256 !== null
    ) issue("terminalState", "Succeeded evidence is incomplete.");
  } else if (value.terminalState === "failed") {
    const localFailure = value.providerRequestCount === 0
      && value.terminalHttpStatus === null
      && value.terminalResponseSha256 === null;
    const definitiveProviderFailure = value.providerRequestCount === 1
      && value.terminalHttpStatus !== null
      && value.terminalHttpStatus >= 400
      && value.terminalHttpStatus <= 499
      && value.terminalResponseSha256 !== null;
    if (
      value.terminalErrorCode === null
      || (!localFailure && !definitiveProviderFailure)
      || value.providerOrderReferenceCiphertext !== null
      || value.providerOrderReferenceSha256 !== null
      || value.providerBookingReferenceCiphertext !== null
      || value.providerBookingReferenceSha256 !== null
      || value.ambiguityEvidenceSha256 !== null
    ) issue("terminalState", "Failed evidence is not definitive.");
  } else if (
    value.providerRequestCount !== 1
    || value.terminalErrorCode === null
    || value.providerOrderReferenceCiphertext !== null
    || value.providerOrderReferenceSha256 !== null
    || value.providerBookingReferenceCiphertext !== null
    || value.providerBookingReferenceSha256 !== null
    || value.ambiguityEvidenceSha256 === null
    || value.ambiguityEvidenceSha256 === value.completionEvidenceSha256
  ) {
    issue("terminalState", "Ambiguous evidence must remain terminal and identifier-free.");
  }
});

const reconcileInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(2),
  executionScopeSha256: sha256Schema,
  orderExecutionBindingSha256: sha256Schema,
  dispatchTokenSha256: sha256Schema,
  reconciliationOutcome: z.enum(["succeeded", "failed"]),
  reconciliationResponseSha256: sha256Schema,
  reconciliationEvidenceSha256: sha256Schema,
  providerOrderReferenceCiphertext: nullableEncryptedReferenceSchema,
  providerOrderReferenceSha256: nullableSha256Schema,
  providerBookingReferenceCiphertext: nullableEncryptedReferenceSchema,
  providerBookingReferenceSha256: nullableSha256Schema,
}).strict().superRefine((value, context) => {
  const orderPair = value.providerOrderReferenceCiphertext === null
    ? value.providerOrderReferenceSha256 === null
    : value.providerOrderReferenceSha256 !== null;
  const bookingPair = value.providerBookingReferenceCiphertext === null
    ? value.providerBookingReferenceSha256 === null
    : value.providerBookingReferenceSha256 !== null;
  const success = value.reconciliationOutcome === "succeeded"
    && value.providerOrderReferenceCiphertext !== null
    && value.providerOrderReferenceSha256 !== null;
  const failure = value.reconciliationOutcome === "failed"
    && value.providerOrderReferenceCiphertext === null
    && value.providerOrderReferenceSha256 === null
    && value.providerBookingReferenceCiphertext === null
    && value.providerBookingReferenceSha256 === null;
  if (!orderPair || !bookingPair || (!success && !failure)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciliationOutcome"],
      message: "Reconciliation evidence is inconsistent.",
    });
  }
  if (
    value.providerBookingReferenceSha256 !== null
    && value.providerBookingReferenceSha256
      === value.providerOrderReferenceSha256
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["providerBookingReferenceSha256"],
      message: "Provider reference digests must be independent.",
    });
  }
});

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
  provider_order_reference_sha256: nullableSha256Schema,
  provider_booking_reference_sha256: nullableSha256Schema,
  provider_request_count: z.union([z.literal(0), z.literal(1)]),
  air_orders_post_count: z.union([z.literal(0), z.literal(1)]),
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
  provider_request_count: z.literal(0),
  air_orders_post_count: z.literal(0),
}).strict();

const completeResultSchema = z.object({
  decision: z.enum(["succeeded", "failed", "ambiguous", "replay"]),
  ...baseResultShape,
  attempt_state: z.enum(["succeeded", "failed", "ambiguous"]),
  attempt_revision: z.literal(2),
}).strict().superRefine((value, context) => {
  if (value.decision !== "replay" && value.decision !== value.attempt_state) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decision"],
      message: "Completion receipt decision is inconsistent.",
    });
  }
  if (
    value.provider_request_count !== value.air_orders_post_count
    || (value.attempt_state !== "failed" && value.provider_request_count !== 1)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["provider_request_count"],
      message: "Completion request count is invalid.",
    });
  }
});

const reconcileResultSchema = z.object({
  decision: z.enum(["reconciled", "replay"]),
  ...baseResultShape,
  attempt_state: z.literal("reconciled"),
  attempt_revision: z.literal(3),
  provider_request_count: z.literal(1),
  air_orders_post_count: z.literal(1),
}).strict();

const supportIdentityReadResultSchema = z.object({
  ...baseResultShape,
  terminal_http_status: z.number().int().min(100).max(599).nullable(),
  client_correlation_id: supportIdentitySchema.nullable(),
  client_correlation_id_sha256: nullableSha256Schema,
  provider_request_id: supportIdentitySchema.nullable(),
  provider_request_id_sha256: nullableSha256Schema,
}).strict().superRefine((value, context) => {
  const issue = (path: keyof typeof value, message: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  };
  const expectedRevision = {
    prepared: 0,
    dispatching: 1,
    succeeded: 2,
    failed: 2,
    ambiguous: 2,
    reconciled: 3,
  }[value.attempt_state];
  if (value.attempt_revision !== expectedRevision) {
    issue("attempt_revision", "Support identity state revision is invalid.");
  }
  if (value.provider_request_count !== value.air_orders_post_count) {
    issue("provider_request_count", "Support identity request counters differ.");
  }
  if (
    (value.client_correlation_id === null)
      !== (value.client_correlation_id_sha256 === null)
  ) {
    issue(
      "client_correlation_id_sha256",
      "Client correlation support identity pair is incomplete.",
    );
  }
  if (
    (value.provider_request_id === null)
      !== (value.provider_request_id_sha256 === null)
  ) {
    issue(
      "provider_request_id_sha256",
      "Provider request support identity pair is incomplete.",
    );
  }
  if (
    value.provider_request_count === 0
    && (
      value.client_correlation_id !== null
      || value.provider_request_id !== null
      || value.terminal_http_status !== null
    )
  ) {
    issue(
      "provider_request_count",
      "A zero-request state cannot carry provider support identity.",
    );
  }
  if (
    value.provider_request_count === 1
    && value.client_correlation_id === null
  ) {
    issue(
      "client_correlation_id",
      "A provider request requires durable client correlation.",
    );
  }
  if (
    value.provider_request_count === 1
    && ((value.terminal_http_status === null) !== (value.provider_request_id === null))
  ) {
    issue(
      "provider_request_id",
      "Duffel request identity must match HTTP-response availability.",
    );
  }
  if (
    (value.attempt_state === "succeeded" || value.attempt_state === "reconciled")
    && value.provider_request_count !== 1
  ) {
    issue(
      "provider_request_count",
      "Successful or reconciled support evidence requires one provider request.",
    );
  }
});

export const FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_MIGRATION_VERSION =
  "202608260108" as const;
export const FLIGHT_CONSUMER_LIVE_DUFFEL_SUPPORT_IDENTITY_MIGRATION_VERSION =
  "202608260112" as const;

export const FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_duffel_order_execution_v1",
  claim: "claim_flight_consumer_live_duffel_order_execution_v1",
  complete: "complete_flight_consumer_live_duffel_order_execution_v2",
  reconcile: "reconcile_flight_consumer_live_duffel_order_execution_v1",
  readSupportIdentity:
    "read_flight_consumer_live_duffel_order_support_identity_v1",
} as const);

export type FlightConsumerLiveDuffelOrderExecutionRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveDuffelOrderExecutionPersistence = Readonly<{
  version: "flight-consumer-live-duffel-order-execution-persistence-v1";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_MIGRATION_VERSION;
  supportIdentityMigrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_DUFFEL_SUPPORT_IDENTITY_MIGRATION_VERSION;
  providerEnvironment: "duffel_live";
  livemode: true;
  routeExposed: false;
  duffelTransportImplemented: false;
  databaseApplyAuthorized: false;
  claimGrantsProviderDispatchAuthority: false;
  stripeAuthorizedRequiresCaptureEvidenceRequired: true;
  preTransportOfferFreshnessRecheckRequired: true;
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
  maxAirOrdersPostRequests: 1;
  prepare: (
    input: z.input<typeof prepareInputSchema>,
  ) => Promise<z.output<typeof prepareResultSchema>>;
  claim: (
    input: z.input<typeof claimInputSchema>,
  ) => Promise<z.output<typeof claimResultSchema>>;
  complete: (
    input: z.input<typeof completeInputSchema>,
  ) => Promise<z.output<typeof completeResultSchema>>;
  reconcile: (
    input: z.input<typeof reconcileInputSchema>,
  ) => Promise<z.output<typeof reconcileResultSchema>>;
  readSupportIdentity: (
    input: z.input<typeof supportIdentityReadInputSchema>,
  ) => Promise<z.output<typeof supportIdentityReadResultSchema>>;
}>;

export class FlightConsumerLiveDuffelOrderExecutionPersistenceError
  extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveDuffelOrderExecutionPersistenceError["reason"],
  ) {
    super("Flight Consumer Live Duffel order execution persistence was refused.");
    this.name = "FlightConsumerLiveDuffelOrderExecutionPersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveDuffelOrderExecutionRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
      "rpc_refused",
    );
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
      "rpc_refused",
    );
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveDuffelOrderExecutionPersistence(
  client: FlightConsumerLiveDuffelOrderExecutionRpcClient,
): FlightConsumerLiveDuffelOrderExecutionPersistence {
  return Object.freeze({
    version:
      "flight-consumer-live-duffel-order-execution-persistence-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_MIGRATION_VERSION,
    supportIdentityMigrationVersion:
      FLIGHT_CONSUMER_LIVE_DUFFEL_SUPPORT_IDENTITY_MIGRATION_VERSION,
    providerEnvironment: "duffel_live" as const,
    livemode: true as const,
    routeExposed: false as const,
    duffelTransportImplemented: false as const,
    databaseApplyAuthorized: false as const,
    claimGrantsProviderDispatchAuthority: false as const,
    stripeAuthorizedRequiresCaptureEvidenceRequired: true as const,
    preTransportOfferFreshnessRecheckRequired: true as const,
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
    maxAirOrdersPostRequests: 1 as const,
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.prepare,
        {
          p_checkout_evidence_aggregate_id:
            value.checkoutEvidenceAggregateId,
          p_checkout_execution_scope_sha256:
            value.checkoutExecutionScopeSha256,
          p_checkout_binding_sha256: value.checkoutBindingSha256,
          p_checkout_state_receipt_sha256:
            value.checkoutStateReceiptSha256,
          p_offer_refresh_attempt_id: value.offerRefreshAttemptId,
          p_offer_refresh_execution_scope_sha256:
            value.offerRefreshExecutionScopeSha256,
          p_offer_binding_sha256: value.offerBindingSha256,
          p_normalized_offer_sha256: value.normalizedOfferSha256,
          p_offer_terminal_response_sha256:
            value.offerTerminalResponseSha256,
          p_order_reference_sha256: value.orderReferenceSha256,
          p_customer_reference_sha256: value.customerReferenceSha256,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_idempotency_sha256: value.idempotencySha256,
          p_order_execution_binding_sha256:
            value.orderExecutionBindingSha256,
          p_order_execution_prerequisite_sha256:
            value.orderExecutionPrerequisiteSha256,
          p_order_request_sha256: value.orderRequestSha256,
          p_amount_cents: value.amountCents,
          p_currency: value.currency,
          p_dispatch_not_after: value.dispatchNotAfter,
        },
        prepareResultSchema,
      );
    },
    async claim(input) {
      const value = parseInput(claimInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.claim,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_order_execution_binding_sha256:
            value.orderExecutionBindingSha256,
          p_order_request_sha256: value.orderRequestSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
        },
        claimResultSchema,
      );
    },
    async complete(input) {
      const value = parseInput(completeInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.complete,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_order_execution_binding_sha256:
            value.orderExecutionBindingSha256,
          p_order_request_sha256: value.orderRequestSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
          p_terminal_state: value.terminalState,
          p_provider_request_count: value.providerRequestCount,
          p_air_orders_post_count: value.airOrdersPostCount,
          p_terminal_error_code: value.terminalErrorCode,
          p_terminal_http_status: value.terminalHttpStatus,
          p_terminal_response_sha256: value.terminalResponseSha256,
          p_provider_order_reference_ciphertext:
            value.providerOrderReferenceCiphertext,
          p_provider_order_reference_sha256:
            value.providerOrderReferenceSha256,
          p_provider_booking_reference_ciphertext:
            value.providerBookingReferenceCiphertext,
          p_provider_booking_reference_sha256:
            value.providerBookingReferenceSha256,
          p_completion_evidence_sha256: value.completionEvidenceSha256,
          p_ambiguity_evidence_sha256: value.ambiguityEvidenceSha256,
          p_client_correlation_id: value.clientCorrelationId,
          p_client_correlation_id_sha256:
            value.clientCorrelationIdSha256,
          p_provider_request_id: value.providerRequestId,
          p_provider_request_id_sha256: value.providerRequestIdSha256,
        },
        completeResultSchema,
      );
    },
    async reconcile(input) {
      const value = parseInput(reconcileInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.reconcile,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_order_execution_binding_sha256:
            value.orderExecutionBindingSha256,
          p_dispatch_token_sha256: value.dispatchTokenSha256,
          p_reconciliation_outcome: value.reconciliationOutcome,
          p_reconciliation_response_sha256:
            value.reconciliationResponseSha256,
          p_reconciliation_evidence_sha256:
            value.reconciliationEvidenceSha256,
          p_provider_order_reference_ciphertext:
            value.providerOrderReferenceCiphertext,
          p_provider_order_reference_sha256:
            value.providerOrderReferenceSha256,
          p_provider_booking_reference_ciphertext:
            value.providerBookingReferenceCiphertext,
          p_provider_booking_reference_sha256:
            value.providerBookingReferenceSha256,
        },
        reconcileResultSchema,
      );
    },
    async readSupportIdentity(input) {
      const value = parseInput(supportIdentityReadInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.readSupportIdentity,
        {
          p_attempt_id: value.attemptId,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_order_execution_binding_sha256:
            value.orderExecutionBindingSha256,
          p_order_request_sha256: value.orderRequestSha256,
        },
        supportIdentityReadResultSchema,
      );
    },
  });
}
