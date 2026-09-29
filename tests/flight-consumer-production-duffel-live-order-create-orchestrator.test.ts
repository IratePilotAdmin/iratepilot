import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveDuffelOrderCreateOrchestrator,
  FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_DECRYPTION_VERSION,
  FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_TRANSPORT_VERSION,
  FLIGHT_CONSUMER_LIVE_DUFFEL_REFERENCE_ENCRYPTION_VERSION,
  FlightConsumerLiveDuffelOrderCreateError,
  type FlightConsumerLiveDuffelOrderCreateRequest,
  type FlightConsumerLiveDuffelOrderCreateTransport,
} from "../lib/flights/consumer-production/duffel-live-order-create-orchestrator.server";
import type {
  FlightConsumerLiveDuffelOrderExecutionPersistence,
} from "../lib/flights/consumer-production/duffel-live-order-execution-persistence.server";
import {
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
} from "../lib/flights/consumer-production/duffel-live-offer-reprice.server";
import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimeProviderBinding,
  digestFlightRuntimeSettlementBinding,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
  type FlightRuntimeSettlementBinding,
} from "../lib/flights/runtime-safety";

const NOW = 1_800_000_000;
const orderId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const aggregateId = "00000000-0000-4000-8000-000000000003";
const offerAttemptId = "00000000-0000-4000-8000-000000000004";
const stripeAttemptId = "00000000-0000-4000-8000-000000000005";
const stripeExecutionAttemptId = "00000000-0000-4000-8000-000000000006";
const orderAttemptId = "00000000-0000-4000-8000-000000000007";
const offerId = "off_0000000000000001";
const passengerId = "pas_0000000000000001";
const providerOrderId = "ord_0000000000000001";
const bookingReference = "ABC123";
const providerRequestId = "req_0000000000000001";

function digest(value: string) {
  return sha256FlightEvidence({ test: value });
}

function instant(seconds: number) {
  return new Date(seconds * 1000).toISOString();
}

const offerIdSha256 =
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256(offerId);
const sourceOfferEvidenceSha256 = digest("source-offer-evidence");
const sourceShoppingExecutionScopeSha256 = digest("source-shopping-scope");
const offerBindingSha256 = sha256FlightEvidence({
  version: "flight-consumer-production-duffel-live-offer-binding-v1",
  providerCode: "duffel",
  providerEnvironment: "live",
  offerIdSha256,
  sourceOfferEvidenceSha256,
  sourceShoppingExecutionScopeSha256,
});

function rawBody(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function successfulOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: providerOrderId,
      booking_reference: bookingReference,
      offer_id: offerId,
      live_mode: true,
      type: "instant",
      total_amount: "169.14",
      total_currency: "USD",
      payment_status: {
        awaiting_payment: false,
        paid_at: instant(NOW - 1),
      },
      ...overrides,
    },
  };
}

const providerBinding: FlightRuntimeProviderBinding = Object.freeze({
  providerId: "duffel_live",
  adapterVersion: "1.0.0",
  adapterSourceDigest: digest("provider-adapter"),
  accountScopeReceiptDigest: digest("provider-account"),
  pointOfSaleScopeReceiptDigest: digest("provider-pos"),
  contentScopeReceiptDigest: digest("provider-content"),
});

const settlementBinding: FlightRuntimeSettlementBinding = Object.freeze({
  providerId: "duffel_live",
  method: "provider_balance",
  accountScopeReceiptDigest: digest("settlement-account"),
  environmentScopeReceiptDigest: digest("settlement-environment"),
  currency: "USD",
});

const runtimePolicy: FlightRuntimePolicy = Object.freeze({
  mode: "production",
  environment: "production",
  runtimeEnabled: true,
  syntheticAdapterEnabled: false,
  providerTrafficEnabled: true,
  bookingEnabled: true,
  paymentEnabled: false,
  settlementEnabled: true,
  ticketingEnabled: false,
  servicingEnabled: false,
  webhookEnabled: false,
  productionTrafficEnabled: true,
  transactionKillSwitchEngaged: false,
  expectedProductionAuthorizationId: "flight-order-auth-0001",
  providerBinding,
  paymentBinding: null,
  settlementBinding,
  invalidSettings: Object.freeze([]),
});

const encryptedEvidence = Object.freeze({
  travelerPayloadCiphertext: `enc:v1:${"A".repeat(32)}`,
  travelerPayloadSha256: digest("traveler-payload"),
  travelerEvidenceSha256: digest("traveler-evidence"),
  contactPayloadCiphertext: `enc:v1:${"B".repeat(32)}`,
  contactPayloadSha256: digest("contact-payload"),
  contactEvidenceSha256: digest("contact-evidence"),
  billingAddressPayloadCiphertext: `enc:v1:${"C".repeat(32)}`,
  billingAddressPayloadSha256: digest("billing-payload"),
  billingAddressEvidenceSha256: digest("billing-evidence"),
});

