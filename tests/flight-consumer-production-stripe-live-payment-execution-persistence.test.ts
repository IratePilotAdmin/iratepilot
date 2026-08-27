import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveStripeExecutionPersistence,
  FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC,
  FlightConsumerLiveStripeExecutionPersistenceError,
  type FlightConsumerLiveStripeExecutionRpcClient,
} from "../lib/flights/consumer-production/stripe-live-payment-execution-persistence.server";

const digest = (character: string) => character.repeat(64);
const attemptId = "00000000-0000-4000-8000-000000000106";
const planId = "00000000-0000-4000-8000-000000000103";
const encryptedReference = `enc:v1:${"A".repeat(32)}`;

const authorityReceipt = Object.freeze({
  livemode: true,
  stripe_dispatch_authorized: false,
  payment_authorized: false,
  order_authorized: false,
  capture_authorized: false,
  refund_authorized: false,
  settlement_authorized: false,
  ticketing_authorized: false,
  servicing_authorized: false,
  consumer_release_enabled: false,
});

function prepareInput() {
  return {
    planId,
    planSha256: digest("1"),
    executionWorkflowSha256: digest("2"),
    executionPrerequisiteSha256: digest("3"),
    dispatchNotAfter: "2026-08-27T12:01:00.000Z",
  };
}

function claimInput() {
  return {
    attemptId,
    expectedRevision: 0 as const,
    executionScopeSha256: digest("4"),
    leaseTokenSha256: digest("5"),
    leaseSeconds: 60,
  };
}

