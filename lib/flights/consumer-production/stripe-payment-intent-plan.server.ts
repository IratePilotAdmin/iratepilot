import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimePaymentBinding,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
  type FlightRuntimePaymentBinding,
} from "../runtime-safety";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const amountSchema = z.number().int().min(50).max(99_999_999);
const paymentBindingSchema = z.object({
  processorId: z.literal("stripe_live"),
  adapterVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/).max(64),
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
}).strict();

const inputSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  paymentAttemptId: uuidSchema,
  authoritativeAmountCents: amountSchema,
  paymentAmountCents: amountSchema,
  currency: z.literal("USD"),
  executionScopeSha256: sha256Schema,
  offerEvidenceSha256: sha256Schema,
  repriceEvidenceSha256: sha256Schema,
  orderPlanSha256: sha256Schema,
  orderRequestEnvelopeSha256: sha256Schema,
  paymentBinding: paymentBindingSchema,
}).strict().superRefine((value, context) => {
  if (value.authoritativeAmountCents !== value.paymentAmountCents) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAmountCents"],
      message: "The planned payment amount must equal the authoritative order amount.",
    });
  }
  if (new Set([
    value.orderId,
    value.customerId,
    value.paymentAttemptId,
  ]).size !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAttemptId"],
      message: "Order, customer, and payment-attempt identifiers must be distinct.",
    });
  }
});

export type FlightConsumerProductionStripePaymentIntentPlanInput =
  z.input<typeof inputSchema>;

export type FlightConsumerProductionStripePaymentIntentPlan = Readonly<{
  version: "flight-consumer-production-stripe-payment-intent-plan-v1";
  mode: "zero_dispatch";
  amountCents: number;
  currency: "usd";
  captureMethod: "manual";
  confirmationMethod: "automatic";
  paymentMethodTypes: readonly ["card"];
  paymentBindingSha256: string;
  orderReferenceSha256: string;
  customerReferenceSha256: string;
  paymentAttemptReferenceSha256: string;
  metadataSha256: string;
  requestBodySha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  idempotencyKeySha256: string;
  planSha256: string;
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

export class FlightConsumerProductionStripePaymentIntentPlanError extends Error {
  readonly code = "payment_intent_plan_refused" as const;

  constructor() {
    super("The zero-dispatch Stripe PaymentIntent plan was refused.");
    this.name = "FlightConsumerProductionStripePaymentIntentPlanError";
  }
}

function referenceSha256(kind: "order" | "customer" | "payment_attempt", value: string) {
  return createHash("sha256")
    .update(
      `iratepilot:flight-consumer-production:stripe-payment-intent-plan:${kind}-reference:v1`,
      "utf8",
    )
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function buildFlightConsumerProductionStripePaymentIntentPlan(
  untrustedInput: unknown,
): FlightConsumerProductionStripePaymentIntentPlan {
  const accepted = inputSchema.safeParse(untrustedInput);
  if (!accepted.success) {
    throw new FlightConsumerProductionStripePaymentIntentPlanError();
  }
  const input = accepted.data;
  const paymentBinding = input.paymentBinding satisfies FlightRuntimePaymentBinding;
  const paymentBindingSha256 = digestFlightRuntimePaymentBinding(paymentBinding);
  const orderReferenceSha256 = referenceSha256("order", input.orderId);
  const customerReferenceSha256 = referenceSha256("customer", input.customerId);
  const paymentAttemptReferenceSha256 = referenceSha256(
    "payment_attempt",
    input.paymentAttemptId,
  );

  const metadata = {
    integration: "flight_consumer_production_plan_v1",
    execution_mode: "live_plan_only",
    order_reference_sha256: orderReferenceSha256,
    customer_reference_sha256: customerReferenceSha256,
    payment_attempt_reference_sha256: paymentAttemptReferenceSha256,
    execution_scope_sha256: input.executionScopeSha256,
    offer_evidence_sha256: input.offerEvidenceSha256,
    reprice_evidence_sha256: input.repriceEvidenceSha256,
    order_plan_sha256: input.orderPlanSha256,
    order_request_envelope_sha256: input.orderRequestEnvelopeSha256,
    payment_binding_sha256: paymentBindingSha256,
  } satisfies FlightCanonicalJsonValue;
  const metadataSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-payment-metadata-v1",
    ...metadata,
  });
  const requestBody = {
    amount: input.paymentAmountCents,
    currency: "usd",
    capture_method: "manual",
    confirmation_method: "automatic",
    payment_method_types: ["card"],
    metadata,
  } satisfies FlightCanonicalJsonValue;
  const requestBodySha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-payment-intent-request-body-v1",
    ...requestBody,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "authorize_payment",
    scopeId: input.orderId,
    requestId: input.paymentAttemptId,
    payload: {
      version: "flight-consumer-production-stripe-payment-intent-idempotency-v1",
      amountCents: input.paymentAmountCents,
      currency: "USD",
      executionScopeSha256: input.executionScopeSha256,
      offerEvidenceSha256: input.offerEvidenceSha256,
      repriceEvidenceSha256: input.repriceEvidenceSha256,
      orderPlanSha256: input.orderPlanSha256,
      orderRequestEnvelopeSha256: input.orderRequestEnvelopeSha256,
      paymentBindingSha256,
      orderReferenceSha256,
      customerReferenceSha256,
      paymentAttemptReferenceSha256,
      requestBodySha256,
    },
  });
  const idempotencyKeySha256 = sha256Utf8(idempotency.idempotencyKey);
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-payment-intent-request-envelope-v1",
    method: "POST",
    path: "/v1/payment_intents",
    contentType: "application/x-www-form-urlencoded",
    requestBodySha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256,
  });
  const planSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-payment-intent-plan-evidence-v1",
    amountCents: input.paymentAmountCents,
    currency: "usd",
    captureMethod: "manual",
    confirmationMethod: "automatic",
    paymentMethodTypes: ["card"],
    paymentBindingSha256,
    orderReferenceSha256,
    customerReferenceSha256,
    paymentAttemptReferenceSha256,
    metadataSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256,
  });

  return deepFreeze({
    version: "flight-consumer-production-stripe-payment-intent-plan-v1" as const,
    mode: "zero_dispatch" as const,
    amountCents: input.paymentAmountCents,
    currency: "usd" as const,
    captureMethod: "manual" as const,
    confirmationMethod: "automatic" as const,
    paymentMethodTypes: ["card"] as const,
    paymentBindingSha256,
    orderReferenceSha256,
    customerReferenceSha256,
    paymentAttemptReferenceSha256,
    metadataSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256,
    planSha256,
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
}
