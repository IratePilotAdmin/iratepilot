import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  FlightConsumerPreviewReconciliationError,
  createInjectedFlightConsumerPreviewReconciliationWorkflow,
  loadFlightConsumerPreviewReconciliationContextFromRpc,
  type FlightConsumerPaymentOperationClaimParameters,
  type FlightConsumerPaymentOperationCompleteParameters,
  type FlightConsumerPreviewReconciliationAuthority,
  type FlightConsumerPreviewReconciliationDependencies,
  type FlightConsumerPreviewReconciliationRpcClient,
  type FlightConsumerPreviewReconciliationStore,
  type FlightConsumerRefundApplyParameters,
  type FlightConsumerRefundPrepareParameters,
} from "../lib/flights/consumer-preview/reconciliation-workflow.server";
import {
  createFlightConsumerPreviewReferenceKeyring,
  encryptFlightConsumerPreviewReference,
} from "../lib/flights/consumer-preview/reference-crypto.server";
import type { FlightConsumerPreviewRuntimeBinding } from "../lib/flights/consumer-preview/runtime.server";
import type {
  FlightConsumerPreviewStripePayment,
  FlightConsumerPreviewStripeRefundResult,
} from "../lib/flights/consumer-preview/stripe-payment.server";
import {
  createFlightConsumerPreviewStripeRefundReferenceKeyring,
  decryptFlightConsumerPreviewStripeRefundReference,
} from "../lib/flights/consumer-preview/stripe-refund-reference.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";
const providerAttemptId = "44444444-4444-4444-8444-444444444444";
const resolutionId = "55555555-5555-4555-8555-555555555555";
const refundAttemptId = "66666666-6666-4666-8666-666666666666";
const paymentIntentId = "pi_previewcaptured0001";
const refundId = "re_previewrefund00001";
const amountCents = 64_321;
const trustedTime = "2026-08-25T18:00:00.000Z";
const executionScopeSha256 = "a".repeat(64);
const referenceKeyVersion = "preview-reference-v1";
const secretMarker = "sk_test_MUST_NEVER_LEAK_12345678";

const runtimeBinding = Object.freeze({
  projectRef: "eiqmdldjnedqgbtoozqa",
  providerCode: "duffel",
  providerAccountSha256: "1".repeat(64),
  pointOfSale: "US",
  contentScopeSha256: "2".repeat(64),
  providerAdapterVersionSha256: "3".repeat(64),
  paymentProcessorCode: "stripe",
  paymentAccountSha256: "4".repeat(64),
  paymentEnvironment: "test",
  paymentSourceSha256: "5".repeat(64),
  paymentAdapterVersionSha256: "6".repeat(64),
  providerSettlementProcessorCode: "duffel_balance",
  providerSettlementAccountSha256: "7".repeat(64),
  providerSettlementEnvironment: "test",
  providerSettlementSourceSha256: "8".repeat(64),
  providerSettlementAdapterVersionSha256: "9".repeat(64),
  executionScopeSha256,
  activationEvidenceSha256: "b".repeat(64),
  runtimeControlReceiptSha256: "c".repeat(64),
  piiKeyVersion: "preview-pii-v1",
  evidenceKeyVersion: "preview-evidence-v1",
  referenceKeyVersion,
}) satisfies FlightConsumerPreviewRuntimeBinding;

const paymentReferenceKeyring = createFlightConsumerPreviewReferenceKeyring({
  keyVersion: referenceKeyVersion,
  encryptionKeyBase64Url: Buffer.alloc(32, 41).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 59).toString("base64url"),
});
const refundReferenceKeyring = createFlightConsumerPreviewStripeRefundReferenceKeyring({
  keyVersion: referenceKeyVersion,
  encryptionKeyBase64Url: Buffer.alloc(32, 41).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 59).toString("base64url"),
});

const protectedPaymentIntent = encryptFlightConsumerPreviewReference({
  value: paymentIntentId,
  context: {
    kind: "stripe_payment_intent",
    customerId,
    resourceId: orderId,
    executionScopeSha256,
  },
  keyring: paymentReferenceKeyring,
});

type TestContext = {
  order: Record<string, unknown>;
  payment: Record<string, unknown> | null;
  providerAttempt: Record<string, unknown> | null;
  safeResolution: Record<string, unknown> | null;
  refundAttempt: Record<string, unknown> | null;
  refundEvidence: Record<string, unknown> | null;
  ticketCount: number;
};

