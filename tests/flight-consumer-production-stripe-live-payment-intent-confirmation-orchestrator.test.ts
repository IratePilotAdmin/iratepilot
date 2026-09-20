import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveStripePaymentIntentConfirmationOrchestrator,
  FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_OBSERVATION_VERIFIER_VERSION,
  FlightConsumerLiveStripePaymentIntentConfirmationError,
  type FlightConsumerLiveStripeConfirmationObservationVerifier,
} from "../lib/flights/consumer-production/stripe-live-payment-intent-confirmation-orchestrator.server";
import type {
  FlightConsumerLiveStripeConfirmationPersistence,
} from "../lib/flights/consumer-production/stripe-confirmation-evidence-persistence.server";
import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../lib/flights/runtime-safety";

const digest = (character: string) => character.repeat(64);
const nowSeconds = 1_800_000_000;
const attemptId = "00000000-0000-4000-8000-000000000109";
const paymentIntentId = "pi_123456789ABC";
const clientSecret = `${paymentIntentId}_secret_abcdefghijklmnop`;
const paymentIntentReferenceSha256 = createHash("sha256")
  .update(paymentIntentId, "utf8")
  .digest("hex");

const resultAuthority = Object.freeze({
  confirmation_handoff_authorized: false as const,
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
});

const evidenceAuthority = Object.freeze({
  providerDispatchAuthorized: false as const,
  stripeDispatchAuthorized: false as const,
  bookingAuthorized: false as const,
  orderAuthorized: false as const,
  paymentAuthorized: false as const,
  captureAuthorized: false as const,
  refundAuthorized: false as const,
  settlementAuthorized: false as const,
  ticketingAuthorized: false as const,
  servicingAuthorized: false as const,
  consumerReleaseEnabled: false as const,
  blindRetryAuthorized: false as const,
});

const paymentBinding = Object.freeze({
  processorId: "stripe_live" as const,
  adapterVersion: "1.0.0",
  adapterSourceDigest: digest("1"),
  accountScopeReceiptDigest: digest("2"),
  environmentScopeReceiptDigest: digest("3"),
});

const providerBinding: FlightRuntimeProviderBinding = Object.freeze({
  providerId: "duffel_live",
  adapterVersion: "1.0.0",
  adapterSourceDigest: digest("4"),
  accountScopeReceiptDigest: digest("5"),
  pointOfSaleScopeReceiptDigest: digest("6"),
  contentScopeReceiptDigest: digest("7"),
});

function checkoutEvidence() {
  return {
    migrationVersion: "202608260107" as const,
    aggregateId: "00000000-0000-4000-8000-000000000107",
    customerId: "00000000-0000-4000-8000-000000000002",
    orderId: "00000000-0000-4000-8000-000000000001",
    checkoutState: "prepared" as const,
    checkoutRevision: 0 as const,
    checkoutStateReceiptSha256: digest("8"),
    offerExpiresAt: new Date((nowSeconds + 540) * 1000).toISOString(),
    executionScopeSha256: digest("9"),
    checkoutBindingSha256: digest("b"),
    stripePlanId: "00000000-0000-4000-8000-000000000103",
    stripePlanSha256: digest("c"),
    stripeExecutionAttemptId: "00000000-0000-4000-8000-000000000106",
    stripeExecutionWorkflowSha256: digest("d"),
    stripeExecutionPrerequisiteSha256: digest("e"),
    stripeExecutionPreparedReceiptSha256: digest("f"),
    paymentBindingSha256: digestFlightRuntimePaymentBinding(paymentBinding),
    orderReferenceSha256: digest("0"),
    customerReferenceSha256: digest("1"),
    amountCents: 16_914,
    currency: "USD" as const,
    ...evidenceAuthority,
  };
}

function sourceCapability(options: {
  failOnUse?: boolean;
  secret?: string;
} = {}) {
  let secret: string | null = options.secret ?? clientSecret;
  const useOnce = vi.fn(<T>(consumer: (value: string) => T): T => {
    if (secret === null || options.failOnUse) {
      throw new Error("source capability unavailable");
    }
    const value = secret;
    secret = null;
    return consumer(value);
  });
  return {
    value: {
      kind: (
        "flight-consumer-live-stripe-client-secret-capability-v1"
      ) as const,
      serializable: false as const,
      get consumed() {
        return secret === null;
      },
      useOnce,
    },
    useOnce,
    isConsumed: () => secret === null,
  };
}

