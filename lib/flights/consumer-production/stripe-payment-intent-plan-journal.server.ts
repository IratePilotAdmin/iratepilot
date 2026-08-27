import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  buildFlightConsumerProductionStripePaymentIntentPlan,
  type FlightConsumerProductionStripePaymentIntentPlan,
} from "./stripe-payment-intent-plan.server";
import {
  requireFlightConsumerProductionStripePaymentPlanRuntime,
} from "./stripe-runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_JOURNAL_RPC =
  "record_flight_consumer_live_stripe_payment_intent_plan_v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const amountSchema = z.number().int().min(50).max(99_999_999);

const workflowInputSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  paymentAttemptId: uuidSchema,
  authoritativeAmountCents: amountSchema,
  paymentAmountCents: amountSchema,
  currency: z.literal("USD"),
  offerEvidenceSha256: sha256Schema,
  repriceEvidenceSha256: sha256Schema,
  orderPlanSha256: sha256Schema,
  orderRequestEnvelopeSha256: sha256Schema,
}).strict();

const journalPlanSchema = z.object({
  version: z.literal(
    "flight-consumer-production-stripe-payment-intent-plan-v1",
  ),
  mode: z.literal("zero_dispatch"),
  currency: z.literal("usd"),
  captureMethod: z.literal("manual"),
  confirmationMethod: z.literal("automatic"),
  paymentMethodTypes: z.tuple([z.literal("card")]),
  executionScopeSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  paymentAttemptReferenceSha256: sha256Schema,
  metadataSha256: sha256Schema,
  requestBodySha256: sha256Schema,
  requestEnvelopeSha256: sha256Schema,
  idempotencyRequestSha256: sha256Schema,
  idempotencyKeySha256: sha256Schema,
  planSha256: sha256Schema,
  amountCents: amountSchema,
  providerRequestCount: z.literal(0),
  stripeRequestCount: z.literal(0),
  stripeMutationCount: z.literal(0),
  paymentIntentCount: z.literal(0),
  chargeCount: z.literal(0),
  refundCount: z.literal(0),
  externalRequestMade: z.literal(false),
  rawPaymentMethodAccepted: z.literal(false),
  clientSecretExposed: z.literal(false),
  paymentAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  if (new Set([
    value.orderReferenceSha256,
    value.customerReferenceSha256,
    value.paymentAttemptReferenceSha256,
  ]).size !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAttemptReferenceSha256"],
      message: "Payment-plan journal identity digests must be distinct.",
    });
  }
});

const journalReceiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  plan_id: uuidSchema,
  recorded_plan_sha256: sha256Schema,
  plan_mode: z.literal("zero_dispatch"),
}).strict();

const workflowReceiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  planId: uuidSchema,
  recordedPlanSha256: sha256Schema,
  planMode: z.literal("zero_dispatch"),
}).strict();

export type FlightConsumerProductionStripePaymentPlanJournalRpcClient =
  Readonly<{
    rpc: (
      name: string,
      args: Readonly<Record<string, unknown>>,
    ) => Promise<Readonly<{
      data: unknown;
      error: Readonly<{ code?: string | null }> | null;
    }>>;
  }>;

export type FlightConsumerProductionStripePaymentPlanJournalReceipt =
  Readonly<{
    decision: "created" | "replay";
    planId: string;
    recordedPlanSha256: string;
    planMode: "zero_dispatch";
  }>;

export interface FlightConsumerProductionStripePaymentPlanJournalPort {
  record(
    plan: FlightConsumerProductionStripePaymentIntentPlan,
  ): Promise<FlightConsumerProductionStripePaymentPlanJournalReceipt>;
}

export type FlightConsumerProductionStripePaymentPlanRecordingResult =
  Readonly<{
    version:
      "flight-consumer-production-stripe-payment-intent-plan-recording-result-v1";
    decision: "created" | "replay";
    planId: string;
    planSha256: string;
    mode: "zero_dispatch";
    executionScopeSha256: string;
    paymentBindingSha256: string;
    providerRequestCount: 0;
    stripeRequestCount: 0;
    stripeMutationCount: 0;
    paymentIntentCount: 0;
    chargeCount: 0;
    refundCount: 0;
    externalRequestMade: false;
    rawPaymentMethodAccepted: false;
    clientSecretExposed: false;
    paymentAuthorized: false;
    captureAuthorized: false;
    refundAuthorized: false;
    orderAuthorized: false;
    ticketingAuthorized: false;
    consumerReleaseEnabled: false;
  }>;

export class FlightConsumerProductionStripePaymentPlanJournalError
  extends Error {
  readonly reason:
    | "invalid_input"
    | "runtime_unavailable"
    | "rpc_refused"
    | "invalid_result"
    | "evidence_mismatch";

  constructor(
    reason: FlightConsumerProductionStripePaymentPlanJournalError["reason"],
  ) {
    super("Flight Consumer Production Stripe zero-dispatch payment plan was refused.");
    this.name = "FlightConsumerProductionStripePaymentPlanJournalError";
    this.reason = reason;
  }
}