function context(): TestContext {
  return {
    order: {
      id: orderId,
      customer_id: customerId,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      provider_code: "duffel",
      consumer_flow_version: 1,
      currency: "USD",
      total_cents: amountCents,
      status: "requires_review",
      provider_order_ref_sha256: null,
    },
    payment: {
      id: paymentId,
      order_id: orderId,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      processor_code: "stripe",
      processor_reference_ciphertext: protectedPaymentIntent.ciphertext,
      processor_reference_sha256: protectedPaymentIntent.referenceSha256,
      currency: "USD",
      authorized_cents: amountCents,
      captured_cents: amountCents,
      refunded_cents: 0,
      status: "captured",
    },
    providerAttempt: {
      id: providerAttemptId,
      customer_id: customerId,
      order_id: orderId,
      provider_code: "duffel",
      operation: "create_order",
      consumer_flow_version: 1,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      retry_authorized: false,
      state: "failed",
      revision: 2,
    },
    safeResolution: {
      id: resolutionId,
      order_id: orderId,
      provider_code: "duffel",
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      case_type: "ambiguous_order",
      subject_type: "flight_order",
      subject_id: orderId,
      source_status: "requires_review",
      target_status: "failed",
      status: "resolved",
      resolution_code: "duplicate_suppressed",
      resolution_evidence_sha256: "d".repeat(64),
    },
    refundAttempt: null,
    refundEvidence: null,
    ticketCount: 0,
  };
}

const authority: FlightConsumerPreviewReconciliationAuthority = Object.freeze({
  paymentBindingReceipt(input: Parameters<
    FlightConsumerPreviewReconciliationAuthority["paymentBindingReceipt"]
  >[0]) {
    return sha256FlightEvidence({ version: "test-payment-binding-v1", ...input });
  },
  operationReceipt(label: string, input: unknown) {
    return sha256FlightEvidence({ version: `test-${label}-v1`, input } as never);
  },
});

class MemoryStore implements FlightConsumerPreviewReconciliationStore {
  readonly calls: Array<{ name: string; parameters: unknown }> = [];
  current = context();
  failLoad: Error | null = null;
  failClaimAfterCommit = false;
  failCompleteAfterCommit = false;
  failCompleteAmbiguous = false;
  failApplyAfterCommit = false;

  async loadContext() {
    this.calls.push({ name: "load", parameters: null });
    if (this.failLoad) throw this.failLoad;
    return structuredClone(this.current);
  }

  async prepareRefund(parameters: FlightConsumerRefundPrepareParameters) {
    this.calls.push({ name: "prepare", parameters: structuredClone(parameters) });
    if (this.current.refundAttempt) throw new Error("existing attempt");
    this.current.refundAttempt = {
      id: refundAttemptId,
      customer_id: customerId,
      order_id: orderId,
      payment_id: paymentId,
      operation: "refund",
      processor_code: "stripe",
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      processor_account_sha256: runtimeBinding.paymentAccountSha256,
      processor_environment: "test",
      processor_source_sha256: runtimeBinding.paymentSourceSha256,
      processor_adapter_version_sha256: runtimeBinding.paymentAdapterVersionSha256,
      payment_binding_receipt_sha256: parameters.p_payment_binding_receipt_sha256,
      adapter_source_sha256: parameters.p_adapter_source_sha256,
      operation_authority_receipt_sha256: parameters.p_operation_authority_receipt_sha256,
      idempotency_key_sha256: parameters.p_key_sha256,
      idempotency_request_sha256: parameters.p_request_sha256,
      request_plan_sha256: parameters.p_request_sha256,
      request_sha256: parameters.p_request_sha256,
      request_body_sha256: parameters.p_request_sha256,
      amount_cents: amountCents,
      currency: "USD",
      dispatch_not_after: parameters.p_dispatch_not_after,
      state: "prepared",
      revision: 0,
      terminal_http_status: null,
      terminal_response_sha256: null,
      terminal_response_bytes: null,
      terminal_receipt_sha256: null,
    };
    this.current.payment!.status = "refund_pending";
    return [{
      decision: "prepared",
      attempt_id: refundAttemptId,
      attempt_revision: 0,
      attempt_state: "prepared",
    }];
  }

  async claimPaymentOperation(parameters: FlightConsumerPaymentOperationClaimParameters) {
    this.calls.push({ name: "claim", parameters: structuredClone(parameters) });
    Object.assign(this.current.refundAttempt!, { state: "dispatching", revision: 1 });
    if (this.failClaimAfterCommit) throw new Error("lost claim response");
    return [{ attempt_id: refundAttemptId, attempt_revision: 1, attempt_state: "dispatching" }];
  }