function stripeCreateResult(
  capability: ReturnType<typeof sourceCapability>["value"],
) {
  return {
    version:
      "flight-consumer-live-stripe-payment-intent-create-result-v1" as const,
    decision: "completed" as const,
    planId: checkoutEvidence().stripePlanId,
    planSha256: checkoutEvidence().stripePlanSha256,
    executionWorkflowSha256:
      checkoutEvidence().stripeExecutionWorkflowSha256,
    executionPrerequisiteSha256:
      checkoutEvidence().stripeExecutionPrerequisiteSha256,
    providerRequestCount: 1 as const,
    stripeMutationCount: 1 as const,
    paymentIntentCreateCount: 1 as const,
    clientSecretPersistedByOrchestrator: false as const,
    clientSecretLoggedByOrchestrator: false as const,
    confirmationAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    orderAuthorized: false as const,
    ticketingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
    attemptId: checkoutEvidence().stripeExecutionAttemptId,
    attemptState: "completed" as const,
    stateReceiptSha256: digest("2"),
    paymentIntentReferenceSha256,
    clientSecretCapability: capability,
    consumerConfirmationRemainsLaterGate: true as const,
  };
}

function confirmationAuthorizationArtifacts() {
  const checkout = checkoutEvidence();
  const created = stripeCreateResult(sourceCapability().value);
  const paymentBindingSha256 = digestFlightRuntimePaymentBinding(
    paymentBinding,
  );
  const confirmationNotAfter = new Date(
    (nowSeconds + 120) * 1000,
  ).toISOString();
  const confirmationBindingSha256 = sha256FlightEvidence({
    version: "flight-consumer-live-stripe-confirmation-binding-v1",
    migrationVersion: "202608260109",
    checkoutAggregateId: checkout.aggregateId,
    customerId: checkout.customerId,
    orderId: checkout.orderId,
    checkoutExecutionScopeSha256: checkout.executionScopeSha256,
    checkoutBindingSha256: checkout.checkoutBindingSha256,
    checkoutStateReceiptSha256: checkout.checkoutStateReceiptSha256,
    stripePlanId: checkout.stripePlanId,
    stripePlanSha256: checkout.stripePlanSha256,
    stripeExecutionAttemptId: created.attemptId,
    stripeExecutionWorkflowSha256: created.executionWorkflowSha256,
    stripeExecutionPrerequisiteSha256:
      created.executionPrerequisiteSha256,
    stripeExecutionCompletedReceiptSha256: created.stateReceiptSha256,
    paymentIntentReferenceSha256:
      created.paymentIntentReferenceSha256,
    paymentBindingSha256,
    orderReferenceSha256: checkout.orderReferenceSha256,
    customerReferenceSha256: checkout.customerReferenceSha256,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
    processorEnvironment: "stripe_live",
    livemode: true,
    captureMethod: "manual",
    paymentMethodType: "card",
  });
  const confirmationRequestSha256 = sha256FlightEvidence({
    version: "flight-consumer-live-stripe-confirmation-request-v1",
    confirmationBindingSha256,
    paymentIntentReferenceSha256:
      created.paymentIntentReferenceSha256,
    amountCents: checkout.amountCents,
    currency: "usd",
    captureMethod: "manual",
    paymentMethodType: "card",
    confirmationNotAfter,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "authorize_payment",
    scopeId: checkout.orderId,
    requestId: checkout.aggregateId,
    payload: {
      version: "flight-consumer-live-stripe-confirmation-idempotency-v1",
      confirmationBindingSha256,
      confirmationRequestSha256,
      paymentIntentReferenceSha256:
        created.paymentIntentReferenceSha256,
      confirmationNotAfter,
    },
  });
  return {
    confirmationNotAfter,
    confirmationBindingSha256,
    confirmationRequestSha256,
    idempotencyRequestSha256: idempotency.requestDigest,
  };
}

function productionAuthorization(): FlightProductionActionAuthorization {
  const artifacts = confirmationAuthorizationArtifacts();
  return {
    version: "flight-production-action-authorization-v2",
    authorizationId: "flight-stripe-live-confirm-approval-001",
    operation: "authorize_payment",
    provider: "provider_production",
    scopeId: checkoutEvidence().orderId,
    requestDigest: artifacts.confirmationRequestSha256,
    idempotencyRequestDigest: artifacts.idempotencyRequestSha256,
    providerBindingDigest: digestFlightRuntimeProviderBinding(providerBinding),
    paymentBindingDigest: digestFlightRuntimePaymentBinding(paymentBinding),
    settlementBindingDigest: null,
    nonce: "3".repeat(32),
    issuedAtSeconds: nowSeconds - 10,
    expiresAtSeconds: nowSeconds + 180,
    signatureHex: digest("4"),
  };
}

