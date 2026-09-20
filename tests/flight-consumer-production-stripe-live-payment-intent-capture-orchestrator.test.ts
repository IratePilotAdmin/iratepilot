import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_DECRYPTION_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_EVIDENCE_JOURNAL_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_TRANSPORT_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_CHARGE_ENCRYPTION_VERSION,
  FlightConsumerLiveStripePaymentIntentCaptureError,
  createFlightConsumerLiveStripePaymentIntentCaptureOrchestrator,
  type FlightConsumerLiveStripeCaptureRequest,
  type FlightConsumerLiveStripeCaptureEvidenceJournalPort,
  type FlightConsumerLiveStripeCaptureTransport,
} from "../lib/flights/consumer-production/stripe-live-payment-intent-capture-orchestrator.server";
import type {
  FlightConsumerLiveStripeCapturePersistence,
} from "../lib/flights/consumer-production/stripe-live-capture-execution-persistence.server";
import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  sha256FlightEvidence,
  type FlightRuntimePaymentBinding,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../lib/flights/runtime-safety";

const NOW = 1_788_000_000;
const amountCents = 54_321;
const paymentIntentId = "pi_0000000000000001";
const chargeId = "ch_0000000000000001";
const stripeRequestId = "req_0000000000000001";
const checkoutAggregateId = "00000000-0000-4000-8000-000000000107";
const customerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const confirmationAttemptId = "00000000-0000-4000-8000-000000000109";
const orderExecutionId = "00000000-0000-4000-8000-000000000108";
const captureAttemptId = "00000000-0000-4000-8000-000000000111";

const digest = (label: string) => sha256FlightEvidence({
  version: "flight-capture-test-digest-v1",
  label,
});
const sha256Utf8 = (value: string) => createHash("sha256")
  .update(value, "utf8")
  .digest("hex");
const instant = (seconds: number) => new Date(seconds * 1000).toISOString();

const providerBinding: FlightRuntimeProviderBinding = Object.freeze({
  providerId: "duffel_live",
  adapterVersion: "1.0.0",
  adapterSourceDigest: digest("duffel-adapter"),
  accountScopeReceiptDigest: digest("duffel-account"),
  pointOfSaleScopeReceiptDigest: digest("duffel-pos"),
  contentScopeReceiptDigest: digest("duffel-content"),
});

const paymentBinding: FlightRuntimePaymentBinding = Object.freeze({
  processorId: "stripe_live",
  adapterVersion: "1.0.0",
  adapterSourceDigest: digest("stripe-adapter"),
  accountScopeReceiptDigest: digest("stripe-account"),
  environmentScopeReceiptDigest: digest("stripe-environment"),
});

const runtimePolicy: FlightRuntimePolicy = Object.freeze({
  mode: "production",
  environment: "production",
  runtimeEnabled: true,
  syntheticAdapterEnabled: false,
  providerTrafficEnabled: true,
  bookingEnabled: true,
  paymentEnabled: true,
  settlementEnabled: true,
  ticketingEnabled: false,
  servicingEnabled: false,
  webhookEnabled: true,
  productionTrafficEnabled: true,
  transactionKillSwitchEngaged: false,
  expectedProductionAuthorizationId: "flight-capture-authorization-v1",
  providerBinding,
  paymentBinding,
  settlementBinding: null,
  invalidSettings: [],
});

const checkoutExecutionScopeSha256 = digest("checkout-scope");
const checkoutBindingSha256 = digest("checkout-binding");
const checkoutFinalizedReceiptSha256 = digest("checkout-finalized");
const authorizationBridgeReceiptSha256 = digest("authorization-bridge");
const confirmationStateReceiptSha256 = digest("confirmation-state");
const orderStateReceiptSha256 = digest("order-state");
const orderExecutionBindingSha256 = digest("order-execution-binding");
const providerOrderReferenceSha256 = digest("provider-order-reference");
const orderReferenceSha256 = digest("order-reference");
const customerReferenceSha256 = digest("customer-reference");
const paymentIntentReferenceSha256 = sha256Utf8(paymentIntentId);
const paymentBindingSha256 = digestFlightRuntimePaymentBinding(paymentBinding);

function requestArtifacts(value: Readonly<{
  amountCents: number;
  paymentIntentId: string;
}>) {
  const referenceSha256 = sha256Utf8(value.paymentIntentId);
  const path = `/v1/payment_intents/${value.paymentIntentId}/capture`;
  const requestBodySha256 = sha256FlightEvidence({
    version: "flight-consumer-live-stripe-capture-request-body-v1",
    amount_to_capture: value.amountCents,
  });
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-live-stripe-capture-request-envelope-v1",
    method: "POST",
    path,
    stripeVersion: "2024-06-20",
    contentType: "application/x-www-form-urlencoded",
    requestBodySha256,
    paymentIntentReferenceSha256: referenceSha256,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "capture_payment",
    scopeId: orderId,
    requestId: checkoutAggregateId,
    payload: {
      version: "flight-consumer-live-stripe-capture-idempotency-v1",
      requestEnvelopeSha256,
      authorizationBridgeReceiptSha256,
      stripeConfirmationStateReceiptSha256:
        confirmationStateReceiptSha256,
      duffelOrderStateReceiptSha256: orderStateReceiptSha256,
      paymentIntentReferenceSha256: referenceSha256,
      providerOrderReferenceSha256,
      amountCents: value.amountCents,
      currency: "USD",
    },
  });
  return { path, requestEnvelopeSha256, idempotency };
}

