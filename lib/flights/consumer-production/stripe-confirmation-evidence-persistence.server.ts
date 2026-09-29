import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const confirmationStateSchema = z.enum([
  "prepared",
  "handoff_claimed",
  "authorized_requires_capture",
  "failed",
  "ambiguous",
  "reconciled",
]);
const reconciledOutcomeSchema = z.enum([
  "authorized_requires_capture",
  "failed",
  "unresolved",
]);
const failedProviderStatusSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "canceled",
]);

const authorityResultShape = {
  confirmation_handoff_authorized: z.literal(false),
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
  stripeExecutionAttemptId: uuidSchema,
  executionScopeSha256: sha256Schema,
  idempotencySha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  confirmationWorkflowSha256: sha256Schema,
  confirmationPrerequisiteSha256: sha256Schema,
  checkoutStateReceiptSha256: sha256Schema,
  stripeExecutionCompletedReceiptSha256: sha256Schema,
  confirmationNotAfter: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const digests = [
    value.executionScopeSha256,
    value.idempotencySha256,
    value.confirmationBindingSha256,
    value.confirmationWorkflowSha256,
    value.confirmationPrerequisiteSha256,
    value.checkoutStateReceiptSha256,
    value.stripeExecutionCompletedReceiptSha256,
  ];
  if (new Set(digests).size !== digests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmationBindingSha256"],
      message: "Confirmation evidence domains must use independent digests.",
    });
  }
});

const claimInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(0),
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  handoffTokenSha256: sha256Schema,
  handoffSeconds: z.number().int().min(15).max(300),
  confirmationRequestSha256: sha256Schema,
}).strict().superRefine((value, context) => {
  if (value.handoffTokenSha256 === value.confirmationRequestSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmationRequestSha256"],
      message: "Handoff and request digests must be independent.",
    });
  }
});

const terminalInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  handoffTokenSha256: sha256Schema,
  terminalState: z.enum(["authorized_requires_capture", "failed"]),
  observedPaymentIntentStatus: z.union([
    z.literal("requires_capture"),
    failedProviderStatusSchema,
  ]),
  observedAmountCents: z.number().int().min(50).max(99_999_999),
  observedCurrency: z.literal("usd"),
  observedLivemode: z.literal(true),
  observedPaymentIntentReferenceSha256: sha256Schema,
  providerResponseSha256: sha256Schema,
  confirmationEvidenceSha256: sha256Schema,
  webhookEventSha256: sha256Schema.nullable(),
  retrievalEvidenceSha256: sha256Schema.nullable(),
  failureCode: z.string().regex(/^[a-z0-9_]{1,96}$/).nullable(),
  failureEvidenceSha256: sha256Schema.nullable(),
  livemode: z.literal(true),
}).strict().superRefine((value, context) => {
  if (
    value.terminalState === "authorized_requires_capture"
    && value.webhookEventSha256 === null
    && value.retrievalEvidenceSha256 === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retrievalEvidenceSha256"],
      message: "Authorization requires webhook or retrieval evidence.",
    });
  }
  const statusIsValid = value.terminalState === "authorized_requires_capture"
    ? value.observedPaymentIntentStatus === "requires_capture"
    : failedProviderStatusSchema.safeParse(
      value.observedPaymentIntentStatus,
    ).success;
  if (!statusIsValid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["observedPaymentIntentStatus"],
      message: "Observed Stripe status does not match the terminal state.",
    });
  }
  const failureShapeIsValid = value.terminalState === "failed"
    ? value.failureCode !== null && value.failureEvidenceSha256 !== null
    : value.failureCode === null && value.failureEvidenceSha256 === null;
  if (!failureShapeIsValid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failureCode"],
      message: "Failure evidence does not match the terminal state.",
    });
  }
  const digests = [
    value.providerResponseSha256,
    value.confirmationEvidenceSha256,
    value.webhookEventSha256,
    value.retrievalEvidenceSha256,
    value.failureEvidenceSha256,
  ].filter((digest): digest is string => digest !== null);
  if (new Set(digests).size !== digests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmationEvidenceSha256"],
      message: "Terminal evidence domains must use independent digests.",
    });
  }
});

const ambiguousInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  handoffTokenSha256: sha256Schema,
  ambiguityCode: z.string().regex(/^[a-z0-9_]{1,96}$/),
  ambiguityEvidenceSha256: sha256Schema,
  livemode: z.literal(true),
}).strict();

const reconcileInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(2),
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  reconciledOutcome: reconciledOutcomeSchema,
  observedPaymentIntentStatus: z.union([
    z.literal("requires_capture"),
    failedProviderStatusSchema,
  ]).nullable(),
  observedAmountCents: z.number().int().min(50).max(99_999_999).nullable(),
  observedCurrency: z.literal("usd").nullable(),
  observedLivemode: z.literal(true).nullable(),
  observedPaymentIntentReferenceSha256: sha256Schema.nullable(),
  providerResponseSha256: sha256Schema.nullable(),
  confirmationEvidenceSha256: sha256Schema.nullable(),
  webhookEventSha256: sha256Schema.nullable(),
  retrievalEvidenceSha256: sha256Schema.nullable(),
  failureCode: z.string().regex(/^[a-z0-9_]{1,96}$/).nullable(),
  failureEvidenceSha256: sha256Schema.nullable(),
  reconciliationEvidenceSha256: sha256Schema,
  livemode: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.webhookEventSha256 === null && value.retrievalEvidenceSha256 === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retrievalEvidenceSha256"],
      message: "Reconciliation requires webhook or retrieval evidence.",
    });
  }
  const resolved = value.reconciledOutcome !== "unresolved";
  const facts = [
    value.observedPaymentIntentStatus,
    value.observedAmountCents,
    value.observedCurrency,
    value.observedLivemode,
    value.observedPaymentIntentReferenceSha256,
  ];
  const structuredFactsAreValid = resolved
    ? facts.every((fact) => fact !== null)
      && (
        value.reconciledOutcome === "authorized_requires_capture"
          ? value.observedPaymentIntentStatus === "requires_capture"
          : failedProviderStatusSchema.safeParse(
            value.observedPaymentIntentStatus,
          ).success
      )
    : facts.every((fact) => fact === null);
  const providerShapeIsValid = resolved
    ? value.providerResponseSha256 !== null
      && value.confirmationEvidenceSha256 !== null
    : value.providerResponseSha256 === null
      && value.confirmationEvidenceSha256 === null;
  const failureShapeIsValid = value.reconciledOutcome === "failed"
    ? value.failureCode !== null && value.failureEvidenceSha256 !== null
    : value.failureCode === null && value.failureEvidenceSha256 === null;
  if (
    !providerShapeIsValid
    || !failureShapeIsValid
    || !structuredFactsAreValid
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciledOutcome"],
      message: "Reconciliation evidence does not match its outcome.",
    });
  }
  const digests = [
    value.providerResponseSha256,
    value.confirmationEvidenceSha256,
    value.webhookEventSha256,
    value.retrievalEvidenceSha256,
    value.failureEvidenceSha256,
    value.reconciliationEvidenceSha256,
  ].filter((digest): digest is string => digest !== null);
  if (new Set(digests).size !== digests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciliationEvidenceSha256"],
      message: "Reconciliation evidence domains must use independent digests.",
    });
  }
});

const baseResultShape = {
  attempt_id: uuidSchema,
  confirmation_state: confirmationStateSchema,
  confirmation_revision: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  ]),
  amount_cents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  payment_intent_reference_sha256: sha256Schema,
  state_receipt_sha256: sha256Schema,
  reconciled_outcome: reconciledOutcomeSchema.nullable(),
  ...authorityResultShape,
} as const;

