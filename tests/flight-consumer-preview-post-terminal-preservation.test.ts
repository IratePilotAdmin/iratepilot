import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createJournal: vi.fn(),
  createTransport: vi.fn(),
  copyRawBody: vi.fn(),
  encryptResponse: vi.fn(),
  decryptResponse: vi.fn(),
  resolvePendingLinks: vi.fn(),
  projectOrder: vi.fn(),
  readProjectedEvidence: vi.fn(),
  extractReferences: vi.fn(),
  encryptReference: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("../lib/flights/consumer-preview/authority.server", () => ({
  createFlightConsumerPreviewAuthority: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/completion-lease.server", () => ({
  createFlightConsumerPreviewCompletionLeaseCoordinator: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/offer-evidence-repository.server", () => ({
  createFlightConsumerPreviewOfferEvidenceRepository: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/pii-repository.server", () => ({
  createFlightConsumerPreviewPiiRepository: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/stripe-payment.server", () => {
  class TestStripePaymentError extends Error {}
  return {
    FlightConsumerPreviewStripePaymentError: TestStripePaymentError,
    createFlightConsumerPreviewStripePayment: vi.fn(),
  };
});
vi.mock("../lib/flights/consumer-preview/duffel-journal.server", () => ({
  createFlightConsumerPreviewDuffelJournal: mocks.createJournal,
}));
vi.mock("../lib/flights/duffel/http-transport.server", () => ({
  createDuffelTestHttpTransport: mocks.createTransport,
  copyDuffelHttpTransportRawBody: mocks.copyRawBody,
}));
vi.mock("../lib/flights/duffel/preview-ports.server", () => ({
  createDuffelPreviewTransportDependencies: vi.fn(() => Object.freeze({})),
}));
vi.mock("../lib/flights/consumer-preview/evidence-crypto.server", () => ({
  encryptFlightConsumerOrderResponseEvidence: mocks.encryptResponse,
  decryptFlightConsumerOrderResponseEvidence: mocks.decryptResponse,
  readFlightConsumerPreviewOfferEvidenceKeyring: vi.fn(() => Object.freeze({})),
}));
vi.mock("../lib/flights/consumer-preview/pending-duffel-webhook-link.server", () => ({
  resolveFlightConsumerPreviewPendingDuffelWebhookLinks: mocks.resolvePendingLinks,
}));
vi.mock("../lib/flights/duffel-sandbox-bridge", () => ({
  prepareDuffelSandboxCreateOrderBridge: vi.fn(),
  projectDuffelSandboxCreateOrderResult: mocks.projectOrder,
  readDuffelSandboxProjectedOrderEvidence: mocks.readProjectedEvidence,
}));
vi.mock("../lib/flights/duffel-sandbox-contract", () => ({
  rehydrateDuffelSandboxOfferEvidence: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/duffel-evidence.server", () => ({
  extractVerifiedDuffelPreviewOrderReferences: mocks.extractReferences,
  extractVerifiedDuffelPreviewPassengerIds: vi.fn(),
}));
vi.mock("../lib/flights/consumer-preview/reference-crypto.server", () => ({
  decryptFlightConsumerPreviewReference: vi.fn(),
  encryptFlightConsumerPreviewReference: mocks.encryptReference,
  readFlightConsumerPreviewReferenceKeyring: vi.fn(() => Object.freeze({})),
}));
vi.mock("../lib/flights/consumer-preview/terminal-response-finalization.server", () => ({
  projectFlightConsumerPreviewTerminalOrderResponse: vi.fn(),
}));

import {
  FlightConsumerPreviewCompleteOrderError,
  createAndFinalizeDuffelOrder,
  recoverOrResumeDuffelOrder,
} from "../lib/flights/consumer-preview/complete-order-workflow.server";
import {
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../lib/flights/runtime-safety";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const repriceReceiptId = "55555555-5555-4555-8555-555555555555";
const paymentId = "66666666-6666-4666-8666-666666666666";
const passengerId = "77777777-7777-4777-8777-777777777777";
const attemptId = "88888888-8888-4888-8888-888888888888";
const executionScopeSha256 = "1".repeat(64);
const responseSha256 = "2".repeat(64);
const completionReceiptSha256 = "3".repeat(64);
const responseEvidenceReceiptSha256 = "4".repeat(64);
const providerPassengerId = "pas_preview_terminal_0001";
const rawBody = Uint8Array.from([123, 125]);
const paymentIntentId = "pi_previewterminal0001";
const amountCents = 24_950;
const paymentBindingReceiptSha256 = "c".repeat(64);
const runtimeBinding = Object.freeze({
  executionScopeSha256,
  paymentProcessorCode: "stripe" as const,
  paymentEnvironment: "test" as const,
  paymentAccountSha256: "a".repeat(64),
  paymentSourceSha256: "b".repeat(64),
  paymentAdapterVersionSha256: "d".repeat(64),
  runtimeControlReceiptSha256: "e".repeat(64),
});
const capturedPayment = Object.freeze({
  id: paymentId,
  processor_reference_ciphertext: `enc:v1:${"p".repeat(32)}`,
  processor_reference_sha256: "9".repeat(64),
  status: "captured" as const,
  authorized_cents: amountCents,
  captured_cents: amountCents,
  refunded_cents: 0,
  updated_at: "2026-08-25T20:59:00.000Z",
});
const authority = Object.freeze({
  operationReceipt(label: string, value: unknown) {
    return sha256FlightEvidence({
      version: "test-post-terminal-authority-v1",
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
    processorReferenceSha256: capturedPayment.processor_reference_sha256,
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
      { requestSha256, runtimeControlReceiptSha256: runtimeBinding.runtimeControlReceiptSha256 },
    ),
  });
}

function succeededCaptureOperation(overrides: Record<string, unknown> = {}) {
  const identity = captureIdentity();
  return {
    attempt_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    customer_id: customerId,
    order_id: orderId,
    payment_id: paymentId,
    operation: "capture",
    execution_scope_sha256: executionScopeSha256,
    processor_account_sha256: runtimeBinding.paymentAccountSha256,
    processor_source_sha256: runtimeBinding.paymentSourceSha256,
    processor_adapter_version_sha256: runtimeBinding.paymentAdapterVersionSha256,
    payment_binding_receipt_sha256: paymentBindingReceiptSha256,
    adapter_source_sha256: runtimeBinding.paymentSourceSha256,
    operation_authority_receipt_sha256: identity.operationAuthorityReceiptSha256,
    idempotency_key_sha256: identity.keySha256,
    idempotency_request_sha256: identity.requestSha256,
    request_plan_sha256: identity.requestSha256,
    request_sha256: identity.requestSha256,
    request_body_sha256: identity.requestSha256,
    amount_cents: amountCents,
    currency: "USD",
    dispatch_not_after: "2099-02-10T00:00:00.000Z",
    attempt_revision: 2,
    attempt_state: "succeeded",
    processor_object_ref_sha256: null,
    terminal_http_status: 200,
    terminal_response_sha256: "f".repeat(64),
    terminal_response_bytes: 256,
    terminal_receipt_sha256: "0".repeat(64),
    ...overrides,
  };
}

function createInput(
  stripe: Readonly<{ attestCapturedPaymentIntent: ReturnType<typeof vi.fn> }>,
  preparedAttemptRecovery: Readonly<{ attemptId: string; dispatchNotAfter: string }> | null,
) {
  return {
    customerId,
    paymentIntentId,
    order: {
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
      status: "order_creating",
      provider_order_ref_sha256: null,
    },
    search: {
      departure_date: "2099-02-10",
      adult_count: 1,
      child_count: 0,
      infant_in_seat_count: 0,
      infant_on_lap_count: 0,
    },
    offer: { validating_carrier: "ZZ" },
    payment: capturedPayment,
    passengers: [{
      id: passengerId,
      traveler_sequence: 1,
      traveler_type: "adult",
      secure_pii_record_ref: "fp_previewterminal0001",
      pii_record_sha256: "1".repeat(64),
    }],
    package: {
      context: { receipt_sha256: "2".repeat(64) },
      paymentBindingReceiptSha256,
      providerSettlementBindingReceiptSha256: "3".repeat(64),
      bridgePackage: {
        orderCreatePlan: { dispatchNotAfter: "2099-02-10T00:00:00.000Z" },
      },
      outboundDepartureAt: "2099-02-10T10:00:00.000Z",
      providerPassengerIds: [providerPassengerId],
      authority,
    },
    runtime: { binding: runtimeBinding },
    stripe,
    preparedAttemptRecovery,
  };
}

describe("Flight Consumer Preview post-terminal preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const journal = Object.freeze({
      readOutcome: vi.fn(() => Object.freeze({
        attemptId,
        terminalState: "succeeded" as const,
        terminalRevision: 2 as const,
        completionReceiptDigest: completionReceiptSha256,
      })),
    });
    mocks.createJournal.mockReturnValue(journal);
    mocks.createTransport.mockReturnValue(Object.freeze({
      execute: vi.fn(async () => Object.freeze({
        status: 201,
        requestDigest: "5".repeat(64),
        responseDigest: responseSha256,
        inboundBodyBytes: rawBody.byteLength,
      })),
    }));
    mocks.copyRawBody.mockReturnValue(rawBody);
    mocks.encryptResponse.mockReturnValue(Object.freeze({
      keyVersion: "flight-preview-evidence-v1",
      ivBase64Url: "a".repeat(16),
      authTagBase64Url: "b".repeat(16),
      ciphertextBase64Url: "c".repeat(24),
      aadSha256: "6".repeat(64),
      ciphertextSha256: "7".repeat(64),
      receiptSha256: responseEvidenceReceiptSha256,
    }));
    mocks.resolvePendingLinks.mockResolvedValue(undefined);
    mocks.projectOrder.mockReturnValue(Object.freeze({ ticketState: "issued" as const }));
    mocks.readProjectedEvidence.mockReturnValue(Object.freeze({
      createdAt: "2026-08-25T21:00:00.000Z",
    }));
    mocks.extractReferences.mockReturnValue(Object.freeze({
      providerOrderId: "ord_preview_terminal_0001",
      providerPassengerIds: Object.freeze([providerPassengerId]),
      tickets: Object.freeze([Object.freeze({
        providerPassengerId,
        documentReference: "TICKET-PREVIEW-0001",
      })]),
    }));
    mocks.encryptReference.mockImplementation((input: Readonly<{ value: string }>) => ({
      ciphertext: `enc:v1:${input.value}`,
      referenceSha256: "8".repeat(64),
    }));
  });

  it("does not strand durable success when finalization and any recovery read are unavailable", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "record_flight_consumer_duffel_order_terminal_v1") {
        return {
          data: [{
            attempt_id: attemptId,
            attempt_revision: 2,
            attempt_state: "succeeded",
          }],
          error: null,
        };
      }
      if (name === "finalize_flight_consumer_duffel_order_v1") {
        return { data: null, error: new Error("transient finalizer outage") };
      }
      if (name === "get_flight_consumer_duffel_order_recovery_v1") {
        throw new Error("transient recovery-read outage");
      }
      if (
        name === "mark_flight_consumer_order_ambiguous_v1"
        || name === "mark_flight_consumer_captured_order_unstarted_v1"
      ) {
        throw new Error("durable success must not be moved to review");
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    mocks.createAdminClient.mockReturnValue(Object.freeze({ rpc }));

    await expect(createAndFinalizeDuffelOrder({
      customerId,
      order: {
        id: orderId,
        customer_id: customerId,
        search_id: searchId,
        offer_id: offerId,
        reprice_receipt_id: repriceReceiptId,
        execution_mode: "test",
        execution_scope_sha256: executionScopeSha256,
        provider_code: "duffel",
        currency: "USD",
        total_cents: 24_950,
        status: "order_creating",
        provider_order_ref_sha256: null,
      },
      search: {
        departure_date: "2099-02-10",
        adult_count: 1,
        child_count: 0,
        infant_in_seat_count: 0,
        infant_on_lap_count: 0,
      },
      offer: { validating_carrier: "ZZ" },
      payment: {
        id: paymentId,
        processor_reference_ciphertext: `enc:v1:${"p".repeat(32)}`,
        processor_reference_sha256: "9".repeat(64),
        status: "captured",
        authorized_cents: 24_950,
        captured_cents: 24_950,
        refunded_cents: 0,
        updated_at: "2026-08-25T20:59:00.000Z",
      },
      passengers: [{
        id: passengerId,
        traveler_sequence: 1,
        traveler_type: "adult",
        secure_pii_record_ref: "fp_previewterminal0001",
        pii_record_sha256: "a".repeat(64),
      }],
      package: {
        context: { receipt_sha256: "b".repeat(64) },
        paymentBindingReceiptSha256: "c".repeat(64),
        providerSettlementBindingReceiptSha256: "d".repeat(64),
        bridgePackage: {
          orderCreatePlan: {
            dispatchNotAfter: "2026-08-25T21:04:00.000Z",
          },
        },
        outboundDepartureAt: "2099-02-10T10:00:00.000Z",
        providerPassengerIds: [providerPassengerId],
        authority: {
          operationReceipt: vi.fn(() => "e".repeat(64)),
        },
      },
      runtime: {
        binding: { executionScopeSha256 },
      },
    } as never)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    const rpcNames = rpc.mock.calls.map(([name]) => name);
    expect(rpcNames).toEqual([
      "record_flight_consumer_duffel_order_terminal_v1",
      "finalize_flight_consumer_duffel_order_v1",
    ]);
    expect(rpcNames).not.toContain("get_flight_consumer_duffel_order_recovery_v1");
    expect(rpcNames).not.toContain("mark_flight_consumer_order_ambiguous_v1");
    expect(rpcNames).not.toContain("mark_flight_consumer_captured_order_unstarted_v1");
    expect(mocks.resolvePendingLinks).toHaveBeenCalledExactlyOnceWith({
      attemptId,
      phase: "post_terminal",
    });
  });

  it("keeps replayable success in order_creating when retained response decryption fails", async () => {
    const evidenceId = "99999999-9999-4999-8999-999999999999";
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_flight_consumer_duffel_order_recovery_v1") {
        return {
          data: [{
            attempt_id: attemptId,
            customer_id: customerId,
            order_id: orderId,
            attempt_revision: 2,
            attempt_state: "succeeded",
            request_sha256: "5".repeat(64),
            operation_authority_receipt_sha256: "6".repeat(64),
            terminal_http_status: 201,
            terminal_response_sha256: responseSha256,
            terminal_response_bytes: rawBody.byteLength,
            terminal_receipt_sha256: completionReceiptSha256,
            dispatch_not_after: "2026-08-25T21:04:00.000Z",
            evidence_available: true,
            response_evidence_receipt_sha256: responseEvidenceReceiptSha256,
            response_evidence_retention_expires_at: "2099-02-10T00:00:00.000Z",
          }],
          error: null,
        };
      }
      if (name === "load_flight_consumer_order_response_evidence_v1") {
        return {
          data: [{
            evidence_id: evidenceId,
            attempt_id: attemptId,
            order_id: orderId,
            customer_id: customerId,
            execution_scope_sha256: executionScopeSha256,
            provider_response_sha256: responseSha256,
            evidence_receipt_sha256: responseEvidenceReceiptSha256,
            key_version: "flight-preview-evidence-v1",
            iv_base64url: "a".repeat(16),
            auth_tag_base64url: "b".repeat(16),
            ciphertext_base64url: "c".repeat(24),
            aad_sha256: "7".repeat(64),
            ciphertext_sha256: "8".repeat(64),
            retention_expires_at: "2099-02-10T00:00:00.000Z",
          }],
          error: null,
        };
      }
      if (name === "mark_flight_consumer_order_ambiguous_v1") {
        throw new Error("replayable success must not be moved to review");
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    mocks.createAdminClient.mockReturnValue(Object.freeze({ rpc }));
    mocks.decryptResponse.mockImplementation(() => {
      throw new Error("transient local decrypt outage");
    });

    await expect(recoverOrResumeDuffelOrder({
      customerId,
      order: {
        id: orderId,
        customer_id: customerId,
        search_id: searchId,
        offer_id: offerId,
        reprice_receipt_id: repriceReceiptId,
        execution_mode: "test",
        execution_scope_sha256: executionScopeSha256,
        provider_code: "duffel",
        currency: "USD",
        total_cents: 24_950,
        status: "order_creating",
        provider_order_ref_sha256: null,
      },
      search: {
        departure_date: "2099-02-10",
        adult_count: 1,
        child_count: 0,
        infant_in_seat_count: 0,
        infant_on_lap_count: 0,
      },
      offer: { validating_carrier: "ZZ" },
      payment: {
        id: paymentId,
        processor_reference_ciphertext: `enc:v1:${"p".repeat(32)}`,
        processor_reference_sha256: "9".repeat(64),
        status: "captured",
        authorized_cents: 24_950,
        captured_cents: 24_950,
        refunded_cents: 0,
        updated_at: "2026-08-25T20:59:00.000Z",
      },
      passengers: [{
        id: passengerId,
        traveler_sequence: 1,
        traveler_type: "adult",
        secure_pii_record_ref: "fp_previewterminal0001",
        pii_record_sha256: "a".repeat(64),
      }],
      runtime: {
        binding: { executionScopeSha256 },
      },
    } as never)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_flight_consumer_duffel_order_recovery_v1",
      "load_flight_consumer_order_response_evidence_v1",
    ]);
    expect(rpc.mock.calls.map(([name]) => name))
      .not.toContain("mark_flight_consumer_order_ambiguous_v1");
    expect(mocks.resolvePendingLinks).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalled();
  });

  it.each([
    ["fresh", null],
    ["prepared recovery", Object.freeze({
      attemptId,
      dispatchNotAfter: "2099-02-10T00:00:00.000Z",
    })],
  ] as const)(
    "keeps the exact %s attempt prepared when Stripe attestation is transiently unavailable",
    async (_label, preparedAttemptRecovery) => {
      let beforeClaim: ((input: Readonly<{ attemptId: string; requestDigest: string }>) => Promise<void>)
        | null = null;
      const providerDispatch = vi.fn();
      mocks.createJournal.mockImplementation((...args: unknown[]) => {
        beforeClaim = args[4] as typeof beforeClaim;
        return Object.freeze({
          readOutcome: vi.fn(() => Object.freeze({
            attemptId,
            currentRevision: 0 as const,
            terminalState: null,
            terminalRevision: null,
            completionReceiptDigest: null,
          })),
        });
      });
      mocks.createTransport.mockReturnValue(Object.freeze({
        execute: vi.fn(async () => {
          expect(beforeClaim).not.toBeNull();
          await beforeClaim!({ attemptId, requestDigest: "4".repeat(64) });
          providerDispatch();
          throw new Error("provider dispatch must remain unreachable");
        }),
      }));
      const attestation = vi.fn(async () => Object.freeze({
        version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
        decision: "unavailable" as const,
        reason: "provider_unavailable" as const,
        evidenceSha256: "5".repeat(64),
      }));
      const rpc = vi.fn(async (name: string) => {
        if (name === "get_flight_consumer_payment_operation_v1") {
          return { data: [succeededCaptureOperation()], error: null };
        }
        if (
          name === "record_flight_consumer_capture_attestation_mismatch_v1"
          || name === "mark_flight_consumer_order_ambiguous_v1"
          || name === "mark_flight_consumer_captured_order_unstarted_v1"
          || name === "claim_flight_consumer_duffel_order_attempt_v1"
        ) throw new Error(`forbidden RPC ${name}`);
        throw new Error(`unexpected RPC ${name}`);
      });
      mocks.createAdminClient.mockReturnValue(Object.freeze({ rpc }));

      await expect(createAndFinalizeDuffelOrder(createInput(
        { attestCapturedPaymentIntent: attestation },
        preparedAttemptRecovery,
      ) as never)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

      expect(attestation).toHaveBeenCalledExactlyOnceWith({ paymentIntentId });
      expect(providerDispatch).not.toHaveBeenCalled();
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "get_flight_consumer_payment_operation_v1",
      ]);
      expect(mocks.createJournal.mock.calls.at(-1)?.[2]).toEqual(preparedAttemptRecovery);
    },
  );

  it("projects a definitive refund mismatch and never reaches Duffel claim or dispatch", async () => {
    let beforeClaim: ((input: Readonly<{ attemptId: string; requestDigest: string }>) => Promise<void>)
      | null = null;
    const providerDispatch = vi.fn();
    mocks.createJournal.mockImplementation((...args: unknown[]) => {
      beforeClaim = args[4] as typeof beforeClaim;
      return Object.freeze({
        readOutcome: vi.fn(() => Object.freeze({
          attemptId,
          currentRevision: 0 as const,
          terminalState: null,
          terminalRevision: null,
          completionReceiptDigest: null,
        })),
      });
    });
    mocks.createTransport.mockReturnValue(Object.freeze({
      execute: vi.fn(async () => {
        await beforeClaim!({ attemptId, requestDigest: "4".repeat(64) });
        providerDispatch();
        throw new Error("provider dispatch must remain unreachable");
      }),
    }));
    const attestation = vi.fn(async () => Object.freeze({
      version: "flight-consumer-preview-stripe-capture-attestation-v1" as const,
      decision: "mismatch" as const,
      reason: "refund_observed" as const,
      evidenceSha256: "5".repeat(64),
    }));
    const reconciliationCaseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rpc = vi.fn(async (
      name: string,
      parameters: Readonly<Record<string, unknown>> = Object.freeze({}),
    ) => {
      if (name === "get_flight_consumer_payment_operation_v1") {
        return { data: [succeededCaptureOperation()], error: null };
      }
      if (name === "record_flight_consumer_capture_attestation_mismatch_v1") {
        expect(parameters).toMatchObject({
          p_order_id: orderId,
          p_payment_id: paymentId,
        });
        return {
          data: [{
            order_id: orderId,
            order_status: "requires_review",
            payment_id: paymentId,
            payment_status: "ambiguous",
            reconciliation_case_id: reconciliationCaseId,
          }],
          error: null,
        };
      }
      if (
        name === "mark_flight_consumer_order_ambiguous_v1"
        || name === "mark_flight_consumer_captured_order_unstarted_v1"
        || name === "claim_flight_consumer_duffel_order_attempt_v1"
      ) throw new Error(`forbidden RPC ${name}`);
      throw new Error(`unexpected RPC ${name}`);
    });
    mocks.createAdminClient.mockReturnValue(Object.freeze({ rpc }));

    await expect(createAndFinalizeDuffelOrder(createInput(
      { attestCapturedPaymentIntent: attestation },
      null,
    ) as never)).rejects.toBeInstanceOf(FlightConsumerPreviewCompleteOrderError);

    expect(providerDispatch).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_flight_consumer_payment_operation_v1",
      "record_flight_consumer_capture_attestation_mismatch_v1",
    ]);
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_capture_attempt_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_expected_capture_revision: 2,
      p_processor_reference_sha256: capturedPayment.processor_reference_sha256,
      p_mismatch_reason: "refund_observed",
      p_observation_sha256: "5".repeat(64),
    });
    expect(JSON.stringify(rpc.mock.calls[1]?.[1])).not.toContain(paymentIntentId);
  });
});