function runtimePolicy(): FlightRuntimePolicy {
  return {
    mode: "production",
    environment: "production",
    runtimeEnabled: true,
    syntheticAdapterEnabled: false,
    providerTrafficEnabled: true,
    bookingEnabled: false,
    paymentEnabled: true,
    settlementEnabled: false,
    ticketingEnabled: false,
    servicingEnabled: false,
    webhookEnabled: false,
    productionTrafficEnabled: true,
    transactionKillSwitchEngaged: false,
    expectedProductionAuthorizationId:
      "flight-stripe-live-confirm-approval-001",
    providerBinding,
    paymentBinding,
    settlementBinding: null,
    invalidSettings: [],
  };
}

function authorizationVerifier(
  consumeDecision: "consumed" | "replayed" | "unavailable" = "consumed",
) {
  const readTrustedTimeSeconds = vi.fn(() => nowSeconds);
  const verifyHmacSha256 = vi.fn(() => true);
  const consumeNonce = vi.fn(async () => consumeDecision);
  const value: FlightProductionAuthorizationVerifier = {
    readTrustedTimeSeconds,
    verifyHmacSha256,
    consumeNonce,
  };
  return {
    value,
    readTrustedTimeSeconds,
    verifyHmacSha256,
    consumeNonce,
  };
}

function confirmationPersistence(overrides: Partial<
  FlightConsumerLiveStripeConfirmationPersistence
> = {}) {
  const prepare = vi.fn(async () => ({
    decision: "created" as const,
    attempt_id: attemptId,
    confirmation_state: "prepared" as const,
    confirmation_revision: 0 as const,
    amount_cents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    state_receipt_sha256: digest("5"),
    reconciled_outcome: null,
    ...resultAuthority,
  }));
  const claim = vi.fn(async () => ({
    decision: "claimed" as const,
    attempt_id: attemptId,
    confirmation_state: "handoff_claimed" as const,
    confirmation_revision: 1 as const,
    amount_cents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    state_receipt_sha256: digest("6"),
    reconciled_outcome: null,
    ...resultAuthority,
  }));
  const recordTerminal = vi.fn(async (input: {
    terminalState: "authorized_requires_capture" | "failed";
  }) => ({
    decision: "recorded" as const,
    attempt_id: attemptId,
    confirmation_state: input.terminalState,
    confirmation_revision: 2 as const,
    amount_cents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    state_receipt_sha256: digest("7"),
    reconciled_outcome: null,
    ...resultAuthority,
  }));
  const markAmbiguous = vi.fn(async () => ({
    decision: "ambiguous" as const,
    attempt_id: attemptId,
    confirmation_state: "ambiguous" as const,
    confirmation_revision: 2 as const,
    amount_cents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    state_receipt_sha256: digest("8"),
    reconciled_outcome: null,
    ...resultAuthority,
  }));
  const reconcile = vi.fn(async (input: {
    reconciledOutcome: "authorized_requires_capture" | "failed" | "unresolved";
  }) => ({
    decision: "reconciled" as const,
    attempt_id: attemptId,
    confirmation_state: "reconciled" as const,
    confirmation_revision: 3 as const,
    amount_cents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    payment_intent_reference_sha256: paymentIntentReferenceSha256,
    state_receipt_sha256: digest("9"),
    reconciled_outcome: input.reconciledOutcome,
    ...resultAuthority,
  }));
  const value = {
    version: (
      "flight-consumer-live-stripe-confirmation-persistence-v1"
    ) as const,
    migrationVersion: "202608260109" as const,
    productionDark: true as const,
    routeExposed: false as const,
    stripeTransportImplemented: false as const,
    clientSecretStored: false as const,
    paymentMethodStored: false as const,
    providerPayloadStored: false as const,
    databaseApplyAuthorized: false as const,
    confirmationHandoffAuthorized: false as const,
    providerDispatchAuthorized: false as const,
    stripeDispatchAuthorized: false as const,
    bookingAuthorized: false as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    settlementAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
    prepare,
    claim,
    recordTerminal,
    markAmbiguous,
    reconcile,
    ...overrides,
  } as unknown as FlightConsumerLiveStripeConfirmationPersistence;
  return {
    value,
    prepare: value.prepare as ReturnType<typeof vi.fn>,
    claim: value.claim as ReturnType<typeof vi.fn>,
    recordTerminal: value.recordTerminal as ReturnType<typeof vi.fn>,
    markAmbiguous: value.markAmbiguous as ReturnType<typeof vi.fn>,
    reconcile: value.reconcile as ReturnType<typeof vi.fn>,
  };
}

