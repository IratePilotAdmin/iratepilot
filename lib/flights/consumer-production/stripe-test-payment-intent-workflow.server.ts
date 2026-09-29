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
  callerClaimsWebhookSignatureVerified: z.boolean(),
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
  callerClaimsLatestChargeMatches: z.boolean(),
  disputed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (
    value.source === "stripe_webhook"
    && (value.webhookEventIdSha256 === null
      || value.webhookEventType === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["webhookEventIdSha256"],
      message: "Webhook candidates require caller-projected event evidence.",
    });
  }
  if (
    value.source === "stripe_retrieve"
    && (value.callerClaimsWebhookSignatureVerified
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

const recoveryInputSchema = z.object({
  operation: z.literal("create_payment_intent"),
  paymentAttemptReferenceSha256: sha256Schema,
  plannedIdempotencyRequestSha256: sha256Schema,
  plannedIdempotencyKeySha256: sha256Schema,
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
  leaseState: z.enum(["not_applicable", "active", "expired_attested"]),
  reconciliationState: z.enum([
    "not_run",
    "provider_absence_attested",
    "provider_present",
    "unresolved",
  ]),
  reconciliationEvidenceSha256: sha256Schema.nullable(),
}).strict().superRefine((value, context) => {
  const reconciliationHasEvidence =
    value.reconciliationState !== "not_run";
  if (
    reconciliationHasEvidence
    !== (value.reconciliationEvidenceSha256 !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciliationEvidenceSha256"],
      message: "Reconciliation state and evidence must be complete.",
    });
  }
});

const authorityBrand = Symbol("flight-consumer-production-stripe-test-authority");

export type FlightConsumerProductionStripeTestWorkflowAuthority = Readonly<{
  version: "flight-consumer-production-stripe-test-workflow-authority-v2";
  mode: "test_contract_only";
  processorCode: "stripe";
  processorEnvironment: "test";
  executionScopeSha256: string;
  paymentBindingSha256: string;
  accountSha256: string;
  credentialInputsSelfConsistent: true;
  webhookSecretInputsSelfConsistent: true;
  providerVerificationPerformed: false;
  allowedOperations: readonly [
    "plan_payment_intent",
    "classify_webhook_candidate",
    "classify_retrieve_candidate",
    "describe_refund_requirements",
    "classify_payment_intent_recovery",
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
  version: "flight-consumer-production-stripe-test-workflow-foundation-v2";
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
  plannedIdempotencyRequestSha256: string;
  plannedIdempotencyKeySha256: string;
  workflowSha256: string;
  webhook: Readonly<{
    futureRawBodyVerificationRequired: true;
    callerSignatureClaimIsAuthentication: false;
    trustedSignatureVerifierAvailable: false;
    livemodeRequired: false;
    futureDurableEventDeduplicationRequired: true;
    durableEventDeduplicationAvailable: false;
    allowedEvents: readonly [
      "payment_intent.amount_capturable_updated",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
      "payment_intent.succeeded",
      "charge.refunded",
      "refund.updated",
    ];
    candidateOnly: true;
  }>;
  reconciliation: Readonly<{
    futureSourceOfTruth: "trusted_stripe_retrieve_adapter";
    trustedAdapterAvailable: false;
    callerProjectionCanAuthorize: false;
    paymentIntentReferenceBindingAvailable: false;
    latestChargeRequiredForCapture: true;
    refundAndDisputeInspectionRequired: true;
    mismatchDisposition: "manual_review";
  }>;
  refund: Readonly<{
    planningAvailable: false;
    unavailableReason: "trusted_adapter_and_persistence_not_implemented";
    futureCapturedPaymentAttestationRequired: true;
    futureExactAmountRequired: true;
    futureDistinctIdempotencyKeyRequired: true;
    dispatchEnabled: false;
  }>;
  recovery: Readonly<{
    classificationOnly: true;
    paymentAttemptBindingRequired: true;
    plannedIdempotencyBindingRequired: true;
    inProgressRetryRequiresExpiredLeaseAndProviderAbsence: true;
    blindRetryEnabled: false;
    refundRecoveryAvailable: false;
  }>;
  persistence: Readonly<{
    target: "none";
    durableAttemptStateAvailable: false;
    migration103CompatibilityImplemented: false;
    migration103JournalWriteAvailable: false;
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
  version: "flight-consumer-production-stripe-test-observation-v2";
  state:
    | "awaiting_payment_method"
    | "payment_failed"
    | "awaiting_confirmation"
    | "action_required"
    | "processing"
    | "authorization_candidate"
    | "canceled"
    | "capture_candidate";
  disposition: "candidate_only" | "quarantined";
  reason:
    | "caller_asserted_untrusted_evidence"
    | "binding_mismatch"
    | "live_mode_refused"
    | "webhook_signature_untrusted"
    | "webhook_event_mismatch"
    | "refund_or_dispute_observed"
    | "capture_state_mismatch"
    | "latest_charge_attestation_missing";
  source: "stripe_webhook" | "stripe_retrieve";
  paymentIntentReferenceSha256: string;
  evidenceSha256: string;
  trustedAdapterEvidence: false;
  webhookAuthenticated: false;
  paymentIntentReferenceBound: false;
  refundPlanningAvailable: false;
  providerMutationAuthorized: false;
  orderAuthorized: false;
  ticketingAuthorized: false;
  consumerReleaseEnabled: false;
}>;

export type FlightConsumerProductionStripeTestFailureRecovery = Readonly<{
  version: "flight-consumer-production-stripe-test-failure-recovery-v2";
  nextStep:
    | "retry_same_idempotency_key"
    | "reconcile_before_retry"
    | "return_recorded_success"
    | "return_recorded_failure"
    | "manual_review";
  sameIdempotencyKeyRequired: true;
  blindRetryAuthorized: false;
  providerDispatchAuthorized: false;
  classificationOnly: true;
  persistenceAvailable: false;
  paymentAttemptReferenceSha256: string;
  plannedIdempotencyRequestSha256: string;
  plannedIdempotencyKeySha256: string;
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
  workflowSha256: string;
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
    version: "flight-consumer-production-stripe-test-workflow-scope-v2",
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
    version: "flight-consumer-production-stripe-test-workflow-authority-v2" as const,
    mode: "test_contract_only" as const,
    processorCode: "stripe" as const,
    processorEnvironment: "test" as const,
    executionScopeSha256,
    paymentBindingSha256,
    accountSha256,
    credentialInputsSelfConsistent: true as const,
    webhookSecretInputsSelfConsistent: true as const,
    providerVerificationPerformed: false as const,
    allowedOperations: [
      "plan_payment_intent",
      "classify_webhook_candidate",
      "classify_retrieve_candidate",
      "describe_refund_requirements",
      "classify_payment_intent_recovery",
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
  const plannedIdempotencyKeySha256 = idempotencyKeySha256(
    idempotency.idempotencyKey,
  );
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-payment-intent-envelope-v1",
    method: "POST",
    path: "/v1/payment_intents",
    requestBodySha256,
    plannedIdempotencyRequestSha256: idempotency.requestDigest,
    plannedIdempotencyKeySha256,
    expectedLivemode: false,
  });
  const workflowSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-workflow-evidence-v2",
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
    plannedIdempotencyRequestSha256: idempotency.requestDigest,
    plannedIdempotencyKeySha256,
    persistenceTarget: "none",
    migration103CompatibilityImplemented: false,
  });

  const foundation = deepFreeze({
    version: "flight-consumer-production-stripe-test-workflow-foundation-v2" as const,
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
    plannedIdempotencyRequestSha256: idempotency.requestDigest,
    plannedIdempotencyKeySha256,
    workflowSha256,
    webhook: {
      futureRawBodyVerificationRequired: true as const,
      callerSignatureClaimIsAuthentication: false as const,
      trustedSignatureVerifierAvailable: false as const,
      livemodeRequired: false as const,
      futureDurableEventDeduplicationRequired: true as const,
      durableEventDeduplicationAvailable: false as const,
      allowedEvents: [
        "payment_intent.amount_capturable_updated",
        "payment_intent.payment_failed",
        "payment_intent.canceled",
        "payment_intent.succeeded",
        "charge.refunded",
        "refund.updated",
      ] as const,
      candidateOnly: true as const,
    },
    reconciliation: {
      futureSourceOfTruth: "trusted_stripe_retrieve_adapter" as const,
      trustedAdapterAvailable: false as const,
      callerProjectionCanAuthorize: false as const,
      paymentIntentReferenceBindingAvailable: false as const,
      latestChargeRequiredForCapture: true as const,
      refundAndDisputeInspectionRequired: true as const,
      mismatchDisposition: "manual_review" as const,
    },
    refund: {
      planningAvailable: false as const,
      unavailableReason:
        "trusted_adapter_and_persistence_not_implemented" as const,
      futureCapturedPaymentAttestationRequired: true as const,
      futureExactAmountRequired: true as const,
      futureDistinctIdempotencyKeyRequired: true as const,
      dispatchEnabled: false as const,
    },
    recovery: {
      classificationOnly: true as const,
      paymentAttemptBindingRequired: true as const,
      plannedIdempotencyBindingRequired: true as const,
      inProgressRetryRequiresExpiredLeaseAndProviderAbsence: true as const,
      blindRetryEnabled: false as const,
      refundRecoveryAvailable: false as const,
    },
    persistence: {
      target: "none" as const,
      durableAttemptStateAvailable: false as const,
      migration103CompatibilityImplemented: false as const,
      migration103JournalWriteAvailable: false as const,
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
    if (!observation.callerClaimsWebhookSignatureVerified) {
      return "webhook_signature_untrusted";
    }
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
    observation.status === "requires_capture"
    && !observation.callerClaimsLatestChargeMatches
  ) return "latest_charge_attestation_missing";
  if (
    observation.status === "succeeded"
    && (
      observation.amountCapturableCents !== 0
      || observation.amountReceivedCents !== foundation.amountCents
    )
  ) return "capture_state_mismatch";
  if (
    observation.status === "succeeded"
    && !observation.callerClaimsLatestChargeMatches
  ) return "latest_charge_attestation_missing";
  return null;
}

function observationState(
  observation: z.infer<typeof observationSchema>,
): FlightConsumerProductionStripeTestObservation["state"] {
  if (
    observation.webhookEventType === "payment_intent.payment_failed"
  ) return "payment_failed";
  const { status } = observation;
  if (status === "requires_payment_method") return "awaiting_payment_method";
  if (status === "requires_confirmation") return "awaiting_confirmation";
  if (status === "requires_action") return "action_required";
  if (status === "processing") return "processing";
  if (status === "requires_capture") return "authorization_candidate";
  if (status === "canceled") return "canceled";
  return "capture_candidate";
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
  const state = observationState(observation);
  const disposition = mismatch === null ? "candidate_only" : "quarantined";
  const reason = mismatch ?? "caller_asserted_untrusted_evidence";
  const evidenceSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-test-observation-evidence-v2",
    workflowSha256: foundation.workflowSha256,
    state,
    disposition,
    reason,
    source: observation.source,
    callerClaimsWebhookSignatureVerified:
      observation.callerClaimsWebhookSignatureVerified,
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
    callerClaimsLatestChargeMatches:
      observation.callerClaimsLatestChargeMatches,
    disputed: observation.disputed,
    trustedAdapterEvidence: false,
    webhookAuthenticated: false,
    paymentIntentReferenceBound: false,
  });
  return deepFreeze({
    version: "flight-consumer-production-stripe-test-observation-v2" as const,
    state,
    disposition,
    reason,
    source: observation.source,
    paymentIntentReferenceSha256: observation.paymentIntentReferenceSha256,
    evidenceSha256,
    trustedAdapterEvidence: false as const,
    webhookAuthenticated: false as const,
    paymentIntentReferenceBound: false as const,
    refundPlanningAvailable: false as const,
    providerMutationAuthorized: false as const,
    orderAuthorized: false as const,
    ticketingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
  });
}