function fixtureRequestBodySha256() {
  return sha256FlightEvidence({
    version: "flight-consumer-live-duffel-order-create-request-body-v1",
    data: {
      type: "instant",
      selected_offers: [offerId],
      payments: [{ type: "balance", currency: "USD", amount: "169.14" }],
      passengers: [{
        id: passengerId,
        title: "ms",
        gender: "f",
        given_name: "Private",
        family_name: "Traveler",
        born_on: "1990-01-01",
        email: "private.traveler@example.com",
        phone_number: "+13125550121",
      }],
    },
  });
}

function fixtureRequestEnvelopeSha256() {
  return sha256FlightEvidence({
    version: "flight-consumer-live-duffel-order-create-request-envelope-v1",
    method: "POST",
    path: "/air/orders",
    contentType: "application/json",
    requestBodySha256: fixtureRequestBodySha256(),
    selectedOfferReferenceSha256: digestPlaintext(offerId),
  });
}

const decryptedMaterial = Object.freeze({
  version: "flight-consumer-live-duffel-order-decrypted-material-v1" as const,
  selectedOfferId: offerId,
  passengers: Object.freeze([Object.freeze({
    id: passengerId,
    title: "ms" as const,
    gender: "f" as const,
    given_name: "Private",
    family_name: "Traveler",
    born_on: "1990-01-01",
  })]),
  contact: Object.freeze({
    email: "private.traveler@example.com",
    phone_number: "+13125550121",
  }),
  travelerEvidenceSha256: encryptedEvidence.travelerEvidenceSha256,
  contactEvidenceSha256: encryptedEvidence.contactEvidenceSha256,
  billingAddressEvidenceSha256:
    encryptedEvidence.billingAddressEvidenceSha256,
  decryptionEvidenceSha256: digest("decryption-evidence"),
  selectedOfferReferenceSha256: digestPlaintext(offerId),
  requestBodySha256: fixtureRequestBodySha256(),
  requestEnvelopeSha256: fixtureRequestEnvelopeSha256(),
});

function expectedRequest(): FlightConsumerLiveDuffelOrderCreateRequest {
  return {
    data: {
      type: "instant",
      selected_offers: [offerId],
      payments: [{ type: "balance", currency: "USD", amount: "169.14" }],
      passengers: [{
        ...decryptedMaterial.passengers[0]!,
        email: decryptedMaterial.contact.email,
        phone_number: decryptedMaterial.contact.phone_number,
      }],
    },
  };
}

function requestArtifacts() {
  const request = expectedRequest();
  const body = sha256FlightEvidence({
    version: "flight-consumer-live-duffel-order-create-request-body-v1",
    data: request.data,
  });
  const envelope = sha256FlightEvidence({
    version: "flight-consumer-live-duffel-order-create-request-envelope-v1",
    method: "POST",
    path: "/air/orders",
    contentType: "application/json",
    requestBodySha256: body,
    selectedOfferReferenceSha256: digestPlaintext(offerId),
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "create_order",
    scopeId: orderId,
    requestId: aggregateId,
    payload: {
      version: "flight-consumer-live-duffel-order-create-idempotency-v1",
      requestEnvelopeSha256: envelope,
      checkoutAggregateId: aggregateId,
      checkoutFinalizedStateReceiptSha256: digest("checkout-finalized"),
      authorizationBridgeReceiptSha256: digest("authorization-bridge"),
      offerRefreshStateReceiptSha256: digest("offer-refresh-state"),
      stripeAuthorizationStateReceiptSha256: digest("stripe-authorized-state"),
      paymentIntentReferenceSha256: digest("payment-intent-reference"),
    },
  });
  return { request, envelope, idempotency };
}

function fixtureClientCorrelationId() {
  return `flt_order_${requestArtifacts().envelope.slice(0, 48)}`;
}

function duffelTransportResult(
  httpStatus: number,
  body: unknown,
  overrides: Readonly<{
    providerRequestId?: string;
    clientCorrelationId?: string;
  }> = {},
) {
  return {
    kind: "http_response" as const,
    httpStatus,
    providerRequestId: overrides.providerRequestId ?? providerRequestId,
    clientCorrelationId:
      overrides.clientCorrelationId ?? fixtureClientCorrelationId(),
    contentType: "application/json" as const,
    rawBody: rawBody(body),
  };
}

