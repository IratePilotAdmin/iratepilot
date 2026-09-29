import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireRuntime: vi.fn(),
  createStripePayment: vi.fn(),
  decryptReference: vi.fn(),
  createAuthority: vi.fn(),
  createDuffelTransport: vi.fn(),
  createCompletionLeaseCoordinator: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: mocks.requireRuntime,
}));
vi.mock("../lib/flights/consumer-preview/authority.server", () => ({
  createFlightConsumerPreviewAuthority: mocks.createAuthority,
}));
vi.mock("../lib/flights/consumer-preview/completion-lease.server", () => ({
  createFlightConsumerPreviewCompletionLeaseCoordinator:
    mocks.createCompletionLeaseCoordinator,
}));
vi.mock("../lib/flights/consumer-preview/reference-crypto.server", () => ({
  decryptFlightConsumerPreviewReference: mocks.decryptReference,
  encryptFlightConsumerPreviewReference: vi.fn(),
  readFlightConsumerPreviewReferenceKeyring: vi.fn(() => Object.freeze({})),
}));
vi.mock("../lib/flights/consumer-preview/stripe-payment.server", () => {
  class TestStripePaymentError extends Error {
    readonly phase: string;
    readonly disposition: "ambiguous" | "definitive_failure";
    readonly httpStatus: number | null;

    constructor(
      phase = "unknown",
      disposition: "ambiguous" | "definitive_failure" = "ambiguous",
      httpStatus: number | null = null,
    ) {
      super("test stripe guard");
      this.phase = phase;
      this.disposition = disposition;
      this.httpStatus = httpStatus;
    }
  }
  return {
    FlightConsumerPreviewStripePaymentError: TestStripePaymentError,
    createFlightConsumerPreviewStripePayment: mocks.createStripePayment,
  };
});
vi.mock("../lib/flights/duffel/http-transport.server", () => ({
  copyDuffelHttpTransportRawBody: vi.fn(),
  createDuffelTestHttpTransport: mocks.createDuffelTransport,
}));

import {
  calculateFlightConsumerPreviewTicketingDeadline,
  FlightConsumerPreviewCompleteOrderError,
  capturePayment,
  completeFlightConsumerPreviewOrder,
} from "../lib/flights/consumer-preview/complete-order-workflow.server";
import {
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../lib/flights/runtime-safety";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const receiptId = "55555555-5555-4555-8555-555555555555";
const paymentId = "66666666-6666-4666-8666-666666666666";
const attemptId = "77777777-7777-4777-8777-777777777777";
const paymentIntentId = "pi_capturepreview000001";
const executionScopeSha256 = "1".repeat(64);
const paymentBindingReceiptSha256 = "6".repeat(64);
const processorReferenceSha256 = "7".repeat(64);
const amountCents = 24_950;

const runtime = Object.freeze({
  authorized: true as const,
  reasons: Object.freeze([] as const),
  binding: Object.freeze({
    executionScopeSha256,
    paymentProcessorCode: "stripe" as const,
    paymentEnvironment: "test" as const,
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
  reprice_receipt_id: receiptId,
  execution_mode: "test" as const,
  execution_scope_sha256: executionScopeSha256,
  provider_code: "duffel" as const,
  currency: "USD" as const,
  total_cents: amountCents,
  status: "payment_authorized" as const,
  provider_order_ref_sha256: null,
});

const payment = Object.freeze({
  id: paymentId,
  processor_reference_ciphertext: `enc:v1:${"A".repeat(32)}`,
  processor_reference_sha256: processorReferenceSha256,
  status: "authorized" as const,
  authorized_cents: amountCents,
  captured_cents: 0,
  refunded_cents: 0,
  updated_at: "2026-08-25T20:00:00.000Z",
});

const authority = Object.freeze({
  operationReceipt(label: string, value: unknown) {
    return sha256FlightEvidence({
      version: "test-capture-authority-v1",
      label,
      value,
    } as FlightCanonicalJsonValue);
  },
});

function captureIdentity() {
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-identity-v1",
    orderId,
    paymentId,
    processorReferenceSha256,
  });
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-request-v1",
    customerId,
    orderId,
    paymentId,
    amountCents,
    currency: "USD",
    executionScopeSha256,
  });
  return Object.freeze({
    keySha256,
    requestSha256,
    operationAuthorityReceiptSha256: authority.operationReceipt(
      "stripe-capture-authority",
      { requestSha256, runtimeControlReceiptSha256: runtime.binding.runtimeControlReceiptSha256 },
    ),
  });
}