function observationVerifier(verified = true) {
  const verifyObservation = vi.fn(() => verified);
  const value: FlightConsumerLiveStripeConfirmationObservationVerifier = {
    version:
      FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_OBSERVATION_VERIFIER_VERSION,
    processorEnvironment: "stripe_live",
    livemode: true,
    acceptsBrowserAssertions: false,
    stripeTransportImplemented: false,
    verifyObservation,
  };
  return { value, verifyObservation };
}

function prepareInput(capability = sourceCapability().value) {
  const artifacts = confirmationAuthorizationArtifacts();
  return {
    checkoutEvidence: checkoutEvidence(),
    stripeCreateResult: stripeCreateResult(capability),
    paymentBinding,
    productionAuthorization: productionAuthorization(),
    confirmationNotAfter: artifacts.confirmationNotAfter,
    handoffTokenSha256: digest("6"),
    handoffSeconds: 60,
  };
}

function harness(options: {
  consumeDecision?: "consumed" | "replayed" | "unavailable";
  persistenceOverrides?: Partial<
    FlightConsumerLiveStripeConfirmationPersistence
  >;
  observationVerified?: boolean;
} = {}) {
  const authorization = authorizationVerifier(options.consumeDecision);
  const persistence = confirmationPersistence(options.persistenceOverrides);
  const observations = observationVerifier(options.observationVerified);
  const orchestrator =
    createFlightConsumerLiveStripePaymentIntentConfirmationOrchestrator({
      runtimePolicy: runtimePolicy(),
      providerExecutionBinding: providerBinding,
      paymentExecutionBinding: paymentBinding,
      productionAuthorizationVerifier: authorization.value,
      confirmationPersistence: persistence.value,
      observationVerifier: observations.value,
    });
  return { orchestrator, authorization, persistence, observations };
}

function handoffAttempt() {
  return {
    migrationVersion: "202608260109" as const,
    attemptId,
    confirmationState: "handoff_claimed" as const,
    confirmationRevision: 1 as const,
    stateReceiptSha256: digest("6"),
    executionScopeSha256: checkoutEvidence().executionScopeSha256,
    confirmationBindingSha256:
      confirmationAuthorizationArtifacts().confirmationBindingSha256,
    handoffTokenSha256: digest("6"),
    paymentIntentReferenceSha256,
    amountCents: checkoutEvidence().amountCents,
    currency: "USD" as const,
    confirmationNotAfter:
      confirmationAuthorizationArtifacts().confirmationNotAfter,
    ...evidenceAuthority,
  };
}

function ambiguousAttempt() {
  const attempt = handoffAttempt();
  return {
    migrationVersion: attempt.migrationVersion,
    attemptId: attempt.attemptId,
    confirmationState: "ambiguous" as const,
    confirmationRevision: 2 as const,
    stateReceiptSha256: digest("8"),
    executionScopeSha256: attempt.executionScopeSha256,
    confirmationBindingSha256: attempt.confirmationBindingSha256,
    paymentIntentReferenceSha256: attempt.paymentIntentReferenceSha256,
    amountCents: attempt.amountCents,
    currency: attempt.currency,
    confirmationNotAfter: attempt.confirmationNotAfter,
    ...evidenceAuthority,
  };
}