function failureRecoveryNextStep(
  input: z.infer<typeof recoveryInputSchema>,
): FlightConsumerProductionStripeTestFailureRecovery["nextStep"] | null {
  if (
    (input.dispatchState === "not_started"
      && input.providerOutcome !== "not_observed")
    || (input.dispatchState === "started"
      && input.providerOutcome !== "not_observed")
    || (input.dispatchState === "response_received"
      && input.providerOutcome === "not_observed")
  ) return null;
  if (
    input.journalState === "in_progress"
    ? input.leaseState === "not_applicable"
    : input.leaseState !== "not_applicable"
  ) return null;
  if (
    input.reconciliationState === "provider_absence_attested"
    && input.providerOutcome !== "not_observed"
  ) return null;
  if (
    input.reconciliationState === "provider_present"
    && input.providerOutcome === "not_observed"
  ) return null;
  if (input.journalState === "succeeded") {
    return input.dispatchState === "response_received"
      && input.providerOutcome === "success"
      ? "return_recorded_success"
      : null;
  }
  if (input.journalState === "failed") {
    return input.dispatchState === "response_received"
      && input.providerOutcome === "definitive_failure"
      ? "return_recorded_failure"
      : null;
  }
  if (
    input.dispatchState === "not_started"
    && input.providerOutcome === "not_observed"
    && input.journalState === "absent"
    && input.reconciliationState === "not_run"
  ) return "retry_same_idempotency_key";
  if (
    input.journalState === "in_progress"
    && input.leaseState === "expired_attested"
    && input.reconciliationState === "provider_absence_attested"
  ) return "retry_same_idempotency_key";
  if (
    input.dispatchState === "response_received"
    && input.providerOutcome === "definitive_failure"
    && input.journalState === "in_progress"
  ) return "manual_review";
  if (
    input.journalState === "ambiguous"
    || input.journalState === "in_progress"
    || input.dispatchState === "started"
    || input.providerOutcome === "pending"
    || (
      input.dispatchState === "response_received"
      && input.providerOutcome === "success"
    )
  ) return "reconcile_before_retry";
  return null;
}

