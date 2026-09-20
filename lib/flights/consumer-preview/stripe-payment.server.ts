import "server-only";

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";

import { getStripe } from "../../stripe";
import {
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { readFlightConsumerPreviewStripeRestrictedKey } from "./stripe-credential.server";

export const FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY = "usd" as const;
export const FLIGHT_CONSUMER_PREVIEW_STRIPE_MAX_AMOUNT_CENTS = 99_999_999 as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const paymentIntentIdSchema = z.string().regex(/^pi_[A-Za-z0-9]{8,127}$/);
const refundIdSchema = z.string().regex(/^re_[A-Za-z0-9]{8,127}$/);
const clientSecretSchema = z.string().regex(/^pi_[A-Za-z0-9]{8,127}_secret_[A-Za-z0-9]{8,256}$/);
const amountSchema = z.number().int().min(50).max(FLIGHT_CONSUMER_PREVIEW_STRIPE_MAX_AMOUNT_CENTS);
const nonnegativeAmountSchema = z.number().int().min(0).max(FLIGHT_CONSUMER_PREVIEW_STRIPE_MAX_AMOUNT_CENTS);
const stripeTestSecretSchema = z.string().regex(/^rk_test_[A-Za-z0-9_]{8,}$/);

const paymentBindingSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  amountCents: amountSchema,
  executionScopeSha256: sha256Schema,
  paymentProcessorCode: z.literal("stripe"),
  paymentEnvironment: z.literal("test"),
  paymentAccountSha256: sha256Schema,
  paymentSourceSha256: sha256Schema,
  paymentAdapterVersionSha256: sha256Schema,
}).strict();

export type FlightConsumerPreviewStripePaymentBinding = z.infer<typeof paymentBindingSchema>;

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

type PaymentMetadata = z.infer<typeof paymentMetadataSchema>;

const paymentIntentStatusSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "canceled",
  "succeeded",
]);

const adapterChargeRefundSchema = z.object({
  id: refundIdSchema,
  object: z.literal("refund"),
  paymentIntentId: paymentIntentIdSchema.nullable(),
  amount: nonnegativeAmountSchema,
  currency: z.string().regex(/^[a-z]{3}$/),
  status: z.string().min(1).nullable(),
}).strict();

const adapterChargeSchema = z.object({
  id: z.string().regex(/^ch_[A-Za-z0-9]{8,127}$/),
  object: z.literal("charge"),
  paymentIntentId: paymentIntentIdSchema,
  livemode: z.literal(false),
  amount: amountSchema,
  amountCaptured: nonnegativeAmountSchema,
  amountRefunded: nonnegativeAmountSchema,
  currency: z.literal(FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY),
  captured: z.boolean(),
  paid: z.boolean(),
  refunded: z.boolean(),
  disputed: z.boolean(),
  status: z.literal("succeeded"),
  refunds: z.object({
    object: z.literal("list"),
    data: z.array(adapterChargeRefundSchema),
    hasMore: z.boolean(),
  }).strict(),
}).strict();

const adapterPaymentIntentSchema = z.object({
  id: paymentIntentIdSchema,
  object: z.literal("payment_intent"),
  livemode: z.literal(false),
  amount: amountSchema,
  amountCapturable: nonnegativeAmountSchema,
  amountReceived: nonnegativeAmountSchema,
  currency: z.literal(FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY),
  captureMethod: z.literal("manual"),
  confirmationMethod: z.literal("automatic"),
  paymentMethodTypes: z.tuple([z.literal("card")]),
  clientSecret: clientSecretSchema.nullable(),
  status: paymentIntentStatusSchema,
  metadata: paymentMetadataSchema,
  latestCharge: z.union([adapterChargeSchema, z.null()]),
}).strict();

const refundMetadataSchema = paymentMetadataSchema.extend({
  payment_intent_id: paymentIntentIdSchema,
  refund_idempotency_key_sha256: sha256Schema,
}).strict();

type RefundMetadata = z.infer<typeof refundMetadataSchema>;

const adapterRefundSchema = z.object({
  id: refundIdSchema,
  object: z.literal("refund"),
  paymentIntentId: paymentIntentIdSchema,
  amount: amountSchema,
  currency: z.literal(FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY),
  status: z.enum(["pending", "succeeded"]),
  metadata: refundMetadataSchema,
}).strict();

const attemptSchema = z.object({ attemptId: uuidSchema }).strict();
const paymentIntentReferenceSchema = z.object({ paymentIntentId: paymentIntentIdSchema }).strict();
const paymentIntentMutationSchema = paymentIntentReferenceSchema.extend({ attemptId: uuidSchema }).strict();