function operation(overrides: Record<string, unknown> = {}) {
  const identity = captureIdentity();
  return {
    attempt_id: attemptId,
    customer_id: customerId,
    order_id: orderId,
    payment_id: paymentId,
    operation: "capture",
    execution_scope_sha256: executionScopeSha256,
    processor_account_sha256: runtime.binding.paymentAccountSha256,
    processor_source_sha256: runtime.binding.paymentSourceSha256,
    processor_adapter_version_sha256: runtime.binding.paymentAdapterVersionSha256,
    payment_binding_receipt_sha256: paymentBindingReceiptSha256,
    adapter_source_sha256: runtime.binding.paymentSourceSha256,
    operation_authority_receipt_sha256: identity.operationAuthorityReceiptSha256,
    idempotency_key_sha256: identity.keySha256,
    idempotency_request_sha256: identity.requestSha256,
    request_plan_sha256: identity.requestSha256,
    request_sha256: identity.requestSha256,
    request_body_sha256: identity.requestSha256,
    amount_cents: amountCents,
    currency: "USD",
    dispatch_not_after: "2026-08-25T21:04:00.000Z",
    attempt_revision: 0,
    attempt_state: "prepared",
    processor_object_ref_sha256: null,
    terminal_http_status: null,
    terminal_response_sha256: null,
    terminal_response_bytes: null,
    terminal_receipt_sha256: null,
    ...overrides,
  };
}

const capturedSnapshot = Object.freeze({
  version: "flight-consumer-preview-stripe-payment-snapshot-v1" as const,
  paymentIntentId,
  status: "succeeded" as const,
  decision: "captured" as const,
  amountCents,
  amountCapturableCents: 0,
  amountReceivedCents: amountCents,
  currency: "usd" as const,
});

const authorizedSnapshot = Object.freeze({
  version: "flight-consumer-preview-stripe-payment-snapshot-v1" as const,
  paymentIntentId,
  status: "requires_capture" as const,
  decision: "authorized" as const,
  amountCents,
  amountCapturableCents: amountCents,
  amountReceivedCents: 0,
  currency: "usd" as const,
});

const captureResult = Object.freeze({
  version: "flight-consumer-preview-stripe-capture-v1" as const,
  decision: "captured" as const,
  paymentIntentId,
  amountCapturedCents: amountCents,
  currency: "usd" as const,
  paymentIdempotencyKeySha256: "8".repeat(64),
});

type RpcCall = Readonly<{ name: string; parameters: Record<string, unknown> }>;

