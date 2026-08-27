import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveStripeConfirmationPersistence,
  FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC,
  FlightConsumerLiveStripeConfirmationPersistenceError,
  type FlightConsumerLiveStripeConfirmationRpcClient,
} from "../lib/flights/consumer-production/stripe-confirmation-evidence-persistence.server";

const digest = (character: string) => character.repeat(64);
const checkoutId = "00000000-0000-4000-8000-000000000107";
const executionId = "00000000-0000-4000-8000-000000000106";
const attemptId = "00000000-0000-4000-8000-000000000109";

const authorityReceipt = Object.freeze({
  confirmation_handoff_authorized: false,
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
    stripeExecutionAttemptId: executionId,
    executionScopeSha256: digest("1"),
    idempotencySha256: digest("2"),
    confirmationBindingSha256: digest("3"),
    confirmationWorkflowSha256: digest("4"),
    confirmationPrerequisiteSha256: digest("5"),
    checkoutStateReceiptSha256: digest("6"),
    stripeExecutionCompletedReceiptSha256: digest("7"),
    confirmationNotAfter: "2026-08-27T13:05:00.000Z",
  };
}

function claimInput() {
  return {
    attemptId,
    expectedRevision: 0 as const,
    executionScopeSha256: digest("1"),
    confirmationBindingSha256: digest("3"),
    handoffTokenSha256: digest("8"),
    handoffSeconds: 120,
    confirmationRequestSha256: digest("9"),
  };
}

function terminalInput() {
  return {
    attemptId,
    expectedRevision: 1 as const,
    executionScopeSha256: digest("1"),
    confirmationBindingSha256: digest("3"),
    handoffTokenSha256: digest("8"),
    terminalState: "authorized_requires_capture" as const,
    observedPaymentIntentStatus: "requires_capture" as const,
    observedAmountCents: 54_321,
    observedCurrency: "usd" as const,
    observedLivemode: true as const,
    observedPaymentIntentReferenceSha256: digest("a"),
    providerResponseSha256: digest("b"),
    confirmationEvidenceSha256: digest("c"),
    webhookEventSha256: null,
    retrievalEvidenceSha256: digest("d"),
    failureCode: null,
    failureEvidenceSha256: null,
    livemode: true as const,
  };
}

