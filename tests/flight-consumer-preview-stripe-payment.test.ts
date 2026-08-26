import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStripe: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../lib/stripe", () => ({ getStripe: mocks.getStripe }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
  FlightConsumerPreviewStripePaymentError,
  createFlightConsumerPreviewStripePayment,
  createInjectedFlightConsumerPreviewStripePayment,
  type FlightConsumerPreviewStripeAdapter,
  type FlightConsumerPreviewStripePaymentBinding,
  type FlightConsumerStripePaymentIntentCaptureParameters,
  type FlightConsumerStripePaymentIntentCreateParameters,
  type FlightConsumerStripePaymentIntentRetrieveParameters,
  type FlightConsumerStripeRefundCreateParameters,
  type FlightConsumerStripeRequestOptions,
} from "../lib/flights/consumer-preview/stripe-payment.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const createAttemptId = "33333333-3333-4333-8333-333333333333";
const captureAttemptId = "44444444-4444-4444-8444-444444444444";
const refundAttemptId = "55555555-5555-4555-8555-555555555555";
const paymentIntentId = "pi_testpayment0001";
const clientSecret = `${paymentIntentId}_secret_testsecret0001`;
const refundId = "re_testrefund00001";
const secretMarker = "sk_test_DO_NOT_LEAK_THIS_SECRET_12345678";

const binding = Object.freeze({
  orderId,
  customerId,
  amountCents: 123_456,
  executionScopeSha256: "a".repeat(64),
  paymentProcessorCode: "stripe",
  paymentEnvironment: "test",
  paymentAccountSha256: "b".repeat(64),
  paymentSourceSha256: "c".repeat(64),
  paymentAdapterVersionSha256: "d".repeat(64),
}) satisfies FlightConsumerPreviewStripePaymentBinding;

const expectedMetadata = Object.freeze({
  integration: "flight_consumer_preview_v1",
  execution_mode: "test",
  order_id: orderId,
  customer_id: customerId,
  execution_scope_sha256: binding.executionScopeSha256,
  payment_account_sha256: binding.paymentAccountSha256,
  payment_source_sha256: binding.paymentSourceSha256,
  payment_adapter_version_sha256: binding.paymentAdapterVersionSha256,
});

type FakeIntent = {
  id: string;
  object: "payment_intent";
  livemode: boolean;
  amount: number;
  amountCapturable: number;
  amountReceived: number;
  currency: string;
  captureMethod: string;
  confirmationMethod: string;
  paymentMethodTypes: string[];
  clientSecret: string | null;
  status: string;
  metadata: Record<string, string>;
  latestCharge: FakeCharge | string | null;
};

type FakeChargeRefund = {
  id: string;
  object: "refund";
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: string | null;
};

type FakeCharge = {
  id: string;
  object: "charge";
  paymentIntentId: string;
  livemode: boolean;
  amount: number;
  amountCaptured: number;
  amountRefunded: number;
  currency: string;
  captured: boolean;
  paid: boolean;
  refunded: boolean;
  disputed: boolean;
  status: "succeeded";
  refunds: {
    object: "list";
    data: FakeChargeRefund[];
    hasMore: boolean;
  };
};

function chargeFor(captured: boolean): FakeCharge {
  return {
    id: "ch_testcharge00001",
    object: "charge",
    paymentIntentId,
    livemode: false,
    amount: binding.amountCents,
    amountCaptured: captured ? binding.amountCents : 0,
    amountRefunded: 0,
    currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
    captured,
    paid: true,
    refunded: false,
    disputed: false,
    status: "succeeded",
    refunds: { object: "list", data: [], hasMore: false },
  };
}

function chargeRefund(status: "pending" | "succeeded", amount: number): FakeChargeRefund {
  return {
    id: status === "pending" ? "re_pendingrefund001" : "re_completedrefund1",
    object: "refund",
    paymentIntentId,
    amount,
    currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
    status,
  };
}

function intentFor(status: string = "requires_payment_method"): FakeIntent {
  return {
    id: paymentIntentId,
    object: "payment_intent",
    livemode: false,
    amount: binding.amountCents,
    amountCapturable: status === "requires_capture" ? binding.amountCents : 0,
    amountReceived: status === "succeeded" ? binding.amountCents : 0,
    currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
    captureMethod: "manual",
    confirmationMethod: "automatic",
    paymentMethodTypes: ["card"],
    clientSecret,
    status,
    metadata: { ...expectedMetadata },
    latestCharge: status === "requires_capture"
      ? chargeFor(false)
      : status === "succeeded"
        ? chargeFor(true)
        : null,
  };
}

