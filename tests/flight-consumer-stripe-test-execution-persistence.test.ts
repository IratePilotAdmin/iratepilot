import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerStripeTestExecutionPersistence,
  FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_MIGRATION_VERSION,
  FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC,
  FlightConsumerStripeTestPersistenceError,
  type FlightConsumerStripeTestPersistenceRpcClient,
} from "../lib/flights/consumer-production/stripe-test-execution-persistence.server";

const digest = (character: string) => character.repeat(64);
const attemptId = "00000000-0000-4000-8000-000000000104";

function prepareInput() {
  return {
    executionScopeSha256: digest("0"),
    paymentBindingSha256: digest("1"),
    orderReferenceSha256: digest("2"),
    customerReferenceSha256: digest("3"),
    paymentAttemptReferenceSha256: digest("4"),
    workflowSha256: digest("5"),
    metadataSha256: digest("6"),
    requestBodySha256: digest("7"),
    requestEnvelopeSha256: digest("8"),
    idempotencyRequestSha256: digest("9"),
    idempotencyKeySha256: digest("a"),
    amountCents: 25_000,
  };
}

function observationInput(source: "stripe_retrieve" | "stripe_webhook") {
  const webhook = source === "stripe_webhook";
  return {
    attemptId,
    expectedRevision: 1,
    executionScopeSha256: digest("0"),
    leaseTokenSha256: webhook ? null : digest("b"),
    source,
    webhookEventIdSha256: webhook ? digest("c") : null,
    webhookIdempotencySha256: webhook ? digest("d") : null,
    webhookEventType: webhook
      ? "payment_intent.amount_capturable_updated" as const
      : null,
    webhookPayloadSha256: webhook ? digest("e") : null,
    webhookSemanticSha256: webhook ? digest("f") : null,
    webhookVerificationReceiptSha256: webhook ? digest("1") : null,
    paymentIntentReferenceSha256: digest("2"),
    observationSha256: digest("3"),
    observationEvidenceSha256: digest("4"),
    observationState: "requires_capture" as const,
    captureState: "requires_capture" as const,
    refundState: "not_requested" as const,
    amountCapturableCents: 25_000,
    amountReceivedCents: 0,
    amountRefundedCents: 0,
    livemode: false as const,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as FlightConsumerStripeTestPersistenceRpcClient,
    rpc,
  };
}