function baseResult(
  confirmationState: "prepared" | "handoff_claimed" | "authorized_requires_capture" | "failed" | "ambiguous" | "reconciled",
  confirmationRevision: 0 | 1 | 2 | 3,
  reconciledOutcome: "authorized_requires_capture" | "failed" | "unresolved" | null = null,
) {
  return {
    attempt_id: attemptId,
    confirmation_state: confirmationState,
    confirmation_revision: confirmationRevision,
    amount_cents: 54_321,
    currency: "USD",
    payment_intent_reference_sha256: digest("a"),
    state_receipt_sha256: digest("e"),
    reconciled_outcome: reconciledOutcome,
    ...authorityReceipt,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as FlightConsumerLiveStripeConfirmationRpcClient,
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

describe("Flight Consumer Production Stripe confirmation evidence persistence", () => {
  it("declares a frozen Production-dark, zero-authority boundary", () => {
    const persistence = createFlightConsumerLiveStripeConfirmationPersistence(
      clientReturning(null).client,
    );
    expect(FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_MIGRATION_VERSION)
      .toBe("202608260109");
    expect(FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_stripe_confirmation_v1",
      claim: "claim_flight_consumer_live_stripe_confirmation_handoff_v1",
      terminal: "record_flight_consumer_live_stripe_confirmation_terminal_v1",
      ambiguous: "mark_flight_consumer_live_stripe_confirmation_ambiguous_v1",
      reconcile: "reconcile_flight_consumer_live_stripe_confirmation_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-live-stripe-confirmation-persistence-v1",
      productionDark: true,
      routeExposed: false,
      stripeTransportImplemented: false,
      clientSecretStored: false,
      paymentMethodStored: false,
      providerPayloadStored: false,
      databaseApplyAuthorized: false,
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
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps exact 106/107 bindings to prepare and one bounded handoff to claim", async () => {
    const prepared = { decision: "created", ...baseResult("prepared", 0) };
    const first = clientReturning([prepared]);
    const persistence = createFlightConsumerLiveStripeConfirmationPersistence(
      first.client,
    );
    await expect(persistence.prepare(prepareInput())).resolves.toEqual(prepared);
    expect(first.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.prepare,
      {
        p_checkout_aggregate_id: checkoutId,
        p_stripe_execution_attempt_id: executionId,
        p_execution_scope_sha256: digest("1"),
        p_idempotency_sha256: digest("2"),
        p_confirmation_binding_sha256: digest("3"),
        p_confirmation_workflow_sha256: digest("4"),
        p_confirmation_prerequisite_sha256: digest("5"),
        p_checkout_state_receipt_sha256: digest("6"),
        p_stripe_execution_completed_receipt_sha256: digest("7"),
        p_confirmation_not_after: "2026-08-27T13:05:00.000Z",
      },
    );

    const claimed = { decision: "claimed", ...baseResult("handoff_claimed", 1) };
    const second = clientReturning([claimed]);
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      second.client,
    ).claim(claimInput())).resolves.toEqual(claimed);
    expect(second.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.claim,
      expect.objectContaining({
        p_expected_revision: 0,
        p_handoff_seconds: 120,
        p_confirmation_request_sha256: digest("9"),
      }),
    );
  });

  it("maps structured requires-capture facts and digest-only observations", async () => {
    const authorized = {
      decision: "recorded",
      ...baseResult("authorized_requires_capture", 2),
    };
    const { client, rpc } = clientReturning([authorized]);
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      client,
    ).recordTerminal(terminalInput())).resolves.toEqual(authorized);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.terminal,
      expect.objectContaining({
        p_terminal_state: "authorized_requires_capture",
        p_observed_payment_intent_status: "requires_capture",
        p_observed_amount_cents: 54_321,
        p_observed_currency: "usd",
        p_observed_livemode: true,
        p_observed_payment_intent_reference_sha256: digest("a"),
        p_provider_response_sha256: digest("b"),
        p_confirmation_evidence_sha256: digest("c"),
        p_retrieval_evidence_sha256: digest("d"),
        p_livemode: true,
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/client_secret|pm_|card_number/);
  });

  it("maps ambiguity and evidence-only reconciliation with nullable fact semantics", async () => {
    const ambiguous = { decision: "ambiguous", ...baseResult("ambiguous", 2) };
    const first = clientReturning([ambiguous]);
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      first.client,
    ).markAmbiguous({
      attemptId,
      expectedRevision: 1,
      executionScopeSha256: digest("1"),
      confirmationBindingSha256: digest("3"),
      handoffTokenSha256: digest("8"),
      ambiguityCode: "transport_outcome_unknown",
      ambiguityEvidenceSha256: digest("f"),
      livemode: true,
    })).resolves.toEqual(ambiguous);

    const reconciled = {
      decision: "reconciled",
      ...baseResult("reconciled", 3, "unresolved"),
    };
    const second = clientReturning([reconciled]);
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      second.client,
    ).reconcile({
      attemptId,
      expectedRevision: 2,
      executionScopeSha256: digest("1"),
      confirmationBindingSha256: digest("3"),
      reconciledOutcome: "unresolved",
      observedPaymentIntentStatus: null,
      observedAmountCents: null,
      observedCurrency: null,
      observedLivemode: null,
      observedPaymentIntentReferenceSha256: null,
      providerResponseSha256: null,
      confirmationEvidenceSha256: null,
      webhookEventSha256: null,
      retrievalEvidenceSha256: digest("0"),
      failureCode: null,
      failureEvidenceSha256: null,
      reconciliationEvidenceSha256: digest("1"),
      livemode: true,
    })).resolves.toEqual(reconciled);
    expect(second.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_RPC.reconcile,
      expect.objectContaining({
        p_reconciled_outcome: "unresolved",
        p_observed_payment_intent_status: null,
        p_observed_amount_cents: null,
        p_observed_livemode: null,
      }),
    );
  });

  it("rejects secret fields, wrong revisions, unsafe fact assertions, and digest reuse before RPC", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveStripeConfirmationPersistence(
      client,
    );
    for (const invalid of [
      { ...prepareInput(), clientSecret: "pi_secret_plaintext" },
      { ...prepareInput(), paymentMethod: "pm_plaintext" },
      { ...prepareInput(), confirmationWorkflowSha256: digest("3") },
    ]) {
      await expect(persistence.prepare(invalid as never)).rejects.toMatchObject({
        reason: "invalid_input",
      });
    }
    await expect(persistence.claim({
      ...claimInput(),
      expectedRevision: 1,
    } as never)).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.recordTerminal({
      ...terminalInput(),
      observedPaymentIntentStatus: "requires_action",
    } as never)).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.recordTerminal({
      ...terminalInput(),
      retrievalEvidenceSha256: null,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.recordTerminal({
      ...terminalInput(),
      providerResponseSha256: terminalInput().confirmationEvidenceSha256,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects authority-bearing or malformed receipts and normalizes RPC failures", async () => {
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      clientReturning([{
        decision: "created",
        ...baseResult("prepared", 0),
        capture_authorized: true,
      }]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({ reason: "invalid_result" });

    const throwingClient: FlightConsumerLiveStripeConfirmationRpcClient = {
      async rpc() {
        throw new Error("private detail");
      },
    };
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toEqual(
      new FlightConsumerLiveStripeConfirmationPersistenceError("rpc_refused"),
    );
    await expect(createFlightConsumerLiveStripeConfirmationPersistence(
      clientReturning([]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({ reason: "invalid_result" });
  });

  it("is server-only, transport-free, env-free, and absent from public routes", () => {
    const moduleName = "stripe-confirmation-evidence-persistence.server";
    const source = readFileSync(
      `lib/flights/consumer-production/${moduleName}.ts`,
      "utf8",
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from ["']stripe["']/);
    expect(source).not.toMatch(/from ["']@supabase\/supabase-js["']/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("process.env");
    for (const path of appSourceFiles("app")) {
      expect(readFileSync(path, "utf8"), path).not.toContain(moduleName);
    }
  });
});