function rawStripeIntent(status: "requires_capture" | "succeeded") {
  const projected = intentFor(status);
  const charge = projected.latestCharge;
  if (charge === null || typeof charge === "string") throw new Error("expanded charge expected");
  return {
    id: projected.id,
    object: projected.object,
    livemode: projected.livemode,
    amount: projected.amount,
    amount_capturable: projected.amountCapturable,
    amount_received: projected.amountReceived,
    currency: projected.currency,
    capture_method: projected.captureMethod,
    confirmation_method: projected.confirmationMethod,
    payment_method_types: projected.paymentMethodTypes,
    client_secret: projected.clientSecret,
    status: projected.status,
    metadata: projected.metadata,
    latest_charge: {
      id: charge.id,
      object: charge.object,
      payment_intent: charge.paymentIntentId,
      livemode: charge.livemode,
      amount: charge.amount,
      amount_captured: charge.amountCaptured,
      amount_refunded: charge.amountRefunded,
      currency: charge.currency,
      captured: charge.captured,
      paid: charge.paid,
      refunded: charge.refunded,
      disputed: charge.disputed,
      status: charge.status,
      refunds: {
        object: charge.refunds.object,
        data: charge.refunds.data.map((refund) => ({
          id: refund.id,
          object: refund.object,
          payment_intent: refund.paymentIntentId,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
        })),
        has_more: charge.refunds.hasMore,
        url: `/v1/charges/${charge.id}/refunds`,
      },
      billing_details: { email: "must-not-cross-adapter@example.test" },
      payment_method_details: { card: { last4: "4242" } },
    },
  };
}

class FakeStripeAdapter implements FlightConsumerPreviewStripeAdapter {
  readonly createCalls: Array<{
    parameters: FlightConsumerStripePaymentIntentCreateParameters;
    options: FlightConsumerStripeRequestOptions;
  }> = [];
  readonly retrieveCalls: Array<{
    paymentIntentId: string;
    parameters: FlightConsumerStripePaymentIntentRetrieveParameters;
  }> = [];
  readonly captureCalls: Array<{
    paymentIntentId: string;
    parameters: FlightConsumerStripePaymentIntentCaptureParameters;
    options: FlightConsumerStripeRequestOptions;
  }> = [];
  readonly refundCalls: Array<{
    parameters: FlightConsumerStripeRefundCreateParameters;
    options: FlightConsumerStripeRequestOptions;
  }> = [];
  intent: unknown = intentFor();
  capturedIntent: unknown | undefined;
  refund: unknown | undefined;
  failure: Error | null = null;
  captureFailure: Error | null = null;

  async createPaymentIntent(
    parameters: FlightConsumerStripePaymentIntentCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    this.createCalls.push({ parameters: structuredClone(parameters), options: structuredClone(options) });
    if (this.failure) throw this.failure;
    return structuredClone(this.intent);
  }

  async retrievePaymentIntent(
    reference: string,
    parameters: FlightConsumerStripePaymentIntentRetrieveParameters,
  ) {
    this.retrieveCalls.push({
      paymentIntentId: reference,
      parameters: structuredClone(parameters),
    });
    if (this.failure) throw this.failure;
    return structuredClone(this.intent);
  }

  async capturePaymentIntent(
    reference: string,
    parameters: FlightConsumerStripePaymentIntentCaptureParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    this.captureCalls.push({
      paymentIntentId: reference,
      parameters: structuredClone(parameters),
      options: structuredClone(options),
    });
    if (this.captureFailure) throw this.captureFailure;
    if (this.failure) throw this.failure;
    this.intent = this.capturedIntent ?? intentFor("succeeded");
    return structuredClone(this.intent);
  }

  async createRefund(
    parameters: FlightConsumerStripeRefundCreateParameters,
    options: FlightConsumerStripeRequestOptions,
  ) {
    this.refundCalls.push({ parameters: structuredClone(parameters), options: structuredClone(options) });
    if (this.failure) throw this.failure;
    return structuredClone(this.refund ?? {
      id: refundId,
      object: "refund",
      paymentIntentId: parameters.paymentIntentId,
      amount: parameters.amount,
      currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
      status: "succeeded",
      metadata: parameters.metadata,
    });
  }
}

