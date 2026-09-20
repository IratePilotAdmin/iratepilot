import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const amountSchema = z.number().int().min(0).max(99_999_999);
const positiveAmountSchema = z.number().int().min(50).max(99_999_999);
const revisionSchema = z.number().int().min(0);

const attemptStateSchema = z.enum([
  "prepared",
  "claimed",
  "observed",
  "reconcile_required",
]);
const observationStateSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "succeeded",
  "canceled",
  "failed",
  "ambiguous",
]);
const captureStateSchema = z.enum([
  "not_requested",
  "requires_capture",
  "captured",
  "failed",
  "ambiguous",
]);
const refundStateSchema = z.enum([
  "not_requested",
  "pending",
  "succeeded",
  "failed",
  "ambiguous",
]);

const prepareInputSchema = z.object({
  executionScopeSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  paymentAttemptReferenceSha256: sha256Schema,
  workflowSha256: sha256Schema,
  metadataSha256: sha256Schema,
  requestBodySha256: sha256Schema,
  requestEnvelopeSha256: sha256Schema,
  idempotencyRequestSha256: sha256Schema,
  idempotencyKeySha256: sha256Schema,
  amountCents: positiveAmountSchema,
}).strict().superRefine((value, context) => {
  if (new Set([
    value.orderReferenceSha256,
    value.customerReferenceSha256,
    value.paymentAttemptReferenceSha256,
  ]).size !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAttemptReferenceSha256"],
      message: "Stripe TEST attempt identity digests must be distinct.",
    });
  }
});

const claimInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: revisionSchema,
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  leaseSeconds: z.number().int().min(15).max(120),
}).strict();

const allowedWebhookEventSchema = z.enum([
  "payment_intent.amount_capturable_updated",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.succeeded",
  "charge.refunded",
  "refund.updated",
]);

const observationInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: revisionSchema,
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema.nullable(),
  source: z.enum(["stripe_webhook", "stripe_retrieve"]),
  webhookEventIdSha256: sha256Schema.nullable(),
  webhookIdempotencySha256: sha256Schema.nullable(),
  webhookEventType: allowedWebhookEventSchema.nullable(),
  webhookPayloadSha256: sha256Schema.nullable(),
  webhookSemanticSha256: sha256Schema.nullable(),
  webhookVerificationReceiptSha256: sha256Schema.nullable(),
  paymentIntentReferenceSha256: sha256Schema,
  observationSha256: sha256Schema,
  observationEvidenceSha256: sha256Schema,
  observationState: observationStateSchema,
  captureState: captureStateSchema,
  refundState: refundStateSchema,
  amountCapturableCents: amountSchema,
  amountReceivedCents: amountSchema,
  amountRefundedCents: amountSchema,
  livemode: z.literal(false),
}).strict().superRefine((value, context) => {
  const webhookFields = [
    value.webhookEventIdSha256,
    value.webhookIdempotencySha256,
    value.webhookEventType,
    value.webhookPayloadSha256,
    value.webhookSemanticSha256,
    value.webhookVerificationReceiptSha256,
  ];
  if (value.source === "stripe_webhook") {
    if (webhookFields.some((entry) => entry === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["webhookEventIdSha256"],
        message: "Webhook persistence requires complete digest evidence.",
      });
    }
    if (value.leaseTokenSha256 !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["leaseTokenSha256"],
        message: "Webhook persistence never accepts a worker lease token.",
      });
    }
  } else if (webhookFields.some((entry) => entry !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source"],
      message: "Retrieve persistence cannot contain webhook evidence.",
    });
  }
  if (value.amountRefundedCents > value.amountReceivedCents) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amountRefundedCents"],
      message: "Refunded amount cannot exceed the observed received amount.",
    });
  }
});

const recoveryInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: revisionSchema,
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  reconciliationState: z.enum([
    "provider_absence_attested",
    "provider_present",
    "unresolved",
  ]),
  reconciliationEvidenceSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema.nullable(),
}).strict().superRefine((value, context) => {
  const providerPresent = value.reconciliationState === "provider_present";
  if (providerPresent !== (value.paymentIntentReferenceSha256 !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentIntentReferenceSha256"],
      message: "Provider-present recovery requires the exact hashed PaymentIntent binding.",
    });
  }
});

const prepareResultSchema = z.object({
  decision: z.enum(["created", "replay"]),
  attempt_id: uuidSchema,
  attempt_revision: revisionSchema,
  attempt_state: attemptStateSchema,
}).strict();
const claimResultSchema = z.object({
  attempt_id: uuidSchema,
  attempt_revision: revisionSchema,
  attempt_state: z.literal("claimed"),
  lease_expires_at: z.string().datetime({ offset: true }),
}).strict();
const observationResultSchema = z.object({
  decision: z.enum(["recorded", "replay"]),
  attempt_id: uuidSchema,
  attempt_revision: revisionSchema,
  attempt_state: z.literal("observed"),
  observation_state: observationStateSchema,
  capture_state: captureStateSchema,
  refund_state: refundStateSchema,
  payment_intent_reference_sha256: sha256Schema,
}).strict();
const recoveryResultSchema = z.object({
  decision: z.enum(["retry_prepared", "reconcile_required"]),
  attempt_id: uuidSchema,
  attempt_revision: revisionSchema,
  attempt_state: z.enum(["prepared", "reconcile_required"]),
  recovery_state: z.enum([
    "provider_absence_attested",
    "provider_present",
    "unresolved",
  ]),
  blind_retry_authorized: z.literal(false),
}).strict();

export const FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_MIGRATION_VERSION =
  "202608260104" as const;