export type FlightConsumerStripeRequestOptions = Readonly<{ idempotencyKey: string }>;
export type FlightConsumerStripePaymentIntentCreateParameters = Readonly<{
  amount: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
  captureMethod: "manual";
  confirmationMethod: "automatic";
  paymentMethodTypes: readonly ["card"];
  metadata: PaymentMetadata;
}>;
export type FlightConsumerStripePaymentIntentRetrieveParameters = Readonly<{
  expand: readonly ["latest_charge"];
}>;
export type FlightConsumerStripePaymentIntentCaptureParameters = Readonly<{
  amountToCapture: number;
  expand: readonly ["latest_charge"];
}>;
export type FlightConsumerStripeRefundCreateParameters = Readonly<{
  paymentIntentId: string;
  amount: number;
  metadata: RefundMetadata;
}>;

/** Narrow Stripe port; it has no field through which raw card data can pass. */
export interface FlightConsumerPreviewStripeAdapter {
  createPaymentIntent(
    parameters: FlightConsumerStripePaymentIntentCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ): Promise<unknown>;
  retrievePaymentIntent(
    paymentIntentId: string,
    parameters: FlightConsumerStripePaymentIntentRetrieveParameters,
  ): Promise<unknown>;
  capturePaymentIntent(
    paymentIntentId: string,
    parameters: FlightConsumerStripePaymentIntentCaptureParameters,
    options: FlightConsumerStripeRequestOptions,
  ): Promise<unknown>;
  createRefund(
    parameters: FlightConsumerStripeRefundCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ): Promise<unknown>;
}

export type FlightConsumerPreviewStripePaymentDependencies = Readonly<{
  adapter: FlightConsumerPreviewStripeAdapter;
  stripeSecretKey: string;
}>;

export type FlightConsumerPreviewStripePaymentSnapshot = Readonly<{
  version: "flight-consumer-preview-stripe-payment-snapshot-v1";
  paymentIntentId: string;
  status: z.infer<typeof paymentIntentStatusSchema>;
  decision:
    | "awaiting_payment_method"
    | "awaiting_confirmation"
    | "action_required"
    | "processing"
    | "authorized"
    | "canceled"
    | "captured";
  amountCents: number;
  amountCapturableCents: number;
  amountReceivedCents: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
}>;

export type FlightConsumerPreviewStripeCaptureAttestationMismatchReason =
  | "payment_intent_mismatch"
  | "latest_charge_mismatch"
  | "refund_observed"
  | "dispute_observed"
  | "capture_state_mismatch";

export type FlightConsumerPreviewStripeCaptureAttestation =
  | Readonly<{
    version: "flight-consumer-preview-stripe-capture-attestation-v1";
    decision: "matched";
    evidenceSha256: string;
  }>
  | Readonly<{
    version: "flight-consumer-preview-stripe-capture-attestation-v1";
    decision: "mismatch";
    reason: FlightConsumerPreviewStripeCaptureAttestationMismatchReason;
    evidenceSha256: string;
  }>
  | Readonly<{
    version: "flight-consumer-preview-stripe-capture-attestation-v1";
    decision: "unavailable";
    reason: "provider_unavailable" | "projection_rejected";
    evidenceSha256: string;
  }>;

export type FlightConsumerPreviewStripeCreateResult = Readonly<{
  version: "flight-consumer-preview-stripe-create-v1";
  paymentIntentId: string;
  clientSecret: string;
  status: z.infer<typeof paymentIntentStatusSchema>;
  amountCents: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
  paymentIdempotencyKeySha256: string;
}>;

export type FlightConsumerPreviewStripeCheckoutRecoveryResult = Readonly<{
  version: "flight-consumer-preview-stripe-checkout-recovery-v1";
  paymentIntentId: string;
  clientSecret: string;
  status: z.infer<typeof paymentIntentStatusSchema>;
  amountCents: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
}>;

export type FlightConsumerPreviewStripeCaptureResult = Readonly<{
  version: "flight-consumer-preview-stripe-capture-v1";
  decision: "captured" | "already_captured";
  paymentIntentId: string;
  amountCapturedCents: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
  paymentIdempotencyKeySha256: string;
}>;

export type FlightConsumerPreviewStripeRefundResult = Readonly<{
  version: "flight-consumer-preview-stripe-refund-v1";
  decision: "refunded" | "refund_pending";
  refundId: string;
  paymentIntentId: string;
  amountRefundedCents: number;
  currency: typeof FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY;
  paymentIdempotencyKeySha256: string;
}>;

