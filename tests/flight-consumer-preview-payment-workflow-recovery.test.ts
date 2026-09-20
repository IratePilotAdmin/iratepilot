import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireRuntime: vi.fn(),
  createStripePayment: vi.fn(),
  verifyTravelerDisclosure: vi.fn(() => true),
  decryptReference: vi.fn(),
  encryptReference: vi.fn(),
  operationReceipt: vi.fn(() => "a".repeat(64)),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: mocks.requireRuntime,
}));
vi.mock("../lib/flights/consumer-preview/stripe-payment.server", () => ({
  createFlightConsumerPreviewStripePayment: mocks.createStripePayment,
}));
vi.mock("../lib/flights/consumer-preview/fictional-travelers", () => ({
  verifyFlightConsumerPreviewFictionalTravelerDisclosure: mocks.verifyTravelerDisclosure,
}));
vi.mock("../lib/flights/consumer-preview/reference-crypto.server", () => ({
  decryptFlightConsumerPreviewReference: mocks.decryptReference,
  encryptFlightConsumerPreviewReference: mocks.encryptReference,
  readFlightConsumerPreviewReferenceKeyring: vi.fn(() => Object.freeze({})),
}));
vi.mock("../lib/flights/consumer-preview/authority.server", () => ({
  createFlightConsumerPreviewAuthority: vi.fn(() => Object.freeze({
    operationReceipt: mocks.operationReceipt,
  })),
}));
vi.mock("../lib/flights/consumer-preview/duffel-evidence.server", () => ({
  extractVerifiedDuffelPreviewPassengerIds: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/offer-evidence-repository.server", () => ({
  createFlightConsumerPreviewOfferEvidenceRepository: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/pii-staging.server", () => ({
  createStagedFlightConsumerPreviewPiiRepository: vi.fn(),
  normalizedStagedFlightConsumerPassenger: vi.fn(),
}));
vi.mock("../lib/flights/duffel-sandbox-contract", () => ({
  rehydrateDuffelSandboxOfferEvidence: vi.fn(),
}));

import {
  FlightConsumerPreviewPaymentWorkflowError,
  prepareFlightConsumerPreviewPayment,
} from "../lib/flights/consumer-preview/payment-workflow.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const repriceReceiptId = "55555555-5555-4555-8555-555555555555";
const attemptId = "66666666-6666-4666-8666-666666666666";
const paymentId = "77777777-7777-4777-8777-777777777777";
const idempotencyKey = "88888888-8888-4888-8888-888888888888";
const otherIdempotencyKey = "99999999-9999-4999-8999-999999999999";
const paymentIntentId = "pi_previewpayment000001";
const clientSecret = `${paymentIntentId}_secret_previewpayment000001`;
const executionScopeSha256 = "1".repeat(64);
const amountCents = 54_321;

const runtime = Object.freeze({
  authorized: true as const,
  reasons: Object.freeze([] as const),
  binding: Object.freeze({
    executionScopeSha256,
    paymentAccountSha256: "2".repeat(64),
    paymentSourceSha256: "3".repeat(64),
    paymentAdapterVersionSha256: "4".repeat(64),
    runtimeControlReceiptSha256: "5".repeat(64),
  }),
});

const order = Object.freeze({
  id: orderId,
  customer_id: customerId,
  search_id: searchId,
  offer_id: offerId,
  reprice_receipt_id: repriceReceiptId,
  execution_mode: "test",
  execution_scope_sha256: executionScopeSha256,
  provider_code: "duffel",
  currency: "USD",
  total_cents: amountCents,
  status: "pending_payment",
});

const search = Object.freeze({
  adult_count: 1,
  child_count: 0,
  infant_in_seat_count: 0,
  infant_on_lap_count: 0,
  departure_date: "2026-11-15",
});

