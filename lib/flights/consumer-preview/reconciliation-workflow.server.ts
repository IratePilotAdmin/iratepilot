import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { createFlightConsumerPreviewAuthority } from "./authority.server";
import {
  decryptFlightConsumerPreviewReference,
  readFlightConsumerPreviewReferenceKeyring,
  type FlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";
import type { FlightConsumerPreviewRuntimeBinding } from "./runtime.server";
import {
  createFlightConsumerPreviewStripePayment,
  type FlightConsumerPreviewStripePayment,
} from "./stripe-payment.server";
import {
  encryptFlightConsumerPreviewStripeRefundReference,
  readFlightConsumerPreviewStripeRefundReferenceKeyring,
  type FlightConsumerPreviewStripeRefundReferenceKeyring,
} from "./stripe-refund-reference.server";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const encryptedReferenceSchema = z.string().regex(/^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/);
const positiveAmountSchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/),
]).transform(Number).refine(Number.isSafeInteger);
const nonnegativeAmountSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
]).transform(Number).refine(Number.isSafeInteger);
const instantSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const STRIPE_REFUND_DISPATCH_RECOVERY_GRACE_MS = 10 * 60_000;

const inputSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  idempotencyKey: z.string().min(16).max(200).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

const runtimeBindingSchema = z.object({
  providerCode: z.literal("duffel"),
  paymentProcessorCode: z.literal("stripe"),
  paymentEnvironment: z.literal("test"),
  paymentAccountSha256: sha256Schema,
  paymentSourceSha256: sha256Schema,
  paymentAdapterVersionSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  runtimeControlReceiptSha256: sha256Schema,
  referenceKeyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
}).passthrough();

const orderSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  provider_code: z.literal("duffel"),
  consumer_flow_version: z.literal(1),
  currency: z.literal("USD"),
  total_cents: positiveAmountSchema,
  status: z.enum(["requires_review", "failed"]),
  provider_order_ref_sha256: sha256Schema.nullable(),
}).strict();

const paymentSchema = z.object({
  id: uuidSchema,
  order_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  processor_code: z.literal("stripe"),
  processor_reference_ciphertext: encryptedReferenceSchema,
  processor_reference_sha256: sha256Schema,
  currency: z.literal("USD"),
  authorized_cents: nonnegativeAmountSchema,
  captured_cents: nonnegativeAmountSchema,
  refunded_cents: nonnegativeAmountSchema,
  status: z.enum([
    "requires_payment_method",
    "requires_action",
    "authorized",
    "captured",
    "refund_pending",
    "partially_refunded",
    "refunded",
    "cancelled",
    "failed",
    "ambiguous",
  ]),
}).strict();

const providerAttemptSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  order_id: uuidSchema,
  provider_code: z.literal("duffel"),
  operation: z.literal("create_order"),
  consumer_flow_version: z.literal(1),
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  retry_authorized: z.literal(false),
  state: z.enum(["failed", "ambiguous", "succeeded", "blocked", "prepared", "dispatching"]),
  revision: z.number().int().min(0).max(2),
}).strict();

const resolutionSchema = z.object({
  id: uuidSchema,
  order_id: uuidSchema,
  provider_code: z.literal("duffel"),
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  case_type: z.literal("ambiguous_order"),
  subject_type: z.literal("flight_order"),
  subject_id: uuidSchema,
  source_status: z.literal("requires_review"),
  target_status: z.literal("failed"),
  status: z.literal("resolved"),
  resolution_code: z.enum([
    "duplicate_suppressed",
    "payment_reversed",
    "provider_state_confirmed",
    "manual_followup_required",
  ]),
  resolution_evidence_sha256: sha256Schema,
}).strict();

const paymentAttemptStateSchema = z.enum([
  "prepared",
  "dispatching",
  "succeeded",
  "failed",
  "ambiguous",
  "blocked",
]);

const refundAttemptSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  order_id: uuidSchema,
  payment_id: uuidSchema,
  operation: z.literal("refund"),
  processor_code: z.literal("stripe"),
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  processor_account_sha256: sha256Schema,
  processor_environment: z.literal("test"),
  processor_source_sha256: sha256Schema,
  processor_adapter_version_sha256: sha256Schema,
  payment_binding_receipt_sha256: sha256Schema,
  adapter_source_sha256: sha256Schema,
  operation_authority_receipt_sha256: sha256Schema,
  idempotency_key_sha256: sha256Schema,
  idempotency_request_sha256: sha256Schema,
  request_plan_sha256: sha256Schema,
  request_sha256: sha256Schema,
  request_body_sha256: sha256Schema,
  amount_cents: positiveAmountSchema,
  currency: z.literal("USD"),
  dispatch_not_after: instantSchema,
  state: paymentAttemptStateSchema,
  revision: z.number().int().min(0).max(2),
  terminal_http_status: z.number().int().min(100).max(599).nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  terminal_response_bytes: nonnegativeAmountSchema.nullable(),
  terminal_receipt_sha256: sha256Schema.nullable(),
}).strict();