export interface FlightConsumerPreviewStripePayment {
  createPaymentIntent(input: Readonly<{ attemptId: string }>): Promise<FlightConsumerPreviewStripeCreateResult>;
  retrievePaymentIntentForCheckout(input: Readonly<{
    paymentIntentId: string;
  }>): Promise<FlightConsumerPreviewStripeCheckoutRecoveryResult>;
  retrievePaymentIntent(input: Readonly<{ paymentIntentId: string }>): Promise<FlightConsumerPreviewStripePaymentSnapshot>;
  attestCapturedPaymentIntent(input: Readonly<{
    paymentIntentId: string;
  }>): Promise<FlightConsumerPreviewStripeCaptureAttestation>;
  capturePaymentIntent(input: Readonly<{
    paymentIntentId: string;
    attemptId: string;
  }>): Promise<FlightConsumerPreviewStripeCaptureResult>;
  refundPaymentIntent(input: Readonly<{
    paymentIntentId: string;
    attemptId: string;
  }>): Promise<FlightConsumerPreviewStripeRefundResult>;
}

export class FlightConsumerPreviewStripePaymentError extends Error {
  readonly phase: string;
  readonly disposition: "ambiguous" | "definitive_failure";
  readonly httpStatus: number | null;

  constructor(
    phase = "unknown",
    disposition: "ambiguous" | "definitive_failure" = "ambiguous",
    httpStatus: number | null = null,
  ) {
    super("Flight Consumer Preview test payment is unavailable.");
    this.name = "FlightConsumerPreviewStripePaymentError";
    this.phase = phase;
    this.disposition = disposition;
    this.httpStatus = httpStatus;
  }
}

function stripeDefinitiveHttpStatus(error: unknown) {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return null;
  const status = error.statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 499
    ? status
    : null;
}

function paymentMetadata(binding: FlightConsumerPreviewStripePaymentBinding): PaymentMetadata {
  return Object.freeze({
    integration: "flight_consumer_preview_v1",
    execution_mode: "test",
    order_id: binding.orderId,
    customer_id: binding.customerId,
    execution_scope_sha256: binding.executionScopeSha256,
    payment_account_sha256: binding.paymentAccountSha256,
    payment_source_sha256: binding.paymentSourceSha256,
    payment_adapter_version_sha256: binding.paymentAdapterVersionSha256,
  });
}

function exactMetadata(left: PaymentMetadata, right: PaymentMetadata) {
  return left.integration === right.integration
    && left.execution_mode === right.execution_mode
    && left.order_id === right.order_id
    && left.customer_id === right.customer_id
    && left.execution_scope_sha256 === right.execution_scope_sha256
    && left.payment_account_sha256 === right.payment_account_sha256
    && left.payment_source_sha256 === right.payment_source_sha256
    && left.payment_adapter_version_sha256 === right.payment_adapter_version_sha256;
}

function referenceSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function captureAttestationEvidence(input: Readonly<{
  binding: FlightConsumerPreviewStripePaymentBinding;
  reason:
    | "matched"
    | FlightConsumerPreviewStripeCaptureAttestationMismatchReason
    | "provider_unavailable"
    | "projection_rejected";
  paymentIntentId: string | null;
  intent?: z.infer<typeof adapterPaymentIntentSchema>;
}>) {
  const intent = input.intent;
  return sha256FlightEvidence({
    version: "flight-consumer-preview-stripe-capture-attestation-evidence-v1",
    reason: input.reason,
    orderId: input.binding.orderId,
    customerId: input.binding.customerId,
    executionScopeSha256: input.binding.executionScopeSha256,
    paymentAccountSha256: input.binding.paymentAccountSha256,
    paymentSourceSha256: input.binding.paymentSourceSha256,
    paymentAdapterVersionSha256: input.binding.paymentAdapterVersionSha256,
    expectedAmountCents: input.binding.amountCents,
    paymentIntentReferenceSha256: input.paymentIntentId === null
      ? null
      : referenceSha256(input.paymentIntentId),
    observation: intent === undefined
      ? null
      : {
          paymentIntentReferenceSha256: referenceSha256(intent.id),
          status: intent.status,
          amountCents: intent.amount,
          amountCapturableCents: intent.amountCapturable,
          amountReceivedCents: intent.amountReceived,
          currency: intent.currency,
          captureMethod: intent.captureMethod,
          confirmationMethod: intent.confirmationMethod,
          paymentMethodTypes: intent.paymentMethodTypes,
          metadataSha256: sha256FlightEvidence({
            version: "flight-consumer-preview-stripe-metadata-evidence-v1",
            ...intent.metadata,
          }),
          latestCharge: intent.latestCharge === null
            ? null
            : {
                chargeReferenceSha256: referenceSha256(intent.latestCharge.id),
                paymentIntentReferenceSha256:
                  referenceSha256(intent.latestCharge.paymentIntentId),
                livemode: intent.latestCharge.livemode,
                amountCents: intent.latestCharge.amount,
                amountCapturedCents: intent.latestCharge.amountCaptured,
                amountRefundedCents: intent.latestCharge.amountRefunded,
                currency: intent.latestCharge.currency,
                captured: intent.latestCharge.captured,
                paid: intent.latestCharge.paid,
                refunded: intent.latestCharge.refunded,
                disputed: intent.latestCharge.disputed,
                status: intent.latestCharge.status,
                refundsHasMore: intent.latestCharge.refunds.hasMore,
                refunds: intent.latestCharge.refunds.data.map((refund) => ({
                  refundReferenceSha256: referenceSha256(refund.id),
                  paymentIntentReferenceSha256: refund.paymentIntentId === null
                    ? null
                    : referenceSha256(refund.paymentIntentId),
                  amountCents: refund.amount,
                  currency: refund.currency,
                  status: refund.status,
                })),
              },
        },
  } as FlightCanonicalJsonValue);
}

