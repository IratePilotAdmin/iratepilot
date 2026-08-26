import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";

import { getStripe } from "../../stripe";
import { createAdminClient } from "../../supabase/admin";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import {
  decryptFlightConsumerPreviewReference,
  readFlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export const FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_EVENTS = Object.freeze([
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
] as const);
export const FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES = 262_144 as const;

type SupportedEventType = (typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_EVENTS)[number];

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const stripeEventIdSchema = z.string().regex(/^evt_[A-Za-z0-9]{8,255}$/);
const paymentIntentIdSchema = z.string().regex(/^pi_[A-Za-z0-9]{8,127}$/);
const chargeIdSchema = z.string().regex(/^ch_[A-Za-z0-9]{8,127}$/);
const stripeAccountIdSchema = z.string().regex(/^acct_[A-Za-z0-9]{8,127}$/);
const stripeTestSecretSchema = z.string().regex(/^sk_test_[A-Za-z0-9_]{8,}$/);
const webhookSecretSchema = z.string().regex(/^whsec_[A-Za-z0-9_]{16,}$/);
const positiveAmountSchema = z.number().int().min(1).max(99_999_999);
const amountSchema = z.number().int().min(0).max(99_999_999);

const runtimeBindingSchema = z.object({
  executionScopeSha256: sha256Schema,
  paymentProcessorCode: z.literal("stripe"),
  paymentEnvironment: z.literal("test"),
  paymentAccountSha256: sha256Schema,
  paymentSourceSha256: sha256Schema,
  paymentAdapterVersionSha256: sha256Schema,
}).strict();

export type FlightConsumerPreviewStripeWebhookBinding = z.infer<typeof runtimeBindingSchema>;

const webhookConfigurationSchema = z.object({
  stripeSecretKey: stripeTestSecretSchema,
  previewWebhookSecret: webhookSecretSchema,
  genericWebhookSecret: webhookSecretSchema.optional(),
  previewStripeAccountSha256: sha256Schema,
  previewStripeAccountId: stripeAccountIdSchema.optional(),
}).strict();

export type FlightConsumerPreviewStripeWebhookConfiguration = z.infer<typeof webhookConfigurationSchema>;

const paymentMetadataSchema = z.object({
  integration: z.literal("flight_consumer_preview_v1"),
  execution_mode: z.literal("test"),
  order_id: uuidSchema,
  customer_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  payment_account_sha256: sha256Schema,
  payment_source_sha256: sha256Schema,
  payment_adapter_version_sha256: sha256Schema,
}).strict();

const paymentIntentStatusSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "canceled",
  "succeeded",
]);

const projectedPaymentIntentSchema = z.object({
  id: paymentIntentIdSchema,
  object: z.literal("payment_intent"),
  livemode: z.literal(false),
  amount: positiveAmountSchema,
  amountCapturable: amountSchema,
  amountReceived: amountSchema,
  currency: z.literal("usd"),
  captureMethod: z.literal("manual"),
  status: paymentIntentStatusSchema,
  metadata: paymentMetadataSchema,
}).strict();

const projectedChargeSchema = z.object({
  id: chargeIdSchema,
  object: z.literal("charge"),
  livemode: z.literal(false),
  paymentIntentId: paymentIntentIdSchema,
  amount: positiveAmountSchema,
  amountRefunded: positiveAmountSchema,
  currency: z.literal("usd"),
  captured: z.literal(true),
  paid: z.literal(true),
  status: z.literal("succeeded"),
}).strict().superRefine((value, context) => {
  if (value.amountRefunded > value.amount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["amountRefunded"], message: "Refund exceeds charge." });
  }
});

const projectedEventSchema = z.object({
  id: stripeEventIdSchema,
  type: z.string().min(3).max(128),
  livemode: z.literal(false),
  account: stripeAccountIdSchema.nullable(),
  created: z.number().int().positive(),
  requestIdempotencyKey: z.string().min(1).max(255).nullable(),
  dataObject: z.unknown(),
}).strict();

export type FlightConsumerPreviewProjectedStripeEvent = z.infer<typeof projectedEventSchema>;

const paymentLinkSchema = z.object({
  paymentId: uuidSchema,
  orderId: uuidSchema,
  customerId: uuidSchema,
  paymentIntentId: paymentIntentIdSchema,
  amountCents: positiveAmountSchema,
  currency: z.literal("USD"),
  executionMode: z.literal("test"),
  executionScopeSha256: sha256Schema,
  processorCode: z.literal("stripe"),
}).strict();

