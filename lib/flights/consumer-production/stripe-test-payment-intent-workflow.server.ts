import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
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
const accountIdSchema = z.string().regex(/^acct_[A-Za-z0-9]{8,127}$/);
const restrictedTestKeySchema = z.string().regex(/^rk_test_[A-Za-z0-9_]{8,256}$/);
const webhookTestSecretSchema = z.string().regex(/^whsec_[A-Za-z0-9_]{8,256}$/);
const paymentIntentStatusSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "canceled",
  "succeeded",
]);

const paymentBindingSchema = z.object({
  processorId: z.literal("stripe_test"),
  adapterVersion: z.string()
    .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/)
    .max(64),
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
}).strict();

const authorityInputSchema = z.object({
  restrictedTestKey: restrictedTestKeySchema,
  stripeAccountId: accountIdSchema,
  webhookTestSecret: webhookTestSecretSchema,
  approvedCredentialSha256: sha256Schema,
  approvedAccountSha256: sha256Schema,
  approvedWebhookSecretSha256: sha256Schema,
  scopeNonceSha256: sha256Schema,
  paymentBinding: paymentBindingSchema,
  contractPlanningEnabled: z.literal(true),
  providerDispatchEnabled: z.literal(false),
  liveModeEnabled: z.literal(false),
  productionPaymentEnabled: z.literal(false),
  captureEnabled: z.literal(false),
  orderEnabled: z.literal(false),
  ticketingEnabled: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  transactionKillSwitchEngaged: z.literal(true),
}).strict();

const foundationInputSchema = z.object({
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
}).strict().superRefine((value, context) => {
  if (value.authoritativeAmountCents !== value.paymentAmountCents) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAmountCents"],
      message: "The test payment amount must equal the authoritative order amount.",
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

const observationSchema = z.object({
  source: z.enum(["stripe_webhook", "stripe_retrieve"]),
  webhookSignatureVerified: z.boolean(),
  webhookEventIdSha256: sha256Schema.nullable(),
  webhookEventType: z.enum([
    "payment_intent.amount_capturable_updated",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "payment_intent.succeeded",
    "charge.refunded",
    "refund.updated",
  ]).nullable(),
  paymentIntentReferenceSha256: sha256Schema,
  livemode: z.boolean(),
  amountCents: amountSchema,
  amountCapturableCents: z.number().int().min(0).max(99_999_999),
  amountReceivedCents: z.number().int().min(0).max(99_999_999),
  amountRefundedCents: z.number().int().min(0).max(99_999_999),
  currency: z.string().regex(/^[a-z]{3}$/),
  captureMethod: z.enum(["automatic", "automatic_async", "manual"]),
  confirmationMethod: z.enum(["automatic", "manual"]),
  status: paymentIntentStatusSchema,
  metadataSha256: sha256Schema,
  latestChargeMatches: z.boolean(),
  disputed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (
    value.source === "stripe_webhook"
    && (!value.webhookSignatureVerified
      || value.webhookEventIdSha256 === null
      || value.webhookEventType === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["webhookSignatureVerified"],
      message: "Webhook observations require verified event evidence.",
    });
  }
  if (
    value.source === "stripe_retrieve"
    && (value.webhookSignatureVerified
      || value.webhookEventIdSha256 !== null
      || value.webhookEventType !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source"],
      message: "Retrieve observations cannot contain webhook evidence.",
    });
  }
});

const refundInputSchema = z.object({
  refundAttemptId: uuidSchema,
  refundAmountCents: amountSchema,
  reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]),
}).strict();

const recoveryInputSchema = z.object({
  operation: z.enum(["create_payment_intent", "refund_payment"]),
  dispatchState: z.enum(["not_started", "started", "response_received"]),
  providerOutcome: z.enum([
    "not_observed",
    "pending",
    "success",
    "definitive_failure",
  ]),
  journalState: z.enum([
    "absent",
    "in_progress",
    "ambiguous",
    "succeeded",
    "failed",
  ]),
}).strict();

const authorityBrand = Symbol("flight-consumer-production-stripe-test-authority");