const refundEvidenceSchema = z.object({
  attempt_id: uuidSchema,
  order_id: uuidSchema,
  payment_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  refund_reference_sha256: sha256Schema,
  refunded_cents: positiveAmountSchema,
  terminal_receipt_sha256: sha256Schema,
}).strict();

const contextSchema = z.object({
  order: orderSchema,
  payment: paymentSchema.nullable(),
  providerAttempt: providerAttemptSchema.nullable(),
  safeResolution: resolutionSchema.nullable(),
  refundAttempt: refundAttemptSchema.nullable(),
  refundEvidence: refundEvidenceSchema.nullable(),
  ticketCount: z.number().int().nonnegative(),
}).strict();

const reconciliationContextRpcResultSchema = z.array(z.object({
  context: contextSchema,
}).strict()).max(1);

type ReconciliationContext = z.infer<typeof contextSchema>;
type RefundAttempt = z.infer<typeof refundAttemptSchema>;
type ExpectedRefundClaims = Readonly<{
  keySha256: string;
  requestSha256: string;
  paymentBindingReceiptSha256: string;
  operationAuthorityReceiptSha256: string;
}>;

const prepareResultSchema = z.array(z.object({
  decision: z.enum(["prepared", "replay"]),
  attempt_id: uuidSchema,
  attempt_revision: z.number().int().min(0).max(2),
  attempt_state: paymentAttemptStateSchema,
}).strict()).length(1);

const claimResultSchema = z.array(z.object({
  attempt_id: uuidSchema,
  attempt_revision: z.literal(1),
  attempt_state: z.literal("dispatching"),
}).strict()).length(1);

const completionResultSchema = z.array(z.object({
  attempt_id: uuidSchema,
  attempt_revision: z.literal(2),
  attempt_state: z.enum(["succeeded", "failed", "ambiguous"]),
}).strict()).length(1);

const applyResultSchema = z.array(z.object({
  order_id: uuidSchema,
  order_status: z.literal("failed"),
  payment_id: uuidSchema,
  payment_status: z.literal("refunded"),
}).strict()).length(1);

export type FlightConsumerPreviewReconciliationInput = z.infer<typeof inputSchema>;

export type FlightConsumerPreviewReconciliationResult =
  | Readonly<{
    decision: "refunded" | "already_refunded";
    orderId: string;
    paymentId: string;
    refundAttemptId: string;
  }>
  | Readonly<{
    decision: "no_refund_required";
    orderId: string;
    paymentId: string | null;
  }>
  | Readonly<{
    decision: "manual_review_required";
    orderId: string;
    reason: "provider_outcome_unresolved" | "payment_outcome_unresolved" | "refund_operation_unresolved";
  }>;

export type FlightConsumerRefundPrepareParameters = Readonly<{
  p_order_id: string;
  p_payment_id: string;
  p_key_sha256: string;
  p_request_sha256: string;
  p_adapter_source_sha256: string;
  p_payment_binding_receipt_sha256: string;
  p_operation_authority_receipt_sha256: string;
  p_dispatch_not_after: string;
}>;

export type FlightConsumerPaymentOperationClaimParameters = Readonly<{
  p_attempt_id: string;
  p_expected_revision: number;
  p_payment_binding_receipt_sha256: string;
  p_operation_authority_receipt_sha256: string;
}>;

export type FlightConsumerPaymentOperationCompleteParameters = Readonly<{
  p_attempt_id: string;
  p_expected_revision: number;
  p_terminal_state: "succeeded" | "failed" | "ambiguous";
  p_terminal_http_status: number | null;
  p_terminal_response_sha256: string | null;
  p_terminal_response_bytes: number | null;
  p_terminal_receipt_sha256: string;
}>;

export type FlightConsumerRefundApplyParameters = Readonly<{
  p_attempt_id: string;
  p_expected_terminal_revision: 2;
  p_payment_id: string;
  p_refund_reference_ciphertext: string;
  p_refund_reference_sha256: string;
  p_refunded_cents: number;
}>;

export interface FlightConsumerPreviewReconciliationStore {
  loadContext(input: Readonly<{
    customerId: string;
    orderId: string;
    executionScopeSha256: string;
  }>): Promise<unknown>;
  prepareRefund(parameters: FlightConsumerRefundPrepareParameters): Promise<unknown>;
  claimPaymentOperation(parameters: FlightConsumerPaymentOperationClaimParameters): Promise<unknown>;
  completePaymentOperation(parameters: FlightConsumerPaymentOperationCompleteParameters): Promise<unknown>;
  applyRefund(parameters: FlightConsumerRefundApplyParameters): Promise<unknown>;
}

export interface FlightConsumerPreviewReconciliationRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface FlightConsumerPreviewReconciliationAuthority {
  paymentBindingReceipt(input: Readonly<{
    customerId: string;
    orderId: string;
    paymentId: string;
    processorReferenceSha256: string;
    amountCents: number;
    currency: string;
  }>): string;
  operationReceipt(label: string, value: unknown): string;
}