export type FlightConsumerPreviewStripeWebhookPaymentLink = z.infer<typeof paymentLinkSchema>;

export type FlightConsumerStripeWebhookRecordParameters = Readonly<{
  p_source: "stripe";
  p_event_id_sha256: string;
  p_idempotency_sha256: string;
  p_event_type: SupportedEventType;
  p_payload_sha256: string;
  p_semantic_sha256: string;
  p_verification_receipt_sha256: string;
  p_occurred_at: string;
  p_order_id: string;
  p_payment_id: string;
  p_provider_attempt_id: null;
}>;

export type FlightConsumerStripeWebhookClaimParameters = Readonly<{
  p_ledger_id: string;
  p_expected_revision: 0;
  p_lease_token_sha256: string;
  p_lease_duration_seconds: 60;
}>;

export type FlightConsumerStripeWebhookReclaimParameters = Readonly<{
  p_ledger_id: string;
  p_expected_revision: 1;
  p_stale_before: string;
  p_recovery_receipt_sha256: string;
  p_lease_token_sha256: string;
  p_lease_duration_seconds: 60;
}>;

export type FlightConsumerStripeWebhookCompleteParameters = Readonly<{
  p_ledger_id: string;
  p_expected_revision: 1;
  p_lease_token_sha256: string;
  p_outcome: "processed" | "duplicate" | "blocked";
  p_outcome_sha256: string;
}>;

export type FlightConsumerStripeWebhookEscalationParameters = Readonly<{
  p_ledger_id: string;
  p_expected_event_type: "payment_intent.payment_failed" | "charge.refunded";
  p_expected_semantic_sha256: string;
  p_expected_lease_token_sha256: string | null;
}>;

export interface FlightConsumerPreviewStripeWebhookStripePort {
  constructEvent(rawBody: string, signature: string, webhookSecret: string): Promise<unknown> | unknown;
  retrievePaymentIntent(paymentIntentId: string): Promise<unknown>;
}

export interface FlightConsumerPreviewStripeWebhookLedgerPort {
  resolvePaymentLink(input: Readonly<{
    paymentIntentId: string;
    orderId: string;
    customerId: string;
    executionScopeSha256: string;
  }>): Promise<unknown>;
  record(parameters: FlightConsumerStripeWebhookRecordParameters): Promise<unknown>;
  claim(parameters: FlightConsumerStripeWebhookClaimParameters): Promise<unknown>;
  reclaim(parameters: FlightConsumerStripeWebhookReclaimParameters): Promise<unknown | null>;
  escalate(parameters: FlightConsumerStripeWebhookEscalationParameters): Promise<unknown>;
  complete(parameters: FlightConsumerStripeWebhookCompleteParameters): Promise<unknown>;
}

export type FlightConsumerPreviewStripeWebhookDependencies = Readonly<{
  stripe: FlightConsumerPreviewStripeWebhookStripePort;
  ledger: FlightConsumerPreviewStripeWebhookLedgerPort;
  readTrustedTime: () => string;
}>;

export type FlightConsumerPreviewStripeWebhookResult = Readonly<{
  version: "flight-consumer-preview-stripe-webhook-result-v1";
  decision: "processed" | "replayed" | "processing" | "blocked";
  eventType: SupportedEventType;
  providerDispatchAuthorized: false;
}>;

export interface FlightConsumerPreviewStripeWebhookWorkflow {
  ingest(input: Readonly<{
    rawBody: string;
    signature: string;
  }>): Promise<FlightConsumerPreviewStripeWebhookResult>;
}

export class FlightConsumerPreviewStripeWebhookError extends Error {
  readonly httpStatus: 400 | 503;

  constructor(httpStatus: 400 | 503 = 503) {
    super(httpStatus === 400
      ? "Flight Consumer Preview Stripe webhook was rejected."
      : "Flight Consumer Preview Stripe webhook is unavailable.");
    this.name = "FlightConsumerPreviewStripeWebhookError";
    this.httpStatus = httpStatus;
  }
}

const recordResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay", "duplicate"]),
  ledger_id: uuidSchema,
  ledger_revision: z.number().int().min(0).max(2),
  ledger_state: z.enum(["verified", "processing", "processed", "duplicate", "blocked", "failed"]),
}).strict()).length(1);