export type FlightConsumerProductionStripeTestWorkflowAuthority = Readonly<{
  version: "flight-consumer-production-stripe-test-workflow-authority-v1";
  mode: "test_contract_only";
  processorCode: "stripe";
  processorEnvironment: "test";
  executionScopeSha256: string;
  paymentBindingSha256: string;
  accountSha256: string;
  credentialBindingMatched: true;
  webhookSecretBindingMatched: true;
  allowedOperations: readonly [
    "plan_payment_intent",
    "evaluate_test_webhook",
    "reconcile_test_payment",
    "plan_test_refund",
    "classify_test_failure",
  ];
  providerDispatchEnabled: false;
  liveModeEnabled: false;
  productionPaymentEnabled: false;
  captureEnabled: false;
  orderEnabled: false;
  ticketingEnabled: false;
  consumerReleaseEnabled: false;
  transactionKillSwitchEngaged: true;
  [authorityBrand]: true;
}>;

export type FlightConsumerProductionStripeTestWorkflowFoundation = Readonly<{
  version: "flight-consumer-production-stripe-test-workflow-foundation-v1";
  mode: "test_contract_only";
  amountCents: number;
  currency: "usd";
  captureMethod: "manual";
  confirmationMethod: "automatic";
  paymentMethodTypes: readonly ["card"];
  executionScopeSha256: string;
  paymentBindingSha256: string;
  orderReferenceSha256: string;
  customerReferenceSha256: string;
  paymentAttemptReferenceSha256: string;
  metadataSha256: string;
  requestBodySha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  idempotencyKeySha256: string;
  workflowSha256: string;
  webhook: Readonly<{
    rawBodyRequired: true;
    stripeSignatureRequired: true;
    signatureToleranceSeconds: 300;
    livemodeRequired: false;
    eventIdIdempotencyRequired: true;
    allowedEvents: readonly [
      "payment_intent.amount_capturable_updated",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
      "payment_intent.succeeded",
      "charge.refunded",
      "refund.updated",
    ];
    outOfOrderStrategy: "retrieve_then_reconcile";
  }>;
  reconciliation: Readonly<{
    sourceOfTruth: "stripe_retrieve_payment_intent";
    exactBindingRequired: true;
    latestChargeRequiredForCapture: true;
    refundAndDisputeInspectionRequired: true;
    mismatchDisposition: "manual_review";
  }>;
  refund: Readonly<{
    capturedPaymentRequired: true;
    exactAmountRequired: true;
    distinctIdempotencyKeyRequired: true;
    pendingRequiresReconciliation: true;
    dispatchEnabled: false;
  }>;
  recovery: Readonly<{
    sameIdempotencyKeyRequired: true;
    ambiguousDispatchRequiresReconciliation: true;
    blindRetryEnabled: false;
    journalFailureRequiresReconciliation: true;
  }>;
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

export type FlightConsumerProductionStripeTestObservation = Readonly<{
  version: "flight-consumer-production-stripe-test-observation-v1";
  decision: "pending" | "authorized" | "captured" | "quarantined";
  reason:
    | "matched_pending"
    | "matched_authorized"
    | "matched_captured"
    | "binding_mismatch"
    | "live_mode_refused"
    | "webhook_event_mismatch"
    | "refund_or_dispute_observed"
    | "capture_state_mismatch";
  source: "stripe_webhook" | "stripe_retrieve";
  paymentIntentReferenceSha256: string;
  evidenceSha256: string;
  providerMutationAuthorized: false;
  orderAuthorized: false;
  ticketingAuthorized: false;
  consumerReleaseEnabled: false;
}>;

export type FlightConsumerProductionStripeTestRefundPlan = Readonly<{
  version: "flight-consumer-production-stripe-test-refund-plan-v1";
  mode: "test_contract_only";
  amountCents: number;
  currency: "usd";
  reason: "requested_by_customer" | "duplicate" | "fraudulent";
  paymentIntentReferenceSha256: string;
  refundAttemptReferenceSha256: string;
  requestBodySha256: string;
  requestEnvelopeSha256: string;
  idempotencyRequestSha256: string;
  idempotencyKeySha256: string;
  refundPlanSha256: string;
  dispatchEnabled: false;
  refundAuthorized: false;
  providerRequestCount: 0;
  refundCount: 0;
  externalRequestMade: false;
  consumerReleaseEnabled: false;
}>;

export type FlightConsumerProductionStripeTestFailureRecovery = Readonly<{
  version: "flight-consumer-production-stripe-test-failure-recovery-v1";
  nextStep:
    | "retry_same_idempotency_key"
    | "reconcile_before_retry"
    | "return_recorded_success"
    | "return_recorded_failure"
    | "manual_review";
  sameIdempotencyKeyRequired: true;
  blindRetryAuthorized: false;
  providerDispatchAuthorized: false;
  evidenceSha256: string;
}>;

export class FlightConsumerProductionStripeTestWorkflowError extends Error {
  readonly code = "stripe_test_workflow_refused" as const;

  constructor() {
    super("The Stripe TEST PaymentIntent workflow contract was refused.");
    this.name = "FlightConsumerProductionStripeTestWorkflowError";
  }
}

const issuedAuthorities = new WeakSet<object>();
const foundationPrivate = new WeakMap<object, Readonly<{
  orderId: string;
  workflowSha256: string;
}>>();
const acceptedCapturedObservations = new WeakMap<object, Readonly<{
  foundation: object;
  workflowSha256: string;
  paymentIntentReferenceSha256: string;
}>>();

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function domainSha256(domain: string, value: string) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function equalSha256(left: string, right: string) {
  return sha256Schema.safeParse(left).success
    && sha256Schema.safeParse(right).success
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function referenceSha256(kind: string, value: string) {
  return domainSha256(
    `iratepilot:flight-consumer-production:stripe-test:${kind}:v1`,
    value,
  );
}

function idempotencyKeySha256(value: string) {
  return domainSha256(
    "iratepilot:flight-consumer-production:stripe-test:idempotency-key:v1",
    value,
  );
}

export function deriveFlightConsumerProductionStripeTestCredentialSha256(
  credential: string,
) {
  const accepted = restrictedTestKeySchema.safeParse(credential);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  return domainSha256(
    "iratepilot:flight-consumer-production:stripe-test:credential:v1",
    accepted.data,
  );
}

export function deriveFlightConsumerProductionStripeTestAccountSha256(
  accountId: string,
) {
  const accepted = accountIdSchema.safeParse(accountId);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  return domainSha256(
    "iratepilot:flight-consumer-production:stripe-test:account:v1",
    accepted.data,
  );
}

export function deriveFlightConsumerProductionStripeTestWebhookSecretSha256(
  webhookSecret: string,
) {
  const accepted = webhookTestSecretSchema.safeParse(webhookSecret);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  return domainSha256(
    "iratepilot:flight-consumer-production:stripe-test:webhook-secret:v1",
    accepted.data,
  );
}

export function createFlightConsumerProductionStripeTestWorkflowAuthority(
  untrustedInput: unknown,
): FlightConsumerProductionStripeTestWorkflowAuthority {
  const accepted = authorityInputSchema.safeParse(untrustedInput);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  const input = accepted.data;
  const credentialSha256 =
    deriveFlightConsumerProductionStripeTestCredentialSha256(
      input.restrictedTestKey,
    );
  const accountSha256 = deriveFlightConsumerProductionStripeTestAccountSha256(
    input.stripeAccountId,
  );
  const webhookSecretSha256 =
    deriveFlightConsumerProductionStripeTestWebhookSecretSha256(
      input.webhookTestSecret,
    );
  if (
    !equalSha256(credentialSha256, input.approvedCredentialSha256)
    || !equalSha256(accountSha256, input.approvedAccountSha256)
    || !equalSha256(webhookSecretSha256, input.approvedWebhookSecretSha256)
  ) throw new FlightConsumerProductionStripeTestWorkflowError();

  const paymentBinding = input.paymentBinding satisfies FlightRuntimePaymentBinding;
  const paymentBindingSha256 = digestFlightRuntimePaymentBinding(paymentBinding);
  const executionScopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-workflow-scope-v1",
    processorCode: "stripe",
    processorEnvironment: "test",
    accountSha256,
    credentialSha256,
    webhookSecretSha256,
    scopeNonceSha256: input.scopeNonceSha256,
    paymentBindingSha256,
    providerDispatchEnabled: false,
    liveModeEnabled: false,
    productionPaymentEnabled: false,
    consumerReleaseEnabled: false,
    transactionKillSwitchEngaged: true,
  });
  const authority = deepFreeze({
    version: "flight-consumer-production-stripe-test-workflow-authority-v1" as const,
    mode: "test_contract_only" as const,
    processorCode: "stripe" as const,
    processorEnvironment: "test" as const,
    executionScopeSha256,
    paymentBindingSha256,
    accountSha256,
    credentialBindingMatched: true as const,
    webhookSecretBindingMatched: true as const,
    allowedOperations: [
      "plan_payment_intent",
      "evaluate_test_webhook",
      "reconcile_test_payment",
      "plan_test_refund",
      "classify_test_failure",
    ] as const,
    providerDispatchEnabled: false as const,
    liveModeEnabled: false as const,
    productionPaymentEnabled: false as const,
    captureEnabled: false as const,
    orderEnabled: false as const,
    ticketingEnabled: false as const,
    consumerReleaseEnabled: false as const,
    transactionKillSwitchEngaged: true as const,
    [authorityBrand]: true as const,
  });
  issuedAuthorities.add(authority);
  return authority;
}

