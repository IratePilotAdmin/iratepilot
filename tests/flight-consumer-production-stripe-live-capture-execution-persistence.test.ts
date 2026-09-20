import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveStripeCapturePersistence,
  FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC,
  FlightConsumerLiveStripeCapturePersistenceError,
  type FlightConsumerLiveStripeCaptureRpcClient,
} from "../lib/flights/consumer-production/stripe-live-capture-execution-persistence.server";

const digest = (character: string) => character.repeat(64);
const checkoutId = "00000000-0000-4000-8000-000000000107";
const confirmationId = "00000000-0000-4000-8000-000000000109";
const orderExecutionId = "00000000-0000-4000-8000-000000000108";
const attemptId = "00000000-0000-4000-8000-000000000111";
const encrypted = (character: string) => `enc:v1:${character.repeat(32)}`;
const sha256 = (value: string) => createHash("sha256")
  .update(value, "utf8").digest("hex");
const clientCorrelationId = `flt_capture_${"b".repeat(48)}`;
const stripeRequestId = "req_0000000000000001";

const authorityReceipt = Object.freeze({
  livemode: true,
  provider_dispatch_authorized: false,
  stripe_dispatch_authorized: false,
  booking_authorized: false,
  order_authorized: false,
  payment_authorized: false,
  capture_authorized: false,
  refund_authorized: false,
  settlement_authorized: false,
  ticketing_authorized: false,
  servicing_authorized: false,
  consumer_release_enabled: false,
  blind_retry_authorized: false,
});

function prepareInput() {
  return {
    checkoutAggregateId: checkoutId,
    authorizationBridgeReceiptSha256: digest("1"),
    stripeConfirmationAttemptId: confirmationId,
    confirmationStateReceiptSha256: digest("2"),
    duffelOrderExecutionId: orderExecutionId,
    duffelOrderStateReceiptSha256: digest("3"),
    providerOrderReferenceSha256: digest("4"),
    paymentIntentReferenceSha256: digest("5"),
    duffelOrderExecutionBindingSha256: digest("6"),
    executionScopeSha256: digest("7"),
    idempotencySha256: digest("8"),
    captureBindingSha256: digest("9"),
    capturePrerequisiteSha256: digest("a"),
    captureRequestSha256: digest("b"),
    captureAuthorityScopeSha256: digest("c"),
    captureAuthorityPayloadSha256: digest("d"),
    captureAuthoritySignatureSha256: digest("e"),
    captureAuthorityKeyId: "capture-signing-key-v1",
    amountCents: 54_321,
    currency: "USD" as const,
    captureAuthorityNotAfter: "2026-08-27T12:05:00.000Z",
    dispatchNotAfter: "2026-08-27T12:04:00.000Z",
  };
}

function claimInput() {
  return {
    attemptId,
    expectedRevision: 0 as const,
    executionScopeSha256: digest("7"),
    captureBindingSha256: digest("9"),
    captureRequestSha256: digest("b"),
    dispatchTokenSha256: digest("f"),
  };
}

function successfulCompletionInput() {
  return {
    attemptId,
    expectedRevision: 1 as const,
    executionScopeSha256: digest("7"),
    captureBindingSha256: digest("9"),
    captureRequestSha256: digest("b"),
    dispatchTokenSha256: digest("f"),
    terminalState: "succeeded" as const,
    stripeCaptureRequestCount: 1 as const,
    stripeMutationCount: 1 as const,
    terminalErrorCode: null,
    terminalHttpStatus: 200,
    terminalResponseSha256: digest("1"),
    completionEvidenceSha256: digest("2"),
    ambiguityEvidenceSha256: null,
    observedPaymentIntentStatus: "succeeded" as const,
    observedPaymentIntentReferenceSha256: digest("5"),
    observedAmountReceivedCents: 54_321,
    observedCurrency: "usd" as const,
    observedLivemode: true as const,
    observedCaptureMethod: "manual" as const,
    chargeReferenceCiphertext: encrypted("C"),
    chargeReferenceSha256: digest("3"),
    clientCorrelationId,
    clientCorrelationIdSha256: sha256(clientCorrelationId),
    stripeRequestId,
    stripeRequestIdSha256: sha256(stripeRequestId),
    transportOutcome: "http_response" as const,
  };
}