function completeInput() {
  return {
    attemptId,
    expectedRevision: 1 as const,
    executionScopeSha256: digest("4"),
    leaseTokenSha256: digest("5"),
    paymentIntentReferenceCiphertext: encryptedReference,
    paymentIntentReferenceSha256: digest("6"),
    terminalResponseSha256: digest("7"),
    completionEvidenceSha256: digest("8"),
    livemode: true as const,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as FlightConsumerLiveStripeExecutionRpcClient,
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

describe("Flight Consumer Production Stripe live execution persistence", () => {
  it("declares an unapplied live-only persistence prerequisite with zero authority", () => {
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      clientReturning(null).client,
    );

    expect(FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_MIGRATION_VERSION)
      .toBe("202608260106");
    expect(FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_stripe_payment_execution_v1",
      claim: "claim_flight_consumer_live_stripe_payment_execution_v1",
      complete: "complete_flight_consumer_live_stripe_payment_execution_v1",
      ambiguous:
        "mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1",
      recover: "recover_flight_consumer_live_stripe_payment_execution_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-live-stripe-execution-persistence-v1",
      migrationVersion: "202608260106",
      processorEnvironment: "stripe_live",
      livemode: true,
      routeExposed: false,
      stripeTransportImplemented: false,
      providerDispatchImplemented: false,
      databaseApplyAuthorized: false,
      stripeDispatchAuthorized: false,
      paymentAuthorized: false,
      orderAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps one immutable 103 plan into the exact prepare RPC", async () => {
    const result = {
      decision: "created",
      attempt_id: attemptId,
      attempt_state: "prepared",
      attempt_revision: 0,
      state_receipt_sha256: digest("9"),
      ...authorityReceipt,
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );

    await expect(persistence.prepare(prepareInput())).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.prepare,
      {
        p_plan_id: planId,
        p_plan_sha256: digest("1"),
        p_execution_workflow_sha256: digest("2"),
        p_execution_prerequisite_sha256: digest("3"),
        p_dispatch_not_after: "2026-08-27T12:01:00.000Z",
      },
    );
  });

  it("claims only revision zero with a bounded digest lease", async () => {
    const result = {
      decision: "claimed",
      attempt_id: attemptId,
      attempt_state: "claimed",
      attempt_revision: 1,
      lease_expires_at: "2026-08-27T12:00:45.000Z",
      state_receipt_sha256: digest("a"),
      ...authorityReceipt,
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );

    await expect(persistence.claim(claimInput())).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.claim,
      {
        p_attempt_id: attemptId,
        p_expected_revision: 0,
        p_execution_scope_sha256: digest("4"),
        p_lease_token_sha256: digest("5"),
        p_lease_seconds: 60,
      },
    );
  });

  it("records a live completion while returning only the PaymentIntent digest", async () => {
    const result = {
      decision: "completed",
      attempt_id: attemptId,
      attempt_state: "completed",
      attempt_revision: 2,
      payment_intent_reference_sha256: digest("6"),
      state_receipt_sha256: digest("b"),
      ...authorityReceipt,
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );

    const receipt = await persistence.complete(completeInput());
    expect(receipt).toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.complete,
      {
        p_attempt_id: attemptId,
        p_expected_revision: 1,
        p_execution_scope_sha256: digest("4"),
        p_lease_token_sha256: digest("5"),
        p_payment_intent_reference_ciphertext: encryptedReference,
        p_payment_intent_reference_sha256: digest("6"),
        p_terminal_response_sha256: digest("7"),
        p_completion_evidence_sha256: digest("8"),
        p_livemode: true,
      },
    );
    expect(JSON.stringify(receipt)).not.toContain(encryptedReference);
  });

  it("terminally marks an unknown live mutation outcome without retry authority", async () => {
    const result = {
      decision: "ambiguous",
      attempt_id: attemptId,
      attempt_state: "ambiguous",
      attempt_revision: 2,
      ambiguity_code: "transport_outcome_unknown",
      state_receipt_sha256: digest("c"),
      ...authorityReceipt,
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );

    await expect(persistence.markAmbiguous({
      attemptId,
      expectedRevision: 1,
      executionScopeSha256: digest("4"),
      leaseTokenSha256: digest("5"),
      ambiguityCode: "transport_outcome_unknown",
      ambiguityEvidenceSha256: digest("d"),
      livemode: true,
    })).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.ambiguous,
      expect.objectContaining({
        p_expected_revision: 1,
        p_ambiguity_code: "transport_outcome_unknown",
        p_ambiguity_evidence_sha256: digest("d"),
        p_livemode: true,
      }),
    );
  });

  it.each([
    {
      state: "provider_present" as const,
      ciphertext: encryptedReference,
      referenceSha256: digest("6"),
      expectedRevision: 2 as const,
      receiptRevision: 3,
    },
    {
      state: "provider_absence_attested" as const,
      ciphertext: null,
      referenceSha256: null,
      expectedRevision: 1 as const,
      receiptRevision: 2,
    },
  ])("records terminal $state recovery without reopening", async (value) => {
    const result = {
      decision: "reconciled",
      attempt_id: attemptId,
      attempt_state: "reconciled",
      attempt_revision: value.receiptRevision,
      recovery_state: value.state,
      payment_intent_reference_sha256: value.referenceSha256,
      blind_retry_authorized: false,
      state_receipt_sha256: digest("e"),
      ...authorityReceipt,
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );

    await expect(persistence.recover({
      attemptId,
      expectedRevision: value.expectedRevision,
      executionScopeSha256: digest("4"),
      leaseTokenSha256: digest("5"),
      reconciliationState: value.state,
      reconciliationEvidenceSha256: digest("f"),
      recoveryEvidenceSha256: digest("0"),
      paymentIntentReferenceCiphertext: value.ciphertext,
      paymentIntentReferenceSha256: value.referenceSha256,
      livemode: true,
    })).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_EXECUTION_RPC.recover,
      expect.objectContaining({
        p_expected_revision: value.expectedRevision,
        p_reconciliation_state: value.state,
        p_payment_intent_reference_ciphertext: value.ciphertext,
        p_payment_intent_reference_sha256: value.referenceSha256,
        p_livemode: true,
      }),
    );
    expect(result.blind_retry_authorized).toBe(false);
    expect(result.attempt_state).not.toBe("prepared");
  });

  it("rejects plaintext, test-mode, extra, inconsistent, and reset inputs before RPC", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveStripeExecutionPersistence(
      client,
    );
    const invalidCompletions = [
      { ...completeInput(), livemode: false },
      {
        ...completeInput(),
        paymentIntentReferenceCiphertext: "pi_plaintext_not_allowed",
      },
      {
        ...completeInput(),
        paymentIntentReferenceCiphertext: `enc:v1:${"A".repeat(4090)}`,
      },
      { ...completeInput(), expectedRevision: 0 },
      { ...completeInput(), paymentMethodId: "pm_not_allowed" },
      { ...completeInput(), clientSecret: "pi_secret_not_allowed" },
    ];
    for (const input of invalidCompletions) {
      await expect(persistence.complete(input as never)).rejects
        .toMatchObject({ reason: "invalid_input" });
    }

    const invalidRecoveries = [
      {
        attemptId,
        expectedRevision: 2,
        executionScopeSha256: digest("4"),
        leaseTokenSha256: digest("5"),
        reconciliationState: "provider_present",
        reconciliationEvidenceSha256: digest("f"),
        recoveryEvidenceSha256: digest("0"),
        paymentIntentReferenceCiphertext: null,
        paymentIntentReferenceSha256: null,
        livemode: true,
      },
      {
        attemptId,
        expectedRevision: 2,
        executionScopeSha256: digest("4"),
        leaseTokenSha256: digest("5"),
        reconciliationState: "unresolved",
        reconciliationEvidenceSha256: digest("f"),
        recoveryEvidenceSha256: digest("0"),
        paymentIntentReferenceCiphertext: encryptedReference,
        paymentIntentReferenceSha256: digest("6"),
        livemode: true,
      },
    ];
    for (const input of invalidRecoveries) {
      await expect(persistence.recover(input as never)).rejects
        .toMatchObject({ reason: "invalid_input" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed or authority-bearing receipts", async () => {
    const unsafe = {
      decision: "created",
      attempt_id: attemptId,
      attempt_state: "prepared",
      attempt_revision: 0,
      state_receipt_sha256: digest("9"),
      ...authorityReceipt,
      order_authorized: true,
    };
    const { client } = clientReturning([unsafe]);
    await expect(createFlightConsumerLiveStripeExecutionPersistence(
      client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });

    const withCiphertext = {
      ...unsafe,
      order_authorized: false,
      payment_intent_reference_ciphertext: encryptedReference,
    };
    const second = clientReturning([withCiphertext]);
    await expect(createFlightConsumerLiveStripeExecutionPersistence(
      second.client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("normalizes RPC exceptions, database errors, and cardinality drift", async () => {
    const throwingClient: FlightConsumerLiveStripeExecutionRpcClient = {
      async rpc() {
        throw new Error("private database detail");
      },
    };
    await expect(createFlightConsumerLiveStripeExecutionPersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toEqual(
      new FlightConsumerLiveStripeExecutionPersistenceError("rpc_refused"),
    );

    const errorClient: FlightConsumerLiveStripeExecutionRpcClient = {
      async rpc() {
        return { data: null, error: { code: "P0001" } };
      },
    };
    await expect(createFlightConsumerLiveStripeExecutionPersistence(
      errorClient,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "rpc_refused",
      message: expect.not.stringContaining("P0001"),
    });

    const empty = clientReturning([]);
    await expect(createFlightConsumerLiveStripeExecutionPersistence(
      empty.client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("has no route, provider SDK, transport, environment, or database client", () => {
    const sourcePath = join(
      "lib",
      "flights",
      "consumer-production",
      "stripe-live-payment-execution-persistence.server.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    const applicationSource = appSourceFiles("app")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.env\b/);
    expect(source).not.toMatch(
      /paymentIntents\.(?:create|capture|cancel|retrieve)|refunds\.create|webhooks\.constructEvent/,
    );
    expect(source).not.toMatch(/createAdminClient|NextRequest|NextResponse/);
    expect(applicationSource)
      .not.toContain("stripe-live-payment-execution-persistence.server");
    expect(applicationSource)
      .not.toContain("createFlightConsumerLiveStripeExecutionPersistence");
  });
});