function requireIssuedAuthority(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
) {
  if (!issuedAuthorities.has(authority)) {
    throw new FlightConsumerProductionStripeTestWorkflowError();
  }
}

export function buildFlightConsumerProductionStripeTestWorkflowFoundation(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
  untrustedInput: unknown,
): FlightConsumerProductionStripeTestWorkflowFoundation {
  requireIssuedAuthority(authority);
  const accepted = foundationInputSchema.safeParse(untrustedInput);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  const input = accepted.data;
  const orderReferenceSha256 = referenceSha256("order-reference", input.orderId);
  const customerReferenceSha256 = referenceSha256(
    "customer-reference",
    input.customerId,
  );
  const paymentAttemptReferenceSha256 = referenceSha256(
    "payment-attempt-reference",
    input.paymentAttemptId,
  );
  const metadata = {
    integration: "flight_consumer_production_test_workflow_v1",
    execution_mode: "test",
    execution_scope_sha256: authority.executionScopeSha256,
    payment_binding_sha256: authority.paymentBindingSha256,
    order_reference_sha256: orderReferenceSha256,
    customer_reference_sha256: customerReferenceSha256,
    payment_attempt_reference_sha256: paymentAttemptReferenceSha256,
    offer_evidence_sha256: input.offerEvidenceSha256,
    reprice_evidence_sha256: input.repriceEvidenceSha256,
    order_plan_sha256: input.orderPlanSha256,
    order_request_envelope_sha256: input.orderRequestEnvelopeSha256,
  } satisfies FlightCanonicalJsonValue;
  const metadataSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-metadata-v1",
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
    version: "flight-consumer-production-stripe-test-payment-intent-body-v1",
    ...requestBody,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "authorize_payment",
    scopeId: input.orderId,
    requestId: input.paymentAttemptId,
    payload: {
      version: "flight-consumer-production-stripe-test-payment-intent-idempotency-v1",
      amountCents: input.paymentAmountCents,
      currency: "USD",
      executionScopeSha256: authority.executionScopeSha256,
      paymentBindingSha256: authority.paymentBindingSha256,
      orderReferenceSha256,
      customerReferenceSha256,
      paymentAttemptReferenceSha256,
      metadataSha256,
      requestBodySha256,
    },
  });
  const createIdempotencyKeySha256 = idempotencyKeySha256(
    idempotency.idempotencyKey,
  );
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-payment-intent-envelope-v1",
    method: "POST",
    path: "/v1/payment_intents",
    requestBodySha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: createIdempotencyKeySha256,
    expectedLivemode: false,
  });
  const workflowSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-workflow-evidence-v1",
    amountCents: input.paymentAmountCents,
    currency: "usd",
    captureMethod: "manual",
    confirmationMethod: "automatic",
    paymentMethodTypes: ["card"],
    executionScopeSha256: authority.executionScopeSha256,
    paymentBindingSha256: authority.paymentBindingSha256,
    orderReferenceSha256,
    customerReferenceSha256,
    paymentAttemptReferenceSha256,
    metadataSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: createIdempotencyKeySha256,
  });

  const foundation = deepFreeze({
    version: "flight-consumer-production-stripe-test-workflow-foundation-v1" as const,
    mode: "test_contract_only" as const,
    amountCents: input.paymentAmountCents,
    currency: "usd" as const,
    captureMethod: "manual" as const,
    confirmationMethod: "automatic" as const,
    paymentMethodTypes: ["card"] as const,
    executionScopeSha256: authority.executionScopeSha256,
    paymentBindingSha256: authority.paymentBindingSha256,
    orderReferenceSha256,
    customerReferenceSha256,
    paymentAttemptReferenceSha256,
    metadataSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: createIdempotencyKeySha256,
    workflowSha256,
    webhook: {
      rawBodyRequired: true as const,
      stripeSignatureRequired: true as const,
      signatureToleranceSeconds: 300 as const,
      livemodeRequired: false as const,
      eventIdIdempotencyRequired: true as const,
      allowedEvents: [
        "payment_intent.amount_capturable_updated",
        "payment_intent.payment_failed",
        "payment_intent.canceled",
        "payment_intent.succeeded",
        "charge.refunded",
        "refund.updated",
      ] as const,
      outOfOrderStrategy: "retrieve_then_reconcile" as const,
    },
    reconciliation: {
      sourceOfTruth: "stripe_retrieve_payment_intent" as const,
      exactBindingRequired: true as const,
      latestChargeRequiredForCapture: true as const,
      refundAndDisputeInspectionRequired: true as const,
      mismatchDisposition: "manual_review" as const,
    },
    refund: {
      capturedPaymentRequired: true as const,
      exactAmountRequired: true as const,
      distinctIdempotencyKeyRequired: true as const,
      pendingRequiresReconciliation: true as const,
      dispatchEnabled: false as const,
    },
    recovery: {
      sameIdempotencyKeyRequired: true as const,
      ambiguousDispatchRequiresReconciliation: true as const,
      blindRetryEnabled: false as const,
      journalFailureRequiresReconciliation: true as const,
    },
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
  foundationPrivate.set(foundation, Object.freeze({
    orderId: input.orderId,
    workflowSha256,
  }));
  return foundation;
}

function mismatchReason(
  foundation: FlightConsumerProductionStripeTestWorkflowFoundation,
  observation: z.infer<typeof observationSchema>,
): FlightConsumerProductionStripeTestObservation["reason"] | null {
  if (observation.livemode) return "live_mode_refused";
  if (observation.source === "stripe_webhook") {
    if (
      observation.webhookEventType === "charge.refunded"
      || observation.webhookEventType === "refund.updated"
    ) return "refund_or_dispute_observed";
    let expectedStatus: z.infer<typeof paymentIntentStatusSchema> | undefined;
    if (
      observation.webhookEventType
      === "payment_intent.amount_capturable_updated"
    ) expectedStatus = "requires_capture";
    else if (
      observation.webhookEventType === "payment_intent.payment_failed"
    ) expectedStatus = "requires_payment_method";
    else if (
      observation.webhookEventType === "payment_intent.canceled"
    ) expectedStatus = "canceled";
    else if (
      observation.webhookEventType === "payment_intent.succeeded"
    ) expectedStatus = "succeeded";
    if (expectedStatus === undefined || observation.status !== expectedStatus) {
      return "webhook_event_mismatch";
    }
  }
  if (
    observation.amountCents !== foundation.amountCents
    || observation.currency !== foundation.currency
    || observation.captureMethod !== foundation.captureMethod
    || observation.confirmationMethod !== foundation.confirmationMethod
    || observation.metadataSha256 !== foundation.metadataSha256
  ) return "binding_mismatch";
  if (observation.amountRefundedCents > 0 || observation.disputed) {
    return "refund_or_dispute_observed";
  }
  if (
    observation.status === "requires_capture"
    && (
      observation.amountCapturableCents !== foundation.amountCents
      || observation.amountReceivedCents !== 0
    )
  ) return "capture_state_mismatch";
  if (
    observation.status === "succeeded"
    && (
      observation.amountCapturableCents !== 0
      || observation.amountReceivedCents !== foundation.amountCents
      || !observation.latestChargeMatches
    )
  ) return "capture_state_mismatch";
  return null;
}

export function evaluateFlightConsumerProductionStripeTestObservation(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
  foundation: FlightConsumerProductionStripeTestWorkflowFoundation,
  untrustedObservation: unknown,
): FlightConsumerProductionStripeTestObservation {
  requireIssuedAuthority(authority);
  const foundationBinding = foundationPrivate.get(foundation);
  const accepted = observationSchema.safeParse(untrustedObservation);
  if (
    foundationBinding === undefined
    || foundation.executionScopeSha256 !== authority.executionScopeSha256
    || foundation.paymentBindingSha256 !== authority.paymentBindingSha256
    || !accepted.success
  ) throw new FlightConsumerProductionStripeTestWorkflowError();
  const observation = accepted.data;
  const mismatch = mismatchReason(foundation, observation);
  let decision: FlightConsumerProductionStripeTestObservation["decision"];
  let reason: FlightConsumerProductionStripeTestObservation["reason"];
  if (mismatch !== null) {
    decision = "quarantined";
    reason = mismatch;
  } else if (observation.status === "requires_capture") {
    decision = "authorized";
    reason = "matched_authorized";
  } else if (observation.status === "succeeded") {
    decision = "captured";
    reason = "matched_captured";
  } else {
    decision = "pending";
    reason = "matched_pending";
  }
  const evidenceSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-observation-evidence-v1",
    workflowSha256: foundation.workflowSha256,
    decision,
    reason,
    source: observation.source,
    webhookEventIdSha256: observation.webhookEventIdSha256,
    webhookEventType: observation.webhookEventType,
    paymentIntentReferenceSha256: observation.paymentIntentReferenceSha256,
    livemode: observation.livemode,
    amountCents: observation.amountCents,
    amountCapturableCents: observation.amountCapturableCents,
    amountReceivedCents: observation.amountReceivedCents,
    amountRefundedCents: observation.amountRefundedCents,
    currency: observation.currency,
    captureMethod: observation.captureMethod,
    confirmationMethod: observation.confirmationMethod,
    status: observation.status,
    metadataSha256: observation.metadataSha256,
    latestChargeMatches: observation.latestChargeMatches,
    disputed: observation.disputed,
  });
  const result = deepFreeze({
    version: "flight-consumer-production-stripe-test-observation-v1" as const,
    decision,
    reason,
    source: observation.source,
    paymentIntentReferenceSha256: observation.paymentIntentReferenceSha256,
    evidenceSha256,
    providerMutationAuthorized: false as const,
    orderAuthorized: false as const,
    ticketingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
  });
  if (decision === "captured") {
    acceptedCapturedObservations.set(result, Object.freeze({
      foundation,
      workflowSha256: foundationBinding.workflowSha256,
      paymentIntentReferenceSha256: observation.paymentIntentReferenceSha256,
    }));
  }
  return result;
}