export const FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_stripe_test_payment_attempt_v1",
  claim: "claim_flight_consumer_stripe_test_payment_attempt_v1",
  observe: "record_flight_consumer_stripe_test_payment_observation_v1",
  recover: "recover_flight_consumer_stripe_test_payment_attempt_v1",
} as const);

export type FlightConsumerStripeTestPersistenceRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerStripeTestExecutionPersistence = Readonly<{
  version: "flight-consumer-stripe-test-execution-persistence-v1";
  migrationVersion: typeof FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_MIGRATION_VERSION;
  processorEnvironment: "stripe_test";
  providerDispatchImplemented: false;
  productionApplyAuthorized: false;
  prepare: (input: z.input<typeof prepareInputSchema>) => Promise<z.output<typeof prepareResultSchema>>;
  claim: (input: z.input<typeof claimInputSchema>) => Promise<z.output<typeof claimResultSchema>>;
  recordObservation: (
    input: z.input<typeof observationInputSchema>,
  ) => Promise<z.output<typeof observationResultSchema>>;
  recoverExpiredLease: (
    input: z.input<typeof recoveryInputSchema>,
  ) => Promise<z.output<typeof recoveryResultSchema>>;
}>;

export class FlightConsumerStripeTestPersistenceError extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(reason: FlightConsumerStripeTestPersistenceError["reason"]) {
    super(`Flight Consumer Stripe TEST persistence ${reason.replaceAll("_", " ")}.`);
    this.name = "FlightConsumerStripeTestPersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerStripeTestPersistenceError("invalid_input");
  }
  return parsed.data;
}

function oneRow(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new FlightConsumerStripeTestPersistenceError("invalid_result");
    }
    return value[0];
  }
  return value;
}

async function executeRpc<T>(
  client: FlightConsumerStripeTestPersistenceRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerStripeTestPersistenceError("rpc_refused");
  }
  if (response.error !== null) {
    throw new FlightConsumerStripeTestPersistenceError("rpc_refused");
  }
  const parsed = schema.safeParse(oneRow(response.data));
  if (!parsed.success) {
    throw new FlightConsumerStripeTestPersistenceError("invalid_result");
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerStripeTestExecutionPersistence(
  client: FlightConsumerStripeTestPersistenceRpcClient,
): FlightConsumerStripeTestExecutionPersistence {
  return Object.freeze({
    version: "flight-consumer-stripe-test-execution-persistence-v1" as const,
    migrationVersion: FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_MIGRATION_VERSION,
    processorEnvironment: "stripe_test" as const,
    providerDispatchImplemented: false as const,
    productionApplyAuthorized: false as const,
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(client, FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.prepare, {
        p_execution_scope_sha256: value.executionScopeSha256,
        p_payment_binding_sha256: value.paymentBindingSha256,
        p_order_reference_sha256: value.orderReferenceSha256,
        p_customer_reference_sha256: value.customerReferenceSha256,
        p_payment_attempt_reference_sha256: value.paymentAttemptReferenceSha256,
        p_workflow_sha256: value.workflowSha256,
        p_metadata_sha256: value.metadataSha256,
        p_request_body_sha256: value.requestBodySha256,
        p_request_envelope_sha256: value.requestEnvelopeSha256,
        p_idempotency_request_sha256: value.idempotencyRequestSha256,
        p_idempotency_key_sha256: value.idempotencyKeySha256,
        p_amount_cents: value.amountCents,
      }, prepareResultSchema);
    },
    async claim(input) {
      const value = parseInput(claimInputSchema, input);
      return executeRpc(client, FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.claim, {
        p_attempt_id: value.attemptId,
        p_expected_revision: value.expectedRevision,
        p_execution_scope_sha256: value.executionScopeSha256,
        p_lease_token_sha256: value.leaseTokenSha256,
        p_lease_seconds: value.leaseSeconds,
      }, claimResultSchema);
    },
    async recordObservation(input) {
      const value = parseInput(observationInputSchema, input);
      return executeRpc(client, FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.observe, {
        p_attempt_id: value.attemptId,
        p_expected_revision: value.expectedRevision,
        p_execution_scope_sha256: value.executionScopeSha256,
        p_lease_token_sha256: value.leaseTokenSha256,
        p_source: value.source,
        p_webhook_event_id_sha256: value.webhookEventIdSha256,
        p_webhook_idempotency_sha256: value.webhookIdempotencySha256,
        p_webhook_event_type: value.webhookEventType,
        p_webhook_payload_sha256: value.webhookPayloadSha256,
        p_webhook_semantic_sha256: value.webhookSemanticSha256,
        p_webhook_verification_receipt_sha256:
          value.webhookVerificationReceiptSha256,
        p_payment_intent_reference_sha256: value.paymentIntentReferenceSha256,
        p_observation_sha256: value.observationSha256,
        p_observation_evidence_sha256: value.observationEvidenceSha256,
        p_observation_state: value.observationState,
        p_capture_state: value.captureState,
        p_refund_state: value.refundState,
        p_amount_capturable_cents: value.amountCapturableCents,
        p_amount_received_cents: value.amountReceivedCents,
        p_amount_refunded_cents: value.amountRefundedCents,
        p_livemode: value.livemode,
      }, observationResultSchema);
    },
    async recoverExpiredLease(input) {
      const value = parseInput(recoveryInputSchema, input);
      return executeRpc(client, FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.recover, {
        p_attempt_id: value.attemptId,
        p_expected_revision: value.expectedRevision,
        p_execution_scope_sha256: value.executionScopeSha256,
        p_lease_token_sha256: value.leaseTokenSha256,
        p_reconciliation_state: value.reconciliationState,
        p_reconciliation_evidence_sha256: value.reconciliationEvidenceSha256,
        p_payment_intent_reference_sha256: value.paymentIntentReferenceSha256,
      }, recoveryResultSchema);
    },
  });
}
