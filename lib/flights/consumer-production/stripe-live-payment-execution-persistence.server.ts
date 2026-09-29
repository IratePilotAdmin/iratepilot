import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const revisionSchema = z.number().int().min(0).max(3);
const encryptedReferenceSchema = z.string().max(4096).regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$/,
);

const authorityResultShape = {
  livemode: z.literal(true),
  stripe_dispatch_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  order_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
} as const;

const prepareInputSchema = z.object({
  planId: uuidSchema,
  planSha256: sha256Schema,
  executionWorkflowSha256: sha256Schema,
  executionPrerequisiteSha256: sha256Schema,
  dispatchNotAfter: z.string().datetime({ offset: true }),
}).strict();

const claimInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(0),
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  leaseSeconds: z.number().int().min(15).max(120),
}).strict();

const completeInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  paymentIntentReferenceCiphertext: encryptedReferenceSchema,
  paymentIntentReferenceSha256: sha256Schema,
  terminalResponseSha256: sha256Schema,
  completionEvidenceSha256: sha256Schema,
  livemode: z.literal(true),
}).strict();

const ambiguousInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.literal(1),
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  ambiguityCode: z.string().regex(/^[a-z0-9_]{1,96}$/),
  ambiguityEvidenceSha256: sha256Schema,
  livemode: z.literal(true),
}).strict();

const recoveryStateSchema = z.enum([
  "provider_present",
  "provider_absence_attested",
  "unresolved",
]);

const recoverInputSchema = z.object({
  attemptId: uuidSchema,
  expectedRevision: z.union([z.literal(1), z.literal(2)]),
  executionScopeSha256: sha256Schema,
  leaseTokenSha256: sha256Schema,
  reconciliationState: recoveryStateSchema,
  reconciliationEvidenceSha256: sha256Schema,
  recoveryEvidenceSha256: sha256Schema,
  paymentIntentReferenceCiphertext: encryptedReferenceSchema.nullable(),
  paymentIntentReferenceSha256: sha256Schema.nullable(),
  livemode: z.literal(true),
}).strict().superRefine((value, context) => {
  const providerPresent = value.reconciliationState === "provider_present";
  const hasCiphertext = value.paymentIntentReferenceCiphertext !== null;
  const hasDigest = value.paymentIntentReferenceSha256 !== null;
  if (
    hasCiphertext !== hasDigest
    || providerPresent !== hasCiphertext
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentIntentReferenceCiphertext"],
      message:
        "Provider-present recovery requires one encrypted PaymentIntent reference and digest pair.",
    });
  }
});

const attemptStateSchema = z.enum([
  "prepared",
  "claimed",
  "completed",
  "ambiguous",
  "reconciled",
]);