function capturedAttestationMismatchReason(
  intent: z.infer<typeof adapterPaymentIntentSchema>,
  paymentIntentId: string,
  binding: FlightConsumerPreviewStripePaymentBinding,
  metadata: PaymentMetadata,
): FlightConsumerPreviewStripeCaptureAttestationMismatchReason | null {
  if (
    intent.id !== paymentIntentId
    || intent.amount !== binding.amountCents
    || intent.currency !== FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY
    || intent.captureMethod !== "manual"
    || intent.confirmationMethod !== "automatic"
    || intent.paymentMethodTypes.length !== 1
    || intent.paymentMethodTypes[0] !== "card"
    || !exactMetadata(intent.metadata, metadata)
  ) return "payment_intent_mismatch";
  const charge = intent.latestCharge;
  if (
    charge === null
    || charge.paymentIntentId !== intent.id
    || charge.livemode
    || charge.amount !== binding.amountCents
    || charge.currency !== FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY
    || charge.status !== "succeeded"
  ) return "latest_charge_mismatch";
  if (
    charge.amountRefunded > 0
    || charge.refunded
    || charge.refunds.hasMore
    || charge.refunds.data.length > 0
  ) return "refund_observed";
  if (charge.disputed) return "dispute_observed";
  if (
    intent.status !== "succeeded"
    || intent.amountCapturable !== 0
    || intent.amountReceived !== binding.amountCents
    || !charge.captured
    || !charge.paid
    || charge.amountCaptured !== binding.amountCents
  ) return "capture_state_mismatch";
  return null;
}

function buildIdempotency(
  binding: FlightConsumerPreviewStripePaymentBinding,
  operation: "create" | "capture" | "refund",
  attemptId: string,
) {
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-stripe-idempotency-v1",
    operation,
    attemptId,
    orderId: binding.orderId,
    customerId: binding.customerId,
    amountCents: binding.amountCents,
    currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
    executionScopeSha256: binding.executionScopeSha256,
    paymentAccountSha256: binding.paymentAccountSha256,
    paymentSourceSha256: binding.paymentSourceSha256,
    paymentAdapterVersionSha256: binding.paymentAdapterVersionSha256,
  } as FlightCanonicalJsonValue);
  const idempotencyKey = `irp_fcp_stripe_${operation}_v1_${requestSha256}`;
  return Object.freeze({
    idempotencyKey,
    paymentIdempotencyKeySha256: createHash("sha256").update(idempotencyKey, "utf8").digest("hex"),
  });
}

function paymentDecision(status: z.infer<typeof paymentIntentStatusSchema>): FlightConsumerPreviewStripePaymentSnapshot["decision"] {
  if (status === "requires_payment_method") return "awaiting_payment_method";
  if (status === "requires_confirmation") return "awaiting_confirmation";
  if (status === "requires_action") return "action_required";
  if (status === "processing") return "processing";
  if (status === "requires_capture") return "authorized";
  if (status === "canceled") return "canceled";
  return "captured";
}

const latestChargeExpansion = Object.freeze(["latest_charge"] as const);
const refundAttestationListLimit = 100 as const;

function expandedReferenceId(value: string | Readonly<{ id: string }> | null | undefined) {
  if (typeof value === "string" || value === null || value === undefined) return value;
  return value.id;
}

function projectChargeRefund(refund: Stripe.Refund) {
  return {
    id: refund.id,
    object: refund.object,
    paymentIntentId: expandedReferenceId(refund.payment_intent),
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
  };
}

function projectChargeRefunds(refunds: Stripe.ApiList<Stripe.Refund>) {
  return {
    object: refunds.object,
    data: refunds.data.map(projectChargeRefund),
    hasMore: refunds.has_more,
  };
}