function subject(existingOperation: Record<string, unknown>, options: Readonly<{
  snapshot?: typeof capturedSnapshot | typeof authorizedSnapshot;
  applyError?: boolean;
  claimAdvancesTo?: string;
  attestation?: Readonly<Record<string, unknown>>;
}> = {}) {
  const rpcCalls: RpcCall[] = [];
  const retrievePaymentIntent = vi.fn(async () => options.snapshot ?? capturedSnapshot);
  const capturePaymentIntent = vi.fn(async () => captureResult);
  const attestCapturedPaymentIntent = vi.fn(async () => options.attestation ?? ({
    version: "flight-consumer-preview-stripe-capture-attestation-v1",
    decision: "matched",
    evidenceSha256: "f".repeat(64),
  }));
  const stripe = Object.freeze({
    retrievePaymentIntent,
    capturePaymentIntent,
    attestCapturedPaymentIntent,
  });
  const admin = Object.freeze({
    async rpc(name: string, parameters: Record<string, unknown>) {
      rpcCalls.push({ name, parameters });
      if (name === "get_flight_consumer_payment_operation_v1") {
        return { data: [existingOperation], error: null };
      }
      if (name === "claim_flight_consumer_payment_operation_v1") {
        if (options.claimAdvancesTo) vi.setSystemTime(new Date(options.claimAdvancesTo));
        return {
          data: [{ attempt_id: attemptId, attempt_revision: 1, attempt_state: "dispatching" }],
          error: null,
        };
      }
      if (name === "complete_flight_consumer_payment_operation_v1") {
        const terminalState = parameters.p_terminal_state as string;
        return {
          data: [{
            attempt_id: attemptId,
            attempt_revision: terminalState === "blocked" ? 1 : 2,
            attempt_state: terminalState,
          }],
          error: null,
        };
      }
      if (name === "apply_flight_consumer_capture_v1") {
        if (options.applyError) return { data: null, error: new Error("apply rejected") };
        return {
          data: [{
            order_id: orderId,
            order_status: "payment_authorized",
            payment_id: paymentId,
            payment_status: "captured",
          }],
          error: null,
        };
      }
      if (name === "record_flight_consumer_capture_attestation_mismatch_v1") {
        return {
          data: [{
            order_id: orderId,
            order_status: "requires_review",
            payment_id: paymentId,
            payment_status: "ambiguous",
            reconciliation_case_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          }],
          error: null,
        };
      }
      return { data: null, error: new Error(`unexpected RPC ${name}`) };
    },
  });
  mocks.createAdminClient.mockReturnValue(admin);
  return {
    rpcCalls,
    stripe,
    retrievePaymentIntent,
    capturePaymentIntent,
    attestCapturedPaymentIntent,
  };
}

async function runCapture(stripe: ReturnType<typeof subject>["stripe"]) {
  return capturePayment({
    order,
    payment,
    paymentIntentId,
    paymentBindingReceiptSha256,
    authority,
    runtime,
    stripe,
  } as never);
}

function callsNamed(rpcCalls: readonly RpcCall[], name: string) {
  return rpcCalls.filter((call) => call.name === name);
}