export function classifyFlightConsumerProductionStripeTestFailureRecovery(
  authority: FlightConsumerProductionStripeTestWorkflowAuthority,
  foundation: FlightConsumerProductionStripeTestWorkflowFoundation,
  untrustedInput: unknown,
): FlightConsumerProductionStripeTestFailureRecovery {
  requireIssuedAuthority(authority);
  const foundationBinding = foundationPrivate.get(foundation);
  const accepted = recoveryInputSchema.safeParse(untrustedInput);
  if (
    foundationBinding === undefined
    || foundation.executionScopeSha256 !== authority.executionScopeSha256
    || foundation.paymentBindingSha256 !== authority.paymentBindingSha256
    || !accepted.success
    || accepted.data.paymentAttemptReferenceSha256
      !== foundation.paymentAttemptReferenceSha256
    || accepted.data.plannedIdempotencyRequestSha256
      !== foundation.plannedIdempotencyRequestSha256
    || accepted.data.plannedIdempotencyKeySha256
      !== foundation.plannedIdempotencyKeySha256
  ) throw new FlightConsumerProductionStripeTestWorkflowError();
  const nextStep = failureRecoveryNextStep(accepted.data);
  if (nextStep === null) throw new FlightConsumerProductionStripeTestWorkflowError();
  return deepFreeze({
    version: "flight-consumer-production-stripe-test-failure-recovery-v2" as const,
    nextStep,
    sameIdempotencyKeyRequired: true as const,
    blindRetryAuthorized: false as const,
    providerDispatchAuthorized: false as const,
    classificationOnly: true as const,
    persistenceAvailable: false as const,
    paymentAttemptReferenceSha256:
      accepted.data.paymentAttemptReferenceSha256,
    plannedIdempotencyRequestSha256:
      accepted.data.plannedIdempotencyRequestSha256,
    plannedIdempotencyKeySha256:
      accepted.data.plannedIdempotencyKeySha256,
    evidenceSha256: sha256FlightEvidence({
      version: "flight-consumer-production-stripe-test-failure-recovery-evidence-v2",
      executionScopeSha256: authority.executionScopeSha256,
      paymentBindingSha256: authority.paymentBindingSha256,
      workflowSha256: foundationBinding.workflowSha256,
      ...accepted.data,
      nextStep,
    }),
  });
}