function input() {
  const artifacts = requestArtifacts({ amountCents, paymentIntentId });
  return {
    bridgeEvidence: {
      migrationVersion: "202608260110",
      checkoutAggregateId,
      customerId,
      orderId,
      checkoutExecutionScopeSha256,
      checkoutBindingSha256,
      checkoutFinalizedReceiptSha256,
      authorizationBridgeReceiptSha256,
      stripeConfirmationAttemptId: confirmationAttemptId,
      stripeConfirmationStateReceiptSha256:
        confirmationStateReceiptSha256,
      paymentIntentReferenceSha256,
      paymentBindingSha256,
      orderReferenceSha256,
      customerReferenceSha256,
      amountCents,
      currency: "USD",
      authorizationEvidenceAt: instant(NOW - 5),
      authorizationNotAfter: instant(NOW + 100),
      confirmationState: "authorized_requires_capture",
      confirmationRevision: 2,
      confirmationReconciledOutcome: null,
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
    },
    stripeAuthorizationEvidence: {
      migrationVersion: "202608260109",
      attemptId: confirmationAttemptId,
      checkoutAggregateId,
      customerId,
      orderId,
      executionScopeSha256: checkoutExecutionScopeSha256,
      checkoutBindingSha256,
      checkoutStateReceiptSha256: checkoutFinalizedReceiptSha256,
      state: {
        confirmationState: "authorized_requires_capture",
        confirmationRevision: 2,
        confirmationReconciledOutcome: null,
      },
      confirmationStateReceiptSha256,
      observedPaymentIntentStatus: "requires_capture",
      observedAmountCents: amountCents,
      observedCurrency: "usd",
      observedLivemode: true,
      processorEnvironment: "stripe_live",
      captureMethod: "manual",
      paymentMethodType: "card",
      paymentIntentReferenceCiphertext: `enc:v1:${"P".repeat(32)}`,
      paymentIntentReferenceSha256,
      paymentBindingSha256,
      orderReferenceSha256,
      customerReferenceSha256,
      amountCents,
      currency: "USD",
      confirmationNotAfter: instant(NOW + 100),
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
    },
    duffelOrderEvidence: {
      migrationVersion: "202608260108",
      attemptId: orderExecutionId,
      checkoutAggregateId,
      checkoutExecutionScopeSha256,
      checkoutBindingSha256,
      checkoutStateReceiptSha256: checkoutFinalizedReceiptSha256,
      state: {
        attemptState: "succeeded",
        attemptRevision: 2,
        reconciliationOutcome: null,
      },
      stateReceiptSha256: orderStateReceiptSha256,
      orderExecutionBindingSha256,
      providerOrderReferenceSha256,
      providerRequestCount: 1,
      airOrdersPostCount: 1,
      externalRequestMade: true,
      orderReferenceSha256,
      customerReferenceSha256,
      amountCents,
      currency: "USD",
      livemode: true,
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
    },
    paymentBinding,
    productionAuthorization: {
      version: "flight-production-action-authorization-v2",
      authorizationId: "flight-capture-authorization-v1",
      operation: "capture_payment",
      provider: "provider_production",
      scopeId: orderId,
      requestDigest: artifacts.requestEnvelopeSha256,
      idempotencyRequestDigest: artifacts.idempotency.requestDigest,
      providerBindingDigest:
        digestFlightRuntimeProviderBinding(providerBinding),
      paymentBindingDigest: paymentBindingSha256,
      settlementBindingDigest: null,
      nonce: "1".repeat(64),
      issuedAtSeconds: NOW - 1,
      expiresAtSeconds: NOW + 90,
      signatureHex: digest("capture-signature"),
    },
    captureAuthorityKeyId: "capture-signing-key-v1",
    dispatchNotAfter: instant(NOW + 60),
    dispatchTokenSha256: digest("dispatch-token"),
  };
}