export type FlightConsumerPreviewReconciliationDependencies = Readonly<{
  store: FlightConsumerPreviewReconciliationStore;
  runtimeBinding: FlightConsumerPreviewRuntimeBinding;
  authority: FlightConsumerPreviewReconciliationAuthority;
  paymentReferenceKeyring: FlightConsumerPreviewReferenceKeyring;
  refundReferenceKeyring: FlightConsumerPreviewStripeRefundReferenceKeyring;
  createStripePayment: (input: Readonly<{
    orderId: string;
    customerId: string;
    amountCents: number;
    runtimeBinding: Readonly<Pick<
      FlightConsumerPreviewRuntimeBinding,
      | "executionScopeSha256"
      | "paymentProcessorCode"
      | "paymentEnvironment"
      | "paymentAccountSha256"
      | "paymentSourceSha256"
      | "paymentAdapterVersionSha256"
    >>;
  }>) => Promise<FlightConsumerPreviewStripePayment>;
  readTrustedTime: () => string;
}>;

export interface FlightConsumerPreviewReconciliationWorkflow {
  reconcile(
    input: FlightConsumerPreviewReconciliationInput,
  ): Promise<FlightConsumerPreviewReconciliationResult>;
}

export class FlightConsumerPreviewReconciliationError extends Error {
  constructor() {
    super("Flight Consumer Preview reconciliation is unavailable.");
    this.name = "FlightConsumerPreviewReconciliationError";
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewReconciliationError();
  return parsed.data;
}

function sameAttemptBinding(
  attempt: RefundAttempt,
  context: ReconciliationContext,
  expected: Readonly<{
    keySha256: string;
    requestSha256: string;
    paymentBindingReceiptSha256: string;
    operationAuthorityReceiptSha256: string;
  }>,
  runtime: z.infer<typeof runtimeBindingSchema>,
) {
  const { order, payment } = context;
  return payment !== null
    && attempt.customer_id === order.customer_id
    && attempt.order_id === order.id
    && attempt.payment_id === payment.id
    && attempt.execution_scope_sha256 === order.execution_scope_sha256
    && attempt.processor_account_sha256 === runtime.paymentAccountSha256
    && attempt.processor_source_sha256 === runtime.paymentSourceSha256
    && attempt.processor_adapter_version_sha256 === runtime.paymentAdapterVersionSha256
    && attempt.payment_binding_receipt_sha256 === expected.paymentBindingReceiptSha256
    && attempt.adapter_source_sha256 === runtime.paymentSourceSha256
    && attempt.operation_authority_receipt_sha256 === expected.operationAuthorityReceiptSha256
    && attempt.idempotency_key_sha256 === expected.keySha256
    && attempt.idempotency_request_sha256 === expected.requestSha256
    && attempt.request_plan_sha256 === expected.requestSha256
    && attempt.request_sha256 === expected.requestSha256
    && attempt.request_body_sha256 === expected.requestSha256
    && attempt.amount_cents === order.total_cents
    && attempt.currency === order.currency;
}

export async function loadFlightConsumerPreviewReconciliationContextFromRpc(
  client: FlightConsumerPreviewReconciliationRpcClient,
  input: Readonly<{
    customerId: string;
    orderId: string;
    executionScopeSha256: string;
  }>,
) {
  const identity = z.object({
    customerId: uuidSchema,
    orderId: uuidSchema,
    executionScopeSha256: sha256Schema,
  }).strict().safeParse(input);
  if (!identity.success || typeof client?.rpc !== "function") {
    throw new FlightConsumerPreviewReconciliationError();
  }
  try {
    const { data, error } = await client.rpc(
      "get_flight_consumer_reconciliation_context_v1",
      {
        p_customer_id: identity.data.customerId,
        p_order_id: identity.data.orderId,
      },
    );
    if (error) throw new Error();
    const rows = reconciliationContextRpcResultSchema.safeParse(data);
    if (!rows.success) throw new Error();
    if (rows.data.length === 0) return null;
    const context = rows.data[0]!.context;
    if (
      context.order.id !== identity.data.orderId
      || context.order.customer_id !== identity.data.customerId
      || context.order.execution_scope_sha256 !== identity.data.executionScopeSha256
    ) throw new Error();
    return context;
  } catch {
    throw new FlightConsumerPreviewReconciliationError();
  }
}

class SupabaseFlightConsumerPreviewReconciliationStore
implements FlightConsumerPreviewReconciliationStore {
  async loadContext(input: Readonly<{
    customerId: string;
    orderId: string;
    executionScopeSha256: string;
  }>) {
    return loadFlightConsumerPreviewReconciliationContextFromRpc(
      createAdminClient() as unknown as FlightConsumerPreviewReconciliationRpcClient,
      input,
    );
  }

  async prepareRefund(parameters: FlightConsumerRefundPrepareParameters) {
    const { data, error } = await createAdminClient().rpc(
      "prepare_flight_consumer_refund_compensation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewReconciliationError();
    return data;
  }

  async claimPaymentOperation(parameters: FlightConsumerPaymentOperationClaimParameters) {
    const { data, error } = await createAdminClient().rpc(
      "claim_flight_consumer_payment_operation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewReconciliationError();
    return data;
  }

  async completePaymentOperation(parameters: FlightConsumerPaymentOperationCompleteParameters) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_payment_operation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewReconciliationError();
    return data;
  }

  async applyRefund(parameters: FlightConsumerRefundApplyParameters) {
    const { data, error } = await createAdminClient().rpc(
      "apply_flight_consumer_refund_compensation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewReconciliationError();
    return data;
  }
}

class DurableFlightConsumerPreviewReconciliationWorkflow
implements FlightConsumerPreviewReconciliationWorkflow {
  readonly #store: FlightConsumerPreviewReconciliationStore;
  readonly #runtime: z.infer<typeof runtimeBindingSchema>;
  readonly #authority: FlightConsumerPreviewReconciliationAuthority;
  readonly #paymentReferenceKeyring: FlightConsumerPreviewReferenceKeyring;
  readonly #refundReferenceKeyring: FlightConsumerPreviewStripeRefundReferenceKeyring;
  readonly #createStripePayment: FlightConsumerPreviewReconciliationDependencies["createStripePayment"];
  readonly #readTrustedTime: () => string;

  constructor(dependencies: FlightConsumerPreviewReconciliationDependencies) {
    try {
      this.#runtime = Object.freeze(runtimeBindingSchema.parse(
        structuredClone(dependencies.runtimeBinding),
      ));
      if (
        dependencies.paymentReferenceKeyring.keyVersion !== this.#runtime.referenceKeyVersion
        || dependencies.refundReferenceKeyring.keyVersion !== this.#runtime.referenceKeyVersion
        || typeof dependencies.store?.loadContext !== "function"
        || typeof dependencies.store?.prepareRefund !== "function"
        || typeof dependencies.store?.claimPaymentOperation !== "function"
        || typeof dependencies.store?.completePaymentOperation !== "function"
        || typeof dependencies.store?.applyRefund !== "function"
        || typeof dependencies.authority?.paymentBindingReceipt !== "function"
        || typeof dependencies.authority?.operationReceipt !== "function"
        || typeof dependencies.createStripePayment !== "function"
        || typeof dependencies.readTrustedTime !== "function"
      ) throw new Error();
      this.#store = dependencies.store;
      this.#authority = dependencies.authority;
      this.#paymentReferenceKeyring = dependencies.paymentReferenceKeyring;
      this.#refundReferenceKeyring = dependencies.refundReferenceKeyring;
      this.#createStripePayment = dependencies.createStripePayment;
      this.#readTrustedTime = dependencies.readTrustedTime;
    } catch {
      throw new FlightConsumerPreviewReconciliationError();
    }
  }

  #trustedTime() {
    try {
      const value = this.#readTrustedTime();
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error();
      return parsed;
    } catch {
      throw new FlightConsumerPreviewReconciliationError();
    }
  }