  async completePaymentOperation(parameters: FlightConsumerPaymentOperationCompleteParameters) {
    this.calls.push({ name: "complete", parameters: structuredClone(parameters) });
    if (parameters.p_terminal_state === "ambiguous" && this.failCompleteAmbiguous) {
      throw new Error("lost ambiguity record");
    }
    const attempt = this.current.refundAttempt!;
    if (attempt.state === "succeeded") {
      return [{ attempt_id: refundAttemptId, attempt_revision: 2, attempt_state: "succeeded" }];
    }
    Object.assign(attempt, {
      state: parameters.p_terminal_state,
      revision: 2,
      terminal_http_status: parameters.p_terminal_http_status,
      terminal_response_sha256: parameters.p_terminal_response_sha256,
      terminal_response_bytes: parameters.p_terminal_response_bytes,
      terminal_receipt_sha256: parameters.p_terminal_receipt_sha256,
    });
    if (parameters.p_terminal_state === "ambiguous") this.current.payment!.status = "ambiguous";
    if (this.failCompleteAfterCommit) throw new Error("lost completion response");
    return [{
      attempt_id: refundAttemptId,
      attempt_revision: 2,
      attempt_state: parameters.p_terminal_state,
    }];
  }

  async applyRefund(parameters: FlightConsumerRefundApplyParameters) {
    this.calls.push({ name: "apply", parameters: structuredClone(parameters) });
    this.current.payment!.status = "refunded";
    this.current.payment!.refunded_cents = amountCents;
    this.current.order.status = "failed";
    this.current.refundEvidence = {
      attempt_id: refundAttemptId,
      order_id: orderId,
      payment_id: paymentId,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      refund_reference_sha256: parameters.p_refund_reference_sha256,
      refunded_cents: amountCents,
      terminal_receipt_sha256: this.current.refundAttempt!.terminal_receipt_sha256,
    };
    if (this.failApplyAfterCommit) throw new Error("lost apply response");
    return [{
      order_id: orderId,
      order_status: "failed",
      payment_id: paymentId,
      payment_status: "refunded",
    }];
  }
}

class FakeStripePayment implements FlightConsumerPreviewStripePayment {
  readonly calls: Array<{ name: string; input: unknown }> = [];
  snapshotDecision: "captured" | "authorized" = "captured";
  refundDecision: FlightConsumerPreviewStripeRefundResult["decision"] = "refunded";
  refundFailure: Error | null = null;

  async createPaymentIntent(): Promise<never> {
    throw new Error("not supported");
  }

  async retrievePaymentIntentForCheckout(): Promise<never> {
    throw new Error("not supported");
  }

  async capturePaymentIntent(): Promise<never> {
    throw new Error("not supported");
  }

  async attestCapturedPaymentIntent(): Promise<never> {
    throw new Error("not supported");
  }

  async retrievePaymentIntent(input: Readonly<{ paymentIntentId: string }>) {
    this.calls.push({ name: "retrieve", input: structuredClone(input) });
    return {
      version: "flight-consumer-preview-stripe-payment-snapshot-v1" as const,
      paymentIntentId,
      status: this.snapshotDecision === "captured" ? "succeeded" as const : "requires_capture" as const,
      decision: this.snapshotDecision,
      amountCents,
      amountCapturableCents: this.snapshotDecision === "captured" ? 0 : amountCents,
      amountReceivedCents: this.snapshotDecision === "captured" ? amountCents : 0,
      currency: "usd" as const,
    };
  }

  async refundPaymentIntent(input: Readonly<{ paymentIntentId: string; attemptId: string }>) {
    this.calls.push({ name: "refund", input: structuredClone(input) });
    if (this.refundFailure) throw this.refundFailure;
    return {
      version: "flight-consumer-preview-stripe-refund-v1" as const,
      decision: this.refundDecision,
      refundId,
      paymentIntentId,
      amountRefundedCents: amountCents,
      currency: "usd" as const,
      paymentIdempotencyKeySha256: "e".repeat(64),
    };
  }
}