function projectLatestCharge(
  charge: Stripe.PaymentIntent["latest_charge"],
  authoritativeRefunds?: Stripe.ApiList<Stripe.Refund>,
) {
  if (typeof charge === "string" || charge === null) return charge;
  return {
    id: charge.id,
    object: charge.object,
    paymentIntentId: expandedReferenceId(charge.payment_intent),
    livemode: charge.livemode,
    amount: charge.amount,
    amountCaptured: charge.amount_captured,
    amountRefunded: charge.amount_refunded,
    currency: charge.currency,
    captured: charge.captured,
    paid: charge.paid,
    refunded: charge.refunded,
    disputed: charge.disputed,
    status: charge.status,
    refunds: authoritativeRefunds === undefined
      ? charge.refunds === null || charge.refunds === undefined
        ? charge.refunds
        : projectChargeRefunds(charge.refunds)
      : projectChargeRefunds(authoritativeRefunds),
  };
}

function projectPaymentIntent(
  intent: Stripe.PaymentIntent,
  authoritativeRefunds?: Stripe.ApiList<Stripe.Refund>,
) {
  return {
    id: intent.id,
    object: intent.object,
    livemode: intent.livemode,
    amount: intent.amount,
    amountCapturable: intent.amount_capturable,
    amountReceived: intent.amount_received,
    currency: intent.currency,
    captureMethod: intent.capture_method,
    confirmationMethod: intent.confirmation_method,
    paymentMethodTypes: [...intent.payment_method_types],
    clientSecret: intent.client_secret,
    status: intent.status,
    metadata: { ...intent.metadata },
    latestCharge: projectLatestCharge(intent.latest_charge, authoritativeRefunds),
  };
}

function projectRefund(refund: Stripe.Refund) {
  const paymentIntentId = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : refund.payment_intent?.id;
  return {
    id: refund.id,
    object: refund.object,
    paymentIntentId,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    metadata: { ...refund.metadata },
  };
}

class StripeSdkFlightConsumerPreviewAdapter implements FlightConsumerPreviewStripeAdapter {
  readonly #stripe: ReturnType<typeof getStripe>;

  constructor(restrictedTestKey: string) {
    this.#stripe = getStripe(restrictedTestKey);
  }

  async createPaymentIntent(
    parameters: FlightConsumerStripePaymentIntentCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    return projectPaymentIntent(await this.#stripe.paymentIntents.create({
      amount: parameters.amount,
      currency: parameters.currency,
      capture_method: parameters.captureMethod,
      confirmation_method: parameters.confirmationMethod,
      payment_method_types: [...parameters.paymentMethodTypes],
      metadata: parameters.metadata,
    }, options));
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
    parameters: FlightConsumerStripePaymentIntentRetrieveParameters,
  ) {
    const intent = await this.#stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: [...parameters.expand],
    });
    const refunds = await this.#stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: refundAttestationListLimit,
    });
    return projectPaymentIntent(intent, refunds);
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    parameters: FlightConsumerStripePaymentIntentCaptureParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    const intent = await this.#stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: parameters.amountToCapture,
      expand: [...parameters.expand],
    }, options);
    const refunds = await this.#stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: refundAttestationListLimit,
    });
    return projectPaymentIntent(intent, refunds);
  }

  async createRefund(
    parameters: FlightConsumerStripeRefundCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    return projectRefund(await this.#stripe.refunds.create({
      payment_intent: parameters.paymentIntentId,
      amount: parameters.amount,
      metadata: parameters.metadata,
    }, options));
  }
}

class BoundFlightConsumerPreviewStripePayment implements FlightConsumerPreviewStripePayment {
  readonly #binding: FlightConsumerPreviewStripePaymentBinding;
  readonly #adapter: FlightConsumerPreviewStripeAdapter;
  readonly #metadata: PaymentMetadata;

  constructor(
    untrustedBinding: FlightConsumerPreviewStripePaymentBinding,
    dependencies: FlightConsumerPreviewStripePaymentDependencies,
  ) {
    try {
      this.#binding = Object.freeze(paymentBindingSchema.parse(structuredClone(untrustedBinding)));
      if (
        !stripeTestSecretSchema.safeParse(dependencies.stripeSecretKey).success
        || typeof dependencies.adapter?.createPaymentIntent !== "function"
        || typeof dependencies.adapter?.retrievePaymentIntent !== "function"
        || typeof dependencies.adapter?.capturePaymentIntent !== "function"
        || typeof dependencies.adapter?.createRefund !== "function"
      ) throw new FlightConsumerPreviewStripePaymentError();
      this.#adapter = dependencies.adapter;
      this.#metadata = paymentMetadata(this.#binding);
    } catch {
      throw new FlightConsumerPreviewStripePaymentError();
    }
  }

