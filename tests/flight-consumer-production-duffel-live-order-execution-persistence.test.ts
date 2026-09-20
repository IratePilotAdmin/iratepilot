import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveDuffelOrderExecutionPersistence,
  FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC,
  FLIGHT_CONSUMER_LIVE_DUFFEL_SUPPORT_IDENTITY_MIGRATION_VERSION,
  FlightConsumerLiveDuffelOrderExecutionPersistenceError,
  type FlightConsumerLiveDuffelOrderExecutionRpcClient,
} from "../lib/flights/consumer-production/duffel-live-order-execution-persistence.server";

const digest = (character: string) => character.repeat(64);
const checkoutId = "00000000-0000-4000-8000-000000000107";
const refreshId = "00000000-0000-4000-8000-000000000105";
const attemptId = "00000000-0000-4000-8000-000000000108";
const encrypted = (character: string) => `enc:v1:${character.repeat(32)}`;

const authorityReceipt = Object.freeze({
  livemode: true,
  provider_dispatch_authorized: false,
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
    checkoutEvidenceAggregateId: checkoutId,
    checkoutExecutionScopeSha256: digest("1"),
    checkoutBindingSha256: digest("2"),
    checkoutStateReceiptSha256: digest("3"),
    offerRefreshAttemptId: refreshId,
    offerRefreshExecutionScopeSha256: digest("4"),
    offerBindingSha256: digest("5"),
    normalizedOfferSha256: digest("6"),
    offerTerminalResponseSha256: digest("7"),
    orderReferenceSha256: digest("8"),
    customerReferenceSha256: digest("9"),
    executionScopeSha256: digest("a"),
    idempotencySha256: digest("b"),
    orderExecutionBindingSha256: digest("c"),
    orderExecutionPrerequisiteSha256: digest("d"),
    orderRequestSha256: digest("e"),
    amountCents: 54_321,
    currency: "USD" as const,
    dispatchNotAfter: "2026-08-27T12:05:00.000Z",
  };
}

function claimInput() {
  return {
    attemptId,
    expectedRevision: 0 as const,
    executionScopeSha256: digest("a"),
    orderExecutionBindingSha256: digest("c"),
    orderRequestSha256: digest("e"),
    dispatchTokenSha256: digest("f"),
  };
}

function supportIdentityReadInput() {
  return {
    attemptId,
    executionScopeSha256: digest("a"),
    orderExecutionBindingSha256: digest("c"),
    orderRequestSha256: digest("e"),
  };
}

function successfulCompletionInput() {
  return {
    attemptId,
    expectedRevision: 1 as const,
    executionScopeSha256: digest("a"),
    orderExecutionBindingSha256: digest("c"),
    orderRequestSha256: digest("e"),
    dispatchTokenSha256: digest("f"),
    terminalState: "succeeded" as const,
    providerRequestCount: 1 as const,
    airOrdersPostCount: 1 as const,
    terminalErrorCode: null,
    terminalHttpStatus: 201,
    terminalResponseSha256: digest("1"),
    providerOrderReferenceCiphertext: encrypted("A"),
    providerOrderReferenceSha256: digest("2"),
    providerBookingReferenceCiphertext: encrypted("B"),
    providerBookingReferenceSha256: digest("3"),
    completionEvidenceSha256: digest("4"),
    ambiguityEvidenceSha256: null,
    clientCorrelationId: "flt_order_0000000000000001",
    clientCorrelationIdSha256: digest("5"),
    providerRequestId: "req_0000000000000001",
    providerRequestIdSha256: digest("6"),
  };
}

function ambiguousCompletionInput() {
  return {
    ...successfulCompletionInput(),
    terminalState: "ambiguous" as const,
    terminalErrorCode: "response_timeout",
    terminalHttpStatus: null,
    terminalResponseSha256: null,
    providerOrderReferenceCiphertext: null,
    providerOrderReferenceSha256: null,
    providerBookingReferenceCiphertext: null,
    providerBookingReferenceSha256: null,
    ambiguityEvidenceSha256: digest("5"),
    clientCorrelationId: "flt_order_0000000000000001",
    clientCorrelationIdSha256: digest("6"),
    providerRequestId: null,
    providerRequestIdSha256: null,
  };
}