const claimResultSchema = z.array(z.object({
  ledger_id: uuidSchema,
  ledger_revision: z.literal(1),
  ledger_state: z.literal("processing"),
  processing_lease_token_sha256: sha256Schema,
  processing_lease_expires_at: z.string().datetime({ offset: true }),
  processing_attempt_count: z.number().int().min(1),
}).strict()).length(1);

const reclaimResultSchema = claimResultSchema;

const completeResultSchema = z.array(z.object({
  ledger_id: uuidSchema,
  ledger_revision: z.literal(2),
  ledger_state: z.enum(["processed", "duplicate", "blocked"]),
}).strict()).length(1);

const operationalEscalationResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay"]),
  reconciliation_case_id: uuidSchema,
  order_id: uuidSchema,
  event_type: z.enum(["payment_intent.payment_failed", "charge.refunded"]),
  case_status: z.enum(["open", "investigating", "blocked", "resolved"]),
}).strict()).length(1);

function rawSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newWebhookLeaseTokenSha256() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

function referenceDigest(kind: "stripe_payment_intent", value: string) {
  return createHash("sha256")
    .update("flight-consumer-reference-digest-v1")
    .update("\0")
    .update(kind)
    .update("\0")
    .update(value, "utf8")
    .digest("hex");
}

function projectPaymentIntent(intent: Stripe.PaymentIntent) {
  return {
    id: intent.id,
    object: intent.object,
    livemode: intent.livemode,
    amount: intent.amount,
    amountCapturable: intent.amount_capturable,
    amountReceived: intent.amount_received,
    currency: intent.currency,
    captureMethod: intent.capture_method,
    status: intent.status,
    metadata: { ...intent.metadata },
  };
}

function projectCharge(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  return {
    id: charge.id,
    object: charge.object,
    livemode: charge.livemode,
    paymentIntentId,
    amount: charge.amount,
    amountRefunded: charge.amount_refunded,
    currency: charge.currency,
    captured: charge.captured,
    paid: charge.paid,
    status: charge.status,
  };
}

function projectEvent(event: Stripe.Event) {
  const requestIdempotencyKey = event.request && typeof event.request !== "string"
    ? event.request.idempotency_key
    : null;
  let dataObject: unknown = Object.freeze({ object: "unsupported" });
  if (event.type.startsWith("payment_intent.")) {
    dataObject = projectPaymentIntent(event.data.object as Stripe.PaymentIntent);
  } else if (event.type === "charge.refunded") {
    dataObject = projectCharge(event.data.object as Stripe.Charge);
  }
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    account: event.account ?? null,
    created: event.created,
    requestIdempotencyKey: requestIdempotencyKey ?? null,
    dataObject,
  };
}

class StripeSdkWebhookPort implements FlightConsumerPreviewStripeWebhookStripePort {
  readonly #stripe: ReturnType<typeof getStripe>;

  constructor() {
    this.#stripe = getStripe();
  }

  constructEvent(rawBody: string, signature: string, webhookSecret: string) {
    return projectEvent(this.#stripe.webhooks.constructEvent(rawBody, signature, webhookSecret, 300));
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return projectPaymentIntent(await this.#stripe.paymentIntents.retrieve(paymentIntentId));
  }
}

const orderRowSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  currency: z.literal("USD"),
  total_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number).pipe(positiveAmountSchema),
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  provider_code: z.literal("duffel"),
}).strict();

const paymentRowSchema = z.object({
  id: uuidSchema,
  order_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  processor_code: z.literal("stripe"),
  processor_reference_ciphertext: z.string().regex(/^enc:v1:[A-Za-z0-9_-]{16,4073}$/),
  processor_reference_sha256: sha256Schema,
}).strict();