  #verifyPaymentIntent(value: unknown) {
    const parsed = adapterPaymentIntentSchema.safeParse(value);
    if (
      !parsed.success
      || parsed.data.amount !== this.#binding.amountCents
      || parsed.data.amountCapturable > this.#binding.amountCents
      || parsed.data.amountReceived > this.#binding.amountCents
      || !exactMetadata(parsed.data.metadata, this.#metadata)
      || (parsed.data.latestCharge !== null && (
        parsed.data.latestCharge.paymentIntentId !== parsed.data.id
        || parsed.data.latestCharge.amount !== this.#binding.amountCents
        || parsed.data.latestCharge.currency !== parsed.data.currency
        || parsed.data.latestCharge.amountCaptured > this.#binding.amountCents
        || parsed.data.latestCharge.amountRefunded > 0
        || parsed.data.latestCharge.refunded
        || parsed.data.latestCharge.disputed
        || parsed.data.latestCharge.refunds.hasMore
        || parsed.data.latestCharge.refunds.data.length > 0
      ))
      || (parsed.data.status === "requires_capture"
        && (
          parsed.data.amountCapturable !== this.#binding.amountCents
          || parsed.data.amountReceived !== 0
          || parsed.data.latestCharge === null
          || parsed.data.latestCharge.captured
          || !parsed.data.latestCharge.paid
          || parsed.data.latestCharge.amountCaptured !== 0
        ))
      || (parsed.data.status === "succeeded"
        && (
          parsed.data.amountCapturable !== 0
          || parsed.data.amountReceived !== this.#binding.amountCents
          || parsed.data.latestCharge === null
          || !parsed.data.latestCharge.captured
          || !parsed.data.latestCharge.paid
          || parsed.data.latestCharge.amountCaptured !== this.#binding.amountCents
        ))
      || (!["requires_capture", "succeeded"].includes(parsed.data.status)
        && (parsed.data.amountCapturable !== 0 || parsed.data.amountReceived !== 0))
    ) throw new FlightConsumerPreviewStripePaymentError();
    return parsed.data;
  }