function stateRow(
  state: "prepared" | "dispatching" | "succeeded" | "failed"
    | "ambiguous" | "reconciled",
  inputValue?: Record<string, unknown>,
) {
  const revision = {
    prepared: 0,
    dispatching: 1,
    succeeded: 2,
    failed: 2,
    ambiguous: 2,
    reconciled: 3,
  }[state] as 0 | 1 | 2 | 3;
  const captureCount = (
    inputValue?.stripeCaptureRequestCount === 0 ? 0
      : inputValue?.stripeCaptureRequestCount === 1 ? 1
        : revision >= 2 ? 1 : 0
  ) as 0 | 1;
  return {
    attempt_id: captureAttemptId,
    attempt_state: state,
    attempt_revision: revision,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    provider_order_reference_sha256: providerOrderReferenceSha256,
    charge_reference_sha256:
      state === "succeeded" || state === "reconciled"
        ? typeof inputValue?.chargeReferenceSha256 === "string"
          ? inputValue.chargeReferenceSha256
          : sha256Utf8(chargeId)
        : null,
    stripe_capture_request_count: captureCount,
    stripe_mutation_count: captureCount,
    stripe_retrieval_request_count:
      (state === "reconciled" ? 1 : 0) as 0 | 1,
    state_receipt_sha256: digest(`capture-state-${state}`),
    livemode: true as const,
    provider_dispatch_authorized: false as const,
    stripe_dispatch_authorized: false as const,
    booking_authorized: false as const,
    order_authorized: false as const,
    payment_authorized: false as const,
    capture_authorized: false as const,
    refund_authorized: false as const,
    settlement_authorized: false as const,
    ticketing_authorized: false as const,
    servicing_authorized: false as const,
    consumer_release_enabled: false as const,
    blind_retry_authorized: false as const,
  };
}

function persistence() {
  return {
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
    prepare: vi.fn(async () => ({
      decision: "created",
      ...stateRow("prepared"),
    })),
    claim: vi.fn(async () => ({
      decision: "claimed",
      ...stateRow("dispatching"),
    })),
    complete: vi.fn(async (value: Record<string, unknown>) => ({
      decision: value.terminalState,
      ...stateRow(value.terminalState as "succeeded" | "failed" | "ambiguous", value),
    })),
    reconcile: vi.fn(async () => ({
      decision: "reconciled",
      ...stateRow("reconciled"),
    })),
    readSupportIdentity: vi.fn(async () => ({
      decision: "observed",
      ...stateRow("prepared"),
      terminal_http_status: null,
      terminal_response_sha256: null,
      client_correlation_id: null,
      client_correlation_id_sha256: null,
      stripe_request_id: null,
      stripe_request_id_sha256: null,
      stripe_transport_outcome: null,
    })),
  } as unknown as FlightConsumerLiveStripeCapturePersistence;
}

function successfulPaymentIntent(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    id: paymentIntentId,
    object: "payment_intent",
    amount: amountCents,
    amount_capturable: 0,
    amount_received: amountCents,
    currency: "usd",
    livemode: true,
    capture_method: "manual",
    status: "succeeded",
    latest_charge: chargeId,
    ...overrides,
  };
}

function transportResult(
  httpStatus: number,
  body: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    outcome: "http_response",
    httpStatus,
    stripeRequestId,
    clientCorrelationId:
      `flt_capture_${requestArtifacts({ amountCents, paymentIntentId })
        .requestEnvelopeSha256.slice(0, 48)}`,
    contentType: "application/json",
    rawBody: Buffer.from(JSON.stringify(body), "utf8"),
    ...overrides,
  };
}

