import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { inspect } from "node:util";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveStripePaymentIntentCreateOrchestrator,
  FLIGHT_CONSUMER_LIVE_STRIPE_CREATE_TRANSPORT_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_REFERENCE_ENCRYPTION_VERSION,
  FlightConsumerLiveStripePaymentIntentCreateError,
  type FlightConsumerLiveStripePaymentIntentCreateTransport,
  type FlightConsumerLiveStripeReferenceEncryptionPort,
} from "../lib/flights/consumer-production/stripe-live-payment-intent-create-orchestrator.server";
import { buildFlightConsumerProductionStripePaymentIntentPlan } from
  "../lib/flights/consumer-production/stripe-payment-intent-plan.server";
import type { FlightConsumerLiveStripeExecutionPersistence } from
  "../lib/flights/consumer-production/stripe-live-payment-execution-persistence.server";
import {
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../lib/flights/runtime-safety";

const digest = (character: string) => character.repeat(64);
const nowSeconds = 1_800_000_000;
const attemptId = "00000000-0000-4000-8000-000000000106";
const paymentIntentId = "pi_123456789ABC";
const clientSecret = `${paymentIntentId}_secret_abcdefghijklmnop`;

const authorityReceipt = Object.freeze({
  livemode: true as const,
  stripe_dispatch_authorized: false as const,
  payment_authorized: false as const,
  order_authorized: false as const,
  capture_authorized: false as const,
  refund_authorized: false as const,
  settlement_authorized: false as const,
  ticketing_authorized: false as const,
  servicing_authorized: false as const,
  consumer_release_enabled: false as const,
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

function planInput() {
  return {
    orderId: "00000000-0000-4000-8000-000000000001",
    customerId: "00000000-0000-4000-8000-000000000002",
    paymentAttemptId: "00000000-0000-4000-8000-000000000003",
    authoritativeAmountCents: 16_914,
    paymentAmountCents: 16_914,
    currency: "USD" as const,
    executionScopeSha256: digest("8"),
    offerEvidenceSha256: digest("9"),
    repriceEvidenceSha256: digest("a"),
    orderPlanSha256: digest("b"),
    orderRequestEnvelopeSha256: digest("c"),
    paymentBinding,
  };
}

function planAndReceipt() {
  const plan = buildFlightConsumerProductionStripePaymentIntentPlan(
    planInput(),
  );
  return {
    plan,
    receipt: {
      decision: "created" as const,
      planId: "00000000-0000-4000-8000-000000000103",
      recordedPlanSha256: plan.planSha256,
      planMode: "zero_dispatch" as const,
    },
  };
}

function productionAuthorization(): FlightProductionActionAuthorization {
  const { plan } = planAndReceipt();
  return {
    version: "flight-production-action-authorization-v2",
    authorizationId: "flight-stripe-live-create-approval-001",
    operation: "authorize_payment",
    provider: "provider_production",
    scopeId: planInput().orderId,
    requestDigest: plan.requestEnvelopeSha256,
    idempotencyRequestDigest: plan.idempotencyRequestSha256,
    providerBindingDigest: digestFlightRuntimeProviderBinding(providerBinding),
    paymentBindingDigest: digestFlightRuntimePaymentBinding(paymentBinding),
    settlementBindingDigest: null,
    nonce: "d".repeat(32),
    issuedAtSeconds: nowSeconds - 10,
    expiresAtSeconds: nowSeconds + 90,
    signatureHex: digest("e"),
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
      "flight-stripe-live-create-approval-001",
    providerBinding,
    paymentBinding,
    settlementBinding: null,
    invalidSettings: [],
  };
}

function verifier(
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

function executionPersistence(overrides: Partial<
  FlightConsumerLiveStripeExecutionPersistence
> = {}) {
  const prepare = vi.fn(async () => ({
    decision: "created" as const,
    attempt_id: attemptId,
    attempt_state: "prepared" as const,
    attempt_revision: 0,
    state_receipt_sha256: digest("1"),
    ...authorityReceipt,
  }));
  const claim = vi.fn(async () => ({
    decision: "claimed" as const,
    attempt_id: attemptId,
    attempt_state: "claimed" as const,
    attempt_revision: 1 as const,
    lease_expires_at: new Date((nowSeconds + 30) * 1000).toISOString(),
    state_receipt_sha256: digest("2"),
    ...authorityReceipt,
  }));
  const complete = vi.fn(async (input: {
    paymentIntentReferenceSha256: string;
  }) => ({
    decision: "completed" as const,
    attempt_id: attemptId,
    attempt_state: "completed" as const,
    attempt_revision: 2 as const,
    payment_intent_reference_sha256:
      input.paymentIntentReferenceSha256,
    state_receipt_sha256: digest("3"),
    ...authorityReceipt,
  }));
  const markAmbiguous = vi.fn(async (input: { ambiguityCode: string }) => ({
    decision: "ambiguous" as const,
    attempt_id: attemptId,
    attempt_state: "ambiguous" as const,
    attempt_revision: 2 as const,
    ambiguity_code: input.ambiguityCode,
    state_receipt_sha256: digest("4"),
    ...authorityReceipt,
  }));
  const recover = vi.fn(async () => {
    throw new Error("Recovery is outside this orchestrator.");
  });
  const value = {
    version: "flight-consumer-live-stripe-execution-persistence-v1" as const,
    migrationVersion: "202608260106" as const,
    processorEnvironment: "stripe_live" as const,
    livemode: true as const,
    routeExposed: false as const,
    stripeTransportImplemented: false as const,
    providerDispatchImplemented: false as const,
    databaseApplyAuthorized: false as const,
    stripeDispatchAuthorized: false as const,
    paymentAuthorized: false as const,
    orderAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    settlementAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
    prepare,
    claim,
    complete,
    markAmbiguous,
    recover,
    ...overrides,
  } as FlightConsumerLiveStripeExecutionPersistence;
  return { value, prepare, claim, complete, markAmbiguous, recover };
}

function transport() {
  const createPaymentIntent = vi.fn(async (
    request: Parameters<
      FlightConsumerLiveStripePaymentIntentCreateTransport["createPaymentIntent"]
    >[0],
    options: Parameters<
      FlightConsumerLiveStripePaymentIntentCreateTransport["createPaymentIntent"]
    >[1],
  ): Promise<unknown> => {
    void options;
    return {
      id: paymentIntentId,
      object: "payment_intent",
      livemode: true,
      status: "requires_payment_method",
      amount: request.amount,
      currency: request.currency,
      capture_method: request.capture_method,
      confirmation_method: request.confirmation_method,
      payment_method_types: request.payment_method_types,
      metadata: { ...request.metadata },
      client_secret: clientSecret,
    };
  });
  const value: FlightConsumerLiveStripePaymentIntentCreateTransport = {
    version: FLIGHT_CONSUMER_LIVE_STRIPE_CREATE_TRANSPORT_VERSION,
    processorEnvironment: "stripe_live",
    livemode: true,
    retryImplemented: false,
    logsResponse: false,
    persistsResponse: false,
    createPaymentIntent,
  };
  return { value, createPaymentIntent };
}

function encryption() {
  const encryptPaymentIntentReference = vi.fn(async (input) => ({
    version:
      "flight-consumer-live-stripe-reference-encryption-result-v1",
    ciphertext: `enc:v1:${"A".repeat(32)}`,
    plaintextReferenceSha256: input.plaintextReferenceSha256,
  }));
  const value: FlightConsumerLiveStripeReferenceEncryptionPort = {
    version: FLIGHT_CONSUMER_LIVE_STRIPE_REFERENCE_ENCRYPTION_VERSION,
    encryptPaymentIntentReference,
  };
  return { value, encryptPaymentIntentReference };
}

function executeInput() {
  const { receipt } = planAndReceipt();
  return {
    planInput: planInput(),
    planJournalReceipt: receipt,
    productionAuthorization: productionAuthorization(),
    dispatchNotAfter: new Date((nowSeconds + 60) * 1000).toISOString(),
    leaseTokenSha256: digest("f"),
    leaseSeconds: 30,
  };
}

function harness(options: {
  consumeDecision?: "consumed" | "replayed" | "unavailable";
  persistenceOverrides?: Partial<
    FlightConsumerLiveStripeExecutionPersistence
  >;
} = {}) {
  const authorizationVerifier = verifier(options.consumeDecision);
  const persistence = executionPersistence(options.persistenceOverrides);
  const stripeTransport = transport();
  const referenceEncryption = encryption();
  const orchestrator =
    createFlightConsumerLiveStripePaymentIntentCreateOrchestrator({
      runtimePolicy: runtimePolicy(),
      providerExecutionBinding: providerBinding,
      productionAuthorizationVerifier: authorizationVerifier.value,
      executionPersistence: persistence.value,
      stripeTransport: stripeTransport.value,
      referenceEncryption: referenceEncryption.value,
    });
  return {
    orchestrator,
    authorizationVerifier,
    persistence,
    stripeTransport,
    referenceEncryption,
  };
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production live Stripe PaymentIntent create orchestrator", () => {
  it("creates exactly one bounded live intent and durably completes before issuing an ephemeral capability", async () => {
    const context = harness();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await context.orchestrator.execute(executeInput());

    expect(result).toMatchObject({
      decision: "completed",
      providerRequestCount: 1,
      stripeMutationCount: 1,
      paymentIntentCreateCount: 1,
      confirmationAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      orderAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      clientSecretPersistedByOrchestrator: false,
      clientSecretLoggedByOrchestrator: false,
      consumerConfirmationRemainsLaterGate: true,
    });
    expect(context.authorizationVerifier.consumeNonce).toHaveBeenCalledOnce();
    expect(context.persistence.prepare).toHaveBeenCalledOnce();
    expect(context.persistence.claim).toHaveBeenCalledOnce();
    expect(context.stripeTransport.createPaymentIntent).toHaveBeenCalledOnce();
    expect(context.persistence.complete).toHaveBeenCalledOnce();
    expect(context.persistence.markAmbiguous).not.toHaveBeenCalled();

    const [request, options] =
      context.stripeTransport.createPaymentIntent.mock.calls[0]!;
    expect(request).toEqual({
      amount: 16_914,
      currency: "usd",
      capture_method: "manual",
      confirmation_method: "automatic",
      payment_method_types: ["card"],
      metadata: expect.objectContaining({
        integration: "flight_consumer_production_plan_v1",
        execution_mode: "live_plan_only",
        execution_scope_sha256: digest("8"),
      }),
    });
    expect(options.idempotencyKey).toMatch(/^flt_v1_[0-9a-f]{64}$/);
    const planned = planAndReceipt().plan;
    expect(options.idempotencyKey).toHaveLength(71);
    expect(createHash("sha256").update(options.idempotencyKey, "utf8")
      .digest("hex")).toBe(planned.idempotencyKeySha256);
    expect(Object.keys(request.metadata)).toHaveLength(11);
    expect(context.authorizationVerifier.consumeNonce).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "authorize_payment",
        scopeId: planInput().orderId,
        requestDigest: planned.requestEnvelopeSha256,
        idempotencyRequestDigest: planned.idempotencyRequestSha256,
        paymentBindingDigest: planned.paymentBindingSha256,
      }),
    );
    expect(context.persistence.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: planAndReceipt().receipt.planId,
        planSha256: planned.planSha256,
        dispatchNotAfter: executeInput().dispatchNotAfter,
      }),
    );
    expect(context.referenceEncryption.encryptPaymentIntentReference)
      .toHaveBeenCalledWith(expect.objectContaining({
        plaintextReference: paymentIntentId,
        plaintextReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }));
    const completeInput = context.persistence.complete.mock.calls[0]![0];
    expect(completeInput).toMatchObject({
      expectedRevision: 1,
      livemode: true,
      paymentIntentReferenceCiphertext: `enc:v1:${"A".repeat(32)}`,
      paymentIntentReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      terminalResponseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      completionEvidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(completeInput)).not.toContain(paymentIntentId);
    expect(JSON.stringify(completeInput)).not.toContain(clientSecret);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    if (result.decision !== "completed") {
      throw new Error("Expected a completed result.");
    }
    expect(Object.keys(result.clientSecretCapability)).not.toContain(
      "clientSecret",
    );
    expect(inspect(result.clientSecretCapability)).toContain("REDACTED");
    expect(inspect(result.clientSecretCapability)).not.toContain(clientSecret);
    expect(() => JSON.stringify(result.clientSecretCapability)).toThrow(
      FlightConsumerLiveStripePaymentIntentCreateError,
    );
    expect(result.clientSecretCapability.consumed).toBe(false);
    expect(result.clientSecretCapability.useOnce((secret) => secret))
      .toBe(clientSecret);
    expect(result.clientSecretCapability.consumed).toBe(true);
    expect(() => result.clientSecretCapability.useOnce((secret) => secret))
      .toThrow(FlightConsumerLiveStripePaymentIntentCreateError);

    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("turns a consumed one-shot authority into a zero-dispatch replay", async () => {
    const context = harness({ consumeDecision: "replayed" });

    const result = await context.orchestrator.execute(executeInput());

    expect(result).toMatchObject({
      decision: "replay",
      replayStage: "authority",
      attemptId: null,
      providerRequestCount: 0,
      clientSecretCapability: null,
      blindRetryAuthorized: false,
    });
    expect(context.persistence.prepare).not.toHaveBeenCalled();
    expect(context.persistence.claim).not.toHaveBeenCalled();
    expect(context.stripeTransport.createPaymentIntent).not.toHaveBeenCalled();
    expect(context.referenceEncryption.encryptPaymentIntentReference)
      .not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "claim lease",
      finalTrustedTimeSeconds: nowSeconds + 30,
      leaseExpiresAtSeconds: nowSeconds + 30,
      dispatchNotAfterSeconds: nowSeconds + 60,
    },
    {
      name: "dispatch window",
      finalTrustedTimeSeconds: nowSeconds + 60,
      leaseExpiresAtSeconds: nowSeconds + 90,
      dispatchNotAfterSeconds: nowSeconds + 60,
    },
    {
      name: "authorization and dispatch window",
      finalTrustedTimeSeconds: nowSeconds + 90,
      leaseExpiresAtSeconds: nowSeconds + 120,
      dispatchNotAfterSeconds: nowSeconds + 90,
    },
  ])("refuses a live call when the $name deadline expires after claim", async ({
    dispatchNotAfterSeconds,
    finalTrustedTimeSeconds,
    leaseExpiresAtSeconds,
  }) => {
    const claim = vi.fn(async () => ({
      decision: "claimed" as const,
      attempt_id: attemptId,
      attempt_state: "claimed" as const,
      attempt_revision: 1 as const,
      lease_expires_at: new Date(leaseExpiresAtSeconds * 1000).toISOString(),
      state_receipt_sha256: digest("2"),
      ...authorityReceipt,
    }));
    const context = harness({
      persistenceOverrides: { claim },
    });
    context.authorizationVerifier.readTrustedTimeSeconds
      .mockReturnValueOnce(nowSeconds)
      .mockReturnValueOnce(nowSeconds)
      .mockReturnValueOnce(finalTrustedTimeSeconds);
    const input = {
      ...executeInput(),
      dispatchNotAfter: new Date(dispatchNotAfterSeconds * 1000).toISOString(),
    };

    await expect(context.orchestrator.execute(input)).rejects
      .toMatchObject({
        reason: "authority_refused",
        blindRetryAuthorized: false,
      });
    expect(context.persistence.prepare).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledOnce();
    expect(context.stripeTransport.createPaymentIntent).not.toHaveBeenCalled();
    expect(context.persistence.complete).not.toHaveBeenCalled();
    expect(context.persistence.markAmbiguous).not.toHaveBeenCalled();
  });

  it("normalizes a final trusted-clock failure after claim without dispatch", async () => {
    const context = harness();
    context.authorizationVerifier.readTrustedTimeSeconds
      .mockReturnValueOnce(nowSeconds)
      .mockReturnValueOnce(nowSeconds)
      .mockImplementationOnce(() => {
        throw new Error("private trusted-clock detail");
      });

    await expect(context.orchestrator.execute(executeInput())).rejects
      .toMatchObject({
        reason: "authority_refused",
        message: "Flight Consumer Live Stripe PaymentIntent creation was refused.",
      });
    expect(context.stripeTransport.createPaymentIntent).not.toHaveBeenCalled();
    expect(context.persistence.markAmbiguous).not.toHaveBeenCalled();
  });

  it("never dispatches when prepare or claim reports a replay", async () => {
    const preparedReplay = executionPersistence({
      prepare: vi.fn(async () => ({
        decision: "replay" as const,
        attempt_id: attemptId,
        attempt_state: "completed" as const,
        attempt_revision: 2,
        state_receipt_sha256: digest("1"),
        ...authorityReceipt,
      })),
    });
    const first = harness({
      persistenceOverrides: { prepare: preparedReplay.value.prepare },
    });
    await expect(first.orchestrator.execute(executeInput())).resolves
      .toMatchObject({
        decision: "replay",
        replayStage: "prepare",
        clientSecretCapability: null,
      });
    expect(first.stripeTransport.createPaymentIntent).not.toHaveBeenCalled();

    const claimedReplay = executionPersistence({
      claim: vi.fn(async () => ({
        decision: "replay" as const,
        attempt_id: attemptId,
        attempt_state: "claimed" as const,
        attempt_revision: 1 as const,
        lease_expires_at: new Date((nowSeconds + 30) * 1000).toISOString(),
        state_receipt_sha256: digest("2"),
        ...authorityReceipt,
      })),
    });
    const second = harness({
      persistenceOverrides: { claim: claimedReplay.value.claim },
    });
    await expect(second.orchestrator.execute(executeInput())).resolves
      .toMatchObject({
        decision: "replay",
        replayStage: "claim",
        clientSecretCapability: null,
      });
    expect(second.stripeTransport.createPaymentIntent).not.toHaveBeenCalled();
  });

  it("terminally records an unknown dispatch outcome without retrying", async () => {
    const context = harness();
    context.stripeTransport.createPaymentIntent.mockRejectedValueOnce(
      new Error(`private provider detail ${clientSecret}`),
    );

    const result = await context.orchestrator.execute(executeInput());

    expect(result).toMatchObject({
      decision: "ambiguous",
      ambiguityCode: "stripe_create_outcome_unknown",
      attemptState: "ambiguous",
      providerRequestCount: 1,
      clientSecretCapability: null,
      blindRetryAuthorized: false,
    });
    expect(context.stripeTransport.createPaymentIntent).toHaveBeenCalledOnce();
    expect(context.persistence.markAmbiguous).toHaveBeenCalledOnce();
    expect(context.persistence.complete).not.toHaveBeenCalled();
    expect(context.referenceEncryption.encryptPaymentIntentReference)
      .not.toHaveBeenCalled();
    const ambiguityInput =
      context.persistence.markAmbiguous.mock.calls[0]![0];
    expect(JSON.stringify(ambiguityInput)).not.toContain(clientSecret);
    expect(ambiguityInput).toMatchObject({
      expectedRevision: 1,
      ambiguityCode: "stripe_create_outcome_unknown",
      ambiguityEvidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      livemode: true,
    });
  });

  it.each([
    { field: "livemode", value: false },
    { field: "status", value: "succeeded" },
    { field: "amount", value: 16_915 },
  ])("terminally refuses an invalid provider $field result", async (change) => {
    const context = harness();
    context.stripeTransport.createPaymentIntent.mockImplementationOnce(
      async (request) => ({
        id: paymentIntentId,
        object: "payment_intent",
        livemode: true,
        status: "requires_payment_method",
        amount: request.amount,
        currency: "usd",
        capture_method: "manual",
        confirmation_method: "automatic",
        payment_method_types: ["card"],
        metadata: request.metadata,
        client_secret: clientSecret,
        [change.field]: change.value,
      }),
    );

    await expect(context.orchestrator.execute(executeInput())).resolves
      .toMatchObject({
        decision: "ambiguous",
        clientSecretCapability: null,
        blindRetryAuthorized: false,
      });
    expect(context.persistence.markAmbiguous).toHaveBeenCalledOnce();
    expect(context.persistence.complete).not.toHaveBeenCalled();
  });

  it("terminalizes encryption and completion persistence uncertainty without exposing a capability", async () => {
    const encryptionFailure = harness();
    encryptionFailure.referenceEncryption.encryptPaymentIntentReference
      .mockRejectedValueOnce(new Error(`private ${paymentIntentId}`));
    await expect(encryptionFailure.orchestrator.execute(executeInput()))
      .resolves.toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_reference_encryption_failed",
        clientSecretCapability: null,
      });
    expect(encryptionFailure.persistence.complete).not.toHaveBeenCalled();
    expect(encryptionFailure.persistence.markAmbiguous).toHaveBeenCalledOnce();

    const completionFailure = harness();
    completionFailure.persistence.complete.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    await expect(completionFailure.orchestrator.execute(executeInput()))
      .resolves.toMatchObject({
        decision: "ambiguous",
        ambiguityCode: "stripe_completion_persistence_unknown",
        clientSecretCapability: null,
      });
    expect(completionFailure.persistence.markAmbiguous).toHaveBeenCalledOnce();
  });

  it("withholds the client-secret capability when completion itself is a replay", async () => {
    const persistence = executionPersistence({
      complete: vi.fn(async (input: {
        paymentIntentReferenceSha256: string;
      }) => ({
        decision: "replay" as const,
        attempt_id: attemptId,
        attempt_state: "completed" as const,
        attempt_revision: 2 as const,
        payment_intent_reference_sha256:
          input.paymentIntentReferenceSha256,
        state_receipt_sha256: digest("3"),
        ...authorityReceipt,
      })),
    });
    const context = harness({
      persistenceOverrides: { complete: persistence.value.complete },
    });

    await expect(context.orchestrator.execute(executeInput())).resolves
      .toMatchObject({
        decision: "replay",
        replayStage: "complete",
        clientSecretCapability: null,
      });
  });

  it("refuses mismatched plan, authority, window, or dependencies before transport", async () => {
    const cases = [
      {
        ...executeInput(),
        planJournalReceipt: {
          ...executeInput().planJournalReceipt,
          recordedPlanSha256: digest("0"),
        },
      },
      {
        ...executeInput(),
        productionAuthorization: {
          ...executeInput().productionAuthorization,
          requestDigest: digest("0"),
        },
      },
      {
        ...executeInput(),
        dispatchNotAfter: new Date((nowSeconds + 121) * 1000).toISOString(),
      },
      { ...executeInput(), clientSecret: clientSecret },
    ];
    for (const input of cases) {
      const context = harness();
      await expect(context.orchestrator.execute(input)).rejects
        .toBeInstanceOf(FlightConsumerLiveStripePaymentIntentCreateError);
      expect(context.stripeTransport.createPaymentIntent)
        .not.toHaveBeenCalled();
    }

    const context = harness();
    expect(() => createFlightConsumerLiveStripePaymentIntentCreateOrchestrator({
      runtimePolicy: runtimePolicy(),
      providerExecutionBinding: providerBinding,
      productionAuthorizationVerifier: context.authorizationVerifier.value,
      executionPersistence: {
        ...context.persistence.value,
        captureAuthorized: true,
      } as never,
      stripeTransport: context.stripeTransport.value,
      referenceEncryption: context.referenceEncryption.value,
    })).toThrow(FlightConsumerLiveStripePaymentIntentCreateError);

    for (const unsafeTransport of [
      { retryImplemented: true },
      { logsResponse: true },
      { persistsResponse: true },
    ]) {
      expect(() => createFlightConsumerLiveStripePaymentIntentCreateOrchestrator({
        runtimePolicy: runtimePolicy(),
        providerExecutionBinding: providerBinding,
        productionAuthorizationVerifier: context.authorizationVerifier.value,
        executionPersistence: context.persistence.value,
        stripeTransport: {
          ...context.stripeTransport.value,
          ...unsafeTransport,
        } as never,
        referenceEncryption: context.referenceEncryption.value,
      })).toThrow(FlightConsumerLiveStripePaymentIntentCreateError);
    }
  });

  it("is server-only, unreachable, injection-only, and implements no downstream mutation", () => {
    const sourcePath = join(
      "lib",
      "flights",
      "consumer-production",
      "stripe-live-payment-intent-create-orchestrator.server.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    const appSource = appSourceFiles("app")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(source).not.toMatch(/\bprocess\.env\b|\bfetch\s*\(/);
    expect(source).not.toMatch(/createAdminClient|NextRequest|NextResponse/);
    expect(source).not.toMatch(/console\.(?:log|error|warn|info|debug)/);
    expect(source).not.toMatch(
      /paymentIntents\.(?:capture|confirm|cancel|retrieve)|refunds\.create/,
    );
    expect(appSource).not.toContain(
      "stripe-live-payment-intent-create-orchestrator.server",
    );
    expect(appSource).not.toContain(
      "createFlightConsumerLiveStripePaymentIntentCreateOrchestrator",
    );

    const context = harness();
    expect(context.orchestrator).toMatchObject({
      routeExposed: false,
      consumerReachable: false,
      environmentReadImplemented: false,
      captureImplemented: false,
      confirmationImplemented: false,
      refundImplemented: false,
      orderImplemented: false,
      ticketingImplemented: false,
      blindProviderRetryImplemented: false,
    });
  });
});