function checkoutKeySha256(key = idempotencyKey) {
  return sha256FlightEvidence({
    version: "flight-consumer-preview-checkout-idempotency-v1",
    customerId,
    orderId,
    key,
  });
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: attemptId,
    customer_id: customerId,
    order_id: orderId,
    payment_id: null,
    operation: "create_intent",
    execution_scope_sha256: executionScopeSha256,
    processor_account_sha256: runtime.binding.paymentAccountSha256,
    processor_source_sha256: runtime.binding.paymentSourceSha256,
    processor_adapter_version_sha256: runtime.binding.paymentAdapterVersionSha256,
    payment_binding_receipt_sha256: "6".repeat(64),
    adapter_source_sha256: runtime.binding.paymentSourceSha256,
    operation_authority_receipt_sha256: "7".repeat(64),
    idempotency_key_sha256: checkoutKeySha256(),
    idempotency_request_sha256: "8".repeat(64),
    request_plan_sha256: "8".repeat(64),
    request_sha256: "8".repeat(64),
    request_body_sha256: "8".repeat(64),
    amount_cents: amountCents,
    currency: "USD",
    dispatch_not_after: "2099-08-25T22:00:00.000Z",
    attempt_state: "dispatching",
    attempt_revision: 1,
    processor_object_ref_sha256: null,
    terminal_http_status: null,
    terminal_response_sha256: null,
    terminal_response_bytes: null,
    terminal_receipt_sha256: null,
    ...overrides,
  };
}

type RpcCall = Readonly<{ name: string; parameters: Record<string, unknown> }>;

function subject(existingAttempt: Record<string, unknown>) {
  const rpcCalls: RpcCall[] = [];
  const fromCalls: string[] = [];
  const createPaymentIntent = vi.fn(async () => Object.freeze({
    version: "flight-consumer-preview-stripe-create-v1" as const,
    paymentIntentId,
    clientSecret,
    status: "requires_payment_method" as const,
    amountCents,
    currency: "usd" as const,
    paymentIdempotencyKeySha256: "9".repeat(64),
  }));
  const retrievePaymentIntentForCheckout = vi.fn(async () => Object.freeze({
    version: "flight-consumer-preview-stripe-checkout-recovery-v1" as const,
    paymentIntentId,
    clientSecret,
    status: "requires_payment_method" as const,
    amountCents,
    currency: "usd" as const,
  }));
  const stripe = Object.freeze({
    createPaymentIntent,
    retrievePaymentIntentForCheckout,
    retrievePaymentIntent: vi.fn(),
    capturePaymentIntent: vi.fn(),
    refundPaymentIntent: vi.fn(),
  });

  const admin = {
    from(table: string) {
      fromCalls.push(table);
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === "flight_orders") return { data: order, error: null };
          if (table === "flight_searches") return { data: search, error: null };
          if (table === "flight_payments") {
            return {
              data: {
                id: paymentId,
                processor_reference_ciphertext: `enc:v1:${"A".repeat(32)}`,
                processor_reference_sha256: "b".repeat(64),
                status: "requires_payment_method",
              },
              error: null,
            };
          }
          return { data: null, error: new Error("unexpected table") };
        }),
      };
      return builder;
    },
    async rpc(name: string, parameters: Record<string, unknown>) {
      rpcCalls.push({ name, parameters });
      if (name === "get_flight_consumer_payment_operation_v1") {
        return { data: [existingAttempt], error: null };
      }
      if (name === "claim_flight_consumer_payment_operation_v1") {
        return {
          data: [{ attempt_id: attemptId, attempt_revision: 1, attempt_state: "dispatching" }],
          error: null,
        };
      }
      if (
        name === "complete_flight_consumer_payment_operation_v1"
        && parameters.p_terminal_state === "blocked"
      ) {
        return {
          data: [{ attempt_id: attemptId, attempt_revision: 1, attempt_state: "blocked" }],
          error: null,
        };
      }
      if (name === "complete_flight_consumer_payment_intent_v1") {
        return {
          data: [{
            decision: "completed",
            attempt_id: attemptId,
            attempt_revision: 2,
            attempt_state: "succeeded",
            payment_id: paymentId,
            payment_status: "requires_payment_method",
          }],
          error: null,
        };
      }
      return { data: null, error: new Error(`unexpected RPC: ${name}`) };
    },
  };

  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createStripePayment.mockResolvedValue(stripe);
  return { rpcCalls, fromCalls, stripe };
}

async function prepare(key = idempotencyKey) {
  return prepareFlightConsumerPreviewPayment({
    customerId,
    orderId,
    idempotencyKey: key,
    travelerDisclosures: [{ travelerSequence: 1 }],
  });
}