  async #retrieve(paymentIntentId: string) {
    return this.#verifyPaymentIntent(await this.#adapter.retrievePaymentIntent(
      paymentIntentId,
      Object.freeze({ expand: latestChargeExpansion }),
    ));
  }

  async createPaymentIntent(untrustedInput: Readonly<{ attemptId: string }>) {
    let phase = "validate_create_input";
    try {
      const input = attemptSchema.parse(structuredClone(untrustedInput));
      phase = "build_create_idempotency";
      const idempotency = buildIdempotency(this.#binding, "create", input.attemptId);
      phase = "dispatch_create_request";
      const rawIntent = await this.#adapter.createPaymentIntent(Object.freeze({
        amount: this.#binding.amountCents,
        currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
        captureMethod: "manual",
        confirmationMethod: "automatic",
        paymentMethodTypes: Object.freeze(["card"] as const),
        metadata: this.#metadata,
      }), { idempotencyKey: idempotency.idempotencyKey });
      phase = "validate_create_response";
      const intent = this.#verifyPaymentIntent(rawIntent);
      if (intent.clientSecret === null || intent.status === "canceled") {
        throw new FlightConsumerPreviewStripePaymentError(phase);
      }
      return Object.freeze({
        version: "flight-consumer-preview-stripe-create-v1" as const,
        paymentIntentId: intent.id,
        clientSecret: intent.clientSecret,
        status: intent.status,
        amountCents: intent.amount,
        currency: intent.currency,
        paymentIdempotencyKeySha256: idempotency.paymentIdempotencyKeySha256,
      });
    } catch (error) {
      throw new FlightConsumerPreviewStripePaymentError(
        error instanceof FlightConsumerPreviewStripePaymentError ? error.phase : phase,
      );
    }
  }

  async retrievePaymentIntent(untrustedInput: Readonly<{ paymentIntentId: string }>) {
    try {
      const input = paymentIntentReferenceSchema.parse(structuredClone(untrustedInput));
      const intent = await this.#retrieve(input.paymentIntentId);
      if (intent.id !== input.paymentIntentId) throw new FlightConsumerPreviewStripePaymentError();
      return Object.freeze({
        version: "flight-consumer-preview-stripe-payment-snapshot-v1" as const,
        paymentIntentId: intent.id,
        status: intent.status,
        decision: paymentDecision(intent.status),
        amountCents: intent.amount,
        amountCapturableCents: intent.amountCapturable,
        amountReceivedCents: intent.amountReceived,
        currency: intent.currency,
      });
    } catch {
      throw new FlightConsumerPreviewStripePaymentError();
    }
  }

  async attestCapturedPaymentIntent(untrustedInput: Readonly<{ paymentIntentId: string }>) {
    const input = paymentIntentReferenceSchema.safeParse(structuredClone(untrustedInput));
    if (!input.success) {
      return Object.freeze({
        version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
        decision: "unavailable" as const,
        reason: "projection_rejected" as const,
        evidenceSha256: captureAttestationEvidence({
          binding: this.#binding,
          reason: "projection_rejected",
          paymentIntentId: null,
        }),
      });
    }
    let rawIntent: unknown;
    try {
      rawIntent = await this.#adapter.retrievePaymentIntent(
        input.data.paymentIntentId,
        Object.freeze({ expand: latestChargeExpansion }),
      );
    } catch {
      return Object.freeze({
        version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
        decision: "unavailable" as const,
        reason: "provider_unavailable" as const,
        evidenceSha256: captureAttestationEvidence({
          binding: this.#binding,
          reason: "provider_unavailable",
          paymentIntentId: input.data.paymentIntentId,
        }),
      });
    }
    const parsed = adapterPaymentIntentSchema.safeParse(rawIntent);
    if (!parsed.success) {
      return Object.freeze({
        version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
        decision: "unavailable" as const,
        reason: "projection_rejected" as const,
        evidenceSha256: captureAttestationEvidence({
          binding: this.#binding,
          reason: "projection_rejected",
          paymentIntentId: input.data.paymentIntentId,
        }),
      });
    }
    const mismatch = capturedAttestationMismatchReason(
      parsed.data,
      input.data.paymentIntentId,
      this.#binding,
      this.#metadata,
    );
    if (mismatch !== null) {
      return Object.freeze({
        version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
        decision: "mismatch" as const,
        reason: mismatch,
        evidenceSha256: captureAttestationEvidence({
          binding: this.#binding,
          reason: mismatch,
          paymentIntentId: input.data.paymentIntentId,
          intent: parsed.data,
        }),
      });
    }
    return Object.freeze({
      version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
      decision: "matched" as const,
      evidenceSha256: captureAttestationEvidence({
        binding: this.#binding,
        reason: "matched",
        paymentIntentId: input.data.paymentIntentId,
        intent: parsed.data,
      }),
    });
  }

  async retrievePaymentIntentForCheckout(untrustedInput: Readonly<{ paymentIntentId: string }>) {
    try {
      const input = paymentIntentReferenceSchema.parse(structuredClone(untrustedInput));
      const intent = await this.#retrieve(input.paymentIntentId);
      if (
        intent.id !== input.paymentIntentId
        || intent.clientSecret === null
        || intent.status === "canceled"
      ) throw new FlightConsumerPreviewStripePaymentError();
      return Object.freeze({
        version: "flight-consumer-preview-stripe-checkout-recovery-v1" as const,
        paymentIntentId: intent.id,
        clientSecret: intent.clientSecret,
        status: intent.status,
        amountCents: intent.amount,
        currency: intent.currency,
      });
    } catch {
      throw new FlightConsumerPreviewStripePaymentError();
    }
  }

  async capturePaymentIntent(untrustedInput: Readonly<{ paymentIntentId: string; attemptId: string }>) {
    let phase = "validate_capture_input";
    try {
      const input = paymentIntentMutationSchema.parse(structuredClone(untrustedInput));
      phase = "build_capture_idempotency";
      const idempotency = buildIdempotency(this.#binding, "capture", input.attemptId);
      phase = "retrieve_before_capture";
      const current = await this.#retrieve(input.paymentIntentId);
      if (current.id !== input.paymentIntentId) throw new FlightConsumerPreviewStripePaymentError();
      if (current.status === "succeeded") {
        return Object.freeze({
          version: "flight-consumer-preview-stripe-capture-v1" as const,
          decision: "already_captured" as const,
          paymentIntentId: current.id,
          amountCapturedCents: current.amountReceived,
          currency: current.currency,
          paymentIdempotencyKeySha256: idempotency.paymentIdempotencyKeySha256,
        });
      }
      if (current.status !== "requires_capture") throw new FlightConsumerPreviewStripePaymentError();
      phase = "dispatch_capture_request";
      const rawCaptured = await this.#adapter.capturePaymentIntent(
        current.id,
        Object.freeze({
          amountToCapture: this.#binding.amountCents,
          expand: latestChargeExpansion,
        }),
        { idempotencyKey: idempotency.idempotencyKey },
      );
      phase = "validate_capture_response";
      const captured = this.#verifyPaymentIntent(rawCaptured);
      if (
        captured.id !== current.id
        || captured.status !== "succeeded"
        || current.latestCharge === null
        || captured.latestCharge === null
        || captured.latestCharge.id !== current.latestCharge.id
      ) {
        throw new FlightConsumerPreviewStripePaymentError();
      }
      return Object.freeze({
        version: "flight-consumer-preview-stripe-capture-v1" as const,
        decision: "captured" as const,
        paymentIntentId: captured.id,
        amountCapturedCents: captured.amountReceived,
        currency: captured.currency,
        paymentIdempotencyKeySha256: idempotency.paymentIdempotencyKeySha256,
      });
    } catch (error) {
      const httpStatus = phase === "dispatch_capture_request"
        ? stripeDefinitiveHttpStatus(error)
        : null;
      throw new FlightConsumerPreviewStripePaymentError(
        error instanceof FlightConsumerPreviewStripePaymentError ? error.phase : phase,
        httpStatus === null ? "ambiguous" : "definitive_failure",
        httpStatus,
      );
    }
  }

  async refundPaymentIntent(untrustedInput: Readonly<{ paymentIntentId: string; attemptId: string }>) {
    try {
      const input = paymentIntentMutationSchema.parse(structuredClone(untrustedInput));
      const idempotency = buildIdempotency(this.#binding, "refund", input.attemptId);
      const current = await this.#retrieve(input.paymentIntentId);
      if (current.id !== input.paymentIntentId || current.status !== "succeeded") {
        throw new FlightConsumerPreviewStripePaymentError();
      }
      const refundMetadata = Object.freeze({
        ...this.#metadata,
        payment_intent_id: current.id,
        refund_idempotency_key_sha256: idempotency.paymentIdempotencyKeySha256,
      });
      const parsed = adapterRefundSchema.safeParse(await this.#adapter.createRefund(Object.freeze({
        paymentIntentId: current.id,
        amount: this.#binding.amountCents,
        metadata: refundMetadata,
      }), { idempotencyKey: idempotency.idempotencyKey }));
      if (
        !parsed.success
        || parsed.data.paymentIntentId !== current.id
        || parsed.data.amount !== this.#binding.amountCents
        || !exactMetadata(parsed.data.metadata, this.#metadata)
        || parsed.data.metadata.payment_intent_id !== current.id
        || parsed.data.metadata.refund_idempotency_key_sha256
          !== idempotency.paymentIdempotencyKeySha256
      ) throw new FlightConsumerPreviewStripePaymentError();
      return Object.freeze({
        version: "flight-consumer-preview-stripe-refund-v1" as const,
        decision: parsed.data.status === "succeeded" ? "refunded" as const : "refund_pending" as const,
        refundId: parsed.data.id,
        paymentIntentId: current.id,
        amountRefundedCents: parsed.data.amount,
        currency: parsed.data.currency,
        paymentIdempotencyKeySha256: idempotency.paymentIdempotencyKeySha256,
      });
    } catch {
      throw new FlightConsumerPreviewStripePaymentError();
    }
  }
}