export function buildFlightConsumerProductionStripeTestRefundPlan(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
  foundation: FlightConsumerProductionStripeTestWorkflowFoundation,
  capturedObservation: FlightConsumerProductionStripeTestObservation,
  untrustedInput: unknown,
): FlightConsumerProductionStripeTestRefundPlan {
  requireIssuedAuthority(authority);
  const foundationBinding = foundationPrivate.get(foundation);
  const captureBinding = acceptedCapturedObservations.get(capturedObservation);
  const accepted = refundInputSchema.safeParse(untrustedInput);
  if (
    foundationBinding === undefined
    || captureBinding === undefined
    || captureBinding.foundation !== foundation
    || captureBinding.workflowSha256 !== foundationBinding.workflowSha256
    || foundation.executionScopeSha256 !== authority.executionScopeSha256
    || !accepted.success
    || accepted.data.refundAmountCents !== foundation.amountCents
  ) throw new FlightConsumerProductionStripeTestWorkflowError();
  const input = accepted.data;
  const refundAttemptReferenceSha256 = referenceSha256(
    "refund-attempt-reference",
    input.refundAttemptId,
  );
  const requestBodySha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-refund-body-v1",
    amount: input.refundAmountCents,
    reason: input.reason,
    paymentIntentReferenceSha256: captureBinding.paymentIntentReferenceSha256,
    refundAttemptReferenceSha256,
    workflowSha256: foundation.workflowSha256,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "refund_payment",
    scopeId: foundationBinding.orderId,
    requestId: input.refundAttemptId,
    payload: {
      version: "flight-consumer-production-stripe-test-refund-idempotency-v1",
      amountCents: input.refundAmountCents,
      currency: "USD",
      reason: input.reason,
      paymentIntentReferenceSha256: captureBinding.paymentIntentReferenceSha256,
      refundAttemptReferenceSha256,
      workflowSha256: foundation.workflowSha256,
      captureObservationSha256: capturedObservation.evidenceSha256,
    },
  });
  const refundIdempotencyKeySha256 = idempotencyKeySha256(
    idempotency.idempotencyKey,
  );
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-refund-envelope-v1",
    method: "POST",
    path: "/v1/refunds",
    requestBodySha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: refundIdempotencyKeySha256,
    expectedLivemode: false,
  });
  const refundPlanSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-refund-plan-evidence-v1",
    amountCents: input.refundAmountCents,
    currency: "usd",
    reason: input.reason,
    executionScopeSha256: foundation.executionScopeSha256,
    paymentBindingSha256: foundation.paymentBindingSha256,
    paymentIntentReferenceSha256: captureBinding.paymentIntentReferenceSha256,
    refundAttemptReferenceSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: refundIdempotencyKeySha256,
  });
  return deepFreeze({
    version: "flight-consumer-production-stripe-test-refund-plan-v1" as const,
    mode: "test_contract_only" as const,
    amountCents: input.refundAmountCents,
    currency: "usd" as const,
    reason: input.reason,
    paymentIntentReferenceSha256: captureBinding.paymentIntentReferenceSha256,
    refundAttemptReferenceSha256,
    requestBodySha256,
    requestEnvelopeSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: refundIdempotencyKeySha256,
    refundPlanSha256,
    dispatchEnabled: false as const,
    refundAuthorized: false as const,
    providerRequestCount: 0 as const,
    refundCount: 0 as const,
    externalRequestMade: false as const,
    consumerReleaseEnabled: false as const,
  });
}