function refineResult(
  value: z.output<ReturnType<typeof z.object<typeof baseResultShape>>>,
  context: z.RefinementCtx,
) {
  const expectedRevision: Record<typeof value.confirmation_state, number> = {
    prepared: 0,
    handoff_claimed: 1,
    authorized_requires_capture: 2,
    failed: 2,
    ambiguous: 2,
    reconciled: 3,
  };
  if (value.confirmation_revision !== expectedRevision[value.confirmation_state]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmation_revision"],
      message: "Confirmation revision does not match its state.",
    });
  }
  if (
    (value.confirmation_state === "reconciled")
      !== (value.reconciled_outcome !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciled_outcome"],
      message: "Reconciled outcome does not match its state.",
    });
  }
}

function resultSchema<const T extends readonly [string, ...string[]]>(
  decisions: T,
) {
  return z.object({
    decision: z.enum(decisions),
    ...baseResultShape,
  }).strict().superRefine(refineResult);
}

const prepareResultSchema = resultSchema(["created", "replay"] as const);
const claimResultSchema = resultSchema(["claimed", "replay"] as const);
const terminalResultSchema = resultSchema(["recorded", "replay"] as const);
const ambiguousResultSchema = resultSchema(["ambiguous", "replay"] as const);
const reconcileResultSchema = resultSchema(["reconciled", "replay"] as const);

export const FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_MIGRATION_VERSION =
  "202608260109" as const;

export const FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_stripe_confirmation_v1",
  claim: "claim_flight_consumer_live_stripe_confirmation_handoff_v1",
  terminal: "record_flight_consumer_live_stripe_confirmation_terminal_v1",
  ambiguous: "mark_flight_consumer_live_stripe_confirmation_ambiguous_v1",
  reconcile: "reconcile_flight_consumer_live_stripe_confirmation_v1",
} as const);

export type FlightConsumerLiveStripeConfirmationRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveStripeConfirmationPersistence = Readonly<{
  version: "flight-consumer-live-stripe-confirmation-persistence-v1";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_MIGRATION_VERSION;
  productionDark: true;
  routeExposed: false;
  stripeTransportImplemented: false;
  clientSecretStored: false;
  paymentMethodStored: false;
  providerPayloadStored: false;
  databaseApplyAuthorized: false;
  confirmationHandoffAuthorized: false;
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
  prepare: (
    input: z.input<typeof prepareInputSchema>,
  ) => Promise<z.output<typeof prepareResultSchema>>;
  claim: (
    input: z.input<typeof claimInputSchema>,
  ) => Promise<z.output<typeof claimResultSchema>>;
  recordTerminal: (
    input: z.input<typeof terminalInputSchema>,
  ) => Promise<z.output<typeof terminalResultSchema>>;
  markAmbiguous: (
    input: z.input<typeof ambiguousInputSchema>,
  ) => Promise<z.output<typeof ambiguousResultSchema>>;
  reconcile: (
    input: z.input<typeof reconcileInputSchema>,
  ) => Promise<z.output<typeof reconcileResultSchema>>;
}>;