  async #load(input: FlightConsumerPreviewReconciliationInput) {
    let raw: unknown;
    try {
      raw = await this.#store.loadContext({
        customerId: input.customerId,
        orderId: input.orderId,
        executionScopeSha256: this.#runtime.executionScopeSha256,
      });
    } catch {
      throw new FlightConsumerPreviewReconciliationError();
    }
    const parsed = contextSchema.safeParse(raw);
    if (!parsed.success) throw new FlightConsumerPreviewReconciliationError();
    const context = parsed.data;
    if (
      context.order.id !== input.orderId
      || context.order.customer_id !== input.customerId
      || context.order.execution_scope_sha256 !== this.#runtime.executionScopeSha256
      || (context.payment !== null && (
        context.payment.order_id !== context.order.id
        || context.payment.execution_scope_sha256 !== context.order.execution_scope_sha256
      ))
    ) throw new FlightConsumerPreviewReconciliationError();
    return context;
  }

  #terminalResult(context: ReconciliationContext): FlightConsumerPreviewReconciliationResult | null {
    if (context.order.status !== "failed") return null;
    const { payment, refundAttempt, refundEvidence } = context;
    if (payment === null) {
      return Object.freeze({
        decision: "no_refund_required" as const,
        orderId: context.order.id,
        paymentId: null,
      });
    }
    if (
      payment.status === "refunded"
      && payment.authorized_cents === context.order.total_cents
      && payment.captured_cents === context.order.total_cents
      && payment.refunded_cents === context.order.total_cents
      && refundAttempt?.state === "succeeded"
      && refundAttempt.revision === 2
      && refundEvidence?.attempt_id === refundAttempt.id
      && refundEvidence.order_id === context.order.id
      && refundEvidence.payment_id === payment.id
      && refundEvidence.refunded_cents === context.order.total_cents
      && refundEvidence.terminal_receipt_sha256 === refundAttempt.terminal_receipt_sha256
      && context.order.provider_order_ref_sha256 === null
      && context.ticketCount === 0
    ) {
      return Object.freeze({
        decision: "already_refunded" as const,
        orderId: context.order.id,
        paymentId: payment.id,
        refundAttemptId: refundAttempt.id,
      });
    }
    if (
      ["failed", "cancelled"].includes(payment.status)
      && payment.authorized_cents === 0
      && payment.captured_cents === 0
      && payment.refunded_cents === 0
    ) {
      return Object.freeze({
        decision: "no_refund_required" as const,
        orderId: context.order.id,
        paymentId: payment.id,
      });
    }
    throw new FlightConsumerPreviewReconciliationError();
  }

  #activeEligibility(context: ReconciliationContext) {
    const { order, payment, providerAttempt, safeResolution, refundAttempt } = context;
    if (
      order.status !== "requires_review"
      || order.provider_order_ref_sha256 !== null
      || context.ticketCount !== 0
      || payment === null
      || payment.authorized_cents !== order.total_cents
      || payment.captured_cents !== order.total_cents
      || payment.refunded_cents !== 0
    ) return "provider_outcome_unresolved" as const;
    if (providerAttempt !== null && (
      providerAttempt.customer_id !== order.customer_id
      || providerAttempt.order_id !== order.id
      || providerAttempt.execution_scope_sha256 !== order.execution_scope_sha256
      || providerAttempt.retry_authorized
      || providerAttempt.state === "succeeded"
      || (providerAttempt.state === "prepared" && providerAttempt.revision !== 0)
      || (["dispatching", "blocked"].includes(providerAttempt.state)
        && providerAttempt.revision !== 1)
      || (["succeeded", "failed", "ambiguous"].includes(providerAttempt.state)
        && providerAttempt.revision !== 2)
    )) return "provider_outcome_unresolved" as const;
    if (
      safeResolution === null
      || safeResolution.order_id !== order.id
      || safeResolution.subject_id !== order.id
      || safeResolution.execution_scope_sha256 !== order.execution_scope_sha256
      || safeResolution.resolution_code !== "duplicate_suppressed"
    ) return "provider_outcome_unresolved" as const;
    if (refundAttempt === null && payment.status !== "captured") {
      return "payment_outcome_unresolved" as const;
    }
    if (refundAttempt !== null) {
      if (
        ["ambiguous", "failed", "blocked"].includes(refundAttempt.state)
        || (["dispatching", "succeeded"].includes(refundAttempt.state)
          && Date.parse(refundAttempt.dispatch_not_after)
            + STRIPE_REFUND_DISPATCH_RECOVERY_GRACE_MS <= this.#trustedTime())
        || (refundAttempt.state === "prepared" && payment.status !== "refund_pending")
        || (refundAttempt.state === "dispatching" && payment.status !== "refund_pending")
        || (refundAttempt.state === "succeeded" && payment.status !== "refund_pending")
      ) return "refund_operation_unresolved" as const;
    }
    return null;
  }

  #expectedClaims(input: FlightConsumerPreviewReconciliationInput, context: ReconciliationContext) {
    const { order, payment, providerAttempt, safeResolution } = context;
    if (payment === null || safeResolution === null) {
      throw new FlightConsumerPreviewReconciliationError();
    }
    const keySha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-refund-idempotency-v1",
      customerId: input.customerId,
      orderId: input.orderId,
      paymentId: payment.id,
      key: input.idempotencyKey,
    });
    const requestSha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-refund-request-v1",
      customerId: input.customerId,
      orderId: input.orderId,
      paymentId: payment.id,
      processorReferenceSha256: payment.processor_reference_sha256,
      amountCents: order.total_cents,
      currency: order.currency,
      providerAttemptId: providerAttempt?.id ?? null,
      providerAttemptState: providerAttempt?.state ?? "not_started",
      providerAttemptRevision: providerAttempt?.revision ?? null,
      safeResolutionId: safeResolution.id,
      safeResolutionCode: safeResolution.resolution_code,
      safeResolutionEvidenceSha256: safeResolution.resolution_evidence_sha256,
      executionScopeSha256: order.execution_scope_sha256,
    });
    const paymentBindingReceiptSha256 = this.#authority.paymentBindingReceipt({
      customerId: input.customerId,
      orderId: input.orderId,
      paymentId: payment.id,
      processorReferenceSha256: payment.processor_reference_sha256,
      amountCents: order.total_cents,
      currency: order.currency,
    });
    const operationAuthorityReceiptSha256 = this.#authority.operationReceipt(
      "stripe-refund-authority",
      {
        customerId: input.customerId,
        orderId: input.orderId,
        paymentId: payment.id,
        keySha256,
        requestSha256,
        paymentBindingReceiptSha256,
        runtimeControlReceiptSha256: this.#runtime.runtimeControlReceiptSha256,
        executionScopeSha256: this.#runtime.executionScopeSha256,
      },
    );
    if (
      !sha256Schema.safeParse(paymentBindingReceiptSha256).success
      || !sha256Schema.safeParse(operationAuthorityReceiptSha256).success
    ) throw new FlightConsumerPreviewReconciliationError();
    return Object.freeze({
      keySha256,
      requestSha256,
      paymentBindingReceiptSha256,
      operationAuthorityReceiptSha256,
    });
  }

  async #prepare(
    input: FlightConsumerPreviewReconciliationInput,
    initial: ReconciliationContext,
    expected: ExpectedRefundClaims,
  ) {
    if (initial.payment === null) throw new FlightConsumerPreviewReconciliationError();
    if (initial.refundAttempt !== null) {
      if (!sameAttemptBinding(initial.refundAttempt, initial, expected, this.#runtime)) {
        throw new FlightConsumerPreviewReconciliationError();
      }
      return { context: initial, attempt: initial.refundAttempt };
    }
    const dispatchNotAfter = new Date(this.#trustedTime() + 4 * 60_000).toISOString();
    const parameters: FlightConsumerRefundPrepareParameters = Object.freeze({
      p_order_id: initial.order.id,
      p_payment_id: initial.payment.id,
      p_key_sha256: expected.keySha256,
      p_request_sha256: expected.requestSha256,
      p_adapter_source_sha256: this.#runtime.paymentSourceSha256,
      p_payment_binding_receipt_sha256: expected.paymentBindingReceiptSha256,
      p_operation_authority_receipt_sha256: expected.operationAuthorityReceiptSha256,
      p_dispatch_not_after: dispatchNotAfter,
    });
    try {
      const prepared = oneRow(prepareResultSchema, await this.#store.prepareRefund(parameters))[0]!;
      if (
        prepared.decision !== "prepared"
        || prepared.attempt_revision !== 0
        || prepared.attempt_state !== "prepared"
      ) throw new Error();
    } catch {
      // A concurrent preparation or a committed RPC with a lost response is
      // recovered from the owner-scoped durable attempt below.
    }
    const recovered = await this.#load(input);
    if (
      recovered.refundAttempt === null
      || !sameAttemptBinding(recovered.refundAttempt, recovered, expected, this.#runtime)
    ) throw new FlightConsumerPreviewReconciliationError();
    return { context: recovered, attempt: recovered.refundAttempt };
  }

  async #claimOrRecover(
    input: FlightConsumerPreviewReconciliationInput,
    context: ReconciliationContext,
    attempt: RefundAttempt,
    expected: ExpectedRefundClaims,
  ) {
    if (attempt.state !== "prepared") return { context, attempt };
    if (Date.parse(attempt.dispatch_not_after) <= this.#trustedTime()) {
      return { context, attempt: { ...attempt, state: "blocked" as const } };
    }
    try {
      const claimed = oneRow(claimResultSchema, await this.#store.claimPaymentOperation({
        p_attempt_id: attempt.id,
        p_expected_revision: 0,
        p_payment_binding_receipt_sha256: expected.paymentBindingReceiptSha256,
        p_operation_authority_receipt_sha256: expected.operationAuthorityReceiptSha256,
      }))[0]!;
      if (claimed.attempt_id !== attempt.id) throw new Error();
    } catch {
      // Recover the exact CAS state; no Stripe mutation occurs until the row is
      // proven dispatching.
    }
    const recovered = await this.#load(input);
    if (
      recovered.refundAttempt === null
      || !sameAttemptBinding(recovered.refundAttempt, recovered, expected, this.#runtime)
    ) throw new FlightConsumerPreviewReconciliationError();
    return { context: recovered, attempt: recovered.refundAttempt };
  }

  async #markAmbiguous(
    context: ReconciliationContext,
    attempt: RefundAttempt,
    detail: "dispatch_failed" | "refund_pending",
  ) {
    if (attempt.state !== "dispatching" || attempt.revision !== 1) return;
    const receipt = this.#authority.operationReceipt("stripe-refund-ambiguous", {
      customerId: context.order.customer_id,
      orderId: context.order.id,
      paymentId: context.payment?.id ?? null,
      attemptId: attempt.id,
      detail,
      executionScopeSha256: context.order.execution_scope_sha256,
    });
    if (!sha256Schema.safeParse(receipt).success) return;
    try {
      await this.#store.completePaymentOperation({
        p_attempt_id: attempt.id,
        p_expected_revision: 1,
        p_terminal_state: "ambiguous",
        p_terminal_http_status: null,
        p_terminal_response_sha256: null,
        p_terminal_response_bytes: null,
        p_terminal_receipt_sha256: receipt,
      });
    } catch {
      // A support operator must reconcile a response whose terminal journal CAS
      // cannot be proven. Never issue another non-idempotent provider mutation.
    }
  }

  async reconcile(untrustedInput: FlightConsumerPreviewReconciliationInput) {
    let input: FlightConsumerPreviewReconciliationInput;
    try {
      input = Object.freeze(inputSchema.parse(structuredClone(untrustedInput)));
    } catch {
      throw new FlightConsumerPreviewReconciliationError();
    }
    let context = await this.#load(input);
    const terminal = this.#terminalResult(context);
    if (terminal) return terminal;
    const eligibility = this.#activeEligibility(context);
    if (eligibility) {
      return Object.freeze({
        decision: "manual_review_required" as const,
        orderId: input.orderId,
        reason: eligibility,
      });
    }
    const expected = this.#expectedClaims(input, context);
    if (
      context.refundAttempt !== null
      && ["ambiguous", "failed", "blocked"].includes(context.refundAttempt.state)
    ) {
      return Object.freeze({
        decision: "manual_review_required" as const,
        orderId: input.orderId,
        reason: "refund_operation_unresolved" as const,
      });
    }
    const payment = context.payment;
    if (payment === null) throw new FlightConsumerPreviewReconciliationError();
    let paymentIntentId: string;
    try {
      paymentIntentId = decryptFlightConsumerPreviewReference({
        ciphertext: payment.processor_reference_ciphertext,
        expectedReferenceSha256: payment.processor_reference_sha256,
        context: {
          kind: "stripe_payment_intent",
          customerId: input.customerId,
          resourceId: input.orderId,
          executionScopeSha256: this.#runtime.executionScopeSha256,
        },
        keyring: this.#paymentReferenceKeyring,
      });
      if (!/^pi_[A-Za-z0-9]{8,127}$/.test(paymentIntentId)) throw new Error();
      const stripe = await this.#createStripePayment({
        orderId: input.orderId,
        customerId: input.customerId,
        amountCents: context.order.total_cents,
        runtimeBinding: {
          executionScopeSha256: this.#runtime.executionScopeSha256,
          paymentProcessorCode: this.#runtime.paymentProcessorCode,
          paymentEnvironment: this.#runtime.paymentEnvironment,
          paymentAccountSha256: this.#runtime.paymentAccountSha256,
          paymentSourceSha256: this.#runtime.paymentSourceSha256,
          paymentAdapterVersionSha256: this.#runtime.paymentAdapterVersionSha256,
        },
      });
      const snapshot = await stripe.retrievePaymentIntent({ paymentIntentId });
      if (
        snapshot.paymentIntentId !== paymentIntentId
        || snapshot.decision !== "captured"
        || snapshot.status !== "succeeded"
        || snapshot.amountCents !== context.order.total_cents
        || snapshot.amountReceivedCents !== context.order.total_cents
        || snapshot.amountCapturableCents !== 0
        || snapshot.currency !== "usd"
      ) {
        return Object.freeze({
          decision: "manual_review_required" as const,
          orderId: input.orderId,
          reason: "payment_outcome_unresolved" as const,
        });
      }

      let state = await this.#prepare(input, context, expected);
      context = state.context;
      state = await this.#claimOrRecover(input, state.context, state.attempt, expected);
      context = state.context;
      const attempt = state.attempt;
      if (
        ["ambiguous", "failed", "blocked"].includes(attempt.state)
        || (attempt.state === "prepared" && attempt.revision === 0)
      ) {
        return Object.freeze({
          decision: "manual_review_required" as const,
          orderId: input.orderId,
          reason: "refund_operation_unresolved" as const,
        });
      }
      if (!sameAttemptBinding(attempt, context, expected, this.#runtime)) {
        throw new FlightConsumerPreviewReconciliationError();
      }

      let refunded: Awaited<ReturnType<FlightConsumerPreviewStripePayment["refundPaymentIntent"]>>;
      try {
        refunded = await stripe.refundPaymentIntent({
          paymentIntentId,
          attemptId: attempt.id,
        });
      } catch {
        await this.#markAmbiguous(context, attempt, "dispatch_failed");
        return Object.freeze({
          decision: "manual_review_required" as const,
          orderId: input.orderId,
          reason: "refund_operation_unresolved" as const,
        });
      }
      if (
        refunded.paymentIntentId !== paymentIntentId
        || refunded.amountRefundedCents !== context.order.total_cents
        || refunded.currency !== "usd"
      ) throw new FlightConsumerPreviewReconciliationError();
      if (refunded.decision !== "refunded") {
        await this.#markAmbiguous(context, attempt, "refund_pending");
        return Object.freeze({
          decision: "manual_review_required" as const,
          orderId: input.orderId,
          reason: "refund_operation_unresolved" as const,
        });
      }

      const responseJson = canonicalFlightJson(refunded as unknown as FlightCanonicalJsonValue);
      const responseSha256 = sha256FlightEvidence(refunded as unknown as FlightCanonicalJsonValue);
      const terminalReceiptSha256 = this.#authority.operationReceipt("stripe-refund-terminal", {
        customerId: input.customerId,
        orderId: input.orderId,
        paymentId: payment.id,
        attemptId: attempt.id,
        responseSha256,
        paymentIdempotencyKeySha256: refunded.paymentIdempotencyKeySha256,
        executionScopeSha256: this.#runtime.executionScopeSha256,
      });
      if (!sha256Schema.safeParse(terminalReceiptSha256).success) {
        throw new FlightConsumerPreviewReconciliationError();
      }
      const terminalParameters: FlightConsumerPaymentOperationCompleteParameters = Object.freeze({
        p_attempt_id: attempt.id,
        p_expected_revision: attempt.state === "succeeded" ? 2 : 1,
        p_terminal_state: "succeeded",
        p_terminal_http_status: 200,
        p_terminal_response_sha256: responseSha256,
        p_terminal_response_bytes: Buffer.byteLength(responseJson, "utf8"),
        p_terminal_receipt_sha256: terminalReceiptSha256,
      });
      try {
        const completed = oneRow(
          completionResultSchema,
          await this.#store.completePaymentOperation(terminalParameters),
        )[0]!;
        if (
          completed.attempt_id !== attempt.id
          || completed.attempt_state !== "succeeded"
        ) throw new Error();
      } catch {
        const recovered = await this.#load(input);
        const recoveredAttempt = recovered.refundAttempt;
        if (
          recoveredAttempt === null
          || recoveredAttempt.state !== "succeeded"
          || recoveredAttempt.revision !== 2
          || recoveredAttempt.terminal_http_status !== 200
          || recoveredAttempt.terminal_response_sha256 !== responseSha256
          || recoveredAttempt.terminal_response_bytes !== Buffer.byteLength(responseJson, "utf8")
          || recoveredAttempt.terminal_receipt_sha256 !== terminalReceiptSha256
          || !sameAttemptBinding(recoveredAttempt, recovered, expected, this.#runtime)
        ) throw new FlightConsumerPreviewReconciliationError();
        context = recovered;
      }

      const protectedRefund = encryptFlightConsumerPreviewStripeRefundReference({
        refundId: refunded.refundId,
        binding: {
          customerId: input.customerId,
          orderId: input.orderId,
          paymentId: payment.id,
          attemptId: attempt.id,
          paymentIntentReferenceSha256: payment.processor_reference_sha256,
          executionScopeSha256: this.#runtime.executionScopeSha256,
          keyVersion: this.#runtime.referenceKeyVersion,
        },
        keyring: this.#refundReferenceKeyring,
      });
      try {
        const applied = oneRow(applyResultSchema, await this.#store.applyRefund({
          p_attempt_id: attempt.id,
          p_expected_terminal_revision: 2,
          p_payment_id: payment.id,
          p_refund_reference_ciphertext: protectedRefund.ciphertext,
          p_refund_reference_sha256: protectedRefund.referenceSha256,
          p_refunded_cents: context.order.total_cents,
        }))[0]!;
        if (applied.order_id !== input.orderId || applied.payment_id !== payment.id) throw new Error();
      } catch {
        const recovered = await this.#load(input);
        const recoveredTerminal = this.#terminalResult(recovered);
        if (recoveredTerminal?.decision !== "already_refunded") {
          throw new FlightConsumerPreviewReconciliationError();
        }
        return recoveredTerminal;
      }
      return Object.freeze({
        decision: "refunded" as const,
        orderId: input.orderId,
        paymentId: payment.id,
        refundAttemptId: attempt.id,
      });
    } catch (error) {
      if (error instanceof FlightConsumerPreviewReconciliationError) throw error;
      throw new FlightConsumerPreviewReconciliationError();
    }
  }
}