describe("Flight Consumer Preview payment retry recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRuntime.mockResolvedValue(runtime);
    mocks.decryptReference.mockReturnValue(paymentIntentId);
    mocks.encryptReference.mockReturnValue(Object.freeze({
      ciphertext: `enc:v1:${"C".repeat(32)}`,
      referenceSha256: "d".repeat(64),
    }));
  });

  it("replays only the same durable dispatch through the scoped RPC and Stripe attempt UUID", async () => {
    const { rpcCalls, fromCalls, stripe } = subject(attempt());

    await expect(prepare()).resolves.toEqual({
      orderId,
      paymentId,
      paymentIntentId,
      clientSecret,
    });

    expect(fromCalls).not.toContain("flight_payment_operation_attempts");
    expect(stripe.createPaymentIntent).toHaveBeenCalledExactlyOnceWith({ attemptId });
    expect(rpcCalls.find(({ name }) => name === "get_flight_consumer_payment_operation_v1"))
      .toEqual({
        name: "get_flight_consumer_payment_operation_v1",
        parameters: { p_customer_id: customerId, p_order_id: orderId, p_operation: "create_intent" },
      });
    expect(rpcCalls.some(({ name }) => name === "claim_flight_consumer_payment_operation_v1"))
      .toBe(false);
    expect(rpcCalls.find(({ name }) => name === "complete_flight_consumer_payment_intent_v1")?.parameters)
      .toMatchObject({ p_attempt_id: attemptId, p_expected_revision: 1, p_terminal_state: "succeeded" });
  });

  it("returns a committed PaymentIntent by exact encrypted reference without creating another", async () => {
    const { stripe } = subject(attempt({
      payment_id: paymentId,
      attempt_state: "succeeded",
      attempt_revision: 2,
      processor_object_ref_sha256: "b".repeat(64),
      terminal_http_status: 200,
      terminal_response_sha256: "c".repeat(64),
      terminal_response_bytes: 256,
      terminal_receipt_sha256: "d".repeat(64),
    }));

    await expect(prepare()).resolves.toMatchObject({ paymentId, paymentIntentId, clientSecret });
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    expect(stripe.retrievePaymentIntentForCheckout)
      .toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(mocks.decryptReference).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      expectedReferenceSha256: "b".repeat(64),
      context: expect.objectContaining({ customerId, resourceId: orderId, executionScopeSha256 }),
    }));
  });

  it("rejects a different caller idempotency UUID before any Stripe access", async () => {
    const { rpcCalls } = subject(attempt());

    await expect(prepare(otherIdempotencyKey))
      .rejects.toBeInstanceOf(FlightConsumerPreviewPaymentWorkflowError);
    expect(checkoutKeySha256(otherIdempotencyKey)).not.toBe(checkoutKeySha256());
    expect(mocks.createStripePayment).not.toHaveBeenCalled();
    expect(rpcCalls.map(({ name }) => name)).toEqual([
      "get_flight_consumer_payment_operation_v1",
    ]);
  });

  it("blocks an expired prepared attempt at revision zero without dispatching Stripe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T21:00:00.000Z"));
    try {
      const { rpcCalls } = subject(attempt({
        dispatch_not_after: "2026-08-25T20:59:59.000Z",
        attempt_state: "prepared",
        attempt_revision: 0,
      }));

      await expect(prepare()).rejects.toBeInstanceOf(FlightConsumerPreviewPaymentWorkflowError);
      expect(mocks.createStripePayment).not.toHaveBeenCalled();
      expect(rpcCalls.some(({ name }) => name === "claim_flight_consumer_payment_operation_v1"))
        .toBe(false);
      expect(rpcCalls.find(({ name }) => name === "complete_flight_consumer_payment_operation_v1")?.parameters)
        .toMatchObject({
          p_attempt_id: attemptId,
          p_expected_revision: 0,
          p_terminal_state: "blocked",
          p_terminal_http_status: null,
          p_terminal_response_sha256: null,
          p_terminal_response_bytes: null,
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to redispatch an expired dispatching attempt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T21:00:00.000Z"));
    try {
      const { rpcCalls } = subject(attempt({
        dispatch_not_after: "2026-08-25T20:59:59.000Z",
      }));

      await expect(prepare()).rejects.toBeInstanceOf(FlightConsumerPreviewPaymentWorkflowError);
      expect(mocks.createStripePayment).not.toHaveBeenCalled();
      expect(rpcCalls.map(({ name }) => name)).toEqual([
        "get_flight_consumer_payment_operation_v1",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