describe("Flight Consumer Stripe TEST execution persistence contract", () => {
  it("declares the isolated authored migration and no dispatch/apply authority", () => {
    const { client } = clientReturning(null);
    const persistence = createFlightConsumerStripeTestExecutionPersistence(client);

    expect(FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_MIGRATION_VERSION)
      .toBe("202608260104");
    expect(FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC).toEqual({
      prepare: "prepare_flight_consumer_stripe_test_payment_attempt_v1",
      claim: "claim_flight_consumer_stripe_test_payment_attempt_v1",
      observe: "record_flight_consumer_stripe_test_payment_observation_v1",
      recover: "recover_flight_consumer_stripe_test_payment_attempt_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-stripe-test-execution-persistence-v1",
      migrationVersion: "202608260104",
      processorEnvironment: "stripe_test",
      providerDispatchImplemented: false,
      productionApplyAuthorized: false,
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps a digest-only attempt into the exact prepare RPC", async () => {
    const result = {
      decision: "created",
      attempt_id: attemptId,
      attempt_revision: 0,
      attempt_state: "prepared",
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerStripeTestExecutionPersistence(client);

    await expect(persistence.prepare(prepareInput())).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.prepare,
      {
        p_execution_scope_sha256: digest("0"),
        p_payment_binding_sha256: digest("1"),
        p_order_reference_sha256: digest("2"),
        p_customer_reference_sha256: digest("3"),
        p_payment_attempt_reference_sha256: digest("4"),
        p_workflow_sha256: digest("5"),
        p_metadata_sha256: digest("6"),
        p_request_body_sha256: digest("7"),
        p_request_envelope_sha256: digest("8"),
        p_idempotency_request_sha256: digest("9"),
        p_idempotency_key_sha256: digest("a"),
        p_amount_cents: 25_000,
      },
    );
  });

  it("claims only an exact bounded lease", async () => {
    const result = {
      attempt_id: attemptId,
      attempt_revision: 1,
      attempt_state: "claimed",
      lease_expires_at: "2026-08-26T12:01:00.000Z",
    };
    const { client, rpc } = clientReturning(result);
    const persistence = createFlightConsumerStripeTestExecutionPersistence(client);

    await expect(persistence.claim({
      attemptId,
      expectedRevision: 0,
      executionScopeSha256: digest("0"),
      leaseTokenSha256: digest("b"),
      leaseSeconds: 60,
    })).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.claim,
      {
        p_attempt_id: attemptId,
        p_expected_revision: 0,
        p_execution_scope_sha256: digest("0"),
        p_lease_token_sha256: digest("b"),
        p_lease_seconds: 60,
      },
    );
  });

  it.each(["stripe_retrieve", "stripe_webhook"] as const)(
    "maps a complete %s observation without raw Stripe material",
    async (source) => {
      const input = observationInput(source);
      const result = {
        decision: "recorded",
        attempt_id: attemptId,
        attempt_revision: 2,
        attempt_state: "observed",
        observation_state: "requires_capture",
        capture_state: "requires_capture",
        refund_state: "not_requested",
        payment_intent_reference_sha256: input.paymentIntentReferenceSha256,
      };
      const { client, rpc } = clientReturning([result]);
      const persistence = createFlightConsumerStripeTestExecutionPersistence(client);

      await expect(persistence.recordObservation(input)).resolves.toEqual(result);
      expect(rpc).toHaveBeenCalledWith(
        FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.observe,
        expect.objectContaining({
          p_attempt_id: attemptId,
          p_source: source,
          p_lease_token_sha256: input.leaseTokenSha256,
          p_webhook_event_id_sha256: input.webhookEventIdSha256,
          p_payment_intent_reference_sha256:
            input.paymentIntentReferenceSha256,
          p_livemode: false,
        }),
      );
      expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(
        /(?:sk|rk)_(?:test|live)_|whsec_|:"(?:pi|pm|ch|re|evt)_[A-Za-z0-9_]+"|client_secret/i,
      );
    },
  );

  it("maps expired-lease recovery while hard-locking blind retry false", async () => {
    const result = {
      decision: "reconcile_required",
      attempt_id: attemptId,
      attempt_revision: 2,
      attempt_state: "reconcile_required",
      recovery_state: "provider_present",
      blind_retry_authorized: false,
    };
    const { client, rpc } = clientReturning(result);
    const persistence = createFlightConsumerStripeTestExecutionPersistence(client);

    await expect(persistence.recoverExpiredLease({
      attemptId,
      expectedRevision: 1,
      executionScopeSha256: digest("0"),
      leaseTokenSha256: digest("b"),
      reconciliationState: "provider_present",
      reconciliationEvidenceSha256: digest("c"),
      paymentIntentReferenceSha256: digest("d"),
    })).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_RPC.recover,
      expect.objectContaining({
        p_reconciliation_state: "provider_present",
        p_payment_intent_reference_sha256: digest("d"),
      }),
    );
  });

  it("rejects raw, incomplete, cross-source, and inconsistent inputs before RPC", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerStripeTestExecutionPersistence(client);
    const refused = [
      { ...prepareInput(), paymentMethodId: "pm_raw_not_allowed" },
      { ...prepareInput(), orderReferenceSha256: digest("3") },
      { ...prepareInput(), amountCents: 49 },
    ];
    for (const input of refused) {
      await expect(persistence.prepare(input)).rejects.toMatchObject({
        reason: "invalid_input",
      });
    }

    const webhook = observationInput("stripe_webhook");
    const observations = [
      { ...webhook, webhookPayloadSha256: null },
      { ...webhook, leaseTokenSha256: digest("a") },
      {
        ...observationInput("stripe_retrieve"),
        webhookEventIdSha256: digest("a"),
      },
      { ...webhook, livemode: true },
      { ...webhook, amountRefundedCents: 1, amountReceivedCents: 0 },
      { ...webhook, clientSecret: "pi_secret_not_allowed" },
    ];
    for (const input of observations) {
      await expect(persistence.recordObservation(input as never)).rejects
        .toMatchObject({ reason: "invalid_input" });
    }

    await expect(persistence.recoverExpiredLease({
      attemptId,
      expectedRevision: 1,
      executionScopeSha256: digest("0"),
      leaseTokenSha256: digest("b"),
      reconciliationState: "provider_present",
      reconciliationEvidenceSha256: digest("c"),
      paymentIntentReferenceSha256: null,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("normalizes transport/database failures and malformed results", async () => {
    const throwingClient: FlightConsumerStripeTestPersistenceRpcClient = {
      rpc: async () => {
        throw new Error("secret database detail");
      },
    };
    await expect(createFlightConsumerStripeTestExecutionPersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toEqual(
      new FlightConsumerStripeTestPersistenceError("rpc_refused"),
    );

    const errorClient: FlightConsumerStripeTestPersistenceRpcClient = {
      rpc: async () => ({ data: null, error: { code: "P0001" } }),
    };
    await expect(createFlightConsumerStripeTestExecutionPersistence(
      errorClient,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "rpc_refused",
      message: expect.not.stringContaining("P0001"),
    });

    const { client } = clientReturning([]);
    await expect(createFlightConsumerStripeTestExecutionPersistence(
      client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("contains no provider SDK, network, environment, credential, or payload path", () => {
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/stripe-test-execution-persistence.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.env\b/);
    expect(source).not.toMatch(
      /paymentIntents\.(?:create|capture|cancel|retrieve)|refunds\.create|webhooks\.constructEvent/,
    );
    expect(source).not.toMatch(
      /secretKey|webhookSecret|clientSecret|rawBody|rawPayload|paymentMethodId/i,
    );
    expect(source).toContain("providerDispatchImplemented: false");
    expect(source).toContain("productionApplyAuthorized: false");
  });
});