function verifiedObservation(
  status:
    | "requires_capture"
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "canceled" = "requires_capture",
) {
  return {
    source: "stripe_webhook" as const,
    observedAt: new Date((nowSeconds - 1) * 1000).toISOString(),
    observedPaymentIntentStatus: status,
    observedAmountCents: checkoutEvidence().amountCents,
    observedCurrency: "usd" as const,
    observedLivemode: true as const,
    observedCaptureMethod: "manual" as const,
    observedPaymentMethodType: "card" as const,
    observedPaymentIntentReferenceSha256: paymentIntentReferenceSha256,
    providerResponseSha256: digest("b"),
    webhookEventSha256: digest("c"),
    retrievalEvidenceSha256: null,
  };
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production live Stripe confirmation orchestrator", () => {
  it("durably prepares and claims before transferring one live secret capability", async () => {
    const events: string[] = [];
    const source = sourceCapability();
    const prepare = vi.fn(async () => {
      events.push("prepared");
      return confirmationPersistence().value.prepare({} as never);
    });
    const claim = vi.fn(async () => {
      events.push("claimed");
      return confirmationPersistence().value.claim({} as never);
    });
    const context = harness({ persistenceOverrides: { prepare, claim } });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );

    expect(events).toEqual(["prepared", "claimed"]);
    expect(prepare.mock.invocationCallOrder[0])
      .toBeLessThan(claim.mock.invocationCallOrder[0]!);
    expect(claim.mock.invocationCallOrder[0])
      .toBeLessThan(source.useOnce.mock.invocationCallOrder[0]!);
    expect(result).toMatchObject({
      decision: "prepared",
      confirmationState: "handoff_claimed",
      confirmationRevision: 1,
      providerRequestCountByOrchestrator: 0,
      stripeMutationCountByOrchestrator: 0,
      orderRequestCountByOrchestrator: 0,
      captureRequestCountByOrchestrator: 0,
      confirmationHandoffAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      consumerConfirmationRemainsRouteLocked: true,
    });
    expect(context.authorization.consumeNonce).toHaveBeenCalledOnce();
    expect(context.persistence.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutAggregateId: checkoutEvidence().aggregateId,
        stripeExecutionAttemptId:
          checkoutEvidence().stripeExecutionAttemptId,
        confirmationNotAfter:
          confirmationAuthorizationArtifacts().confirmationNotAfter,
      }),
    );
    expect(context.persistence.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        expectedRevision: 0,
        handoffTokenSha256: digest("6"),
        handoffSeconds: 60,
        confirmationRequestSha256:
          confirmationAuthorizationArtifacts().confirmationRequestSha256,
      }),
    );
    expect(source.isConsumed()).toBe(true);
    if (result.clientSecretCapability === null) {
      throw new Error("Expected a private client-secret capability.");
    }
    expect(result.clientSecretCapability.consumed).toBe(false);
    expect(inspect(result.clientSecretCapability)).toContain("REDACTED");
    expect(inspect(result.clientSecretCapability)).not.toContain(clientSecret);
    expect(() => JSON.stringify(result.clientSecretCapability)).toThrow(
      FlightConsumerLiveStripePaymentIntentConfirmationError,
    );
    expect(result.clientSecretCapability.useOnce((secret) => secret))
      .toBe(clientSecret);
    expect(result.clientSecretCapability.consumed).toBe(true);
    expect(() => result.clientSecretCapability!.useOnce((secret) => secret))
      .toThrow(FlightConsumerLiveStripePaymentIntentConfirmationError);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it("consumes the source and returns no capability on authority replay", async () => {
    const source = sourceCapability();
    const context = harness({ consumeDecision: "replayed" });

    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );

    expect(result).toMatchObject({
      decision: "replay",
      replayStage: "authority",
      attemptId: null,
      clientSecretCapability: null,
    });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.prepare).not.toHaveBeenCalled();
    expect(context.persistence.claim).not.toHaveBeenCalled();
  });

  it("destroys an unused handoff capability at its trusted-clock deadline", async () => {
    const source = sourceCapability();
    const context = harness();
    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );
    if (result.clientSecretCapability === null) {
      throw new Error("Expected a private client-secret capability.");
    }
    context.authorization.readTrustedTimeSeconds.mockReturnValue(
      nowSeconds + 60,
    );

    expect(() => result.clientSecretCapability!.useOnce((secret) => secret))
      .toThrow(FlightConsumerLiveStripePaymentIntentConfirmationError);
    expect(result.clientSecretCapability.consumed).toBe(true);
  });

  it("fails closed and consumes the source when prepare is uncertain", async () => {
    const source = sourceCapability();
    const prepare = vi.fn(async () => {
      throw new Error("private RPC uncertainty");
    });
    const context = harness({ persistenceOverrides: { prepare } });

    await expect(context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    )).rejects.toMatchObject({ reason: "persistence_refused" });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.claim).not.toHaveBeenCalled();
    expect(context.persistence.markAmbiguous).not.toHaveBeenCalled();
  });

  it("normalizes an invalid prepare receipt and consumes the source", async () => {
    const source = sourceCapability();
    const prepare = vi.fn(async () => undefined as never);
    const context = harness({ persistenceOverrides: { prepare } });

    await expect(context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    )).rejects.toMatchObject({ reason: "persistence_refused" });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.claim).not.toHaveBeenCalled();
  });

  it("consumes the source and terminalizes a claim uncertainty as ambiguous", async () => {
    const source = sourceCapability();
    const claim = vi.fn(async () => {
      throw new Error("claim response lost");
    });
    const context = harness({ persistenceOverrides: { claim } });

    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );

    expect(result).toMatchObject({
      decision: "ambiguous",
      confirmationState: "ambiguous",
      clientSecretCapability: null,
      blindRetryAuthorized: false,
    });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.markAmbiguous).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        expectedRevision: 1,
        ambiguityCode: "stripe_confirmation_claim_outcome_unknown",
        livemode: true,
      }),
    );
  });

  it("does not hide a claim uncertainty when ambiguity persistence also fails", async () => {
    const source = sourceCapability();
    const claim = vi.fn(async () => {
      throw new Error("claim response lost");
    });
    const markAmbiguous = vi.fn(async () => {
      throw new Error("ambiguity receipt unavailable");
    });
    const context = harness({
      persistenceOverrides: { claim, markAmbiguous },
    });

    await expect(context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    )).rejects.toMatchObject({ reason: "ambiguity_persistence_failed" });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.markAmbiguous).toHaveBeenCalledOnce();
  });

  it("terminalizes an unavailable source capability after a durable claim", async () => {
    const source = sourceCapability({ failOnUse: true });
    const context = harness();

    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );

    expect(result).toMatchObject({
      decision: "ambiguous",
      confirmationState: "ambiguous",
      clientSecretCapability: null,
    });
    expect(context.persistence.markAmbiguous).toHaveBeenCalledWith(
      expect.objectContaining({
        ambiguityCode: "client_secret_handoff_unavailable",
      }),
    );
  });

  it("never hands off a client secret for a different PaymentIntent", async () => {
    const mismatchedPaymentIntentId = "pi_ABCDEFGHIJKL";
    const source = sourceCapability({
      secret: `${mismatchedPaymentIntentId}_secret_abcdefghijklmnop`,
    });
    const context = harness();

    const result = await context.orchestrator.prepareHandoff(
      prepareInput(source.value),
    );

    expect(result).toMatchObject({
      decision: "ambiguous",
      confirmationState: "ambiguous",
      clientSecretCapability: null,
      blindRetryAuthorized: false,
    });
    expect(source.isConsumed()).toBe(true);
    expect(context.persistence.markAmbiguous).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        ambiguityCode: "client_secret_handoff_unavailable",
      }),
    );
  });

  it("records only verifier-authenticated requires-capture observations", async () => {
    const context = harness();
    const observation = verifiedObservation();

    const result = await context.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation,
    });

    expect(context.observations.verifyObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationKind: "terminal",
        attemptId,
        expectedAmountCents: checkoutEvidence().amountCents,
        expectedCurrency: "usd",
        observation,
      }),
    );
    expect(context.persistence.recordTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        expectedRevision: 1,
        terminalState: "authorized_requires_capture",
        observedPaymentIntentStatus: "requires_capture",
        failureCode: null,
        failureEvidenceSha256: null,
        livemode: true,
      }),
    );
    expect(result).toMatchObject({
      decision: "recorded",
      confirmationState: "authorized_requires_capture",
      confirmationRevision: 2,
      failureCode: null,
      orderCreationRemainsLaterGate: true,
      orderAuthorized: false,
      captureAuthorized: false,
    });
  });

  it("maps canceled to deterministic failed evidence", async () => {
    const context = harness();

    const result = await context.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation: verifiedObservation("canceled"),
    });

    expect(result).toMatchObject({
      confirmationState: "failed",
      failureCode: "stripe_confirmation_canceled",
    });
    expect(context.persistence.recordTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalState: "failed",
        observedPaymentIntentStatus: "canceled",
        failureCode: "stripe_confirmation_canceled",
        failureEvidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it.each([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
  ] as const)(
    "routes intermediate Stripe status %s to ambiguity, never terminal failure",
    async (status) => {
      const context = harness();

      const result = await context.orchestrator.recordVerifiedObservation({
        attempt: handoffAttempt(),
        observation: verifiedObservation(status),
      });

      expect(result).toMatchObject({
        decision: "ambiguous",
        confirmationState: "ambiguous",
        ambiguityCode: "stripe_confirmation_intermediate_status",
        reconciliationRequired: true,
        blindRetryAuthorized: false,
      });
      expect(context.persistence.recordTerminal).not.toHaveBeenCalled();
      expect(context.persistence.markAmbiguous).toHaveBeenCalledWith(
        expect.objectContaining({
          ambiguityCode: "stripe_confirmation_intermediate_status",
          expectedRevision: 1,
        }),
      );
    },
  );

  it("allows a later verified authorization to reconcile an intermediate status", async () => {
    const context = harness();
    const pending = await context.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation: verifiedObservation("requires_action"),
    });
    expect(pending.confirmationState).toBe("ambiguous");

    const reconciled = await context.orchestrator.reconcileVerifiedObservation({
      outcome: "authorized_requires_capture",
      attempt: ambiguousAttempt(),
      observation: {
        ...verifiedObservation("requires_capture"),
        source: "stripe_retrieval",
        webhookEventSha256: null,
        retrievalEvidenceSha256: digest("e"),
      },
    });

    expect(reconciled).toMatchObject({
      confirmationState: "reconciled",
      reconciledOutcome: "authorized_requires_capture",
      orderAuthorized: false,
    });
    expect(context.persistence.recordTerminal).not.toHaveBeenCalled();
    expect(context.persistence.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciledOutcome: "authorized_requires_capture",
        observedPaymentIntentStatus: "requires_capture",
      }),
    );
  });

  it("rejects browser assertions, mismatched facts, and future observations", async () => {
    const unverified = harness({ observationVerified: false });
    await expect(unverified.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation: verifiedObservation(),
    })).rejects.toMatchObject({ reason: "observation_refused" });
    expect(unverified.persistence.recordTerminal).not.toHaveBeenCalled();

    const mismatched = harness();
    await expect(mismatched.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation: {
        ...verifiedObservation(),
        observedAmountCents: checkoutEvidence().amountCents + 1,
      },
    })).rejects.toMatchObject({ reason: "binding_mismatch" });
    expect(mismatched.persistence.recordTerminal).not.toHaveBeenCalled();

    const future = harness();
    await expect(future.orchestrator.recordVerifiedObservation({
      attempt: handoffAttempt(),
      observation: {
        ...verifiedObservation(),
        observedAt: new Date((nowSeconds + 1) * 1000).toISOString(),
      },
    })).rejects.toMatchObject({ reason: "observation_refused" });
    expect(future.observations.verifyObservation).not.toHaveBeenCalled();
    expect(future.persistence.recordTerminal).not.toHaveBeenCalled();
  });

  it("persists explicit ambiguity and verifier-authenticated reconciliation", async () => {
    const context = harness();
    const ambiguous = await context.orchestrator.markAmbiguous({
      attempt: handoffAttempt(),
      ambiguityCode: "stripe_confirmation_outcome_unknown",
      ambiguitySourceEvidenceSha256: digest("d"),
    });
    expect(ambiguous).toMatchObject({
      confirmationState: "ambiguous",
      reconciliationRequired: true,
      blindRetryAuthorized: false,
    });
    expect(context.persistence.markAmbiguous).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        ambiguityCode: "stripe_confirmation_outcome_unknown",
        ambiguityEvidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );

    const reconciled = await context.orchestrator
      .reconcileVerifiedObservation({
        outcome: "authorized_requires_capture",
        attempt: ambiguousAttempt(),
        observation: {
          ...verifiedObservation(),
          source: "stripe_retrieval",
          webhookEventSha256: null,
          retrievalEvidenceSha256: digest("e"),
        },
      });
    expect(reconciled).toMatchObject({
      confirmationState: "reconciled",
      confirmationRevision: 3,
      reconciledOutcome: "authorized_requires_capture",
      orderCreationRemainsLaterGate: true,
      orderAuthorized: false,
    });
    expect(context.persistence.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 2,
        reconciledOutcome: "authorized_requires_capture",
        observedPaymentIntentStatus: "requires_capture",
        reconciliationEvidenceSha256:
          expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("reconciles unresolved evidence without inventing provider facts", async () => {
    const context = harness();
    const result = await context.orchestrator.reconcileVerifiedObservation({
      outcome: "unresolved",
      attempt: ambiguousAttempt(),
      observation: {
        source: "stripe_retrieval",
        observedAt: new Date((nowSeconds - 1) * 1000).toISOString(),
        webhookEventSha256: null,
        retrievalEvidenceSha256: digest("f"),
      },
    });

    expect(result.reconciledOutcome).toBe("unresolved");
    expect(context.persistence.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciledOutcome: "unresolved",
        observedPaymentIntentStatus: null,
        observedAmountCents: null,
        observedCurrency: null,
        observedLivemode: null,
        observedPaymentIntentReferenceSha256: null,
        providerResponseSha256: null,
        confirmationEvidenceSha256: null,
        failureCode: null,
        failureEvidenceSha256: null,
      }),
    );
  });

  it("accepts trusted reconciliation evidence after the handoff deadline", async () => {
    const delayedNowSeconds = nowSeconds + 900;
    const context = harness();
    context.authorization.readTrustedTimeSeconds.mockReturnValue(
      delayedNowSeconds,
    );
    const delayedObservation = {
      ...verifiedObservation(),
      source: "stripe_retrieval" as const,
      observedAt: new Date((delayedNowSeconds - 1) * 1000).toISOString(),
      webhookEventSha256: null,
      retrievalEvidenceSha256: digest("e"),
    };

    await expect(context.orchestrator.reconcileVerifiedObservation({
      outcome: "authorized_requires_capture",
      attempt: ambiguousAttempt(),
      observation: delayedObservation,
    })).resolves.toMatchObject({
      confirmationState: "reconciled",
      reconciledOutcome: "authorized_requires_capture",
    });
    expect(context.observations.verifyObservation).toHaveBeenCalledOnce();
  });

  it("refuses mismatched evidence and unsafe dependencies before persistence", async () => {
    const source = sourceCapability();
    const context = harness();
    await expect(context.orchestrator.prepareHandoff({
      ...prepareInput(source.value),
      checkoutEvidence: {
        ...checkoutEvidence(),
        paymentBindingSha256: digest("0"),
      },
    })).rejects.toMatchObject({ reason: "binding_mismatch" });
    expect(context.persistence.prepare).not.toHaveBeenCalled();

    expect(() =>
      createFlightConsumerLiveStripePaymentIntentConfirmationOrchestrator({
        runtimePolicy: runtimePolicy(),
        providerExecutionBinding: providerBinding,
        paymentExecutionBinding: paymentBinding,
        productionAuthorizationVerifier: context.authorization.value,
        confirmationPersistence: {
          ...context.persistence.value,
          orderAuthorized: true,
        } as never,
        observationVerifier: context.observations.value,
      })
    ).toThrow(FlightConsumerLiveStripePaymentIntentConfirmationError);
  });

  it("is server-only, route-free, transport-free, and keeps orders bodyless-locked", () => {
    const sourcePath = join(
      "lib",
      "flights",
      "consumer-production",
      "stripe-live-payment-intent-confirmation-orchestrator.server.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    const orderRoute = readFileSync(
      join("app", "api", "flights", "orders", "route.ts"),
      "utf8",
    );
    const releaseBoundary = readFileSync(
      join(
        "docs",
        "FLIGHT_CONSUMER_PRODUCTION_STRIPE_CONFIRMATION_DARK_GATE.md",
      ),
      "utf8",
    );
    const appSource = appSourceFiles("app")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/\bprocess\.env\b|\bfetch\s*\(/);
    expect(source).not.toMatch(/createAdminClient|NextRequest|NextResponse/);
    expect(source).not.toMatch(/console\.(?:log|error|warn|info|debug)/);
    expect(source).not.toMatch(
      /paymentIntents\.(?:create|confirm|capture|cancel|retrieve)/,
    );
    expect(source).not.toMatch(/orders\.create|air\/orders|issueTicket/);
    expect(source).toContain("timingSafeEqual(observedDigest, expectedDigest)");
    expect(appSource).not.toContain(
      "stripe-live-payment-intent-confirmation-orchestrator.server",
    );
    expect(orderRoute).toContain("export async function POST()");
    expect(orderRoute).not.toMatch(
      /request\s*:\s*NextRequest|\brequest\.json\s*\(/,
    );
    expect(orderRoute).toContain(
      "flight_consumer_production_order_endpoint_locked",
    );
    expect(releaseBoundary).toContain(
      "browser handoff remains route-locked",
    );
    expect(releaseBoundary).toContain(
      "Stripe-enforced cancellation/expiry",
    );
    expect(releaseBoundary).toContain("reaper and late-authorization");
    expect(releaseBoundary).toMatch(
      /not\s+consumer-ready or public-launch authority/,
    );

    const context = harness();
    expect(context.orchestrator).toMatchObject({
      migrationVersion: "202608260109",
      productionDark: true,
      routeExposed: false,
      consumerReachable: false,
      environmentReadImplemented: false,
      stripeTransportImplemented: false,
      browserAssertionAccepted: false,
      browserHandoffRouteExposed: false,
      terminalObservationRouteExposed: false,
      reconciliationRouteExposed: false,
      lateAuthorizationCancellationImplemented: false,
      lateAuthorizationReaperImplemented: false,
      orderImplemented: false,
      captureImplemented: false,
      ticketingImplemented: false,
      consumerReleaseEnabled: false,
    });
  });
});