function context(overrides: Readonly<{
  times?: number[];
  nonce?: "consumed" | "replayed" | "unavailable";
  persistence?: FlightConsumerLiveStripeCapturePersistence;
  decrypt?: () => Promise<unknown>;
  transport?: (
    request: FlightConsumerLiveStripeCaptureRequest,
    options: Readonly<{
      idempotencyKey: string;
      clientCorrelationId: string;
    }>,
  ) => Promise<unknown>;
  encrypt?: () => Promise<unknown>;
  transportPaymentBindingDigest?: string;
  evidenceJournal?: FlightConsumerLiveStripeCaptureEvidenceJournalPort;
}> = {}) {
  const times = [...(overrides.times ?? [NOW, NOW, NOW])];
  const verifier = {
    readTrustedTimeSeconds: vi.fn(() => times.shift() ?? NOW),
    verifyHmacSha256: vi.fn(() => true),
    consumeNonce: vi.fn(async () => overrides.nonce ?? "consumed"),
  };
  const persistencePort = overrides.persistence ?? persistence();
  const transport = vi.fn(overrides.transport ?? (async (_request, options) =>
    transportResult(200, successfulPaymentIntent(), {
      clientCorrelationId: options.clientCorrelationId,
    })
  ));
  const decrypt = vi.fn(overrides.decrypt ?? (async () => ({
    version:
      "flight-consumer-live-stripe-capture-reference-decryption-result-v1",
    paymentIntentId,
    plaintextReferenceSha256: paymentIntentReferenceSha256,
    decryptionEvidenceSha256: digest("decryption-evidence"),
  })));
  const encrypt = vi.fn(async () => overrides.encrypt
    ? overrides.encrypt()
    : ({
      version:
        "flight-consumer-live-stripe-charge-reference-encryption-result-v1",
      ciphertext: `enc:v1:${"C".repeat(32)}`,
      plaintextReferenceSha256: sha256Utf8(chargeId),
    }));
  const evidenceJournal = overrides.evidenceJournal ?? {
    version: FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_EVIDENCE_JOURNAL_VERSION,
    durable: true,
    appendOnly: true,
    storesPlaintextIdentifiers: false,
    storesRawProviderPayload: false,
    prepareDispatchEvidence: vi.fn(async () => ({
      version:
        "flight-consumer-live-stripe-capture-durable-evidence-receipt-v1",
      evidenceReceiptSha256: digest("dispatch-evidence-receipt"),
    })),
    appendTransportOutcomeEvidence: vi.fn(async () => ({
      version:
        "flight-consumer-live-stripe-capture-durable-evidence-receipt-v1",
      evidenceReceiptSha256: digest("transport-evidence-receipt"),
    })),
  } as FlightConsumerLiveStripeCaptureEvidenceJournalPort;

  const orchestrator =
    createFlightConsumerLiveStripePaymentIntentCaptureOrchestrator({
      runtimePolicy,
      providerExecutionBinding: providerBinding,
      paymentExecutionBinding: paymentBinding,
      productionAuthorizationVerifier: verifier,
      executionPersistence: persistencePort,
      referenceDecryption: {
        version: FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_DECRYPTION_VERSION,
        logsPlaintext: false,
        persistsPlaintext: false,
        decryptPaymentIntentReference: decrypt,
      },
      stripeTransport: {
        version: FLIGHT_CONSUMER_LIVE_STRIPE_CAPTURE_TRANSPORT_VERSION,
        method: "POST",
        pathTemplate: "/v1/payment_intents/:id/capture",
        stripeVersion: "2024-06-20",
        processorEnvironment: "stripe_live",
        livemode: true,
        paymentBindingDigest: overrides.transportPaymentBindingDigest
          ?? paymentBindingSha256,
        retryImplemented: false,
        logsRequest: false,
        logsResponse: false,
        persistsRequest: false,
        persistsResponse: false,
        retainsStripeRequestId: true,
        echoesClientCorrelationId: true,
        explicitOutcomeEnvelope: true,
        thrownOutcomeIsUnclassified: true,
        maxCaptureMutations: 1,
        capturePaymentIntent: transport as FlightConsumerLiveStripeCaptureTransport[
          "capturePaymentIntent"
        ],
      },
      referenceEncryption: {
        version: FLIGHT_CONSUMER_LIVE_STRIPE_CHARGE_ENCRYPTION_VERSION,
        encryptChargeReference: encrypt,
      },
      evidenceJournal,
    });
  return {
    orchestrator,
    verifier,
    persistencePort,
    transport,
    decrypt,
    encrypt,
    evidenceJournal,
  };
}