function failureRecoveryNextStep(
  input: z.infer<typeof recoveryInputSchema>,
): FlightConsumerProductionStripeTestFailureRecovery["nextStep"] | null {
  if (input.journalState === "succeeded") {
    return input.providerOutcome === "success" ? "return_recorded_success" : null;
  }
  if (input.journalState === "failed") {
    return input.providerOutcome === "definitive_failure"
      ? "return_recorded_failure"
      : null;
  }
  if (
    input.dispatchState === "not_started"
    && input.providerOutcome === "not_observed"
    && ["absent", "in_progress"].includes(input.journalState)
  ) return "retry_same_idempotency_key";
  if (
    input.journalState === "ambiguous"
    || input.dispatchState === "started"
    || input.providerOutcome === "pending"
    || (
      input.dispatchState === "response_received"
      && input.providerOutcome === "success"
    )
  ) return "reconcile_before_retry";
  if (
    input.dispatchState === "response_received"
    && input.providerOutcome === "definitive_failure"
    && input.journalState === "in_progress"
  ) return "manual_review";
  return null;
}

export function classifyFlightConsumerProductionStripeTestFailureRecovery(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
  untrustedInput: unknown,
): FlightConsumerProductionStripeTestFailureRecovery {
  requireIssuedAuthority(authority);
  const accepted = recoveryInputSchema.safeParse(untrustedInput);
  if (!accepted.success) throw new FlightConsumerProductionStripeTestWorkflowError();
  const nextStep = failureRecoveryNextStep(accepted.data);
  if (nextStep === null) throw new FlightConsumerProductionStripeTestWorkflowError();
  return deepFreeze({
    version: "flight-consumer-production-stripe-test-failure-recovery-v1" as const,
    nextStep,
    sameIdempotencyKeyRequired: true as const,
    blindRetryAuthorized: false as const,
    providerDispatchAuthorized: false as const,
    evidenceSha256: sha256FlightEvidence({
      version: "flight-consumer-production-stripe-test-failure-recovery-evidence-v1",
      executionScopeSha256: authority.executionScopeSha256,
      paymentBindingSha256: authority.paymentBindingSha256,
      ...accepted.data,
      nextStep,
    }),
  });
}