const prepareResultSchema = z.object({
  decision: z.enum(["created", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: attemptStateSchema,
  attempt_revision: revisionSchema,
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict().superRefine((value, context) => {
  if (
    value.decision === "created"
    && (value.attempt_state !== "prepared" || value.attempt_revision !== 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attempt_state"],
      message: "A created live execution must be prepared at revision zero.",
    });
  }
});

const claimResultSchema = z.object({
  decision: z.enum(["claimed", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: z.literal("claimed"),
  attempt_revision: z.literal(1),
  lease_expires_at: z.string().datetime({ offset: true }),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict();

const completeResultSchema = z.object({
  decision: z.enum(["completed", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: z.literal("completed"),
  attempt_revision: z.literal(2),
  payment_intent_reference_sha256: sha256Schema,
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict();

const ambiguousResultSchema = z.object({
  decision: z.enum(["ambiguous", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: z.literal("ambiguous"),
  attempt_revision: z.literal(2),
  ambiguity_code: z.string().regex(/^[a-z0-9_]{1,96}$/),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict();

const recoverResultSchema = z.object({
  decision: z.enum(["reconciled", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: z.literal("reconciled"),
  attempt_revision: z.union([z.literal(2), z.literal(3)]),
  recovery_state: recoveryStateSchema,
  payment_intent_reference_sha256: sha256Schema.nullable(),
  blind_retry_authorized: z.literal(false),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict().superRefine((value, context) => {
  const providerPresent = value.recovery_state === "provider_present";
  if (providerPresent !== (value.payment_intent_reference_sha256 !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payment_intent_reference_sha256"],
      message:
        "A provider-present recovery receipt requires the PaymentIntent digest.",
    });
  }
});

export const FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_MIGRATION_VERSION =
  "202608260106" as const;

export const FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_stripe_payment_execution_v1",
  claim: "claim_flight_consumer_live_stripe_payment_execution_v1",
  complete: "complete_flight_consumer_live_stripe_payment_execution_v1",
  ambiguous:
    "mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1",
  recover: "recover_flight_consumer_live_stripe_payment_execution_v1",
} as const);

export type FlightConsumerLiveStripeExecutionRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveStripeExecutionPersistence = Readonly<{
  version: "flight-consumer-live-stripe-execution-persistence-v1";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_MIGRATION_VERSION;
  processorEnvironment: "stripe_live";
  livemode: true;
  routeExposed: false;
  stripeTransportImplemented: false;
  providerDispatchImplemented: false;
  databaseApplyAuthorized: false;
  stripeDispatchAuthorized: false;
  paymentAuthorized: false;
  orderAuthorized: false;
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
  complete: (
    input: z.input<typeof completeInputSchema>,
  ) => Promise<z.output<typeof completeResultSchema>>;
  markAmbiguous: (
    input: z.input<typeof ambiguousInputSchema>,
  ) => Promise<z.output<typeof ambiguousResultSchema>>;
  recover: (
    input: z.input<typeof recoverInputSchema>,
  ) => Promise<z.output<typeof recoverResultSchema>>;
}>;

export class FlightConsumerLiveStripeExecutionPersistenceError extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveStripeExecutionPersistenceError["reason"],
  ) {
    super("Flight Consumer Live Stripe execution persistence was refused.");
    this.name = "FlightConsumerLiveStripeExecutionPersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeExecutionPersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveStripeExecutionRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveStripeExecutionPersistenceError(
      "rpc_refused",
    );
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveStripeExecutionPersistenceError(
      "rpc_refused",
    );
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveStripeExecutionPersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveStripeExecutionPersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveStripeExecutionPersistence(
  client: FlightConsumerLiveStripeExecutionRpcClient,
): FlightConsumerLiveStripeExecutionPersistence {
  return Object.freeze({
    version: "flight-consumer-live-stripe-execution-persistence-v1" as const,
    migrationVersion: FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_MIGRATION_VERSION,
    processorEnvironment: "stripe_live" as const,
    livemode: true as const,
    routeExposed: false as const,
    stripeTransportImplemented: false as const,
    providerDispatchImplemented: false as const,
    databaseApplyAuthorized: false as const,
    stripeDispatchAuthorized: false as const,
    paymentAuthorized: false as const,
    orderAuthorized: false as const,
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
        FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.prepare,
        {
          p_plan_id: value.planId,
          p_plan_sha256: value.planSha256,
          p_execution_workflow_sha256: value.executionWorkflowSha256,
          p_execution_prerequisite_sha256:
            value.executionPrerequisiteSha256,
          p_dispatch_not_after: value.dispatchNotAfter,
        },
        prepareResultSchema,
      );
    },
    async claim(input) {
      const value = parseInput(claimInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.claim,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_lease_token_sha256: value.leaseTokenSha256,
          p_lease_seconds: value.leaseSeconds,
        },
        claimResultSchema,
      );
    },
    async complete(input) {
      const value = parseInput(completeInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.complete,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_lease_token_sha256: value.leaseTokenSha256,
          p_payment_intent_reference_ciphertext:
            value.paymentIntentReferenceCiphertext,
          p_payment_intent_reference_sha256:
            value.paymentIntentReferenceSha256,
          p_terminal_response_sha256: value.terminalResponseSha256,
          p_completion_evidence_sha256: value.completionEvidenceSha256,
          p_livemode: value.livemode,
        },
        completeResultSchema,
      );
    },
    async markAmbiguous(input) {
      const value = parseInput(ambiguousInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.ambiguous,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_lease_token_sha256: value.leaseTokenSha256,
          p_ambiguity_code: value.ambiguityCode,
          p_ambiguity_evidence_sha256: value.ambiguityEvidenceSha256,
          p_livemode: value.livemode,
        },
        ambiguousResultSchema,
      );
    },
    async recover(input) {
      const value = parseInput(recoverInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.recover,
        {
          p_attempt_id: value.attemptId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_lease_token_sha256: value.leaseTokenSha256,
          p_reconciliation_state: value.reconciliationState,
          p_reconciliation_evidence_sha256:
            value.reconciliationEvidenceSha256,
          p_recovery_evidence_sha256: value.recoveryEvidenceSha256,
          p_payment_intent_reference_ciphertext:
            value.paymentIntentReferenceCiphertext,
          p_payment_intent_reference_sha256:
            value.paymentIntentReferenceSha256,
          p_livemode: value.livemode,
        },
        recoverResultSchema,
      );
    },
  });
}