export function createInjectedFlightConsumerPreviewReconciliationWorkflow(
  dependencies: FlightConsumerPreviewReconciliationDependencies,
): FlightConsumerPreviewReconciliationWorkflow {
  return Object.freeze(new DurableFlightConsumerPreviewReconciliationWorkflow(dependencies));
}

/**
 * Internal service boundary for an authenticated support/admin route or worker.
 * The caller must authorize the operator before supplying the owner customerId;
 * this module intentionally does not expose a public HTTP mutation.
 */
export async function reconcileFlightConsumerPreviewOrder(
  input: FlightConsumerPreviewReconciliationInput,
): Promise<FlightConsumerPreviewReconciliationResult> {
  try {
    const runtime = await requireFlightConsumerPreviewRequestRuntime();
    const authority = createFlightConsumerPreviewAuthority(runtime.binding);
    const workflow = createInjectedFlightConsumerPreviewReconciliationWorkflow({
      store: Object.freeze(new SupabaseFlightConsumerPreviewReconciliationStore()),
      runtimeBinding: runtime.binding,
      authority,
      paymentReferenceKeyring: readFlightConsumerPreviewReferenceKeyring(),
      refundReferenceKeyring: readFlightConsumerPreviewStripeRefundReferenceKeyring(),
      createStripePayment: createFlightConsumerPreviewStripePayment,
      readTrustedTime: () => new Date().toISOString(),
    });
    return await workflow.reconcile(input);
  } catch (error) {
    if (error instanceof FlightConsumerPreviewReconciliationError) throw error;
    throw new FlightConsumerPreviewReconciliationError();
  }
}