function createSubject(
  store = new MemoryStore(),
  stripe = new FakeStripePayment(),
  binding: FlightConsumerPreviewRuntimeBinding = runtimeBinding,
) {
  const createStripePayment = vi.fn(async (
    input: Parameters<FlightConsumerPreviewReconciliationDependencies["createStripePayment"]>[0],
  ) => {
    if (!input.runtimeBinding) throw new Error("missing runtime binding");
    return stripe;
  });
  const workflow = createInjectedFlightConsumerPreviewReconciliationWorkflow({
    store,
    runtimeBinding: binding,
    authority,
    paymentReferenceKeyring,
    refundReferenceKeyring,
    createStripePayment,
    readTrustedTime: () => trustedTime,
  });
  return { workflow, store, stripe, createStripePayment };
}

const input = Object.freeze({
  customerId,
  orderId,
  idempotencyKey: "support-refund-gate-0001",
});

describe("Flight Consumer Preview scoped reconciliation context loader", () => {
  it("loads the entire strict owner-bound context through one service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ context: context() }], error: null }));
    const loaded = await loadFlightConsumerPreviewReconciliationContextFromRpc(
      { rpc } satisfies FlightConsumerPreviewReconciliationRpcClient,
      { customerId, orderId, executionScopeSha256 },
    );
    expect(loaded).toMatchObject({
      order: { id: orderId, customer_id: customerId, execution_scope_sha256: executionScopeSha256 },
      payment: { id: paymentId },
      ticketCount: 0,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "get_flight_consumer_reconciliation_context_v1",
      { p_customer_id: customerId, p_order_id: orderId },
    );
  });

  it("returns null only for no row and rejects wrong scope or extra sensitive fields generically", async () => {
    const empty = vi.fn(async () => ({ data: [], error: null }));
    await expect(loadFlightConsumerPreviewReconciliationContextFromRpc(
      { rpc: empty },
      { customerId, orderId, executionScopeSha256 },
    )).resolves.toBeNull();

    const wrongScope = context();
    wrongScope.order.execution_scope_sha256 = "f".repeat(64);
    await expect(loadFlightConsumerPreviewReconciliationContextFromRpc(
      { rpc: vi.fn(async () => ({ data: [{ context: wrongScope }], error: null })) },
      { customerId, orderId, executionScopeSha256 },
    )).rejects.toBeInstanceOf(FlightConsumerPreviewReconciliationError);

    const unsafe = context();
    Object.assign(unsafe.payment!, { card_number: "4242424242424242" });
    const failure = await loadFlightConsumerPreviewReconciliationContextFromRpc(
      { rpc: vi.fn(async () => ({ data: [{ context: unsafe }], error: null })) },
      { customerId, orderId, executionScopeSha256 },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FlightConsumerPreviewReconciliationError);
    expect(String(failure)).not.toContain("4242424242424242");
  });
});