export function createInjectedFlightConsumerPreviewStripePayment(
  binding: FlightConsumerPreviewStripePaymentBinding,
  dependencies: FlightConsumerPreviewStripePaymentDependencies,
): FlightConsumerPreviewStripePayment {
  return Object.freeze(new BoundFlightConsumerPreviewStripePayment(binding, dependencies));
}

export async function createFlightConsumerPreviewStripePayment(input: Readonly<{
  orderId: string;
  customerId: string;
  amountCents: number;
  runtimeBinding: Readonly<{
    executionScopeSha256: string;
    paymentProcessorCode: "stripe";
    paymentEnvironment: "test";
    paymentAccountSha256: string;
    paymentSourceSha256: string;
    paymentAdapterVersionSha256: string;
  }>;
}>): Promise<FlightConsumerPreviewStripePayment> {
  let phase = "validate_adapter_binding";
  try {
    const restrictedTestKey = readFlightConsumerPreviewStripeRestrictedKey();
    const identity = z.object({
      orderId: uuidSchema,
      customerId: uuidSchema,
      amountCents: amountSchema,
      runtimeBinding: paymentBindingSchema.pick({
        executionScopeSha256: true,
        paymentProcessorCode: true,
        paymentEnvironment: true,
        paymentAccountSha256: true,
        paymentSourceSha256: true,
        paymentAdapterVersionSha256: true,
      }),
    }).strict().parse(structuredClone({
      orderId: input.orderId,
      customerId: input.customerId,
      amountCents: input.amountCents,
      runtimeBinding: {
        executionScopeSha256: input.runtimeBinding.executionScopeSha256,
        paymentProcessorCode: input.runtimeBinding.paymentProcessorCode,
        paymentEnvironment: input.runtimeBinding.paymentEnvironment,
        paymentAccountSha256: input.runtimeBinding.paymentAccountSha256,
        paymentSourceSha256: input.runtimeBinding.paymentSourceSha256,
        paymentAdapterVersionSha256: input.runtimeBinding.paymentAdapterVersionSha256,
      },
    }));
    phase = "initialize_stripe_adapter";
    return createInjectedFlightConsumerPreviewStripePayment({
      orderId: identity.orderId,
      customerId: identity.customerId,
      amountCents: identity.amountCents,
      ...identity.runtimeBinding,
    }, {
      adapter: Object.freeze(new StripeSdkFlightConsumerPreviewAdapter(
        restrictedTestKey,
      )),
      stripeSecretKey: restrictedTestKey,
    });
  } catch (error) {
    throw new FlightConsumerPreviewStripePaymentError(
      error instanceof FlightConsumerPreviewStripePaymentError ? error.phase : phase,
    );
  }
}