function ambiguousCompletionInput() {
  return {
    ...successfulCompletionInput(),
    terminalState: "ambiguous" as const,
    terminalErrorCode: "response_timeout",
    terminalHttpStatus: null,
    terminalResponseSha256: null,
    ambiguityEvidenceSha256: digest("4"),
    observedPaymentIntentStatus: null,
    observedPaymentIntentReferenceSha256: null,
    observedAmountReceivedCents: null,
    observedCurrency: null,
    observedLivemode: null,
    observedCaptureMethod: null,
    chargeReferenceCiphertext: null,
    chargeReferenceSha256: null,
    stripeRequestId: null,
    stripeRequestIdSha256: null,
    transportOutcome: "no_response" as const,
  };
}

function result(
  state: "prepared" | "dispatching" | "succeeded" | "failed"
    | "ambiguous" | "reconciled",
  revision: 0 | 1 | 2 | 3,
) {
  const captureCount = revision >= 2 ? 1 : 0;
  return {
    attempt_id: attemptId,
    attempt_state: state,
    attempt_revision: revision,
    payment_intent_reference_sha256: digest("5"),
    provider_order_reference_sha256: digest("4"),
    charge_reference_sha256:
      state === "succeeded" || state === "reconciled" ? digest("3") : null,
    stripe_capture_request_count: captureCount,
    stripe_mutation_count: captureCount,
    stripe_retrieval_request_count: state === "reconciled" ? 1 : 0,
    state_receipt_sha256: digest("6"),
    ...authorityReceipt,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async (
    _name: string,
    _args: Readonly<Record<string, unknown>>,
  ) => {
    void _name;
    void _args;
    return { data, error: null };
  });
  return {
    client: { rpc } as FlightConsumerLiveStripeCaptureRpcClient,
    rpc,
  };
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production Stripe live capture persistence", () => {
  it("declares a dark, transport-free, zero-authority boundary", () => {
    const persistence = createFlightConsumerLiveStripeCapturePersistence(
      clientReturning(null).client,
    );
    expect(FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_MIGRATION_VERSION)
      .toBe("202608260114");
    expect(FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_stripe_capture_v1",
      claim: "claim_flight_consumer_live_stripe_capture_v1",
      complete: "complete_flight_consumer_live_stripe_capture_v2",
      reconcile: "reconcile_flight_consumer_live_stripe_capture_v1",
      readSupportIdentity:
        "read_flight_consumer_live_stripe_capture_support_identity_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-live-stripe-capture-persistence-v2",
      migrationVersion: "202608260114",
      processorEnvironment: "stripe_live",
      livemode: true,
      captureMethod: "manual",
      paymentMethodType: "card",
      routeExposed: false,
      stripeTransportImplemented: false,
      databaseApplyAuthorized: false,
      signedOneShotAuthorityRequired: true,
      exact109AuthorizationRequired: true,
      exact110FinalizationBridgeRequired: true,
      exact108SuccessfulOrderRequired: true,
      exact113BookingSettlementPredecessorRequired: true,
      plaintextSupportIdentityRetained: true,
      supportIdentityLookupRequired: true,
      claimGrantsCaptureAuthority: false,
      reconciliationIsRetrievalOnly: true,
      providerDispatchAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      maxStripeCaptureMutations: 1,
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps an exact 108/109/110 and signed-authority prepare", async () => {
    const receipt = { decision: "created", ...result("prepared", 0) };
    const { client, rpc } = clientReturning([receipt]);
    const persistence = createFlightConsumerLiveStripeCapturePersistence(
      client,
    );
    await expect(persistence.prepare(prepareInput())).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.prepare,
      {
        p_checkout_aggregate_id: checkoutId,
        p_authorization_bridge_receipt_sha256: digest("1"),
        p_stripe_confirmation_attempt_id: confirmationId,
        p_confirmation_state_receipt_sha256: digest("2"),
        p_duffel_order_execution_id: orderExecutionId,
        p_duffel_order_state_receipt_sha256: digest("3"),
        p_provider_order_reference_sha256: digest("4"),
        p_payment_intent_reference_sha256: digest("5"),
        p_duffel_order_execution_binding_sha256: digest("6"),
        p_execution_scope_sha256: digest("7"),
        p_idempotency_sha256: digest("8"),
        p_capture_binding_sha256: digest("9"),
        p_capture_prerequisite_sha256: digest("a"),
        p_capture_request_sha256: digest("b"),
        p_capture_authority_scope_sha256: digest("c"),
        p_capture_authority_payload_sha256: digest("d"),
        p_capture_authority_signature_sha256: digest("e"),
        p_capture_authority_key_id: "capture-signing-key-v1",
        p_amount_cents: 54_321,
        p_currency: "USD",
        p_capture_authority_not_after: "2026-08-27T12:05:00.000Z",
        p_dispatch_not_after: "2026-08-27T12:04:00.000Z",
      },
    );
  });

  it("maps one claim whose receipt grants no capture authority", async () => {
    const receipt = { decision: "claimed", ...result("dispatching", 1) };
    const { client, rpc } = clientReturning([receipt]);
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      client,
    ).claim(claimInput())).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.claim,
      {
        p_attempt_id: attemptId,
        p_expected_revision: 0,
        p_execution_scope_sha256: digest("7"),
        p_capture_binding_sha256: digest("9"),
        p_capture_request_sha256: digest("b"),
        p_dispatch_token_sha256: digest("f"),
      },
    );
    expect(receipt.capture_authorized).toBe(false);
  });

  it("persists structured success while returning only digests", async () => {
    const receipt = { decision: "succeeded", ...result("succeeded", 2) };
    const { client, rpc } = clientReturning([receipt]);
    const outcome = await createFlightConsumerLiveStripeCapturePersistence(
      client,
    ).complete(successfulCompletionInput());
    expect(outcome).toEqual(receipt);
    expect(JSON.stringify(outcome)).not.toContain(encrypted("C"));
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.complete,
      expect.objectContaining({
        p_terminal_state: "succeeded",
        p_stripe_capture_request_count: 1,
        p_stripe_mutation_count: 1,
        p_observed_payment_intent_status: "succeeded",
        p_observed_payment_intent_reference_sha256: digest("5"),
        p_observed_amount_received_cents: 54_321,
        p_observed_currency: "usd",
        p_observed_livemode: true,
        p_observed_capture_method: "manual",
        p_charge_reference_ciphertext: encrypted("C"),
        p_charge_reference_sha256: digest("3"),
        p_client_correlation_id: clientCorrelationId,
        p_client_correlation_id_sha256: sha256(clientCorrelationId),
        p_stripe_request_id: stripeRequestId,
        p_stripe_request_id_sha256: sha256(stripeRequestId),
        p_stripe_transport_outcome: "http_response",
      }),
    );
  });

  it("maps ambiguity to retrieval-only reconciliation without capture 2", async () => {
    const ambiguous = {
      decision: "ambiguous",
      ...result("ambiguous", 2),
    };
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      clientReturning([ambiguous]).client,
    ).complete(ambiguousCompletionInput())).resolves.toEqual(ambiguous);

    const reconciled = {
      decision: "reconciled",
      ...result("reconciled", 3),
    };
    const { client, rpc } = clientReturning([reconciled]);
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      client,
    ).reconcile({
      attemptId,
      expectedRevision: 2,
      executionScopeSha256: digest("7"),
      captureBindingSha256: digest("9"),
      dispatchTokenSha256: digest("f"),
      reconciliationOutcome: "succeeded",
      stripeRetrievalRequestCount: 1,
      retrievalResponseSha256: digest("1"),
      reconciliationEvidenceSha256: digest("2"),
      observedPaymentIntentStatus: "succeeded",
      observedPaymentIntentReferenceSha256: digest("5"),
      observedAmountReceivedCents: 54_321,
      observedCurrency: "usd",
      observedLivemode: true,
      observedCaptureMethod: "manual",
      chargeReferenceCiphertext: encrypted("C"),
      chargeReferenceSha256: digest("3"),
    })).resolves.toEqual(reconciled);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.reconcile,
      expect.objectContaining({
        p_stripe_retrieval_request_count: 1,
        p_observed_payment_intent_reference_sha256: digest("5"),
      }),
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty(
      "p_stripe_capture_request_count",
      2,
    );
  });

  it("maps an exact-bound read-only support identity lookup", async () => {
    const observed = {
      decision: "observed",
      ...result("succeeded", 2),
      terminal_http_status: 200,
      terminal_response_sha256: digest("1"),
      client_correlation_id: clientCorrelationId,
      client_correlation_id_sha256: sha256(clientCorrelationId),
      stripe_request_id: stripeRequestId,
      stripe_request_id_sha256: sha256(stripeRequestId),
      stripe_transport_outcome: "http_response",
    };
    const { client, rpc } = clientReturning([observed]);
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      client,
    ).readSupportIdentity({
      attemptId,
      executionScopeSha256: digest("7"),
      captureBindingSha256: digest("9"),
      captureRequestSha256: digest("b"),
    })).resolves.toEqual(observed);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_RPC.readSupportIdentity,
      {
        p_attempt_id: attemptId,
        p_execution_scope_sha256: digest("7"),
        p_capture_binding_sha256: digest("9"),
        p_capture_request_sha256: digest("b"),
      },
    );
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      clientReturning([{
        ...observed,
        stripe_request_id_sha256: digest("f"),
      }]).client,
    ).readSupportIdentity({
      attemptId,
      executionScopeSha256: digest("7"),
      captureBindingSha256: digest("9"),
      captureRequestSha256: digest("b"),
    })).rejects.toMatchObject({ reason: "invalid_result" });
    const otherCorrelation = `flt_capture_${"c".repeat(48)}`;
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      clientReturning([{
        ...observed,
        client_correlation_id: otherCorrelation,
        client_correlation_id_sha256: sha256(otherCorrelation),
      }]).client,
    ).readSupportIdentity({
      attemptId,
      executionScopeSha256: digest("7"),
      captureBindingSha256: digest("9"),
      captureRequestSha256: digest("b"),
    })).rejects.toMatchObject({ reason: "invalid_result" });
  });

  it("rejects plaintext, counter drift, expired ordering, and secret fields", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveStripeCapturePersistence(
      client,
    );
    await expect(persistence.prepare({
      ...prepareInput(),
      captureAuthorityNotAfter: "2026-08-27T12:03:00.000Z",
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      stripeMutationCount: 0,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      chargeReferenceCiphertext: "ch_plaintext",
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      terminalHttpStatus: 201,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      chargeReferenceCiphertext: null,
      chargeReferenceSha256: null,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      stripeRequestId: null,
      stripeRequestIdSha256: null,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...ambiguousCompletionInput(),
      terminalResponseSha256: digest("response-evidence"),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    const wrongCorrelation = `flt_capture_${"c".repeat(48)}`;
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      clientCorrelationId: wrongCorrelation,
      clientCorrelationIdSha256: sha256(wrongCorrelation),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      clientCorrelationIdSha256: digest("f"),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.complete({
      ...successfulCompletionInput(),
      clientSecret: "forbidden",
    } as never)).rejects.toMatchObject({ reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed rows, RPC failures, and authority drift", async () => {
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      clientReturning([]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      clientReturning([{
        decision: "created",
        ...result("prepared", 0),
        capture_authorized: true,
      }]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    const throwingClient = {
      rpc: vi.fn(async () => {
        throw new Error("redacted");
      }),
    } as FlightConsumerLiveStripeCaptureRpcClient;
    await expect(createFlightConsumerLiveStripeCapturePersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "rpc_refused",
    });
  });

  it("has no route, env read, transport, or secret-bearing integration", () => {
    const path =
      "lib/flights/consumer-production/stripe-live-capture-execution-persistence.server.ts";
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /\b(?:fetch|axios|stripe\.com|api\.stripe|process\.env)\b/i,
    );
    expect(source).not.toMatch(/\b(?:client_secret|payment_method|card_data)\b/i);
    const imports = appSourceFiles("app")
      .filter((file) => readFileSync(file, "utf8").includes(
        "stripe-live-capture-execution-persistence",
      ));
    expect(imports).toEqual([]);
  });

  it("uses a stable non-secret error surface", () => {
    const error = new FlightConsumerLiveStripeCapturePersistenceError(
      "rpc_refused",
    );
    expect(error.message).toBe(
      "Flight Consumer Live Stripe capture persistence was refused.",
    );
    expect(error.reason).toBe("rpc_refused");
  });
});