class SupabaseStripeWebhookLedgerPort implements FlightConsumerPreviewStripeWebhookLedgerPort {
  async resolvePaymentLink(input: Readonly<{
    paymentIntentId: string;
    orderId: string;
    customerId: string;
    executionScopeSha256: string;
  }>) {
    const admin = createAdminClient();
    const orderResult = await admin.from("flight_orders")
      .select("id,customer_id,currency,total_cents,execution_mode,execution_scope_sha256,provider_code")
      .eq("id", input.orderId)
      .eq("customer_id", input.customerId)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", input.executionScopeSha256)
      .eq("provider_code", "duffel")
      .maybeSingle();
    if (orderResult.error) throw new FlightConsumerPreviewStripeWebhookError();
    const order = orderRowSchema.safeParse(orderResult.data);
    if (!order.success) return null;

    const paymentResult = await admin.from("flight_payments")
      .select("id,order_id,execution_mode,execution_scope_sha256,processor_code,processor_reference_ciphertext,processor_reference_sha256")
      .eq("order_id", input.orderId)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", input.executionScopeSha256)
      .eq("processor_code", "stripe")
      .eq("processor_reference_sha256", referenceDigest("stripe_payment_intent", input.paymentIntentId))
      .maybeSingle();
    if (paymentResult.error) throw new FlightConsumerPreviewStripeWebhookError();
    const payment = paymentRowSchema.safeParse(paymentResult.data);
    if (!payment.success) return null;
    const resolvedReference = decryptFlightConsumerPreviewReference({
      ciphertext: payment.data.processor_reference_ciphertext,
      expectedReferenceSha256: payment.data.processor_reference_sha256,
      context: {
        kind: "stripe_payment_intent",
        customerId: input.customerId,
        resourceId: input.orderId,
        executionScopeSha256: input.executionScopeSha256,
      },
      keyring: readFlightConsumerPreviewReferenceKeyring(),
    });
    if (resolvedReference !== input.paymentIntentId) return null;
    return Object.freeze({
      paymentId: payment.data.id,
      orderId: order.data.id,
      customerId: order.data.customer_id,
      paymentIntentId: resolvedReference,
      amountCents: order.data.total_cents,
      currency: order.data.currency,
      executionMode: payment.data.execution_mode,
      executionScopeSha256: payment.data.execution_scope_sha256,
      processorCode: payment.data.processor_code,
    });
  }

  async record(parameters: FlightConsumerStripeWebhookRecordParameters) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_verified_webhook_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewStripeWebhookError();
    return data;
  }

  async claim(parameters: FlightConsumerStripeWebhookClaimParameters) {
    const { data, error } = await createAdminClient().rpc(
      "claim_flight_consumer_webhook_lease_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewStripeWebhookError();
    return data;
  }

  async reclaim(parameters: FlightConsumerStripeWebhookReclaimParameters) {
    const { data, error } = await createAdminClient().rpc(
      "reclaim_flight_consumer_webhook_v1",
      parameters,
    );
    if (error?.message.includes("Flight webhook reclaim CAS failed")) return null;
    if (error) throw new FlightConsumerPreviewStripeWebhookError();
    return data;
  }

  async escalate(parameters: FlightConsumerStripeWebhookEscalationParameters) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_webhook_operational_escalation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewStripeWebhookError();
    return data;
  }

  async complete(parameters: FlightConsumerStripeWebhookCompleteParameters) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_webhook_lease_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewStripeWebhookError();
    return data;
  }
}

export function createFlightConsumerPreviewStripeWebhookLedgerPort(): FlightConsumerPreviewStripeWebhookLedgerPort {
  return Object.freeze(new SupabaseStripeWebhookLedgerPort());
}

type VerifiedSignal = Readonly<{
  eventType: SupportedEventType;
  paymentIntent: z.infer<typeof projectedPaymentIntentSchema>;
  charge: z.infer<typeof projectedChargeSchema> | null;
  paymentLink: FlightConsumerPreviewStripeWebhookPaymentLink;
  semanticSha256: string;
}>;

function isAdverseStripeEvent(
  eventType: SupportedEventType,
): eventType is FlightConsumerStripeWebhookEscalationParameters["p_expected_event_type"] {
  return eventType === "payment_intent.payment_failed" || eventType === "charge.refunded";
}

class StripeWebhookWorkflow implements FlightConsumerPreviewStripeWebhookWorkflow {
  readonly #binding: FlightConsumerPreviewStripeWebhookBinding;
  readonly #configuration: FlightConsumerPreviewStripeWebhookConfiguration;
  readonly #stripe: FlightConsumerPreviewStripeWebhookStripePort;
  readonly #ledger: FlightConsumerPreviewStripeWebhookLedgerPort;
  readonly #readTrustedTime: () => string;