describe("Flight Consumer Production Stripe live PaymentIntent capture orchestrator", () => {
  it("executes one exact 2024-06-20 manual capture and persists encrypted charge evidence", async () => {
    const ctx = context();
    const result = await ctx.orchestrator.execute(input());
    const artifacts = requestArtifacts({ amountCents, paymentIntentId });

    expect(ctx.transport).toHaveBeenCalledTimes(1);
    expect(ctx.transport).toHaveBeenCalledWith({
      method: "POST",
      path: artifacts.path,
      stripeVersion: "2024-06-20",
      contentType: "application/x-www-form-urlencoded",
      paymentIntentId,
      body: { amount_to_capture: amountCents },
    }, {
      idempotencyKey: artifacts.idempotency.idempotencyKey,
      clientCorrelationId:
        `flt_capture_${artifacts.requestEnvelopeSha256.slice(0, 48)}`,
    });
    expect(ctx.persistencePort.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutAggregateId,
        authorizationBridgeReceiptSha256,
        stripeConfirmationAttemptId: confirmationAttemptId,
        confirmationStateReceiptSha256,
        duffelOrderExecutionId: orderExecutionId,
        duffelOrderStateReceiptSha256: orderStateReceiptSha256,
        providerOrderReferenceSha256,
        paymentIntentReferenceSha256,
        captureRequestSha256: artifacts.requestEnvelopeSha256,
        captureAuthorityKeyId: "capture-signing-key-v1",
        amountCents,
        currency: "USD",
      }),
    );
    expect(ctx.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalState: "succeeded",
        stripeCaptureRequestCount: 1,
        stripeMutationCount: 1,
        terminalHttpStatus: 200,
        observedPaymentIntentStatus: "succeeded",
        observedPaymentIntentReferenceSha256:
          paymentIntentReferenceSha256,
        observedAmountReceivedCents: amountCents,
        observedCurrency: "usd",
        observedLivemode: true,
        observedCaptureMethod: "manual",
        chargeReferenceCiphertext: expect.stringMatching(/^enc:v1:/),
        chargeReferenceSha256: sha256Utf8(chargeId),
        clientCorrelationId:
          `flt_capture_${artifacts.requestEnvelopeSha256.slice(0, 48)}`,
        clientCorrelationIdSha256: sha256Utf8(
          `flt_capture_${artifacts.requestEnvelopeSha256.slice(0, 48)}`,
        ),
        stripeRequestId,
        stripeRequestIdSha256: sha256Utf8(stripeRequestId),
      }),
    );
    expect(ctx.evidenceJournal.prepareDispatchEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: captureAttemptId,
        idempotencyRequestSha256: artifacts.idempotency.requestDigest,
        idempotencyKeySha256:
          sha256Utf8(artifacts.idempotency.idempotencyKey),
      }),
    );
    expect(ctx.evidenceJournal.appendTransportOutcomeEvidence)
      .toHaveBeenCalledWith(expect.objectContaining({
        attemptId: captureAttemptId,
        outcome: "http_response",
        providerRequestCount: 1,
        terminalHttpStatus: 200,
        stripeRequestIdSha256: sha256Utf8(stripeRequestId),
      }));
    expect(result).toMatchObject({
      decision: "succeeded",
      providerRequestCount: 1,
      stripeCaptureRequestCount: 1,
      stripeMutationCount: 1,
      paymentIntentReferenceSha256,
      chargeReferenceSha256: sha256Utf8(chargeId),
      providerDispatchAuthorized: false,
      stripeDispatchAuthorized: false,
      captureAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      ticketingRemainsLaterGate: true,
    });
    expect(result.stripeRequestIdSha256).toBe(sha256Utf8(stripeRequestId));
    expect(result.dispatchEvidenceReceiptSha256).toBe(
      digest("dispatch-evidence-receipt"),
    );
    expect(result.transportEvidenceReceiptSha256).toBe(
      digest("transport-evidence-receipt"),
    );
    expect(JSON.stringify(result)).not.toMatch(/pi_|ch_|req_/);
  });

  it("refuses schema-valid completion receipts that drift from the exact capture", async () => {
    const successPersistence = persistence();
    vi.mocked(successPersistence.complete).mockImplementation(async (value) => ({
      decision: "succeeded",
      ...stateRow("succeeded", value as Record<string, unknown>),
      provider_order_reference_sha256: digest("wrong-provider-order"),
    }) as never);
    const success = context({ persistence: successPersistence });
    await expect(success.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "terminal_persistence_failed",
      blindRetryAuthorized: false,
    });
    expect(success.transport).toHaveBeenCalledTimes(1);

    const ambiguousPersistence = persistence();
    vi.mocked(ambiguousPersistence.complete).mockImplementation(
      async (value) => ({
        decision: "ambiguous",
        ...stateRow("ambiguous", value as Record<string, unknown>),
        attempt_id: "00000000-0000-4000-8000-000000000999",
      }) as never,
    );
    const ambiguous = context({
      persistence: ambiguousPersistence,
      transport: async () => transportResult(500, {
        error: { type: "api_error" },
      }),
    });
    await expect(ambiguous.orchestrator.execute(input())).rejects
      .toMatchObject({
        reason: "terminal_persistence_failed",
        blindRetryAuthorized: false,
      });
    expect(ambiguous.transport).toHaveBeenCalledTimes(1);
  });

  it("rechecks trusted time immediately before dispatch and records zero-mutation expiry", async () => {
    const ctx = context({ times: [NOW, NOW, NOW + 60] });
    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "failed",
      failureCode: "dispatch_window_expired",
      providerRequestCount: 0,
      stripeMutationCount: 0,
    });
    expect(ctx.verifier.readTrustedTimeSeconds).toHaveBeenCalledTimes(3);
    expect(ctx.transport).not.toHaveBeenCalled();
    expect(ctx.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalState: "failed",
        stripeCaptureRequestCount: 0,
        stripeMutationCount: 0,
      }),
    );
  });

  it("treats thrown, 5xx, conflict, rate limit, and unknown 4xx outcomes as terminal ambiguity", async () => {
    const cases = [
      async (
        _request: FlightConsumerLiveStripeCaptureRequest,
        options: Readonly<{ clientCorrelationId: string }>,
      ) => ({
        outcome: "no_response",
        clientCorrelationId: options.clientCorrelationId,
      }),
      async () => transportResult(500, { error: { type: "api_error" } }),
      async () => transportResult(409, {
        error: { type: "idempotency_error", code: "idempotency_key_in_use" },
      }),
      async () => transportResult(429, {
        error: { type: "rate_limit_error", code: "rate_limit" },
      }),
      async () => transportResult(400, {
        error: { type: "invalid_request_error", code: "lock_timeout" },
      }),
    ];

    for (const transport of cases) {
      const ctx = context({ transport });
      await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
        decision: "ambiguous",
        providerRequestCount: 1,
        stripeCaptureRequestCount: 1,
        blindRetryAuthorized: false,
      });
      expect(ctx.transport).toHaveBeenCalledTimes(1);
    }
  });

  it("allowlists only exact definitive no-capture 4xx evidence", async () => {
    const definitive = context({
      transport: async () => transportResult(400, {
        error: {
          type: "invalid_request_error",
          code: "amount_too_large",
        },
      }),
    });
    await expect(definitive.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "failed",
        failureCode: "stripe_capture_definitive_refusal",
        providerRequestCount: 1,
        blindRetryAuthorized: false,
      });
    expect(definitive.transport).toHaveBeenCalledTimes(1);

    const unexpectedState = context({
      transport: async () => transportResult(400, {
        error: {
          type: "invalid_request_error",
          code: "payment_intent_unexpected_state",
        },
      }),
    });
    await expect(unexpectedState.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_capture_nonterminal_response",
        providerRequestCount: 1,
        blindRetryAuthorized: false,
      });
    expect(unexpectedState.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({ terminalState: "ambiguous" }),
    );

    const wrongType = context({
      transport: async () => transportResult(400, {
        error: {
          type: "api_error",
          code: "payment_intent_unexpected_state",
        },
      }),
    });
    await expect(wrongType.orchestrator.execute(input())).resolves
      .toMatchObject({ decision: "ambiguous" });
  });

  it("requires exact PI identity, success status, amount, currency, livemode, capture method, and latest charge", async () => {
    const cases = [
      successfulPaymentIntent({ id: "pi_0000000000000002" }),
      successfulPaymentIntent({ status: "requires_capture" }),
      successfulPaymentIntent({ amount_received: amountCents - 1 }),
      successfulPaymentIntent({ amount: amountCents + 1 }),
      successfulPaymentIntent({ currency: "eur" }),
      successfulPaymentIntent({ livemode: false }),
      successfulPaymentIntent({ capture_method: "automatic" }),
      successfulPaymentIntent({ latest_charge: null }),
    ];
    for (const body of cases) {
      const ctx = context({
        transport: async () => transportResult(200, body),
      });
      await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_capture_success_binding_mismatch",
        providerRequestCount: 1,
        blindRetryAuthorized: false,
      });
      expect(ctx.transport).toHaveBeenCalledTimes(1);
      expect(ctx.encrypt).not.toHaveBeenCalled();
    }
  });

  it("locally hashes raw bytes and requires echoed correlation evidence", async () => {
    const correlation = context({
      transport: async () => transportResult(200, successfulPaymentIntent(), {
        clientCorrelationId: `flt_capture_${"0".repeat(48)}`,
      }),
    });
    await expect(correlation.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_capture_correlation_mismatch",
      });

    const malformed = context({
      transport: async () => ({
        ...transportResult(200, successfulPaymentIntent()),
        rawBody: Buffer.from("{", "utf8"),
      }),
    });
    await expect(malformed.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_capture_response_refused",
      });
    const completion = vi.mocked(malformed.persistencePort.complete)
      .mock.calls[0]?.[0] as Record<string, unknown>;
    expect(completion.terminalResponseSha256).toBe(
      createHash("sha256").update(Buffer.from("{", "utf8")).digest("hex"),
    );
  });

  it("retains support IDs for a resolved malformed envelope and never journals it as no-response", async () => {
    const malformedEnvelope = context({
      transport: async () => transportResult(502, { error: true }, {
        contentType: "text/plain",
        clientCorrelationId: undefined,
      }),
    });
    await expect(malformedEnvelope.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_capture_response_refused",
        providerRequestCount: 1,
      });
    expect(malformedEnvelope.evidenceJournal.appendTransportOutcomeEvidence)
      .toHaveBeenCalledWith(expect.objectContaining({
        outcome: "invalid_http_response",
        terminalHttpStatus: 502,
        stripeRequestIdSha256: sha256Utf8(stripeRequestId),
        observedClientCorrelationIdSha256: null,
      }));
    expect(malformedEnvelope.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalHttpStatus: 502,
        clientCorrelationId: expect.stringMatching(/^flt_capture_/),
        stripeRequestId,
        stripeRequestIdSha256: sha256Utf8(stripeRequestId),
      }),
    );

    const missingIdentity = context({
      transport: async () => ({
        httpStatus: 502,
        contentType: "application/json",
        rawBody: Buffer.from("{}", "utf8"),
      }),
    });
    await expect(missingIdentity.orchestrator.execute(input())).rejects
      .toMatchObject({
        reason: "terminal_persistence_failed",
        blindRetryAuthorized: false,
      });
    expect(missingIdentity.evidenceJournal.appendTransportOutcomeEvidence)
      .not.toHaveBeenCalled();
    expect(missingIdentity.persistencePort.complete).not.toHaveBeenCalled();
  });

  it("retains local correlation and no Stripe Request-Id only for an explicit no-response envelope", async () => {
    const noResponse = context({
      transport: async (_request, options) => ({
        outcome: "no_response",
        clientCorrelationId: options.clientCorrelationId,
      }),
    });
    await expect(noResponse.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "stripe_capture_outcome_unknown",
    });
    expect(noResponse.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalHttpStatus: null,
        clientCorrelationId: expect.stringMatching(/^flt_capture_/),
        clientCorrelationIdSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        stripeRequestId: null,
        stripeRequestIdSha256: null,
      }),
    );

    const thrown = context({
      transport: async () => { throw new Error("unclassified adapter throw"); },
    });
    await expect(thrown.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "terminal_persistence_failed",
      blindRetryAuthorized: false,
    });
    expect(thrown.evidenceJournal.appendTransportOutcomeEvidence)
      .not.toHaveBeenCalled();
    expect(thrown.persistencePort.complete).not.toHaveBeenCalled();
  });

  it("rejects decrypted PI mutation and request-body mutation before persistence or Stripe", async () => {
    const wrongPi = "pi_0000000000000002";
    const decryption = context({
      decrypt: async () => ({
        version:
          "flight-consumer-live-stripe-capture-reference-decryption-result-v1",
        paymentIntentId: wrongPi,
        plaintextReferenceSha256: sha256Utf8(wrongPi),
        decryptionEvidenceSha256: digest("other-decryption"),
      }),
    });
    await expect(decryption.orchestrator.execute(input())).rejects
      .toMatchObject({ reason: "decryption_refused" });
    expect(decryption.persistencePort.prepare).not.toHaveBeenCalled();
    expect(decryption.transport).not.toHaveBeenCalled();

    const mutated = input();
    mutated.bridgeEvidence.amountCents += 1;
    mutated.stripeAuthorizationEvidence.amountCents += 1;
    mutated.stripeAuthorizationEvidence.observedAmountCents += 1;
    mutated.duffelOrderEvidence.amountCents += 1;
    const bodyMutation = context();
    await expect(bodyMutation.orchestrator.execute(mutated)).rejects
      .toMatchObject({ reason: "authority_refused" });
    expect(bodyMutation.persistencePort.prepare).not.toHaveBeenCalled();
    expect(bodyMutation.transport).not.toHaveBeenCalled();
  });

  it("accepts exact reconciled 108 and 109 evidence while rejecting cross-lineage drift", async () => {
    const reconciled = input();
    reconciled.bridgeEvidence.confirmationState = "reconciled";
    reconciled.bridgeEvidence.confirmationRevision = 3;
    (reconciled.bridgeEvidence as {
      confirmationReconciledOutcome: string | null;
    }).confirmationReconciledOutcome = "authorized_requires_capture";
    (reconciled.stripeAuthorizationEvidence as {
      state: unknown;
    }).state = {
      confirmationState: "reconciled",
      confirmationRevision: 3,
      confirmationReconciledOutcome: "authorized_requires_capture",
    };
    (reconciled.duffelOrderEvidence as { state: unknown }).state = {
      attemptState: "reconciled",
      attemptRevision: 3,
      reconciliationOutcome: "succeeded",
    };
    await expect(context().orchestrator.execute(reconciled)).resolves
      .toMatchObject({ decision: "succeeded" });

    const drift = input();
    drift.duffelOrderEvidence.stateReceiptSha256 = digest("wrong-order-state");
    const refused = context();
    await expect(refused.orchestrator.execute(drift)).rejects.toMatchObject({
      reason: "authority_refused",
    });
    expect(refused.transport).not.toHaveBeenCalled();
  });

  it("returns authority and persistence replay without a second mutation", async () => {
    const authority = context({ nonce: "replayed" });
    await expect(authority.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "replay",
        replayStage: "authority",
        providerRequestCount: 0,
      });
    expect(authority.persistencePort.prepare).not.toHaveBeenCalled();
    expect(authority.transport).not.toHaveBeenCalled();

    const port = persistence();
    vi.mocked(port.prepare).mockResolvedValue({
      decision: "replay",
      ...stateRow("ambiguous"),
    });
    const replayCorrelation =
      `flt_capture_${requestArtifacts({ amountCents, paymentIntentId })
        .requestEnvelopeSha256.slice(0, 48)}`;
    vi.mocked(port.readSupportIdentity).mockResolvedValue({
      decision: "observed",
      ...stateRow("ambiguous"),
      terminal_http_status: null,
      terminal_response_sha256: null,
      client_correlation_id: replayCorrelation,
      client_correlation_id_sha256: sha256Utf8(replayCorrelation),
      stripe_request_id: null,
      stripe_request_id_sha256: null,
      stripe_transport_outcome: "no_response",
    });
    const replay = context({ persistence: port });
    await expect(replay.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "replay",
      replayStage: "prepare",
      attemptState: "ambiguous",
      providerRequestCount: 1,
      stripeCaptureRequestCount: 1,
      stripeMutationCount: 1,
      clientCorrelationIdSha256: sha256Utf8(replayCorrelation),
      stripeRequestIdSha256: null,
    });
    expect(replay.transport).not.toHaveBeenCalled();
    expect(port.readSupportIdentity).toHaveBeenCalledWith({
      attemptId: captureAttemptId,
      executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      captureBindingSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      captureRequestSha256:
        requestArtifacts({ amountCents, paymentIntentId })
          .requestEnvelopeSha256,
    });

    const driftPort = persistence();
    vi.mocked(driftPort.prepare).mockResolvedValue({
      decision: "replay",
      ...stateRow("ambiguous"),
    });
    vi.mocked(driftPort.readSupportIdentity).mockResolvedValue({
      decision: "observed",
      ...stateRow("ambiguous"),
      state_receipt_sha256: digest("drifted-support-state"),
      terminal_http_status: null,
      terminal_response_sha256: null,
      client_correlation_id: replayCorrelation,
      client_correlation_id_sha256: sha256Utf8(replayCorrelation),
      stripe_request_id: null,
      stripe_request_id_sha256: null,
      stripe_transport_outcome: "no_response",
    });
    await expect(context({ persistence: driftPort }).orchestrator
      .execute(input())).rejects.toMatchObject({
        reason: "persistence_refused",
      });

    const correlationDriftPort = persistence();
    vi.mocked(correlationDriftPort.prepare).mockResolvedValue({
      decision: "replay",
      ...stateRow("ambiguous"),
    });
    const otherCorrelation = `flt_capture_${"c".repeat(48)}`;
    vi.mocked(correlationDriftPort.readSupportIdentity).mockResolvedValue({
      decision: "observed",
      ...stateRow("ambiguous"),
      terminal_http_status: null,
      terminal_response_sha256: null,
      client_correlation_id: otherCorrelation,
      client_correlation_id_sha256: sha256Utf8(otherCorrelation),
      stripe_request_id: null,
      stripe_request_id_sha256: null,
      stripe_transport_outcome: "no_response",
    });
    await expect(context({ persistence: correlationDriftPort }).orchestrator
      .execute(input())).rejects.toMatchObject({
        reason: "persistence_refused",
      });
  });

  it("terminalizes charge encryption failure and never retries the capture", async () => {
    const ctx = context({
      encrypt: async () => ({
        version:
          "flight-consumer-live-stripe-charge-reference-encryption-result-v1",
        ciphertext: `enc:v1:${"Z".repeat(32)}`,
        plaintextReferenceSha256: digest("wrong-charge"),
      }),
    });
    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "stripe_capture_reference_encryption_failed",
      providerRequestCount: 1,
      blindRetryAuthorized: false,
    });
    expect(ctx.transport).toHaveBeenCalledTimes(1);
  });

  it("requires durable digest-only dispatch and outcome evidence around the mutation", async () => {
    const unavailableBefore = context().evidenceJournal;
    vi.mocked(unavailableBefore.prepareDispatchEvidence)
      .mockRejectedValue(new Error("journal unavailable"));
    const before = context({ evidenceJournal: unavailableBefore });
    await expect(before.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "failed",
      failureCode: "dispatch_evidence_persistence_failed",
      providerRequestCount: 0,
      blindRetryAuthorized: false,
    });
    expect(before.transport).not.toHaveBeenCalled();

    const unavailableAfter = context().evidenceJournal;
    vi.mocked(unavailableAfter.appendTransportOutcomeEvidence)
      .mockRejectedValue(new Error("journal unavailable"));
    const after = context({ evidenceJournal: unavailableAfter });
    await expect(after.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "stripe_capture_evidence_journal_failed",
      providerRequestCount: 1,
      blindRetryAuthorized: false,
    });
    expect(after.transport).toHaveBeenCalledTimes(1);
  });

  it("makes a post-provider persistence uncertainty terminal without a blind retry", async () => {
    const port = persistence();
    vi.mocked(port.complete).mockRejectedValue(new Error("unknown commit"));
    const ctx = context({ persistence: port });
    await expect(ctx.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "terminal_persistence_failed",
      blindRetryAuthorized: false,
    });
    expect(ctx.transport).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
  });

  it("refuses an unbound Stripe transport at construction", () => {
    expect(() => context({
      transportPaymentBindingDigest: digest("wrong-payment-binding"),
    })).toThrowError(FlightConsumerLiveStripePaymentIntentCaptureError);
  });

  it("exposes only a dark, injected, one-shot source boundary", () => {
    const ctx = context();
    expect(ctx.orchestrator).toMatchObject({
      version:
        "flight-consumer-live-stripe-payment-intent-capture-orchestrator-v2",
      routeExposed: false,
      consumerReachable: false,
      environmentReadImplemented: false,
      providerClientImplemented: false,
      refundImplemented: false,
      ticketingImplemented: false,
      servicingImplemented: false,
      blindProviderRetryImplemented: false,
      maxStripeCaptureMutations: 1,
    });
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/stripe-live-payment-intent-capture-orchestrator.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(/\bprocess\.env\b|\bconsole\.|\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:route|stripe-sdk|supabase\/admin)[^"']*["']/i);
    expect(source).not.toMatch(/api\.stripe\.com|https?:\/\//i);
    expect(source).toContain('pathTemplate: "/v1/payment_intents/:id/capture"');
    expect(source).toContain('stripeVersion: "2024-06-20"');
    expect(source).toContain("amount_to_capture");
    expect(source).toContain("rawBody");
    expect(source).toContain("stripeRequestIdSha256");
    expect(source).toContain("clientCorrelationIdSha256");
    expect(source).toContain("idempotencyKeySha256");
    expect(source).toContain("prepareDispatchEvidence");
    expect(source).toContain("appendTransportOutcomeEvidence");
    expect(source).toContain("storesPlaintextIdentifiers: false");
    expect(source).toContain("maxCaptureMutations: 1");
    expect(source).toContain("explicitOutcomeEnvelope: true");
    expect(source).toContain("thrownOutcomeIsUnclassified: true");
  });
});