describe("Flight Consumer Preview internal reconciliation/refund workflow", () => {
  it("retrieves the exact Stripe test PaymentIntent and atomically compensates only zero-provider-liability", async () => {
    const { workflow, store, stripe, createStripePayment } = createSubject();
    await expect(workflow.reconcile(input)).resolves.toEqual({
      decision: "refunded",
      orderId,
      paymentId,
      refundAttemptId,
    });

    expect(createStripePayment).toHaveBeenCalledExactlyOnceWith({
      orderId,
      customerId,
      amountCents,
      runtimeBinding: {
        executionScopeSha256,
        paymentProcessorCode: runtimeBinding.paymentProcessorCode,
        paymentEnvironment: runtimeBinding.paymentEnvironment,
        paymentAccountSha256: runtimeBinding.paymentAccountSha256,
        paymentSourceSha256: runtimeBinding.paymentSourceSha256,
        paymentAdapterVersionSha256: runtimeBinding.paymentAdapterVersionSha256,
      },
    });
    expect(stripe.calls).toEqual([
      { name: "retrieve", input: { paymentIntentId } },
      { name: "refund", input: { paymentIntentId, attemptId: refundAttemptId } },
    ]);
    expect(store.calls.map(({ name }) => name)).toEqual([
      "load", "prepare", "load", "claim", "load", "complete", "apply",
    ]);
    const prepare = store.calls.find(({ name }) => name === "prepare")!.parameters;
    expect(prepare).toMatchObject({
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_adapter_source_sha256: runtimeBinding.paymentSourceSha256,
      p_payment_binding_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_operation_authority_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const apply = store.calls.find(({ name }) => name === "apply")!
      .parameters as FlightConsumerRefundApplyParameters;
    expect(apply.p_refunded_cents).toBe(amountCents);
    expect(apply.p_refund_reference_ciphertext).toMatch(/^enc:v1:/);
    expect(JSON.stringify(store.calls)).not.toContain(paymentIntentId);
    expect(JSON.stringify(store.calls)).not.toContain(refundId);
    expect(decryptFlightConsumerPreviewStripeRefundReference({
      ciphertext: apply.p_refund_reference_ciphertext,
      expectedReferenceSha256: apply.p_refund_reference_sha256,
      binding: {
        customerId,
        orderId,
        paymentId,
        attemptId: refundAttemptId,
        paymentIntentReferenceSha256: protectedPaymentIntent.referenceSha256,
        executionScopeSha256,
        keyVersion: referenceKeyVersion,
      },
      keyring: refundReferenceKeyring,
    })).toBe(refundId);
  });

  it("requires resolved duplicate-suppression evidence and never calls a Duffel mutation", async () => {
    for (const mutation of [
      (value: TestContext) => { value.safeResolution = null; },
      (value: TestContext) => { value.safeResolution!.resolution_code = "payment_reversed"; },
      (value: TestContext) => { value.providerAttempt!.state = "succeeded"; },
      (value: TestContext) => { value.order.provider_order_ref_sha256 = "f".repeat(64); },
      (value: TestContext) => { value.ticketCount = 1; },
    ]) {
      const store = new MemoryStore();
      mutation(store.current);
      const { workflow, stripe } = createSubject(store);
      await expect(workflow.reconcile(input)).resolves.toMatchObject({
        decision: "manual_review_required",
        reason: "provider_outcome_unresolved",
      });
      expect(stripe.calls).toHaveLength(0);
      expect(store.calls.map(({ name }) => name)).toEqual(["load"]);
    }
  });

  it("compensates an administrator-confirmed captured order whose Duffel dispatch never started", async () => {
    const store = new MemoryStore();
    store.current.providerAttempt = null;
    const { workflow, stripe } = createSubject(store);
    await expect(workflow.reconcile(input)).resolves.toMatchObject({ decision: "refunded" });
    expect(stripe.calls.filter(({ name }) => name === "refund")).toHaveLength(1);
    expect(store.calls.every(({ name }) => !name.toLowerCase().includes("duffel"))).toBe(true);
  });

  it("rejects live runtime bindings and cross-owner records before touching money", async () => {
    expect(() => createSubject(
      new MemoryStore(),
      new FakeStripePayment(),
      { ...runtimeBinding, paymentEnvironment: "live" } as unknown as FlightConsumerPreviewRuntimeBinding,
    )).toThrow(FlightConsumerPreviewReconciliationError);

    const store = new MemoryStore();
    store.current.order.customer_id = "77777777-7777-4777-8777-777777777777";
    const { workflow, stripe } = createSubject(store);
    await expect(workflow.reconcile(input)).rejects.toBeInstanceOf(
      FlightConsumerPreviewReconciliationError,
    );
    expect(stripe.calls).toHaveLength(0);
  });

  it("does not prepare or refund unless Stripe reports the exact full captured test intent", async () => {
    const stripe = new FakeStripePayment();
    stripe.snapshotDecision = "authorized";
    const { workflow, store } = createSubject(new MemoryStore(), stripe);
    await expect(workflow.reconcile(input)).resolves.toEqual({
      decision: "manual_review_required",
      orderId,
      reason: "payment_outcome_unresolved",
    });
    expect(stripe.calls.map(({ name }) => name)).toEqual(["retrieve"]);
    expect(store.calls.map(({ name }) => name)).toEqual(["load"]);
  });

  it("journals an indeterminate Stripe refund once and stops for manual reconciliation", async () => {
    const stripe = new FakeStripePayment();
    stripe.refundFailure = new Error(`${secretMarker}: connection lost`);
    const { workflow, store } = createSubject(new MemoryStore(), stripe);
    await expect(workflow.reconcile(input)).resolves.toEqual({
      decision: "manual_review_required",
      orderId,
      reason: "refund_operation_unresolved",
    });
    expect(stripe.calls.map(({ name }) => name)).toEqual(["retrieve", "refund"]);
    expect(store.calls.filter(({ name }) => name === "complete")).toHaveLength(1);
    expect(store.calls.find(({ name }) => name === "complete")!.parameters).toMatchObject({
      p_terminal_state: "ambiguous",
      p_terminal_http_status: null,
      p_terminal_response_sha256: null,
    });
    expect(store.calls.some(({ name }) => name === "apply")).toBe(false);
    expect(JSON.stringify(store.calls)).not.toContain(secretMarker);
  });

  it("never applies a pending Stripe refund as completed", async () => {
    const stripe = new FakeStripePayment();
    stripe.refundDecision = "refund_pending";
    const { workflow, store } = createSubject(new MemoryStore(), stripe);
    await expect(workflow.reconcile(input)).resolves.toMatchObject({
      decision: "manual_review_required",
      reason: "refund_operation_unresolved",
    });
    expect(store.calls.some(({ name }) => name === "apply")).toBe(false);
    expect(store.current.payment!.status).toBe("ambiguous");
  });

  it("recovers lost claim and apply responses without issuing a second refund", async () => {
    const store = new MemoryStore();
    store.failClaimAfterCommit = true;
    store.failCompleteAfterCommit = true;
    store.failApplyAfterCommit = true;
    const { workflow, stripe } = createSubject(store);
    await expect(workflow.reconcile(input)).resolves.toEqual({
      decision: "already_refunded",
      orderId,
      paymentId,
      refundAttemptId,
    });
    expect(stripe.calls.filter(({ name }) => name === "refund")).toHaveLength(1);
    expect(store.calls.filter(({ name }) => name === "apply")).toHaveLength(1);
  });

  it("resumes only the same durable dispatch with the same Stripe idempotency identity", async () => {
    const store = new MemoryStore();
    store.failCompleteAmbiguous = true;
    const firstStripe = new FakeStripePayment();
    firstStripe.refundFailure = new Error("indeterminate network result");
    const first = createSubject(store, firstStripe).workflow;
    await expect(first.reconcile(input)).resolves.toMatchObject({
      decision: "manual_review_required",
    });
    expect(store.current.refundAttempt!.state).toBe("dispatching");

    const secondStripe = new FakeStripePayment();
    const second = createSubject(store, secondStripe).workflow;
    await expect(second.reconcile(input)).resolves.toMatchObject({ decision: "refunded" });
    expect(secondStripe.calls.filter(({ name }) => name === "refund")).toEqual([{
      name: "refund",
      input: { paymentIntentId, attemptId: refundAttemptId },
    }]);
    expect(store.calls.filter(({ name }) => name === "prepare")).toHaveLength(1);
    expect(store.calls.filter(({ name }) => name === "claim")).toHaveLength(1);
  });

  it("returns terminal failed-order outcomes without accessing Stripe", async () => {
    const noPaymentStore = new MemoryStore();
    noPaymentStore.current.order.status = "failed";
    noPaymentStore.current.payment = null;
    const noPayment = createSubject(noPaymentStore);
    await expect(noPayment.workflow.reconcile(input)).resolves.toEqual({
      decision: "no_refund_required",
      orderId,
      paymentId: null,
    });
    expect(noPayment.stripe.calls).toHaveLength(0);

    const completed = createSubject();
    await completed.workflow.reconcile(input);
    completed.stripe.calls.length = 0;
    await expect(completed.workflow.reconcile(input)).resolves.toMatchObject({
      decision: "already_refunded",
      refundAttemptId,
    });
    expect(completed.stripe.calls).toHaveLength(0);
  });

  it("uses a generic error that cannot leak database or credential details", async () => {
    const store = new MemoryStore();
    store.failLoad = new Error(`${secretMarker}: ${paymentIntentId}`);
    const { workflow } = createSubject(store);
    const failure = await workflow.reconcile(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FlightConsumerPreviewReconciliationError);
    expect(String(failure)).not.toContain(secretMarker);
    expect(String(failure)).not.toContain(paymentIntentId);
  });

  it("binds encrypted refund evidence to the exact owner, order, payment, and attempt", async () => {
    const { workflow, store } = createSubject();
    await workflow.reconcile(input);
    const apply = store.calls.find(({ name }) => name === "apply")!
      .parameters as FlightConsumerRefundApplyParameters;
    expect(() => decryptFlightConsumerPreviewStripeRefundReference({
      ciphertext: apply.p_refund_reference_ciphertext,
      expectedReferenceSha256: apply.p_refund_reference_sha256,
      binding: {
        customerId,
        orderId,
        paymentId,
        attemptId: "77777777-7777-4777-8777-777777777777",
        paymentIntentReferenceSha256: protectedPaymentIntent.referenceSha256,
        executionScopeSha256,
        keyVersion: referenceKeyVersion,
      },
      keyring: refundReferenceKeyring,
    })).toThrow("refund reference is unavailable");
  });
});