  constructor(
    binding: FlightConsumerPreviewStripeWebhookBinding,
    configuration: FlightConsumerPreviewStripeWebhookConfiguration,
    dependencies: FlightConsumerPreviewStripeWebhookDependencies,
  ) {
    try {
      this.#binding = Object.freeze(runtimeBindingSchema.parse(structuredClone(binding)));
      this.#configuration = Object.freeze(webhookConfigurationSchema.parse(structuredClone(configuration)));
      if (
        this.#configuration.previewStripeAccountSha256 !== this.#binding.paymentAccountSha256
        || (this.#configuration.genericWebhookSecret !== undefined
          && this.#configuration.genericWebhookSecret === this.#configuration.previewWebhookSecret)
        || typeof dependencies.stripe?.constructEvent !== "function"
        || typeof dependencies.stripe?.retrievePaymentIntent !== "function"
        || typeof dependencies.ledger?.resolvePaymentLink !== "function"
        || typeof dependencies.ledger?.record !== "function"
        || typeof dependencies.ledger?.claim !== "function"
        || typeof dependencies.ledger?.reclaim !== "function"
        || typeof dependencies.ledger?.escalate !== "function"
        || typeof dependencies.ledger?.complete !== "function"
        || typeof dependencies.readTrustedTime !== "function"
      ) throw new FlightConsumerPreviewStripeWebhookError();
      this.#stripe = dependencies.stripe;
      this.#ledger = dependencies.ledger;
      this.#readTrustedTime = dependencies.readTrustedTime;
    } catch {
      throw new FlightConsumerPreviewStripeWebhookError();
    }
  }

  #trustedTime() {
    const value = this.#readTrustedTime();
    if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
      throw new FlightConsumerPreviewStripeWebhookError();
    }
    return value;
  }

  #assertMetadata(metadata: z.infer<typeof paymentMetadataSchema>) {
    if (
      metadata.execution_scope_sha256 !== this.#binding.executionScopeSha256
      || metadata.payment_account_sha256 !== this.#binding.paymentAccountSha256
      || metadata.payment_source_sha256 !== this.#binding.paymentSourceSha256
      || metadata.payment_adapter_version_sha256 !== this.#binding.paymentAdapterVersionSha256
    ) throw new FlightConsumerPreviewStripeWebhookError(400);
  }

  async #verifiedSignal(eventType: SupportedEventType, dataObject: unknown): Promise<VerifiedSignal> {
    let paymentIntent: z.infer<typeof projectedPaymentIntentSchema>;
    let charge: z.infer<typeof projectedChargeSchema> | null = null;
    if (eventType === "charge.refunded") {
      const parsedCharge = projectedChargeSchema.safeParse(dataObject);
      if (!parsedCharge.success) throw new FlightConsumerPreviewStripeWebhookError(400);
      charge = parsedCharge.data;
      let untrustedPaymentIntent: unknown;
      try {
        untrustedPaymentIntent = await this.#stripe.retrievePaymentIntent(charge.paymentIntentId);
      } catch {
        throw new FlightConsumerPreviewStripeWebhookError(503);
      }
      const parsedIntent = projectedPaymentIntentSchema.safeParse(untrustedPaymentIntent);
      if (!parsedIntent.success) throw new FlightConsumerPreviewStripeWebhookError(400);
      paymentIntent = parsedIntent.data;
      if (paymentIntent.status !== "succeeded") throw new FlightConsumerPreviewStripeWebhookError(400);
    } else {
      const parsedIntent = projectedPaymentIntentSchema.safeParse(dataObject);
      if (!parsedIntent.success) throw new FlightConsumerPreviewStripeWebhookError(400);
      paymentIntent = parsedIntent.data;
    }
    this.#assertMetadata(paymentIntent.metadata);
    if (
      (eventType === "payment_intent.amount_capturable_updated"
        && (paymentIntent.status !== "requires_capture"
          || paymentIntent.amountCapturable !== paymentIntent.amount
          || paymentIntent.amountReceived !== 0))
      || (eventType === "payment_intent.succeeded"
        && (paymentIntent.status !== "succeeded"
          || paymentIntent.amountReceived !== paymentIntent.amount
          || paymentIntent.amountCapturable !== 0))
      || (eventType === "payment_intent.payment_failed"
        && (paymentIntent.status !== "requires_payment_method"
          || paymentIntent.amountReceived !== 0
          || paymentIntent.amountCapturable !== 0))
      || (charge !== null
        && (charge.paymentIntentId !== paymentIntent.id
          || charge.amount !== paymentIntent.amount
          || charge.currency !== paymentIntent.currency))
    ) throw new FlightConsumerPreviewStripeWebhookError(400);

    let untrustedLink: unknown;
    try {
      untrustedLink = await this.#ledger.resolvePaymentLink({
        paymentIntentId: paymentIntent.id,
        orderId: paymentIntent.metadata.order_id,
        customerId: paymentIntent.metadata.customer_id,
        executionScopeSha256: this.#binding.executionScopeSha256,
      });
    } catch {
      throw new FlightConsumerPreviewStripeWebhookError(503);
    }
    const link = paymentLinkSchema.safeParse(untrustedLink);
    if (
      !link.success
      || link.data.paymentIntentId !== paymentIntent.id
      || link.data.orderId !== paymentIntent.metadata.order_id
      || link.data.customerId !== paymentIntent.metadata.customer_id
      || link.data.executionScopeSha256 !== this.#binding.executionScopeSha256
      || link.data.amountCents !== paymentIntent.amount
      || link.data.currency.toLowerCase() !== paymentIntent.currency
    ) throw new FlightConsumerPreviewStripeWebhookError(400);
    const semanticSha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-stripe-webhook-semantic-v1",
      eventType,
      paymentReferenceSha256: referenceDigest("stripe_payment_intent", paymentIntent.id),
      orderId: link.data.orderId,
      paymentId: link.data.paymentId,
      amountCents: paymentIntent.amount,
      amountCapturableCents: paymentIntent.amountCapturable,
      amountReceivedCents: paymentIntent.amountReceived,
      currency: paymentIntent.currency,
      paymentStatus: paymentIntent.status,
      chargeReferenceSha256: charge === null ? null : rawSha256(charge.id),
      amountRefundedCents: charge?.amountRefunded ?? 0,
      providerDispatchAuthorized: false,
    } as FlightCanonicalJsonValue);
    return Object.freeze({
      eventType,
      paymentIntent,
      charge,
      paymentLink: Object.freeze(link.data),
      semanticSha256,
    });
  }

  async #record(parameters: FlightConsumerStripeWebhookRecordParameters) {
    const parsed = recordResultSchema.safeParse(await this.#ledger.record(parameters));
    if (!parsed.success) throw new FlightConsumerPreviewStripeWebhookError();
    return parsed.data[0]!;
  }

  async #escalate(
    ledgerId: string,
    signal: VerifiedSignal,
    leaseTokenSha256: string | null,
  ) {
    if (!isAdverseStripeEvent(signal.eventType)) return;
    const escalated = operationalEscalationResultSchema.safeParse(
      await this.#ledger.escalate({
        p_ledger_id: ledgerId,
        p_expected_event_type: signal.eventType,
        p_expected_semantic_sha256: signal.semanticSha256,
        p_expected_lease_token_sha256: leaseTokenSha256,
      }),
    );
    if (
      !escalated.success
      || escalated.data[0]!.order_id !== signal.paymentLink.orderId
      || escalated.data[0]!.event_type !== signal.eventType
    ) throw new FlightConsumerPreviewStripeWebhookError();
  }

  #result(
    decision: FlightConsumerPreviewStripeWebhookResult["decision"],
    eventType: SupportedEventType,
  ) {
    return Object.freeze({
      version: "flight-consumer-preview-stripe-webhook-result-v1" as const,
      decision,
      eventType,
      providerDispatchAuthorized: false as const,
    });
  }

  async ingest(untrustedInput: Readonly<{ rawBody: string; signature: string }>) {
    try {
      const parsedInput = z.object({
        rawBody: z.string().min(2).max(FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES),
        signature: z.string().min(8).max(4_096),
      }).strict().safeParse(untrustedInput);
      if (!parsedInput.success) throw new FlightConsumerPreviewStripeWebhookError(400);
      const input = parsedInput.data;
      if (Buffer.byteLength(input.rawBody, "utf8") > FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES) {
        throw new FlightConsumerPreviewStripeWebhookError(400);
      }

      let untrustedEvent: unknown;
      try {
        untrustedEvent = await this.#stripe.constructEvent(
          input.rawBody,
          input.signature,
          this.#configuration.previewWebhookSecret,
        );
      } catch {
        throw new FlightConsumerPreviewStripeWebhookError(400);
      }
      const event = projectedEventSchema.safeParse(untrustedEvent);
      if (!event.success) throw new FlightConsumerPreviewStripeWebhookError(400);
      if (!FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_EVENTS.includes(event.data.type as SupportedEventType)) {
        throw new FlightConsumerPreviewStripeWebhookError(400);
      }
      const eventType = event.data.type as SupportedEventType;
      if (
        event.data.account !== null
        && (this.#configuration.previewStripeAccountId === undefined
          || event.data.account !== this.#configuration.previewStripeAccountId)
      ) throw new FlightConsumerPreviewStripeWebhookError(400);
      const trustedTime = this.#trustedTime();
      if (event.data.created * 1_000 > Date.parse(trustedTime) + 300_000) {
        throw new FlightConsumerPreviewStripeWebhookError(400);
      }

      const signal = await this.#verifiedSignal(eventType, event.data.dataObject);
      const payloadSha256 = rawSha256(input.rawBody);
      const eventIdSha256 = rawSha256(event.data.id);
      // A Stripe request idempotency key identifies the API request that
      // caused an Event, not the Event itself. One request can cause multiple
      // immutable snapshot Events, so webhook deduplication must stay bound to
      // Stripe's unique Event ID.
      const idempotencySha256 = sha256FlightEvidence({
        version: "flight-consumer-preview-stripe-webhook-idempotency-v1",
        eventIdSha256,
        eventType,
        semanticSha256: signal.semanticSha256,
      });
      const verificationReceiptSha256 = createHmac(
        "sha256",
        this.#configuration.previewWebhookSecret,
      ).update("flight-consumer-preview-stripe-webhook-verification-v1")
        .update("\0")
        .update(canonicalFlightJson({
          eventIdSha256,
          idempotencySha256,
          eventType,
          payloadSha256,
          semanticSha256: signal.semanticSha256,
          executionScopeSha256: this.#binding.executionScopeSha256,
          paymentAccountSha256: this.#binding.paymentAccountSha256,
        } as FlightCanonicalJsonValue))
        .digest("hex");
      const recordParameters = Object.freeze({
        p_source: "stripe" as const,
        p_event_id_sha256: eventIdSha256,
        p_idempotency_sha256: idempotencySha256,
        p_event_type: eventType,
        p_payload_sha256: payloadSha256,
        p_semantic_sha256: signal.semanticSha256,
        p_verification_receipt_sha256: verificationReceiptSha256,
        p_occurred_at: new Date(event.data.created * 1_000).toISOString(),
        p_order_id: signal.paymentLink.orderId,
        p_payment_id: signal.paymentLink.paymentId,
        p_provider_attempt_id: null,
      });
      let recorded = await this.#record(recordParameters);
      if (recorded.ledger_revision === 2) {
        await this.#escalate(recorded.ledger_id, signal, null);
        return this.#result("replayed", eventType);
      }
      const leaseTokenSha256 = newWebhookLeaseTokenSha256();
      if (recorded.ledger_revision === 1 && recorded.ledger_state === "processing") {
        const staleBefore = new Date(Date.parse(trustedTime) - 180_000).toISOString();
        const recoveryReceiptSha256 = sha256FlightEvidence({
          version: "flight-consumer-preview-stripe-webhook-recovery-v1",
          ledgerId: recorded.ledger_id,
          eventType,
          semanticSha256: signal.semanticSha256,
          leaseTokenSha256,
          staleBefore,
        });
        const reclaimedRaw = await this.#ledger.reclaim({
          p_ledger_id: recorded.ledger_id,
          p_expected_revision: 1,
          p_stale_before: staleBefore,
          p_recovery_receipt_sha256: recoveryReceiptSha256,
          p_lease_token_sha256: leaseTokenSha256,
          p_lease_duration_seconds: 60,
        });
        if (reclaimedRaw === null) return this.#result("processing", eventType);
        const reclaimed = reclaimResultSchema.parse(reclaimedRaw)[0]!;
        if (
          reclaimed.ledger_id !== recorded.ledger_id
          || reclaimed.processing_lease_token_sha256 !== leaseTokenSha256
        ) throw new FlightConsumerPreviewStripeWebhookError();
      }
      if (
        recorded.ledger_revision !== 0
        && !(recorded.ledger_revision === 1 && recorded.ledger_state === "processing")
      ) {
        throw new FlightConsumerPreviewStripeWebhookError();
      }

      if (recorded.ledger_revision === 0) {
        if (recorded.ledger_state !== "verified") throw new FlightConsumerPreviewStripeWebhookError();
        let claim: z.infer<typeof claimResultSchema>[number];
        try {
          const claimed = claimResultSchema.parse(await this.#ledger.claim({
            p_ledger_id: recorded.ledger_id,
            p_expected_revision: 0,
            p_lease_token_sha256: leaseTokenSha256,
            p_lease_duration_seconds: 60,
          }));
          claim = claimed[0]!;
        } catch {
          recorded = await this.#record(recordParameters);
          if (recorded.ledger_revision === 2) {
            await this.#escalate(recorded.ledger_id, signal, null);
            return this.#result("replayed", eventType);
          }
          if (recorded.ledger_revision === 1 && recorded.ledger_state === "processing") {
            return this.#result("processing", eventType);
          }
          throw new FlightConsumerPreviewStripeWebhookError();
        }
        if (
          claim.ledger_id !== recorded.ledger_id
          || claim.processing_lease_token_sha256 !== leaseTokenSha256
        ) throw new FlightConsumerPreviewStripeWebhookError();
      }
      await this.#escalate(recorded.ledger_id, signal, leaseTokenSha256);
      const outcome = isAdverseStripeEvent(eventType)
        ? "blocked" as const
        : recorded.decision === "duplicate" ? "duplicate" as const : "processed" as const;
      const outcomeSha256 = sha256FlightEvidence({
        version: "flight-consumer-preview-stripe-webhook-outcome-v1",
        eventType,
        semanticSha256: signal.semanticSha256,
        ledgerId: recorded.ledger_id,
        outcome,
        signalOnly: !isAdverseStripeEvent(eventType),
        operationalEscalationRequired: isAdverseStripeEvent(eventType),
        providerDispatchAuthorized: false,
      });
      const completed = completeResultSchema.safeParse(await this.#ledger.complete({
        p_ledger_id: recorded.ledger_id,
        p_expected_revision: 1,
        p_lease_token_sha256: leaseTokenSha256,
        p_outcome: outcome,
        p_outcome_sha256: outcomeSha256,
      }));
      if (
        !completed.success
        || completed.data[0]!.ledger_id !== recorded.ledger_id
        || completed.data[0]!.ledger_state !== outcome
      ) throw new FlightConsumerPreviewStripeWebhookError();
      return this.#result(
        isAdverseStripeEvent(eventType) ? "blocked" : "processed",
        eventType,
      );
    } catch (error) {
      if (error instanceof FlightConsumerPreviewStripeWebhookError) throw error;
      throw new FlightConsumerPreviewStripeWebhookError();
    }
  }
}