export class FlightConsumerLiveStripeConfirmationPersistenceError
  extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveStripeConfirmationPersistenceError["reason"],
  ) {
    super("Flight Consumer Live Stripe confirmation persistence was refused.");
    this.name = "FlightConsumerLiveStripeConfirmationPersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeConfirmationPersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveStripeConfirmationRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveStripeConfirmationPersistenceError(
      "rpc_refused",
    );
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveStripeConfirmationPersistenceError(
      "rpc_refused",
    );
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveStripeConfirmationPersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeConfirmationPersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveStripeConfirmationPersistence(
  client: FlightConsumerLiveStripeConfirmationRpcClient,
): FlightConsumerLiveStripeConfirmationPersistence {
  return Object.freeze({
    version: "flight-consumer-live-stripe-confirmation-persistence-v1" as const,
    migrationVersion: FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_MIGRATION_VERSION,
    productionDark: true as const,
    routeExposed: false as const,
    stripeTransportImplemented: false as const,
    clientSecretStored: false as const,
    paymentMethodStored: false as const,
    providerPayloadStored: false as const,
    databaseApplyAuthorized: false as const,
    confirmationHandoffAuthorized: false as const,
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
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.prepare,
        {
          p_checkout_aggregate_id: value.checkoutAggregateId,
          p_stripe_execution_attempt_id: value.stripeExecutionAttemptId,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_idempotency_sha256: value.idempotencySha256,
          p_confirmation_binding_sha256: value.confirmationBindingSha256,
          p_confirmation_workflow_sha256: value.confirmationWorkflowSha256,
          p_confirmation_prerequisite_sha256:
            value.confirmationPrerequisiteSha256,
          p_checkout_state_receipt_sha256:
            value.checkoutStateReceiptSha256,
          p_stripe_execution_completed_receipt_sha256:
            value.stripeExecutionCompletedReceiptSha256,
          p_confirmation_not_after: value.confirmationNotAfter,
        },
        prepareResultSchema,
      );
    },
    async claim(input) {
      const value = parseInput(claimInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.claim,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_confirmation_binding_sha256: value.confirmationBindingSha256,
          p_handoff_token_sha256: value.handoffTokenSha256,
          p_handoff_seconds: value.handoffSeconds,
          p_confirmation_request_sha256: value.confirmationRequestSha256,
        },
        claimResultSchema,
      );
    },
    async recordTerminal(input) {
      const value = parseInput(terminalInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.terminal,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_confirmation_binding_sha256: value.confirmationBindingSha256,
          p_handoff_token_sha256: value.handoffTokenSha256,
          p_terminal_state: value.terminalState,
          p_observed_payment_intent_status:
            value.observedPaymentIntentStatus,
          p_observed_amount_cents: value.observedAmountCents,
          p_observed_currency: value.observedCurrency,
          p_observed_livemode: value.observedLivemode,
          p_observed_payment_intent_reference_sha256:
            value.observedPaymentIntentReferenceSha256,
          p_provider_response_sha256: value.providerResponseSha256,
          p_confirmation_evidence_sha256:
            value.confirmationEvidenceSha256,
          p_webhook_event_sha256: value.webhookEventSha256,
          p_retrieval_evidence_sha256: value.retrievalEvidenceSha256,
          p_failure_code: value.failureCode,
          p_failure_evidence_sha256: value.failureEvidenceSha256,
          p_livemode: value.livemode,
        },
        terminalResultSchema,
      );
    },
    async markAmbiguous(input) {
      const value = parseInput(ambiguousInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.ambiguous,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_confirmation_binding_sha256: value.confirmationBindingSha256,
          p_handoff_token_sha256: value.handoffTokenSha256,
          p_ambiguity_code: value.ambiguityCode,
          p_ambiguity_evidence_sha256: value.ambiguityEvidenceSha256,
          p_livemode: value.livemode,
        },
        ambiguousResultSchema,
      );
    },
    async reconcile(input) {
      const value = parseInput(reconcileInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.reconcile,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_confirmation_binding_sha256: value.confirmationBindingSha256,
          p_reconciled_outcome: value.reconciledOutcome,
          p_observed_payment_intent_status:
            value.observedPaymentIntentStatus,
          p_observed_amount_cents: value.observedAmountCents,
          p_observed_currency: value.observedCurrency,
          p_observed_livemode: value.observedLivemode,
          p_observed_payment_intent_reference_sha256:
            value.observedPaymentIntentReferenceSha256,
          p_provider_response_sha256: value.providerResponseSha256,
          p_confirmation_evidence_sha256:
            value.confirmationEvidenceSha256,
          p_webhook_event_sha256: value.webhookEventSha256,
          p_retrieval_evidence_sha256: value.retrievalEvidenceSha256,
          p_failure_code: value.failureCode,
          p_failure_evidence_sha256: value.failureEvidenceSha256,
          p_reconciliation_evidence_sha256:
            value.reconciliationEvidenceSha256,
          p_livemode: value.livemode,
        },
        reconcileResultSchema,
      );
    },
  });
}