function result(
  state: "prepared" | "dispatching" | "succeeded" | "failed"
    | "ambiguous" | "reconciled",
  revision: 0 | 1 | 2 | 3,
) {
  const terminal = state === "succeeded" || state === "reconciled";
  const dispatched = revision >= 2;
  return {
    attempt_id: attemptId,
    attempt_state: state,
    attempt_revision: revision,
    provider_order_reference_sha256: terminal ? digest("2") : null,
    provider_booking_reference_sha256: terminal ? digest("3") : null,
    provider_request_count: dispatched ? 1 : 0,
    air_orders_post_count: dispatched ? 1 : 0,
    state_receipt_sha256: digest("6"),
    ...authorityReceipt,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as FlightConsumerLiveDuffelOrderExecutionRpcClient,
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

describe("Flight Consumer Production Duffel live order persistence", () => {
  it("declares a dark, transport-free, zero-authority boundary", () => {
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      clientReturning(null).client,
    );
    expect(FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_MIGRATION_VERSION)
      .toBe("202608260108");
    expect(FLIGHT_CONSUMER_LIVE_DUFFEL_SUPPORT_IDENTITY_MIGRATION_VERSION)
      .toBe("202608260112");
    expect(FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_duffel_order_execution_v1",
      claim: "claim_flight_consumer_live_duffel_order_execution_v1",
      complete: "complete_flight_consumer_live_duffel_order_execution_v2",
      reconcile: "reconcile_flight_consumer_live_duffel_order_execution_v1",
      readSupportIdentity:
        "read_flight_consumer_live_duffel_order_support_identity_v1",
    });
    expect(persistence).toMatchObject({
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
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps an exact 105/107-bound prepare without plaintext evidence", async () => {
    const receipt = { decision: "created", ...result("prepared", 0) };
    const { client, rpc } = clientReturning([receipt]);
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      client,
    );
    await expect(persistence.prepare(prepareInput())).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.prepare,
      {
        p_checkout_evidence_aggregate_id: checkoutId,
        p_checkout_execution_scope_sha256: digest("1"),
        p_checkout_binding_sha256: digest("2"),
        p_checkout_state_receipt_sha256: digest("3"),
        p_offer_refresh_attempt_id: refreshId,
        p_offer_refresh_execution_scope_sha256: digest("4"),
        p_offer_binding_sha256: digest("5"),
        p_normalized_offer_sha256: digest("6"),
        p_offer_terminal_response_sha256: digest("7"),
        p_order_reference_sha256: digest("8"),
        p_customer_reference_sha256: digest("9"),
        p_execution_scope_sha256: digest("a"),
        p_idempotency_sha256: digest("b"),
        p_order_execution_binding_sha256: digest("c"),
        p_order_execution_prerequisite_sha256: digest("d"),
        p_order_request_sha256: digest("e"),
        p_amount_cents: 54_321,
        p_currency: "USD",
        p_dispatch_not_after: "2026-08-27T12:05:00.000Z",
      },
    );
  });

  it("maps one claim and returns a non-dispatch-authorizing replay decision", async () => {
    const receipt = { decision: "claimed", ...result("dispatching", 1) };
    const { client, rpc } = clientReturning([receipt]);
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      client,
    );
    await expect(persistence.claim(claimInput())).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.claim,
      {
        p_attempt_id: attemptId,
        p_expected_revision: 0,
        p_execution_scope_sha256: digest("a"),
        p_order_execution_binding_sha256: digest("c"),
        p_order_request_sha256: digest("e"),
        p_dispatch_token_sha256: digest("f"),
      },
    );
  });

  it("persists a successful outcome while returning only provider digests", async () => {
    const receipt = { decision: "succeeded", ...result("succeeded", 2) };
    const { client, rpc } = clientReturning([receipt]);
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      client,
    );
    const outcome = await persistence.complete(successfulCompletionInput());
    expect(outcome).toEqual(receipt);
    expect(JSON.stringify(outcome)).not.toContain(encrypted("A"));
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.complete,
      expect.objectContaining({
        p_terminal_state: "succeeded",
        p_provider_request_count: 1,
        p_air_orders_post_count: 1,
        p_provider_order_reference_ciphertext: encrypted("A"),
        p_provider_order_reference_sha256: digest("2"),
        p_client_correlation_id: "flt_order_0000000000000001",
        p_client_correlation_id_sha256: digest("5"),
        p_provider_request_id: "req_0000000000000001",
        p_provider_request_id_sha256: digest("6"),
      }),
    );
  });

  it("maps terminal ambiguity to reconciliation without a second POST", async () => {
    const ambiguous = {
      decision: "ambiguous",
      ...result("ambiguous", 2),
    };
    const first = clientReturning([ambiguous]);
    await expect(createFlightConsumerLiveDuffelOrderExecutionPersistence(
      first.client,
    ).complete(ambiguousCompletionInput())).resolves.toEqual(ambiguous);

    const reconciled = {
      decision: "reconciled",
      ...result("reconciled", 3),
    };
    const second = clientReturning([reconciled]);
    const reconcileInput = {
      attemptId,
      expectedRevision: 2 as const,
      executionScopeSha256: digest("a"),
      orderExecutionBindingSha256: digest("c"),
      dispatchTokenSha256: digest("f"),
      reconciliationOutcome: "succeeded" as const,
      reconciliationResponseSha256: digest("1"),
      reconciliationEvidenceSha256: digest("2"),
      providerOrderReferenceCiphertext: encrypted("A"),
      providerOrderReferenceSha256: digest("2"),
      providerBookingReferenceCiphertext: encrypted("B"),
      providerBookingReferenceSha256: digest("3"),
    };
    await expect(createFlightConsumerLiveDuffelOrderExecutionPersistence(
      second.client,
    ).reconcile(reconcileInput)).resolves.toEqual(reconciled);
    expect(second.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.reconcile,
      expect.not.objectContaining({ p_air_orders_post_count: 2 }),
    );
  });

  it("reads exact terminal support identity without adding dispatch authority", async () => {
    const receipt = {
      ...result("succeeded", 2),
      terminal_http_status: 201,
      client_correlation_id: "flt_order_0000000000000001",
      client_correlation_id_sha256: digest("5"),
      provider_request_id: "req_0000000000000001",
      provider_request_id_sha256: digest("6"),
    };
    const { client, rpc } = clientReturning([receipt]);
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      client,
    );
    await expect(persistence.readSupportIdentity(supportIdentityReadInput()))
      .resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_DUFFEL_ORDER_EXECUTION_RPC.readSupportIdentity,
      {
        p_attempt_id: attemptId,
        p_execution_scope_sha256: digest("a"),
        p_order_execution_binding_sha256: digest("c"),
        p_order_request_sha256: digest("e"),
      },
    );
    expect(receipt).toMatchObject({
      provider_dispatch_authorized: false,
      booking_authorized: false,
      payment_authorized: false,
      capture_authorized: false,
      consumer_release_enabled: false,
      blind_retry_authorized: false,
    });
  });

  it("rejects plaintext, counter drift, blind retry, and secret fields", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveDuffelOrderExecutionPersistence(
      client,
    );
    const invalid = [
      {
        ...successfulCompletionInput(),
        providerOrderReferenceCiphertext: "ord_plaintext",
      },
      { ...successfulCompletionInput(), airOrdersPostCount: 0 },
      {
        ...ambiguousCompletionInput(),
        providerOrderReferenceCiphertext: encrypted("A"),
        providerOrderReferenceSha256: digest("2"),
      },
      {
        ...successfulCompletionInput(),
        clientCorrelationId: null,
        clientCorrelationIdSha256: null,
      },
      {
        ...successfulCompletionInput(),
        providerRequestId: null,
        providerRequestIdSha256: null,
      },
      {
        ...ambiguousCompletionInput(),
        providerRequestId: "req_0000000000000001",
        providerRequestIdSha256: digest("7"),
      },
      { ...prepareInput(), clientSecret: "secret" },
      { ...prepareInput(), paymentMethodId: "pm_plaintext" },
      { ...claimInput(), expectedRevision: 1 },
    ];
    for (const input of invalid) {
      const method = "terminalState" in input
        ? persistence.complete.bind(persistence)
        : "dispatchTokenSha256" in input
          ? persistence.claim.bind(persistence)
          : persistence.prepare.bind(persistence);
      await expect(method(input as never)).rejects.toMatchObject({
        reason: "invalid_input",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects authority-bearing, ciphertext-bearing, and malformed receipts", async () => {
    const unsafe = {
      decision: "succeeded",
      ...result("succeeded", 2),
      payment_authorized: true,
    };
    await expect(createFlightConsumerLiveDuffelOrderExecutionPersistence(
      clientReturning([unsafe]).client,
    ).complete(successfulCompletionInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    await expect(createFlightConsumerLiveDuffelOrderExecutionPersistence(
      clientReturning([{
        ...unsafe,
        payment_authorized: false,
        provider_order_reference_ciphertext: encrypted("A"),
      }]).client,
    ).complete(successfulCompletionInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("normalizes RPC failures and stays server-only and absent from routes", async () => {
    const throwingClient: FlightConsumerLiveDuffelOrderExecutionRpcClient = {
      async rpc() {
        throw new Error("private database detail");
      },
    };
    await expect(createFlightConsumerLiveDuffelOrderExecutionPersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toEqual(
      new FlightConsumerLiveDuffelOrderExecutionPersistenceError(
        "rpc_refused",
      ),
    );

    const sourcePath =
      "lib/flights/consumer-production/duffel-live-order-execution-persistence.server.ts";
    const source = readFileSync(sourcePath, "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from ["']stripe["']/);
    expect(source).not.toMatch(/from ["']@supabase\/supabase-js["']/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("process.env");

    for (const path of appSourceFiles("app")) {
      const appSource = readFileSync(path, "utf8");
      expect(appSource, path).not.toContain(
        "duffel-live-order-execution-persistence.server",
      );
      expect(appSource, path).not.toContain(
        "prepare_flight_consumer_live_duffel_order_execution_v1",
      );
    }
  });
});