export function createInjectedFlightConsumerPreviewStripeWebhookWorkflow(
  binding: FlightConsumerPreviewStripeWebhookBinding,
  configuration: FlightConsumerPreviewStripeWebhookConfiguration,
  dependencies: FlightConsumerPreviewStripeWebhookDependencies,
): FlightConsumerPreviewStripeWebhookWorkflow {
  return Object.freeze(new StripeWebhookWorkflow(binding, configuration, dependencies));
}

export async function createFlightConsumerPreviewStripeWebhookWorkflow() {
  try {
    const runtime = await requireFlightConsumerPreviewRequestRuntime();
    const configuration = webhookConfigurationSchema.parse({
      stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
      previewWebhookSecret: process.env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET ?? "",
      genericWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      previewStripeAccountSha256:
        process.env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256 ?? "",
      previewStripeAccountId: process.env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID,
    });
    return createInjectedFlightConsumerPreviewStripeWebhookWorkflow({
      executionScopeSha256: runtime.binding.executionScopeSha256,
      paymentProcessorCode: runtime.binding.paymentProcessorCode,
      paymentEnvironment: runtime.binding.paymentEnvironment,
      paymentAccountSha256: runtime.binding.paymentAccountSha256,
      paymentSourceSha256: runtime.binding.paymentSourceSha256,
      paymentAdapterVersionSha256: runtime.binding.paymentAdapterVersionSha256,
    }, configuration, {
      stripe: Object.freeze(new StripeSdkWebhookPort()),
      ledger: createFlightConsumerPreviewStripeWebhookLedgerPort(),
      readTrustedTime: () => new Date().toISOString(),
    });
  } catch {
    throw new FlightConsumerPreviewStripeWebhookError();
  }
}