function completeSubject(existingOperation: Record<string, unknown>, options: Readonly<{
  failPackage?: boolean;
}> = {}) {
  const rpcCalls: RpcCall[] = [];
  let locallyCaptured = false;
  const retrievePaymentIntent = vi.fn(async () => capturedSnapshot);
  const capturePaymentIntent = vi.fn(async () => captureResult);
  const attestCapturedPaymentIntent = vi.fn(async () => ({
    version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
    decision: "matched" as const,
    evidenceSha256: "f".repeat(64),
  }));
  const stripe = Object.freeze({
    retrievePaymentIntent,
    capturePaymentIntent,
    attestCapturedPaymentIntent,
  });
  const passenger = Object.freeze({
    id: "88888888-8888-4888-8888-888888888888",
    traveler_sequence: 1,
    traveler_type: "adult",
    secure_pii_record_ref: "fp_previewpassenger0001",
    pii_record_sha256: "b".repeat(64),
  });
  const admin = {
    from(table: string) {
      const builder: Record<string, unknown> & PromiseLike<unknown> = {
        then(resolve, reject) {
          return Promise.resolve(table === "flight_passenger_refs"
            ? { data: [passenger], error: null }
            : { data: null, error: new Error(`unexpected awaited table ${table}`) })
            .then(resolve, reject);
        },
      };
      for (const method of ["select", "eq", "order", "limit"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.maybeSingle = vi.fn(async () => {
        if (table === "flight_orders") return { data: order, error: null };
        if (table === "flight_searches") {
          return {
            data: {
              departure_date: "2026-11-15",
              adult_count: 1,
              child_count: 0,
              infant_in_seat_count: 0,
              infant_on_lap_count: 0,
            },
            error: null,
          };
        }
        if (table === "flight_offers") {
          return { data: { validating_carrier: "AA" }, error: null };
        }
        if (table === "flight_payments") {
          return {
            data: {
              ...payment,
              status: locallyCaptured ? "captured" : "authorized",
              captured_cents: locallyCaptured ? amountCents : 0,
            },
            error: null,
          };
        }
        return { data: null, error: new Error(`unexpected table ${table}`) };
      });
      return builder;
    },
    async rpc(name: string, parameters: Record<string, unknown>) {
      rpcCalls.push({ name, parameters });
      if (name === "get_flight_consumer_payment_operation_v1") {
        return { data: [existingOperation], error: null };
      }
      if (name === "complete_flight_consumer_payment_operation_v1") {
        const terminalState = parameters.p_terminal_state as string;
        return {
          data: [{
            attempt_id: attemptId,
            attempt_revision: terminalState === "blocked" ? 1 : 2,
            attempt_state: terminalState,
          }],
          error: null,
        };
      }
      if (name === "apply_flight_consumer_capture_v1") {
        locallyCaptured = true;
        return {
          data: [{
            order_id: orderId,
            order_status: "payment_authorized",
            payment_id: paymentId,
            payment_status: "captured",
          }],
          error: null,
        };
      }
      if (name === "get_flight_consumer_offer_evidence_context_v1") {
        return options.failPackage
          ? { data: null, error: new Error("refreshed evidence expired") }
          : { data: null, error: new Error("package creation was not expected") };
      }
      if (name === "mark_flight_consumer_captured_order_unstarted_v1") {
        return { data: [{ order_id: orderId }], error: null };
      }
      return { data: null, error: new Error(`unexpected RPC ${name}`) };
    },
  };
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.requireRuntime.mockResolvedValue(runtime);
  mocks.createStripePayment.mockResolvedValue(stripe);
  mocks.decryptReference.mockReturnValue(paymentIntentId);
  mocks.createAuthority.mockReturnValue(authority);
  return { rpcCalls, retrievePaymentIntent, capturePaymentIntent, attestCapturedPaymentIntent };
}

async function completeOrder() {
  return completeFlightConsumerPreviewOrder({
    customerId,
    orderId,
    idempotencyKey: "99999999-9999-4999-8999-999999999999",
    paymentIntentId,
  });
}

describe("Flight Consumer Preview ticketing deadline", () => {
  it("is exactly one minute before the authenticated outbound departure", () => {
    const deadline = calculateFlightConsumerPreviewTicketingDeadline(
      "2099-02-10T10:00:00.000Z",
      "2099-02-09T10:00:00.000Z",
    );

    expect(deadline).toBe("2099-02-10T09:59:00.000Z");
    expect(Date.parse(deadline)).toBeGreaterThan(Date.parse("2099-02-09T10:00:00.000Z"));
    expect(Date.parse(deadline)).toBeLessThan(Date.parse("2099-02-10T10:00:00.000Z"));
  });

  it.each([
    ["", "2099-02-09T10:00:00.000Z"],
    ["2099-02-10T10:00:00+00:00", "2099-02-09T10:00:00.000Z"],
    ["2099-02-10T10:00:30.000Z", "2099-02-10T10:00:00.000Z"],
    ["2020-02-10T10:00:00.000Z", "2020-02-09T10:00:00.000Z"],
  ])("rejects an unsafe outbound/provider pair", (departure, providerCreated) => {
    expect(() => calculateFlightConsumerPreviewTicketingDeadline(
      departure,
      providerCreated,
    )).toThrow(FlightConsumerPreviewCompleteOrderError);
  });
});

describe("Flight Consumer Preview capture recovery state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T21:00:00.000Z"));
    mocks.createCompletionLeaseCoordinator.mockReturnValue(Object.freeze({
      acquire: vi.fn(async () => Object.freeze({
        decision: "owner" as const,
        handle: Object.freeze({
          orderId,
          leaseRevision: 0,
          leaseTokenSha256: "c".repeat(64),
          requestSha256: "d".repeat(64),
        }),
      })),
      heartbeat: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    }));
  });

  it("claims a current prepared attempt and dispatches exactly once with its durable UUID", async () => {
    const { rpcCalls, stripe, capturePaymentIntent, retrievePaymentIntent } = subject(operation());

    await expect(runCapture(stripe)).resolves.toBeUndefined();

    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(1);
    expect(capturePaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId, attemptId });
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_attempt_id: attemptId, p_expected_revision: 1, p_terminal_state: "succeeded" });
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(1);
  });

  it("terminalizes an expired prepared attempt as blocked at revision zero without Stripe access", async () => {
    const { rpcCalls, stripe, capturePaymentIntent, retrievePaymentIntent } = subject(operation({
      dispatch_not_after: "2026-08-25T20:59:59.000Z",
    }));

    await expect(runCapture(stripe)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_attempt_id: attemptId, p_expected_revision: 0, p_terminal_state: "blocked" });
  });

  it("switches to retrieve-only recovery when claim latency consumes the prepared deadline", async () => {
    const { rpcCalls, stripe, capturePaymentIntent, retrievePaymentIntent } = subject(
      operation(),
      {
        snapshot: authorizedSnapshot,
        claimAdvancesTo: "2026-08-25T21:04:01.000Z",
      },
    );

    await expect(runCapture(stripe)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(1);
    expect(retrievePaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_expected_revision: 1, p_terminal_state: "ambiguous" });
  });

  it("recovers a current dispatching attempt only through the same idempotent attempt UUID", async () => {
    const { rpcCalls, stripe, capturePaymentIntent } = subject(operation({
      attempt_state: "dispatching",
      attempt_revision: 1,
    }));

    await expect(runCapture(stripe)).resolves.toBeUndefined();

    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(capturePaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId, attemptId });
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(1);
  });

  it("uses retrieve-only recovery for an expired dispatch and opens review when capture is still required", async () => {
    const { rpcCalls, stripe, capturePaymentIntent, retrievePaymentIntent } = subject(operation({
      dispatch_not_after: "2026-08-25T20:59:59.000Z",
      attempt_state: "dispatching",
      attempt_revision: 1,
    }), { snapshot: authorizedSnapshot });

    await expect(runCapture(stripe)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(retrievePaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_expected_revision: 1, p_terminal_state: "ambiguous" });
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(0);
  });

  it("retrieves an already captured expired dispatch, terminalizes it, and applies it without mutation", async () => {
    const { rpcCalls, stripe, capturePaymentIntent, retrievePaymentIntent } = subject(operation({
      dispatch_not_after: "2026-08-25T20:59:59.000Z",
      attempt_state: "dispatching",
      attempt_revision: 1,
    }));

    await expect(runCapture(stripe)).resolves.toBeUndefined();

    expect(retrievePaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_expected_revision: 1, p_terminal_state: "succeeded" });
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(1);
  });

  it("replays a succeeded attempt by provider attestation and local apply only", async () => {
    const {
      rpcCalls,
      stripe,
      capturePaymentIntent,
      retrievePaymentIntent,
      attestCapturedPaymentIntent,
    } = subject(operation({
      attempt_state: "succeeded",
      attempt_revision: 2,
      terminal_http_status: 200,
      terminal_response_sha256: "9".repeat(64),
      terminal_response_bytes: 128,
      terminal_receipt_sha256: "a".repeat(64),
    }));

    await expect(runCapture(stripe)).resolves.toBeUndefined();

    expect(attestCapturedPaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(1);
  });

  it("projects a definitive succeeded-capture mismatch before local apply", async () => {
    const {
      rpcCalls,
      stripe,
      capturePaymentIntent,
      retrievePaymentIntent,
      attestCapturedPaymentIntent,
    } = subject(operation({
      attempt_state: "succeeded",
      attempt_revision: 2,
      terminal_http_status: 200,
      terminal_response_sha256: "9".repeat(64),
      terminal_response_bytes: 128,
      terminal_receipt_sha256: "a".repeat(64),
    }), {
      attestation: {
        version: "flight-consumer-preview-stripe-capture-attestation-v1",
        decision: "mismatch",
        reason: "refund_observed",
        evidenceSha256: "e".repeat(64),
      },
    });

    await expect(runCapture(stripe)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(attestCapturedPaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "record_flight_consumer_capture_attestation_mismatch_v1"))
      .toHaveLength(1);
    expect(callsNamed(
      rpcCalls,
      "record_flight_consumer_capture_attestation_mismatch_v1",
    )[0]!.parameters).toMatchObject({
      p_capture_attempt_id: attemptId,
      p_expected_capture_revision: 2,
      p_mismatch_reason: "refund_observed",
      p_observation_sha256: "e".repeat(64),
    });
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(0);
  });

  it.each(["provider_unavailable", "projection_rejected"] as const)(
    "keeps %s succeeded-capture attestation failure retryable",
    async (reason) => {
      const { rpcCalls, stripe, capturePaymentIntent, attestCapturedPaymentIntent } = subject(operation({
        attempt_state: "succeeded",
        attempt_revision: 2,
        terminal_http_status: 200,
        terminal_response_sha256: "9".repeat(64),
        terminal_response_bytes: 128,
        terminal_receipt_sha256: "a".repeat(64),
      }), {
        attestation: {
          version: "flight-consumer-preview-stripe-capture-attestation-v1",
          decision: "unavailable",
          reason,
          evidenceSha256: "e".repeat(64),
        },
      });

      await expect(runCapture(stripe))
        .rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

      expect(attestCapturedPaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
      expect(capturePaymentIntent).not.toHaveBeenCalled();
      expect(callsNamed(rpcCalls, "record_flight_consumer_capture_attestation_mismatch_v1"))
        .toHaveLength(0);
      expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(0);
    },
  );

  it("re-attests historical terminal capture after binding rotation without redispatch", async () => {
    const {
      rpcCalls,
      stripe,
      capturePaymentIntent,
      retrievePaymentIntent,
      attestCapturedPaymentIntent,
    } = subject(operation({
      attempt_state: "succeeded",
      attempt_revision: 2,
      processor_account_sha256: "b".repeat(64),
      processor_source_sha256: "c".repeat(64),
      processor_adapter_version_sha256: "d".repeat(64),
      payment_binding_receipt_sha256: "e".repeat(64),
      adapter_source_sha256: "f".repeat(64),
      operation_authority_receipt_sha256: "9".repeat(64),
      terminal_http_status: 200,
      terminal_response_sha256: "8".repeat(64),
      terminal_response_bytes: 128,
      terminal_receipt_sha256: "7".repeat(64),
    }));

    await expect(runCapture(stripe)).resolves.toBeUndefined();

    expect(attestCapturedPaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "claim_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")).toHaveLength(0);
    expect(callsNamed(rpcCalls, "apply_flight_consumer_capture_v1")).toHaveLength(1);
  });

  it("never attempts a revision-one overwrite after terminal success when local apply fails", async () => {
    const { rpcCalls, stripe } = subject(operation({
      attempt_state: "dispatching",
      attempt_revision: 1,
    }), { applyError: true });

    await expect(runCapture(stripe)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    const terminalCalls = callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1");
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0]!.parameters).toMatchObject({
      p_expected_revision: 1,
      p_terminal_state: "succeeded",
    });
  });

  it("recovers succeeded capture before offer-package loading and opens review if that package expired", async () => {
    const {
      rpcCalls,
      retrievePaymentIntent,
      capturePaymentIntent,
      attestCapturedPaymentIntent,
    } = completeSubject(operation({
      attempt_state: "succeeded",
      attempt_revision: 2,
      terminal_http_status: 200,
      terminal_response_sha256: "9".repeat(64),
      terminal_response_bytes: 128,
      terminal_receipt_sha256: "a".repeat(64),
    }), { failPackage: true });

    await expect(completeOrder()).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(attestCapturedPaymentIntent).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    const rpcNames = rpcCalls.map(({ name }) => name);
    expect(rpcNames.indexOf("apply_flight_consumer_capture_v1"))
      .toBeLessThan(rpcNames.indexOf("get_flight_consumer_offer_evidence_context_v1"));
    expect(rpcNames).toContain("mark_flight_consumer_captured_order_unstarted_v1");
    expect(mocks.createDuffelTransport).not.toHaveBeenCalled();
  });

  it("blocks an expired prepared capture before package loading or any Stripe operation", async () => {
    const { rpcCalls, retrievePaymentIntent, capturePaymentIntent } = completeSubject(operation({
      dispatch_not_after: "2026-08-25T20:59:59.000Z",
    }));

    await expect(completeOrder()).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(retrievePaymentIntent).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(callsNamed(rpcCalls, "complete_flight_consumer_payment_operation_v1")[0]!.parameters)
      .toMatchObject({ p_expected_revision: 0, p_terminal_state: "blocked" });
    expect(callsNamed(rpcCalls, "get_flight_consumer_offer_evidence_context_v1")).toHaveLength(0);
    expect(mocks.createDuffelTransport).not.toHaveBeenCalled();
  });
});