function digestPlaintext(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function input(overrides: Record<string, unknown> = {}) {
  const artifacts = requestArtifacts();
  const authorization: FlightProductionActionAuthorization = {
    version: "flight-production-action-authorization-v2",
    authorizationId: "flight-order-auth-0001",
    operation: "create_order",
    provider: "provider_production",
    scopeId: orderId,
    requestDigest: artifacts.envelope,
    idempotencyRequestDigest: artifacts.idempotency.requestDigest,
    providerBindingDigest: digestFlightRuntimeProviderBinding(providerBinding),
    paymentBindingDigest: null,
    settlementBindingDigest:
      digestFlightRuntimeSettlementBinding(settlementBinding),
    nonce: "a".repeat(32),
    issuedAtSeconds: NOW - 30,
    expiresAtSeconds: NOW + 100,
    signatureHex: digest("signature"),
  };
  return {
    orderId,
    customerId,
    checkoutEvidence: {
      aggregateId,
      orderId,
      customerId,
      checkoutState: "finalized",
      checkoutRevision: 1,
      executionScopeSha256: digest("execution-scope"),
      checkoutBindingSha256: digest("checkout-binding"),
      preparedStateReceiptSha256: digest("checkout-prepared"),
      finalizedStateReceiptSha256: digest("checkout-finalized"),
      finalizationEvidenceSha256: digest("checkout-finalization-evidence"),
      authorizationBridgeReceiptSha256: digest("authorization-bridge"),
      offerRefreshAttemptId: offerAttemptId,
      offerRefreshExecutionScopeSha256: digest("offer-execution-scope"),
      offerBindingSha256,
      normalizedOfferSha256: digest("normalized-offer"),
      offerTerminalResponseSha256: digest("offer-terminal-response"),
      offerExpiresAt: instant(NOW + 180),
      stripeExecutionAttemptId,
      stripeExecutionWorkflowSha256: digest("stripe-execution-workflow"),
      stripeExecutionPrerequisiteSha256: digest("stripe-execution-prerequisite"),
      stripeExecutionCompletedReceiptSha256: digest("stripe-completed"),
      paymentBindingSha256: digest("payment-binding"),
      orderReferenceSha256: digest("order-reference"),
      customerReferenceSha256: digest("customer-reference"),
      amountCents: 16_914,
      currency: "USD",
      encryptedEvidence,
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
    offerRefreshEvidence: {
      attemptId: offerAttemptId,
      attemptState: "succeeded",
      attemptRevision: 2,
      executionScopeSha256: digest("offer-execution-scope"),
      offerIdSha256,
      sourceOfferEvidenceSha256,
      sourceShoppingExecutionScopeSha256,
      offerBindingSha256,
      normalizedOfferSha256: digest("normalized-offer"),
      terminalResponseSha256: digest("offer-terminal-response"),
      stateReceiptSha256: digest("offer-refresh-state"),
      providerDispatchCount: 1,
      amountCents: 16_914,
      currency: "USD",
      offerExpiresAt: instant(NOW + 180),
      observedAt: instant(NOW - 10),
      orderAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      refundAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
    },
    stripeAuthorizationEvidence: {
      attemptId: stripeAttemptId,
      confirmationState: "authorized_requires_capture",
      confirmationRevision: 2,
      confirmationReconciledOutcome: null,
      checkoutAggregateId: aggregateId,
      stripeExecutionAttemptId,
      stripeExecutionWorkflowSha256: digest("stripe-execution-workflow"),
      stripeExecutionPrerequisiteSha256: digest("stripe-execution-prerequisite"),
      executionScopeSha256: digest("execution-scope"),
      confirmationBindingSha256: digest("confirmation-binding"),
      confirmationWorkflowSha256: digest("confirmation-workflow"),
      confirmationPrerequisiteSha256: digest("confirmation-prerequisite"),
      checkoutPreparedStateReceiptSha256: digest("checkout-prepared"),
      stripeExecutionCompletedReceiptSha256: digest("stripe-completed"),
      stateReceiptSha256: digest("stripe-authorized-state"),
      observedPaymentIntentStatus: "requires_capture",
      amountCents: 16_914,
      currency: "USD",
      processorEnvironment: "stripe_live",
      livemode: true,
      captureMethod: "manual",
      paymentBindingSha256: digest("payment-binding"),
      orderReferenceSha256: digest("order-reference"),
      customerReferenceSha256: digest("customer-reference"),
      paymentIntentReferenceSha256: digest("payment-intent-reference"),
      observedAmountCents: 16_914,
      observedCurrency: "usd",
      observedLivemode: true,
      observedPaymentIntentReferenceSha256:
        digest("payment-intent-reference"),
      providerResponseSha256: digest("stripe-provider-response"),
      confirmationEvidenceSha256: digest("stripe-confirmation-evidence"),
      webhookEventSha256: null,
      retrievalEvidenceSha256: digest("stripe-retrieval-evidence"),
      authorizationEvidenceAt: instant(NOW - 5),
      authorizationNotAfter: instant(NOW + 120),
      confirmationHandoffAuthorized: false,
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
    providerBinding,
    settlementBinding,
    productionAuthorization: authorization,
    dispatchNotAfter: instant(NOW + 60),
    dispatchTokenSha256: digest("dispatch-token"),
    ...overrides,
  };
}

function stateRow(
  state: "prepared" | "dispatching" | "succeeded" | "failed" | "ambiguous",
) {
  const revision: 0 | 1 | 2 = state === "prepared"
    ? 0
    : state === "dispatching"
    ? 1
    : 2;
  const requestCount: 0 | 1 = state === "prepared" || state === "dispatching"
    ? 0
    : 1;
  return {
    attempt_id: orderAttemptId,
    attempt_state: state,
    attempt_revision: revision,
    provider_order_reference_sha256:
      state === "succeeded" ? digestPlaintext(providerOrderId) : null,
    provider_booking_reference_sha256:
      state === "succeeded" ? digestPlaintext(bookingReference) : null,
    provider_request_count: requestCount,
    air_orders_post_count: requestCount,
    state_receipt_sha256: digest(`state-${state}`),
    livemode: true as const,
    provider_dispatch_authorized: false as const,
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

function persistence(): FlightConsumerLiveDuffelOrderExecutionPersistence {
  return {
    version: "flight-consumer-live-duffel-order-execution-persistence-v1",
    migrationVersion: "202608260108",
    supportIdentityMigrationVersion: "202608260112",
    providerEnvironment: "duffel_live",
    livemode: true,
    routeExposed: false,
    duffelTransportImplemented: false,
    databaseApplyAuthorized: false,
    claimGrantsProviderDispatchAuthority: false,
    stripeAuthorizedRequiresCaptureEvidenceRequired: true,
    preTransportOfferFreshnessRecheckRequired: true,
    providerDispatchAuthorized: false,
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
    maxAirOrdersPostRequests: 1,
    prepare: vi.fn(async () => ({ decision: "created", ...stateRow("prepared") })),
    claim: vi.fn(async () => ({ decision: "claimed", ...stateRow("dispatching") })),
    complete: vi.fn(async (value) => ({
      decision: value.terminalState,
      ...stateRow(value.terminalState),
      provider_order_reference_sha256:
        value.providerOrderReferenceSha256,
      provider_booking_reference_sha256:
        value.providerBookingReferenceSha256,
      provider_request_count: value.providerRequestCount,
      air_orders_post_count: value.airOrdersPostCount,
    })),
    readSupportIdentity: vi.fn(async () => ({
      ...stateRow("prepared"),
      terminal_http_status: null,
      client_correlation_id: null,
      client_correlation_id_sha256: null,
      provider_request_id: null,
      provider_request_id_sha256: null,
    })),
    reconcile: vi.fn(async () => ({
      decision: "reconciled",
      ...stateRow("succeeded"),
      attempt_state: "reconciled",
      attempt_revision: 3,
    })),
  } as FlightConsumerLiveDuffelOrderExecutionPersistence;
}

function context(inputOverrides: Readonly<{
  times?: number[];
  nonce?: "consumed" | "replayed" | "unavailable";
  transport?: FlightConsumerLiveDuffelOrderCreateTransport["createOrder"];
  transportProviderBindingDigest?: string;
  transportSettlementBindingDigest?: string;
  transportRequestTimeoutMs?: number;
  persistence?: FlightConsumerLiveDuffelOrderExecutionPersistence;
  decrypt?: () => Promise<unknown>;
  encrypt?: (kind: "provider_order" | "provider_booking") => Promise<unknown>;
}> = {}) {
  const times = [...(inputOverrides.times ?? [NOW, NOW, NOW])];
  const verifier = {
    readTrustedTimeSeconds: vi.fn(() => times.shift() ?? NOW),
    verifyHmacSha256: vi.fn(() => true),
    consumeNonce: vi.fn(async () => inputOverrides.nonce ?? "consumed"),
  };
  const persistencePort = inputOverrides.persistence ?? persistence();
  const transport = vi.fn(inputOverrides.transport ?? (async (_request, options) => ({
    kind: "http_response" as const,
    httpStatus: 201,
    providerRequestId,
    clientCorrelationId: options.clientCorrelationId,
    contentType: "application/json",
    rawBody: rawBody(successfulOrderBody()),
  })));
  const encrypt = vi.fn(async (value: { kind: "provider_order" | "provider_booking" }) =>
    inputOverrides.encrypt
      ? inputOverrides.encrypt(value.kind)
      : ({
        version: "flight-consumer-live-duffel-reference-encryption-result-v1",
        ciphertext: `enc:v1:${value.kind === "provider_order" ? "D".repeat(32) : "E".repeat(32)}`,
        plaintextReferenceSha256: value.kind === "provider_order"
          ? digestPlaintext(providerOrderId)
          : digestPlaintext(bookingReference),
      })
  );
  const orchestrator = createFlightConsumerLiveDuffelOrderCreateOrchestrator({
    runtimePolicy,
    providerExecutionBinding: providerBinding,
    settlementExecutionBinding: settlementBinding,
    productionAuthorizationVerifier: verifier,
    executionPersistence: persistencePort,
    decryption: {
      version: FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_DECRYPTION_VERSION,
      logsPlaintext: false,
      persistsPlaintext: false,
      buildsCanonicalRequestDigest: true,
      decryptCheckoutEvidence: vi.fn(
        inputOverrides.decrypt ?? (async () => decryptedMaterial),
      ),
    },
    duffelTransport: {
      version: FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_TRANSPORT_VERSION,
      method: "POST",
      path: "/air/orders",
      duffelVersion: "v2",
      providerEnvironment: "duffel_live",
      livemode: true,
      requestTimeoutMs: inputOverrides.transportRequestTimeoutMs ?? 130_000,
      clientCorrelationIdImplemented: true,
      retainsProviderRequestId: true,
      returnsExplicitOutcomeEnvelope: true,
      providerBindingDigest: inputOverrides.transportProviderBindingDigest
        ?? digestFlightRuntimeProviderBinding(providerBinding),
      settlementBindingDigest: inputOverrides.transportSettlementBindingDigest
        ?? digestFlightRuntimeSettlementBinding(settlementBinding),
      retryImplemented: false,
      logsRequest: false,
      logsResponse: false,
      persistsRequest: false,
      persistsResponse: false,
      maxAirOrdersPosts: 1,
      createOrder: transport,
    },
    referenceEncryption: {
      version: FLIGHT_CONSUMER_LIVE_DUFFEL_REFERENCE_ENCRYPTION_VERSION,
      encryptReference: encrypt,
    },
  });
  return { orchestrator, verifier, persistencePort, transport, encrypt };
}

describe("Flight Consumer Production live Duffel order create orchestrator", () => {
  it("executes exactly one deterministic POST and persists only encrypted/digested provider references", async () => {
    const ctx = context();
    const result = await ctx.orchestrator.execute(input());

    expect(ctx.transport).toHaveBeenCalledTimes(1);
    expect(ctx.transport).toHaveBeenCalledWith(
      expectedRequest(),
      {
        clientCorrelationId: fixtureClientCorrelationId(),
        requestTimeoutMs: 130_000,
      },
    );
    expect(ctx.persistencePort.prepare).toHaveBeenCalledTimes(1);
    expect(ctx.persistencePort.claim).toHaveBeenCalledTimes(1);
    expect(ctx.persistencePort.complete).toHaveBeenCalledWith(expect.objectContaining({
      terminalState: "succeeded",
      providerRequestCount: 1,
      airOrdersPostCount: 1,
      providerOrderReferenceCiphertext: expect.stringMatching(/^enc:v1:/),
      providerOrderReferenceSha256: digestPlaintext(providerOrderId),
      providerBookingReferenceCiphertext: expect.stringMatching(/^enc:v1:/),
      providerBookingReferenceSha256: digestPlaintext(bookingReference),
      clientCorrelationId: fixtureClientCorrelationId(),
      clientCorrelationIdSha256:
        digestPlaintext(fixtureClientCorrelationId()),
      providerRequestId,
      providerRequestIdSha256: digestPlaintext(providerRequestId),
    }));
    expect(result).toMatchObject({
      decision: "succeeded",
      providerRequestCount: 1,
      airOrdersPostCount: 1,
      clientCorrelationId: fixtureClientCorrelationId(),
      providerRequestId,
      providerDispatchAuthorized: false,
      orderAuthorized: false,
      captureAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      stripeCaptureRemainsLaterGate: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Private|Traveler|example\.com|13125550121|off_|pas_|ord_|ABC123/,
    );
  });

  it("rechecks trusted time immediately before transport and terminalizes expiry without dispatch", async () => {
    const ctx = context({ times: [NOW, NOW, NOW + 61] });
    const result = await ctx.orchestrator.execute(input());

    expect(ctx.transport).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      decision: "failed",
      failureCode: "dispatch_window_expired",
      providerRequestCount: 0,
      airOrdersPostCount: 0,
    });
    expect(ctx.verifier.readTrustedTimeSeconds).toHaveBeenCalledTimes(3);
  });

  it("treats a thrown transport and a malformed success as terminal ambiguity with no blind retry", async () => {
    const noResponse = context({
      transport: async (_request, options) => ({
        kind: "no_response" as const,
        clientCorrelationId: options.clientCorrelationId,
        failureKind: "timeout_before_headers" as const,
      }),
    });
    await expect(noResponse.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_outcome_unknown",
      providerRequestCount: 1,
      clientCorrelationId: fixtureClientCorrelationId(),
      providerRequestId: null,
      blindRetryAuthorized: false,
    });
    expect(noResponse.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCorrelationId: fixtureClientCorrelationId(),
        providerRequestId: null,
        terminalHttpStatus: null,
      }),
    );
    expect(noResponse.transport).toHaveBeenCalledTimes(1);

    const thrown = context({
      transport: async () => { throw new Error("unknown transport phase"); },
    });
    await expect(thrown.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "terminal_persistence_failed",
      blindRetryAuthorized: false,
    });
    expect(thrown.persistencePort.complete).not.toHaveBeenCalled();
    expect(thrown.transport).toHaveBeenCalledTimes(1);

    const malformed = context({
      transport: async () => duffelTransportResult(
        201,
        { data: { id: providerOrderId } },
      ),
    });
    await expect(malformed.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_success_binding_mismatch",
    });
    expect(malformed.transport).toHaveBeenCalledTimes(1);
  });

  it("retains Duffel support identity when a resolved HTTP envelope has malformed presentation metadata", async () => {
    const ctx = context({
      transport: async (_request, options) => ({
        kind: "http_response" as const,
        httpStatus: 201,
        providerRequestId,
        clientCorrelationId: options.clientCorrelationId,
        contentType: "text/plain",
        rawBody: rawBody(successfulOrderBody()),
      }),
    });

    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_response_refused",
      providerRequestCount: 1,
      clientCorrelationId: fixtureClientCorrelationId(),
      providerRequestId,
      blindRetryAuthorized: false,
    });
    expect(ctx.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalState: "ambiguous",
        terminalHttpStatus: 201,
        terminalResponseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        clientCorrelationId: fixtureClientCorrelationId(),
        clientCorrelationIdSha256:
          digestPlaintext(fixtureClientCorrelationId()),
        providerRequestId,
        providerRequestIdSha256: digestPlaintext(providerRequestId),
      }),
    );
  });

  it("leaves a resolved response for explicit reconciliation when Duffel support identity is unusable", async () => {
    const ctx = context({
      transport: async (_request, options) => ({
        kind: "http_response" as const,
        httpStatus: 502,
        providerRequestId: "invalid request id with spaces",
        clientCorrelationId: options.clientCorrelationId,
        contentType: "application/json",
        rawBody: rawBody({ errors: [] }),
      }),
    });

    await expect(ctx.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "terminal_persistence_failed",
      blindRetryAuthorized: false,
    });
    expect(ctx.transport).toHaveBeenCalledTimes(1);
    expect(ctx.persistencePort.complete).not.toHaveBeenCalled();
  });

  it("requires the exact selected offer, paid status object, booking reference, and HTTP 201", async () => {
    const cases = [
      duffelTransportResult(201, successfulOrderBody({
        offer_id: "off_0000000000000002",
      })),
      duffelTransportResult(201, successfulOrderBody({
        payment_status: {
          awaiting_payment: true,
          paid_at: instant(NOW - 1),
        },
      })),
      duffelTransportResult(201, successfulOrderBody({
        payment_status: {
          awaiting_payment: false,
          paid_at: null,
        },
      })),
      duffelTransportResult(201, successfulOrderBody({
        booking_reference: null,
      })),
      duffelTransportResult(200, successfulOrderBody()),
    ];

    for (const response of cases) {
      const ctx = context({ transport: async () => response });
      await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
        decision: "ambiguous",
        providerRequestCount: 1,
        blindRetryAuthorized: false,
      });
      expect(ctx.transport).toHaveBeenCalledTimes(1);
    }
  });

  it("requires echoed client correlation and locally hashes bounded raw response bytes", async () => {
    const mismatch = context({
      transport: async () => duffelTransportResult(
        201,
        successfulOrderBody(),
        { clientCorrelationId: "corr_0000000000000002" },
      ),
    });
    await expect(mismatch.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_correlation_mismatch",
    });

    const invalidJson = context({
      transport: async () => ({
        ...duffelTransportResult(201, successfulOrderBody()),
        rawBody: Buffer.from("{", "utf8"),
      }),
    });
    await expect(invalidJson.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_response_refused",
    });
  });

  it("allowlists exact no-booking errors and keeps unknown outcomes ambiguous", async () => {
    const refusal = context({
      transport: async () => duffelTransportResult(422, {
        errors: [{
          type: "invalid_state_error",
          code: "offer_expired",
        }],
        meta: { status: 422, request_id: providerRequestId },
      }),
    });
    await expect(refusal.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "failed",
      failureCode: "duffel_order_definitive_refusal",
      providerRequestCount: 1,
      clientCorrelationId: fixtureClientCorrelationId(),
      providerRequestId,
    });
    expect(refusal.persistencePort.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCorrelationId: fixtureClientCorrelationId(),
        providerRequestId,
        terminalHttpStatus: 422,
      }),
    );

    const unknown = context({
      transport: async () => duffelTransportResult(503, {
        errors: [{ type: "api_error", code: "service_unavailable" }],
        meta: { status: 503, request_id: providerRequestId },
      }),
    });
    await expect(unknown.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_nonterminal_response",
      providerRequestCount: 1,
    });

    const duplicate = context({
      transport: async () => duffelTransportResult(422, {
        errors: [{
          type: "invalid_state_error",
          code: "duplicate_booking",
        }],
        meta: { status: 422, request_id: providerRequestId },
      }),
    });
    await expect(duplicate.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_nonterminal_response",
    });

    const externallyModified = context({
      transport: async () => duffelTransportResult(422, {
        errors: [{
          type: "airline_error",
          code: "modified_externally",
        }],
        meta: { status: 422, request_id: providerRequestId },
      }),
    });
    await expect(externallyModified.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "duffel_order_nonterminal_response",
      });

    const wrongErrorType = context({
      transport: async () => duffelTransportResult(422, {
        errors: [{ type: "api_error", code: "offer_expired" }],
        meta: { status: 422, request_id: providerRequestId },
      }),
    });
    await expect(wrongErrorType.orchestrator.execute(input())).resolves
      .toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "duffel_order_nonterminal_response",
      });

    const rateLimited = context({
      transport: async () => duffelTransportResult(429, {
        errors: [{ type: "rate_limit_error", code: "rate_limit_exceeded" }],
        meta: { status: 429, request_id: providerRequestId },
      }),
    });
    await expect(rateLimited.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "failed",
      failureCode: "duffel_order_rate_limited_no_booking",
      blindRetryAuthorized: false,
    });
  });

  it("terminalizes reference-encryption failure after the single provider call", async () => {
    const ctx = context({
      encrypt: async () => ({
        version: "flight-consumer-live-duffel-reference-encryption-result-v1",
        ciphertext: `enc:v1:${"Z".repeat(32)}`,
        plaintextReferenceSha256: digest("wrong-reference"),
      }),
    });
    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "duffel_order_reference_encryption_failed",
      providerRequestCount: 1,
    });
    expect(ctx.transport).toHaveBeenCalledTimes(1);
  });

  it("rejects stale/mismatched 105, 109, and 110 evidence before persistence or transport", async () => {
    const otherOfferIdSha256 =
      deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
        "off_0000000000000002",
      );
    const otherOfferBindingSha256 = sha256FlightEvidence({
      version: "flight-consumer-production-duffel-live-offer-binding-v1",
      providerCode: "duffel",
      providerEnvironment: "live",
      offerIdSha256: otherOfferIdSha256,
      sourceOfferEvidenceSha256,
      sourceShoppingExecutionScopeSha256,
    });
    const cases = [
      input({
        offerRefreshEvidence: {
          ...input().offerRefreshEvidence,
          amountCents: 16_915,
        },
      }),
      input({
        stripeAuthorizationEvidence: {
          ...input().stripeAuthorizationEvidence,
          confirmationState: "failed",
        },
      }),
      input({
        checkoutEvidence: {
          ...input().checkoutEvidence,
          authorizationBridgeReceiptSha256: "bad",
        },
      }),
      input({
        checkoutEvidence: {
          ...input().checkoutEvidence,
          offerBindingSha256: otherOfferBindingSha256,
        },
        offerRefreshEvidence: {
          ...input().offerRefreshEvidence,
          offerIdSha256: otherOfferIdSha256,
          offerBindingSha256: otherOfferBindingSha256,
        },
      }),
    ];
    for (const value of cases) {
      const ctx = context();
      await expect(ctx.orchestrator.execute(value)).rejects.toBeInstanceOf(
        FlightConsumerLiveDuffelOrderCreateError,
      );
      expect(ctx.persistencePort.prepare).not.toHaveBeenCalled();
      expect(ctx.transport).not.toHaveBeenCalled();
    }
  });

  it("fails closed when decrypted evidence is not exact", async () => {
    const ctx = context({
      decrypt: async () => ({
        ...decryptedMaterial,
        travelerEvidenceSha256: digest("other-traveler"),
      }),
    });
    await expect(ctx.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "decryption_refused",
      blindRetryAuthorized: false,
    });
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it("locally binds the exact constructed request body before authority or dispatch", async () => {
    const ctx = context({
      decrypt: async () => ({
        ...decryptedMaterial,
        passengers: [{
          ...decryptedMaterial.passengers[0],
          family_name: "Mutated",
        }],
      }),
    });
    await expect(ctx.orchestrator.execute(input())).rejects.toMatchObject({
      reason: "decryption_refused",
      blindRetryAuthorized: false,
    });
    expect(ctx.persistencePort.prepare).not.toHaveBeenCalled();
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it("accepts the exact reconciled revision-3 requires-capture authorization path", async () => {
    const direct = input();
    const reconciled = input({
      stripeAuthorizationEvidence: {
        ...direct.stripeAuthorizationEvidence,
        confirmationState: "reconciled",
        confirmationRevision: 3,
        confirmationReconciledOutcome: "authorized_requires_capture",
        authorizationEvidenceAt: instant(NOW - 2),
      },
    });
    const ctx = context();
    await expect(ctx.orchestrator.execute(reconciled)).resolves.toMatchObject({
      decision: "succeeded",
      providerRequestCount: 1,
      captureAuthorized: false,
    });
    expect(ctx.transport).toHaveBeenCalledTimes(1);
  });

  it("returns an authority replay without preparing or dispatching", async () => {
    const ctx = context({ nonce: "replayed" });
    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "replay",
      replayStage: "authority",
      providerRequestCount: 0,
    });
    expect(ctx.persistencePort.prepare).not.toHaveBeenCalled();
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it("returns exact persistence replay states without provider dispatch", async () => {
    const port = persistence();
    vi.mocked(port.prepare).mockResolvedValue({
      decision: "replay",
      ...stateRow("ambiguous"),
    });
    vi.mocked(port.readSupportIdentity).mockResolvedValue({
      ...stateRow("ambiguous"),
      terminal_http_status: 503,
      client_correlation_id: fixtureClientCorrelationId(),
      client_correlation_id_sha256:
        digestPlaintext(fixtureClientCorrelationId()),
      provider_request_id: providerRequestId,
      provider_request_id_sha256: digestPlaintext(providerRequestId),
    });
    const ctx = context({ persistence: port });
    await expect(ctx.orchestrator.execute(input())).resolves.toMatchObject({
      decision: "replay",
      replayStage: "prepare",
      attemptState: "ambiguous",
      providerRequestCount: 1,
      airOrdersPostCount: 1,
      clientCorrelationId: fixtureClientCorrelationId(),
      providerRequestId,
    });
    expect(port.readSupportIdentity).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: orderAttemptId,
      orderRequestSha256: fixtureRequestEnvelopeSha256(),
    }));
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it("requires an exact provider-balance settlement binding and signed request", async () => {
    const badSettlement = {
      ...input(),
      settlementBinding: {
        ...settlementBinding,
        environmentScopeReceiptDigest: digest("different-environment"),
      },
    };
    await expect(context().orchestrator.execute(badSettlement)).rejects
      .toMatchObject({ reason: "evidence_refused" });

    const badRequest = input();
    badRequest.productionAuthorization.requestDigest = digest("different-request");
    await expect(context().orchestrator.execute(badRequest)).rejects
      .toMatchObject({ reason: "authority_refused" });
  });

  it("refuses an unbound or under-timeout live transport at construction", () => {
    expect(() => context({
      transportProviderBindingDigest: digest("other-provider-binding"),
    })).toThrowError(FlightConsumerLiveDuffelOrderCreateError);
    expect(() => context({
      transportSettlementBindingDigest: digest("other-settlement-binding"),
    })).toThrowError(FlightConsumerLiveDuffelOrderCreateError);
    expect(() => context({ transportRequestTimeoutMs: 129_999 }))
      .toThrowError(FlightConsumerLiveDuffelOrderCreateError);
  });

  it("exposes no route, environment, provider client, retry, Stripe capture, or plaintext logging surface", () => {
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/duffel-live-order-create-orchestrator.server.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\bprocess\.env\b|\bconsole\.|\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:route|stripe|supabase\/admin)[^"']*["']/i);
    expect(source).not.toMatch(/createPaymentIntent|capturePaymentIntent|refundPayment/i);
    expect(source).not.toMatch(/JSON\.stringify/);
    expect(source).toContain("data: request.data");
    expect(source).toContain('path: "/air/orders"');
    expect(source).toContain('duffelVersion: "v2"');
    expect(source).toContain("requestTimeoutMs < 130_000");
    expect(source).toContain("clientCorrelationId");
    expect(source).toContain("providerRequestIdSha256");
    expect(source).toContain("providerBindingDigest");
    expect(source).toContain("rawBody");
    expect(source).toContain("maxAirOrdersPosts: 1");
    expect(source).toContain("stripeCaptureImplemented: false");
  });

  it("publishes only a zero-route, non-consumer execution surface", () => {
    const orchestrator = context().orchestrator;
    expect(orchestrator).toMatchObject({
      version: "flight-consumer-live-duffel-order-create-orchestrator-v1",
      routeExposed: false,
      consumerReachable: false,
      environmentReadImplemented: false,
      stripeCaptureImplemented: false,
      refundImplemented: false,
      ticketingImplemented: false,
      servicingImplemented: false,
      blindProviderRetryImplemented: false,
      maxAirOrdersPosts: 1,
    });
  });
});