function equalSha256(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function oneReceipt(value: unknown) {
  const parsed = z.array(journalReceiptSchema).length(1).safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerProductionStripePaymentPlanJournalError(
      "invalid_result",
    );
  }
  return parsed.data[0]!;
}

export function createFlightConsumerProductionStripePaymentPlanJournalPort(
  client?: FlightConsumerProductionStripePaymentPlanJournalRpcClient,
): FlightConsumerProductionStripePaymentPlanJournalPort {
  const rpcClient: FlightConsumerProductionStripePaymentPlanJournalRpcClient =
    client ?? Object.freeze({
      async rpc(name, args) {
        const { data, error } = await createAdminClient().rpc(name, args);
        return Object.freeze({
          data,
          error: error === null
            ? null
            : Object.freeze({ code: error.code }),
        });
      },
    });
  return Object.freeze({
    async record(plan: FlightConsumerProductionStripePaymentIntentPlan) {
      const accepted = journalPlanSchema.safeParse(plan);
      if (!accepted.success) {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "invalid_input",
        );
      }
      const value = accepted.data;
      let response: Awaited<ReturnType<typeof rpcClient.rpc>>;
      try {
        response = await rpcClient.rpc(
          FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_JOURNAL_RPC,
          {
            p_execution_scope_sha256: value.executionScopeSha256,
            p_payment_binding_sha256: value.paymentBindingSha256,
            p_order_reference_sha256: value.orderReferenceSha256,
            p_customer_reference_sha256: value.customerReferenceSha256,
            p_payment_attempt_reference_sha256:
              value.paymentAttemptReferenceSha256,
            p_metadata_sha256: value.metadataSha256,
            p_request_body_sha256: value.requestBodySha256,
            p_request_envelope_sha256: value.requestEnvelopeSha256,
            p_idempotency_request_sha256: value.idempotencyRequestSha256,
            p_idempotency_key_sha256: value.idempotencyKeySha256,
            p_plan_sha256: value.planSha256,
            p_amount_cents: value.amountCents,
          },
        );
      } catch {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "rpc_refused",
        );
      }
      if (response.error !== null) {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "rpc_refused",
        );
      }
      const receipt = oneReceipt(response.data);
      return Object.freeze({
        decision: receipt.decision,
        planId: receipt.plan_id,
        recordedPlanSha256: receipt.recorded_plan_sha256,
        planMode: receipt.plan_mode,
      });
    },
  });
}

export function createFlightConsumerProductionStripePaymentPlanWorkflow(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Readonly<{
    journal?: FlightConsumerProductionStripePaymentPlanJournalPort;
  }> = {},
) {
  let runtime;
  try {
    runtime = requireFlightConsumerProductionStripePaymentPlanRuntime(env);
  } catch {
    throw new FlightConsumerProductionStripePaymentPlanJournalError(
      "runtime_unavailable",
    );
  }

  const journal = dependencies.journal
    ?? createFlightConsumerProductionStripePaymentPlanJournalPort();

  return Object.freeze({
    async execute(
      untrustedInput: unknown,
    ): Promise<FlightConsumerProductionStripePaymentPlanRecordingResult> {
      const accepted = workflowInputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "invalid_input",
        );
      }
      const input = accepted.data;
      let plan: FlightConsumerProductionStripePaymentIntentPlan;
      try {
        plan = buildFlightConsumerProductionStripePaymentIntentPlan({
          ...input,
          executionScopeSha256: runtime.binding.executionScopeSha256,
          paymentBinding: runtime.binding.paymentBinding,
        });
      } catch {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "invalid_input",
        );
      }

      const acceptedReceipt = workflowReceiptSchema.safeParse(
        await journal.record(plan),
      );
      if (!acceptedReceipt.success) {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "invalid_result",
        );
      }
      const receipt = acceptedReceipt.data;
      if (
        !equalSha256(receipt.recordedPlanSha256, plan.planSha256)
      ) {
        throw new FlightConsumerProductionStripePaymentPlanJournalError(
          "evidence_mismatch",
        );
      }

      return Object.freeze({
        version:
          "flight-consumer-production-stripe-payment-intent-plan-recording-result-v1" as const,
        decision: receipt.decision,
        planId: receipt.planId,
        planSha256: plan.planSha256,
        mode: "zero_dispatch" as const,
        executionScopeSha256: plan.executionScopeSha256,
        paymentBindingSha256: plan.paymentBindingSha256,
        providerRequestCount: 0 as const,
        stripeRequestCount: 0 as const,
        stripeMutationCount: 0 as const,
        paymentIntentCount: 0 as const,
        chargeCount: 0 as const,
        refundCount: 0 as const,
        externalRequestMade: false as const,
        rawPaymentMethodAccepted: false as const,
        clientSecretExposed: false as const,
        paymentAuthorized: false as const,
        captureAuthorized: false as const,
        refundAuthorized: false as const,
        orderAuthorized: false as const,
        ticketingAuthorized: false as const,
        consumerReleaseEnabled: false as const,
      });
    },
  });
}