function createSubject(adapter = new FakeStripeAdapter(), secret = secretMarker) {
  const payment = createInjectedFlightConsumerPreviewStripePayment(binding, {
    adapter,
    stripeSecretKey: secret,
  });
  return { payment, adapter };
}

function stripeKeyHash(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

describe("Flight Consumer Preview Stripe test-payment orchestration", () => {
  it("projects a full runtime authority down to the exact Stripe binding", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", secretMarker);
    try {
      await expect(createFlightConsumerPreviewStripePayment({
        orderId,
        customerId,
        amountCents: binding.amountCents,
        runtimeBinding: {
          executionScopeSha256: binding.executionScopeSha256,
          paymentProcessorCode: "stripe",
          paymentEnvironment: "test",
          paymentAccountSha256: binding.paymentAccountSha256,
          paymentSourceSha256: binding.paymentSourceSha256,
          paymentAdapterVersionSha256: binding.paymentAdapterVersionSha256,
          runtimeControlReceiptSha256: "e".repeat(64),
        },
      } as Parameters<typeof createFlightConsumerPreviewStripePayment>[0]))
        .resolves.toBeDefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reconstructs omitted nullable charge refunds from an authoritative filtered list", async () => {
    const authorized = rawStripeIntent("requires_capture");
    const captured = rawStripeIntent("succeeded");
    Reflect.deleteProperty(authorized.latest_charge, "refunds");
    Reflect.deleteProperty(captured.latest_charge, "refunds");
    const retrieve = vi.fn(async () => authorized);
    const capture = vi.fn(async () => captured);
    const list = vi.fn(async () => ({
      object: "list" as const,
      data: [],
      has_more: false,
      url: "/v1/refunds",
    }));
    mocks.getStripe.mockReturnValue({ paymentIntents: { retrieve, capture }, refunds: { list } });
    vi.stubEnv("STRIPE_SECRET_KEY", secretMarker);
    try {
      const payment = await createFlightConsumerPreviewStripePayment({
        orderId,
        customerId,
        amountCents: binding.amountCents,
        runtimeBinding: {
          executionScopeSha256: binding.executionScopeSha256,
          paymentProcessorCode: "stripe",
          paymentEnvironment: "test",
          paymentAccountSha256: binding.paymentAccountSha256,
          paymentSourceSha256: binding.paymentSourceSha256,
          paymentAdapterVersionSha256: binding.paymentAdapterVersionSha256,
        },
      });
      await expect(payment.retrievePaymentIntent({ paymentIntentId }))
        .resolves.toMatchObject({ decision: "authorized" });
      await expect(payment.capturePaymentIntent({ paymentIntentId, attemptId: captureAttemptId }))
        .resolves.toMatchObject({ decision: "captured" });
      expect(retrieve).toHaveBeenCalledWith(paymentIntentId, {
        expand: ["latest_charge"],
      });
      expect(list).toHaveBeenNthCalledWith(1, {
        payment_intent: paymentIntentId,
        limit: 100,
      });
      expect(capture).toHaveBeenCalledWith(
        paymentIntentId,
        {
          amount_to_capture: binding.amountCents,
          expand: ["latest_charge"],
        },
        { idempotencyKey: expect.stringMatching(/^irp_fcp_stripe_capture_v1_[0-9a-f]{64}$/) },
      );
      expect(list).toHaveBeenNthCalledWith(2, {
        payment_intent: paymentIntentId,
        limit: 100,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("treats a pending refund from the authoritative list as capture-attestation mismatch", async () => {
    const captured = rawStripeIntent("succeeded");
    const charge = captured.latest_charge;
    Reflect.deleteProperty(charge, "refunds");
    const retrieve = vi.fn(async () => captured);
    const list = vi.fn(async () => ({
      object: "list" as const,
      data: [{
        id: "re_pendingrefund001",
        object: "refund" as const,
        payment_intent: paymentIntentId,
        amount: binding.amountCents,
        currency: FLIGHT_CONSUMER_PREVIEW_STRIPE_CURRENCY,
        status: "pending",
      }],
      has_more: false,
      url: "/v1/refunds",
    }));
    mocks.getStripe.mockReturnValue({ paymentIntents: { retrieve }, refunds: { list } });
    vi.stubEnv("STRIPE_SECRET_KEY", secretMarker);
    try {
      const payment = await createFlightConsumerPreviewStripePayment({
        orderId,
        customerId,
        amountCents: binding.amountCents,
        runtimeBinding: {
          executionScopeSha256: binding.executionScopeSha256,
          paymentProcessorCode: "stripe",
          paymentEnvironment: "test",
          paymentAccountSha256: binding.paymentAccountSha256,
          paymentSourceSha256: binding.paymentSourceSha256,
          paymentAdapterVersionSha256: binding.paymentAdapterVersionSha256,
        },
      });
      await expect(payment.attestCapturedPaymentIntent({ paymentIntentId })).resolves.toMatchObject({
        decision: "mismatch",
        reason: "refund_observed",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("creates an exact USD manual-capture card PaymentIntent without card data", async () => {
    const { payment, adapter } = createSubject();
    const result = await payment.createPaymentIntent({ attemptId: createAttemptId });

    expect(result).toEqual({
      version: "flight-consumer-preview-stripe-create-v1",
      paymentIntentId,
      clientSecret,
      status: "requires_payment_method",
      amountCents: binding.amountCents,
      currency: "usd",
      paymentIdempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(adapter.createCalls).toHaveLength(1);
    expect(adapter.createCalls[0]!.parameters).toEqual({
      amount: binding.amountCents,
      currency: "usd",
      captureMethod: "manual",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card"],
      metadata: expectedMetadata,
    });
    const serialized = JSON.stringify(adapter.createCalls[0]!.parameters).toLowerCase();
    expect(serialized).not.toMatch(/card_number|cardnumber|\bcvc\b|client_secret|sk_test_|sk_live_/);
  });

  it("derives stable, operation-bound, hash-only Stripe idempotency keys from UUID attempts", async () => {
    const { payment, adapter } = createSubject();
    const first = await payment.createPaymentIntent({ attemptId: createAttemptId });
    const second = await payment.createPaymentIntent({ attemptId: createAttemptId });
    const another = await payment.createPaymentIntent({
      attemptId: "66666666-6666-4666-8666-666666666666",
    });
    const [firstKey, secondKey, anotherKey] = adapter.createCalls.map((call) => call.options.idempotencyKey);
    expect(firstKey).toBe(secondKey);
    expect(anotherKey).not.toBe(firstKey);
    expect(firstKey).toMatch(/^irp_fcp_stripe_create_v1_[0-9a-f]{64}$/);
    expect(firstKey).not.toContain(createAttemptId);
    expect(firstKey).not.toContain(orderId);
    expect(firstKey).not.toContain(customerId);
    expect(first.paymentIdempotencyKeySha256).toBe(stripeKeyHash(firstKey!));
    expect(second.paymentIdempotencyKeySha256).toBe(first.paymentIdempotencyKeySha256);
    expect(another.paymentIdempotencyKeySha256).not.toBe(first.paymentIdempotencyKeySha256);
  });

  it("rejects live, restricted, missing, and malformed Stripe keys before any operation", () => {
    for (const key of ["sk_live_not_allowed_12345678", "rk_test_not_allowed_12345678", "", "private-key"]) {
      expect(() => createSubject(new FakeStripeAdapter(), key)).toThrow(FlightConsumerPreviewStripePaymentError);
    }
  });

  it("strictly rejects livemode and cross-order/customer/execution/amount PaymentIntents", async () => {
    const mutations: Array<Partial<FakeIntent>> = [
      { livemode: true },
      { amount: binding.amountCents + 1 },
      { currency: "eur" },
      { captureMethod: "automatic" },
      { paymentMethodTypes: ["card", "us_bank_account"] },
      { metadata: { ...expectedMetadata, order_id: "77777777-7777-4777-8777-777777777777" } },
      { metadata: { ...expectedMetadata, customer_id: "77777777-7777-4777-8777-777777777777" } },
      { metadata: { ...expectedMetadata, execution_scope_sha256: "e".repeat(64) } },
      { metadata: { ...expectedMetadata, unexpected: "not-allowed" } },
    ];
    for (const mutation of mutations) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = { ...intentFor(), ...mutation };
      const { payment } = createSubject(adapter);
      await expect(payment.createPaymentIntent({ attemptId: createAttemptId }))
        .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    }
  });

  it("retrieves only the bound PaymentIntent and maps authorization state", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("requires_capture");
    const { payment } = createSubject(adapter);
    await expect(payment.retrievePaymentIntent({ paymentIntentId })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-payment-snapshot-v1",
      paymentIntentId,
      status: "requires_capture",
      decision: "authorized",
      amountCents: binding.amountCents,
      amountCapturableCents: binding.amountCents,
      amountReceivedCents: 0,
      currency: "usd",
    });
    expect(adapter.retrieveCalls).toEqual([{
      paymentIntentId,
      parameters: { expand: ["latest_charge"] },
    }]);
    (adapter.intent as FakeIntent).id = "pi_anotherpayment01";
    await expect(payment.retrievePaymentIntent({ paymentIntentId }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
  });

  it("requires an exact expanded latest charge for authorization and captured success", async () => {
    for (const status of ["requires_capture", "succeeded"] as const) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = intentFor(status);
      const { payment } = createSubject(adapter);
      await expect(payment.retrievePaymentIntent({ paymentIntentId })).resolves.toMatchObject({
        paymentIntentId,
        status,
        decision: status === "requires_capture" ? "authorized" : "captured",
        amountCents: binding.amountCents,
        currency: "usd",
      });
    }
  });

  it("returns only digest/categorical capture attestation and detects refund or dispute", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("succeeded");
    const { payment } = createSubject(adapter);
    await expect(payment.attestCapturedPaymentIntent({ paymentIntentId })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-capture-attestation-v1",
      decision: "matched",
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const refundedCharge = chargeFor(true);
    refundedCharge.amountRefunded = 1;
    refundedCharge.refunds.data = [chargeRefund("succeeded", 1)];
    adapter.intent = { ...intentFor("succeeded"), latestCharge: refundedCharge };
    const refundResult = await payment.attestCapturedPaymentIntent({ paymentIntentId });
    expect(refundResult).toMatchObject({ decision: "mismatch", reason: "refund_observed" });

    const disputedCharge = chargeFor(true);
    disputedCharge.disputed = true;
    adapter.intent = { ...intentFor("succeeded"), latestCharge: disputedCharge };
    const disputeResult = await payment.attestCapturedPaymentIntent({ paymentIntentId });
    expect(disputeResult).toMatchObject({ decision: "mismatch", reason: "dispute_observed" });

    const serialized = JSON.stringify([refundResult, disputeResult]);
    expect(serialized).not.toMatch(/pi_|ch_|re_|4242|billing|card|secret/i);
  });

  it("keeps Stripe/API and malformed-projection attestation failures retryable", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.failure = new Error("timeout with provider detail that must not escape");
    const { payment } = createSubject(adapter);
    await expect(payment.attestCapturedPaymentIntent({ paymentIntentId })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-capture-attestation-v1",
      decision: "unavailable",
      reason: "provider_unavailable",
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    adapter.failure = null;
    adapter.intent = { malformed: "provider payload" };
    await expect(payment.attestCapturedPaymentIntent({ paymentIntentId })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-capture-attestation-v1",
      decision: "unavailable",
      reason: "projection_rejected",
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("rejects missing, unexpanded, or identity-mismatched latest charges", async () => {
    const withoutLatestCharge: Record<string, unknown> = {
      ...intentFor("requires_capture"),
    };
    delete withoutLatestCharge.latestCharge;
    const malformed: unknown[] = [
      withoutLatestCharge,
      { ...intentFor("requires_capture"), latestCharge: null },
      { ...intentFor("requires_capture"), latestCharge: "ch_unexpanded00001" },
      {
        ...intentFor("requires_capture"),
        latestCharge: {
          ...chargeFor(false),
          paymentIntentId: "pi_otherpayment0001",
        },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), amount: binding.amountCents - 1 },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), currency: "eur" },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), livemode: true },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), refunds: undefined },
      },
    ];
    for (const intent of malformed) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = intent;
      await expect(createSubject(adapter).payment.retrievePaymentIntent({ paymentIntentId }))
        .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    }
  });

  it("rejects partial, full, pending, or incompletely paginated refund history", async () => {
    const partial = chargeFor(true);
    partial.amountRefunded = 1;
    partial.refunds.data = [chargeRefund("succeeded", 1)];
    const full = chargeFor(true);
    full.amountRefunded = binding.amountCents;
    full.refunded = true;
    full.refunds.data = [chargeRefund("succeeded", binding.amountCents)];
    const pending = chargeFor(true);
    pending.refunds.data = [chargeRefund("pending", binding.amountCents)];
    const incomplete = chargeFor(true);
    incomplete.refunds.hasMore = true;
    const amountOnly = chargeFor(true);
    amountOnly.amountRefunded = 1;
    const refundedFlagOnly = chargeFor(true);
    refundedFlagOnly.refunded = true;

    for (const latestCharge of [
      partial,
      full,
      pending,
      incomplete,
      amountOnly,
      refundedFlagOnly,
    ]) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = { ...intentFor("succeeded"), latestCharge };
      await expect(createSubject(adapter).payment.retrievePaymentIntent({ paymentIntentId }))
        .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    }
  });

  it("rejects disputed or semantically incorrect authorization/capture charges", async () => {
    const disputed = chargeFor(true);
    disputed.disputed = true;
    const malformed: unknown[] = [
      { ...intentFor("succeeded"), latestCharge: disputed },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), captured: true },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), paid: false },
      },
      {
        ...intentFor("requires_capture"),
        latestCharge: { ...chargeFor(false), amountCaptured: 1 },
      },
      {
        ...intentFor("succeeded"),
        latestCharge: { ...chargeFor(true), captured: false },
      },
      {
        ...intentFor("succeeded"),
        latestCharge: { ...chargeFor(true), paid: false },
      },
      {
        ...intentFor("succeeded"),
        latestCharge: { ...chargeFor(true), amountCaptured: binding.amountCents - 1 },
      },
    ];
    for (const intent of malformed) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = intent;
      await expect(createSubject(adapter).payment.retrievePaymentIntent({ paymentIntentId }))
        .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    }
  });

  it("recovers only the bound non-cancelled client secret after a lost checkout response", async () => {
    const adapter = new FakeStripeAdapter();
    const { payment } = createSubject(adapter);
    await expect(payment.retrievePaymentIntentForCheckout({ paymentIntentId })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-checkout-recovery-v1",
      paymentIntentId,
      clientSecret,
      status: "requires_payment_method",
      amountCents: binding.amountCents,
      currency: "usd",
    });
    adapter.intent = { ...intentFor(), clientSecret: null };
    await expect(payment.retrievePaymentIntentForCheckout({ paymentIntentId }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    adapter.intent = intentFor("canceled");
    await expect(payment.retrievePaymentIntentForCheckout({ paymentIntentId }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
  });

  it("captures exactly the full authorized amount without multi-capture parameters", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("requires_capture");
    const { payment } = createSubject(adapter);
    const captured = await payment.capturePaymentIntent({ paymentIntentId, attemptId: captureAttemptId });
    expect(captured).toEqual({
      version: "flight-consumer-preview-stripe-capture-v1",
      decision: "captured",
      paymentIntentId,
      amountCapturedCents: binding.amountCents,
      currency: "usd",
      paymentIdempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(adapter.captureCalls).toHaveLength(1);
    expect(adapter.captureCalls[0]).toMatchObject({
      paymentIntentId,
      parameters: {
        amountToCapture: binding.amountCents,
        expand: ["latest_charge"],
      },
      options: { idempotencyKey: expect.stringMatching(/^irp_fcp_stripe_capture_v1_[0-9a-f]{64}$/) },
    });
    expect(adapter.captureCalls[0]!.parameters).not.toHaveProperty("finalCapture");
    expect(captured.paymentIdempotencyKeySha256)
      .toBe(stripeKeyHash(adapter.captureCalls[0]!.options.idempotencyKey));

    await expect(payment.capturePaymentIntent({ paymentIntentId, attemptId: captureAttemptId }))
      .resolves.toMatchObject({ decision: "already_captured", amountCapturedCents: binding.amountCents });
    expect(adapter.captureCalls).toHaveLength(1);
  });

  it("refuses capture before exact full authorization", async () => {
    for (const malformed of [
      intentFor("requires_payment_method"),
      { ...intentFor("requires_capture"), amountCapturable: binding.amountCents - 1 },
      { ...intentFor("requires_capture"), amountReceived: 1 },
    ]) {
      const adapter = new FakeStripeAdapter();
      adapter.intent = malformed;
      const { payment } = createSubject(adapter);
      await expect(payment.capturePaymentIntent({ paymentIntentId, attemptId: captureAttemptId }))
        .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
      expect(adapter.captureCalls).toHaveLength(0);
    }
  });

  it("rejects a capture response that switches to a different latest charge", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("requires_capture");
    adapter.capturedIntent = {
      ...intentFor("succeeded"),
      latestCharge: { ...chargeFor(true), id: "ch_othercharge0001" },
    };
    await expect(createSubject(adapter).payment.capturePaymentIntent({
      paymentIntentId,
      attemptId: captureAttemptId,
    })).rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    expect(adapter.captureCalls).toHaveLength(1);
  });

  it("classifies a Stripe capture 4xx as a definitive non-capture without leaking it", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("requires_capture");
    adapter.captureFailure = Object.assign(
      new Error(`Stripe rejected ${secretMarker}`),
      { statusCode: 400 },
    );
    const { payment } = createSubject(adapter);

    const error = await payment.capturePaymentIntent({
      paymentIntentId,
      attemptId: captureAttemptId,
    }).catch((failure: unknown) => failure);

    expect(error).toMatchObject({
      phase: "dispatch_capture_request",
      disposition: "definitive_failure",
      httpStatus: 400,
    });
    expect(String(error)).not.toContain(secretMarker);
  });

  it("creates only an exact full refund for a captured bound intent", async () => {
    const adapter = new FakeStripeAdapter();
    adapter.intent = intentFor("succeeded");
    const { payment } = createSubject(adapter);
    const result = await payment.refundPaymentIntent({ paymentIntentId, attemptId: refundAttemptId });
    expect(result).toMatchObject({
      version: "flight-consumer-preview-stripe-refund-v1",
      decision: "refunded",
      refundId,
      paymentIntentId,
      amountRefundedCents: binding.amountCents,
      currency: "usd",
      paymentIdempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(adapter.refundCalls).toHaveLength(1);
    expect(adapter.refundCalls[0]).toMatchObject({
      parameters: {
        paymentIntentId,
        amount: binding.amountCents,
        metadata: {
          ...expectedMetadata,
          payment_intent_id: paymentIntentId,
          refund_idempotency_key_sha256: result.paymentIdempotencyKeySha256,
        },
      },
      options: { idempotencyKey: expect.stringMatching(/^irp_fcp_stripe_refund_v1_[0-9a-f]{64}$/) },
    });
  });

  it("fails closed on malformed refund authority and accepts a bounded pending result", async () => {
    const pendingAdapter = new FakeStripeAdapter();
    pendingAdapter.intent = intentFor("succeeded");
    const pendingPayment = createSubject(pendingAdapter).payment;
    pendingAdapter.refund = {
      id: refundId,
      object: "refund",
      paymentIntentId,
      amount: binding.amountCents,
      currency: "usd",
      status: "pending",
      metadata: {
        ...expectedMetadata,
        payment_intent_id: paymentIntentId,
        refund_idempotency_key_sha256: "0".repeat(64),
      },
    };
    await expect(pendingPayment.refundPaymentIntent({ paymentIntentId, attemptId: refundAttemptId }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);

    pendingAdapter.refund = {
      id: refundId,
      object: "refund",
      paymentIntentId,
      amount: binding.amountCents,
      currency: "usd",
      status: "pending",
      metadata: pendingAdapter.refundCalls[0]!.parameters.metadata,
    };
    await expect(pendingPayment.refundPaymentIntent({ paymentIntentId, attemptId: refundAttemptId }))
      .resolves.toMatchObject({ decision: "refund_pending" });

    const notCapturedAdapter = new FakeStripeAdapter();
    notCapturedAdapter.intent = intentFor("requires_capture");
    const notCapturedPayment = createSubject(notCapturedAdapter).payment;
    await expect(notCapturedPayment.refundPaymentIntent({ paymentIntentId, attemptId: refundAttemptId }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    expect(notCapturedAdapter.refundCalls).toHaveLength(0);
  });

  it("rejects extra request fields and normalizes provider errors without leaking secrets", async () => {
    const adapter = new FakeStripeAdapter();
    const { payment } = createSubject(adapter);
    const invalid = await payment.createPaymentIntent({
      attemptId: createAttemptId,
      cardNumber: "4242424242424242",
    } as unknown as { attemptId: string }).catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    expect(invalid).toMatchObject({ phase: "validate_create_input" });
    expect(adapter.createCalls).toHaveLength(0);

    adapter.failure = new Error(`Stripe failed with ${secretMarker} and 4242424242424242`);
    const failed = await payment.createPaymentIntent({ attemptId: createAttemptId }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(FlightConsumerPreviewStripePaymentError);
    expect(failed).toMatchObject({ phase: "dispatch_create_request" });
    expect(String(failed)).not.toContain(secretMarker);
    expect(String(failed)).not.toContain("4242424242424242");
  });
});
