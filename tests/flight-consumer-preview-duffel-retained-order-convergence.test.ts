import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  completeFlightConsumerPreviewDuffelRetainedOrderCheckoutReplay,
  executeFlightConsumerPreviewDuffelRetainedOrderConvergence,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_FAILED_ORDER_CREATED_EVENTS_LIST_URL,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_CONVERGENCE_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_LIST_URL,
  FlightConsumerPreviewDuffelWebhookBootstrapError,
  readFlightConsumerPreviewDuffelRetainedOrderTarget,
  type FlightConsumerPreviewDuffelRetainedOrderConvergenceDependencies,
  type FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
} from "../lib/flights/consumer-preview/duffel-webhook-bootstrap.server";
import { FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS } from "../lib/flights/consumer-preview/duffel-webhook.server";
import { createAdminClient } from "../lib/supabase/admin";

const actorId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";
const attemptId = "497887f8-61d7-4efe-b377-8002046d554b";
const ledgerId = "b0c13dde-4b5e-42e1-baad-0871f09729c6";
const eventId = "wev_0000A3tQSmKyqOrcySrGbo";
const providerOrderId = "ord_0000ABd6wggSct7BoraU1o";
const eventIdSha256 =
  "2dae01ccc165801e723f873c57b87c2bfe163854e034aa989b491a1c75ef21fc";
const idempotencySha256 =
  "b2144674d5aea77874690139cb7f93148fa7fa8c9e06f91c9a1e0832d707dc88";
const providerOrderRefSha256 =
  "2d441f12b7684529ad06e83e399afabe46dd6ac5404a2e51750eca3408ff53af";
const providerOfferRefSha256 =
  "82f8a62c9b72b9a469f56d1e9c0ddeef0d726ecda2ef86902081034097378c24";
const scopeSha256 = "a".repeat(64);
const runtimeReceiptSha256 = "b".repeat(64);
const recoveryReceiptSha256 =
  "69365626a4aa1cf92edf5f2b0ee47fcbb65cfe0b600bad283783d1d68a97986e";
const verificationReceiptSha256 =
  "6c2e5bd585a3d24929f73b73a155835950ec63a4f42261d98b206e080d74aaf9";
const retentionExpiresAt = "2026-09-03T06:36:45.402+00:00";
const reconciliationCaseId = "33333333-3333-4333-8333-333333333333";
const bypassSecret = "preview_bypass_secret_1234567890";
const appOrigin = "https://iratepilot-consumer-flights-preview.vercel.app";
const receiverUrl = `${appOrigin}/api/flights/preview/webhooks/duffel?x-vercel-protection-bypass=${bypassSecret}`;

const runtime = Object.freeze({
  authorized: true as const,
  mode: "flight_consumer_preview_test" as const,
  reasons: Object.freeze([]),
  binding: Object.freeze({
    executionScopeSha256: scopeSha256,
    runtimeControlReceiptSha256: runtimeReceiptSha256,
  }),
});

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: appOrigin,
    DUFFEL_TEST_ACCESS_TOKEN: "duffel_test_1234567890abcdef",
    FLIGHT_CONSUMER_PREVIEW_PROVIDER_WEBHOOK_BYPASS_SECRET: bypassSecret,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    events: [...FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS],
    id: "end_0000A3tQSmKyqOrcySrGbo",
    live_mode: false,
    url: receiverUrl,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "v2",
    created_at: "2026-08-27 06:36:43.834000+00:00",
    id: eventId,
    idempotency_key: providerOrderId,
    live_mode: false,
    type: "order.created",
    ...overrides,
  };
}

function list(data: unknown[], after: string | null = null) {
  return jsonResponse({ data, meta: { after, before: null, limit: 200 } });
}

function input(confirmation =
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_CONVERGENCE_CONFIRMATION) {
  return { actorId, confirmation, idempotencyKey: correlationId };
}

function harness(options: Readonly<{
  events?: unknown[];
  eventAfter?: string | null;
  eventResponse?: Response;
  completeCheckoutReplay?: ReturnType<typeof vi.fn>;
  readTarget?: ReturnType<typeof vi.fn>;
  sha256?: (value: string) => string;
  webhookRows?: unknown[];
}> = {}) {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(list(options.webhookRows ?? [webhook()]))
    .mockResolvedValueOnce(options.eventResponse
      ?? list(options.events ?? [event()], options.eventAfter ?? null));
  const requireRuntime = vi.fn().mockResolvedValue(runtime);
  const readTarget = options.readTarget ?? vi.fn().mockResolvedValue({
    executionScopeSha256: scopeSha256,
    orderStatus: "requires_review",
    issuedTicketCount: 0,
  });
  const converge = vi.fn().mockResolvedValue({
    orderId: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
    status: "ticketed",
    issuedTicketCount: 1,
    reconciliationCaseId: "33333333-3333-4333-8333-333333333333",
    webhookLeaseCompletionRequired: false,
  });
  const createConvergence = vi.fn(() => ({ converge }));
  const completeCheckoutReplay = options.completeCheckoutReplay ?? vi.fn().mockResolvedValue({
    issuedTicketCount: 1,
  });
  const operatorRpc = vi.fn();
  const operatorClient = { rpc: operatorRpc } as unknown as
    FlightConsumerPreviewDuffelRetainedOrderOperatorClient;
  const sha256 = options.sha256 ?? ((value: string) => {
    if (value === eventId) return eventIdSha256;
    if (value === providerOrderId) return idempotencySha256;
    return "f".repeat(64);
  });
  const dependencies = {
    env: environment(),
    fetcher: fetcher as unknown as typeof fetch,
    sha256,
    providerOrderReferenceSha256: (value: string) =>
      value === providerOrderId ? providerOrderRefSha256 : "e".repeat(64),
    requireRuntime,
    readTarget,
    createConvergence,
    completeCheckoutReplay,
  } as unknown as FlightConsumerPreviewDuffelRetainedOrderConvergenceDependencies;
  return {
    completeCheckoutReplay,
    converge,
    createConvergence,
    dependencies,
    fetcher,
    operatorClient,
    operatorRpc,
    readTarget,
    requireRuntime,
  };
}

describe("fixed retained-evidence Duffel TEST order convergence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T07:05:07.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes only the exact durable checkout replay and never authorizes redispatch", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        decision: "replayed",
        lease_revision: 2,
        lease_state: "completed",
        lease_token_sha256: null,
        lease_expires_at: null,
        order_status: "ticketed",
        issued_ticket_count: 1,
        provider_attempt_state: "succeeded",
        provider_attempt_revision: 2,
        payment_attempt_state: "succeeded",
        payment_attempt_revision: 2,
        provider_redispatch_authorized: false,
      }],
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    await expect(
      completeFlightConsumerPreviewDuffelRetainedOrderCheckoutReplay(runtime as never),
    ).resolves.toEqual({ issuedTicketCount: 1 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "acquire_flight_consumer_completion_lease_v1",
      expect.objectContaining({
        p_customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
        p_order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
        p_idempotency_key_sha256:
          "89ab257265cabd16255cf6b86d078d57a8ea62ebde302a32eab634c8397fc797",
        p_request_sha256:
          "22f61c203268825572491b17f2e5e84737b0827254cfba145b35aefdede193e5",
        p_execution_scope_sha256: scopeSha256,
        p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_lease_duration_seconds: 60,
      }),
    );

    rpc.mockResolvedValueOnce({
      data: [{
        decision: "replayed",
        lease_revision: 2,
        lease_state: "completed",
        lease_token_sha256: null,
        lease_expires_at: null,
        order_status: "ticketed",
        issued_ticket_count: 1,
        provider_attempt_state: "succeeded",
        provider_attempt_revision: 2,
        payment_attempt_state: "succeeded",
        payment_attempt_revision: 2,
        provider_redispatch_authorized: true,
      }],
      error: null,
    });
    await expect(
      completeFlightConsumerPreviewDuffelRetainedOrderCheckoutReplay(runtime as never),
    ).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelWebhookBootstrapError);
  });

  it("exercises the production read-only target projection and exact signed replay/payment/evidence bindings", async () => {
    const adminRpc = vi.fn(async (name: string, _parameters?: unknown) => {
      void _parameters;
      if (name === "get_flight_consumer_async_duffel_convergence_lease_bound_v1") {
        return { data: [{
          order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
          customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
          order_status: "requires_review",
          execution_scope_sha256: scopeSha256,
          provider_attempt_id: attemptId,
          provider_attempt_state: "succeeded",
          provider_attempt_revision: 2,
          ledger_id: ledgerId,
          ledger_state: "processed",
          ledger_revision: 2,
          provider_offer_ref_sha256: providerOfferRefSha256,
          provider_order_ref_sha256: providerOrderRefSha256,
          recovery_evidence_receipt_sha256: recoveryReceiptSha256,
          recovery_retention_expires_at: retentionExpiresAt,
          reconciliation_case_id: reconciliationCaseId,
          reconciliation_case_status: "open",
          reconciliation_resolution_code: null,
          reconciliation_resolution_actor_type: null,
          reconciliation_system_receipt_sha256: null,
          reconciliation_updated_at: "2026-08-27T06:37:00.000Z",
          issued_ticket_count: 0,
        }], error: null };
      }
      if (name === "resolve_flight_consumer_duffel_webhook_replay_v1") {
        return { data: [{
          replay_found: true,
          order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
          customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
          provider_attempt_id: attemptId,
          order_status: "requires_review",
          execution_scope_sha256: scopeSha256,
        }], error: null };
      }
      if (name === "load_flight_consumer_duffel_order_recovery_evidence_v1") {
        return { data: [{
          ledger_id: ledgerId,
          attempt_id: attemptId,
          order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
          customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
          execution_scope_sha256: scopeSha256,
          provider_offer_ref_sha256: providerOfferRefSha256,
          provider_order_ref_sha256: providerOrderRefSha256,
          webhook_verification_receipt_sha256: verificationReceiptSha256,
          recovery_evidence_receipt_sha256: recoveryReceiptSha256,
          retention_expires_at: retentionExpiresAt,
        }], error: null };
      }
      if (name === "get_flight_consumer_duffel_recovery_evidence_observation_v1") {
        return { data: [{ created_at: "2026-08-27T06:36:45.402Z" }], error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: adminRpc } as never);
    const operatorRpc = vi.fn().mockResolvedValue({ data: [{
      case_id: reconciliationCaseId,
      order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
      customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
      order_status: "requires_review",
      payment_id: "a9bc4fa2-d088-4712-9f84-a255436efdfb",
      payment_status: "captured",
      provider_attempt_id: attemptId,
      provider_attempt_state: "succeeded",
      provider_attempt_revision: 2,
      authorized_cents: "42500",
      captured_cents: "42500",
      refunded_cents: "0",
      total_cents: "42500",
      currency: "USD",
      ticket_count: 0,
      execution_scope_sha256: scopeSha256,
    }], error: null });

    await expect(readFlightConsumerPreviewDuffelRetainedOrderTarget(
      runtime as never,
      { rpc: operatorRpc } as unknown as
        FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
    )).resolves.toEqual({
      executionScopeSha256: scopeSha256,
      orderStatus: "requires_review",
      issuedTicketCount: 0,
    });
    expect(adminRpc.mock.calls.map((call) => call[0])).toEqual([
      "get_flight_consumer_async_duffel_convergence_lease_bound_v1",
      "resolve_flight_consumer_duffel_webhook_replay_v1",
      "load_flight_consumer_duffel_order_recovery_evidence_v1",
      "get_flight_consumer_duffel_recovery_evidence_observation_v1",
    ]);
    expect(adminRpc.mock.calls[1][1]).toMatchObject({
      p_event_id_sha256: eventIdSha256,
      p_idempotency_sha256: idempotencySha256,
      p_verification_receipt_sha256: verificationReceiptSha256,
      p_provider_order_ref_sha256: providerOrderRefSha256,
      p_provider_offer_ref_sha256: providerOfferRefSha256,
    });
    expect(operatorRpc).toHaveBeenCalledWith(
      "get_flight_consumer_admin_reconciliation_v1",
      { p_case_id: reconciliationCaseId },
    );

    adminRpc.mockImplementationOnce(async () => ({ data: [{
      order_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
      customer_id: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
      order_status: "requires_review",
      execution_scope_sha256: scopeSha256,
      provider_attempt_id: attemptId,
      provider_attempt_state: "succeeded",
      provider_attempt_revision: 2,
      ledger_id: ledgerId,
      ledger_state: "processed",
      ledger_revision: 2,
      provider_offer_ref_sha256: "f".repeat(64),
      provider_order_ref_sha256: providerOrderRefSha256,
      recovery_evidence_receipt_sha256: recoveryReceiptSha256,
      recovery_retention_expires_at: retentionExpiresAt,
      reconciliation_case_id: reconciliationCaseId,
      reconciliation_case_status: "open",
      reconciliation_resolution_code: null,
      reconciliation_resolution_actor_type: null,
      reconciliation_system_receipt_sha256: null,
      reconciliation_updated_at: "2026-08-27T06:37:00.000Z",
      issued_ticket_count: 0,
    }], error: null }));
    await expect(readFlightConsumerPreviewDuffelRetainedOrderTarget(
      runtime as never,
      { rpc: operatorRpc } as unknown as
        FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
    )).rejects.toMatchObject({ kind: "conflict" });
  });

  it("uses only two exact Duffel GETs, revalidates ACTIVE state, and converges the processed ledger with a null lease", async () => {
    const test = harness();
    const result = await executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(),
      test.operatorClient,
      test.dependencies,
    );

    expect(result).toEqual({
      decision: "locally_converged",
      mode: "duffel_test_mode",
      status: "ticketed",
      issuedTicketCount: 1,
      completionLeaseState: "completed",
    });
    expect(test.fetcher).toHaveBeenCalledTimes(2);
    expect(test.fetcher.mock.calls.map((call) => call[0])).toEqual([
      FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_LIST_URL,
      FLIGHT_CONSUMER_PREVIEW_DUFFEL_FAILED_ORDER_CREATED_EVENTS_LIST_URL,
    ]);
    for (const [, request] of test.fetcher.mock.calls) {
      expect(request).toMatchObject({
        method: "GET",
        cache: "no-store",
        redirect: "error",
      });
      expect(request.body).toBeUndefined();
      const headers = new Headers(request.headers);
      expect(headers.get("duffel-version")).toBe("v2");
      expect(headers.get("x-client-correlation-id")).toBe(correlationId);
      expect(headers.has("content-type")).toBe(false);
    }
    expect(test.requireRuntime).toHaveBeenCalledTimes(2);
    expect(test.readTarget).toHaveBeenCalledTimes(2);
    expect(test.operatorRpc).not.toHaveBeenCalled();
    expect(test.createConvergence).toHaveBeenCalledWith(runtime);
    expect(test.converge).toHaveBeenCalledWith({
      customerId: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.customerId,
      orderId: FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET.orderId,
      attemptId,
      ledgerId,
      leaseTokenSha256: null,
      providerOrderId,
      providerOrderRefSha256,
      providerOfferRefSha256,
    });
    expect(test.completeCheckoutReplay).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(JSON.stringify(result)).not.toMatch(
      /wev_|ord_|b0c13dde|duffel_test_1234567890abcdef/,
    );
  });

  it("fails closed on ambiguous partial digest matches before local convergence", async () => {
    const secondEventId = "wev_0000B4tQSmKyqOrcySrGbo";
    const test = harness({
      events: [event(), event({ id: secondEventId })],
      sha256: (value) => {
        if (value === eventId || value === secondEventId) return eventIdSha256;
        if (value === providerOrderId) return idempotencySha256;
        return "f".repeat(64);
      },
    });
    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), test.operatorClient, test.dependencies,
    )).rejects.toMatchObject({ kind: "conflict" });
    expect(test.converge).not.toHaveBeenCalled();
  });

  it("rejects live-mode, wrong-version, and digest-mismatched event candidates", async () => {
    for (const events of [
      [event({ live_mode: true })],
      [event({ api_version: "v1" })],
      [event({ id: "wev_0000WrongDigestEvent", idempotency_key: "ord_0000WrongDigestOrder" })],
    ]) {
      const test = harness({ events });
      await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
        input(), test.operatorClient, test.dependencies,
      )).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelWebhookBootstrapError);
      expect(test.converge).not.toHaveBeenCalled();
    }
  });

  it("does not contact Duffel when the durable target projection is wrong", async () => {
    const readTarget = vi.fn().mockRejectedValue(
      new FlightConsumerPreviewDuffelWebhookBootstrapError("conflict"),
    );
    const test = harness({ readTarget });
    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), test.operatorClient, test.dependencies,
    )).rejects.toMatchObject({ kind: "conflict" });
    expect(test.fetcher).not.toHaveBeenCalled();
    expect(test.converge).not.toHaveBeenCalled();
    expect(test.operatorRpc).not.toHaveBeenCalled();
  });

  it("rejects incomplete pagination and non-JSON response contracts", async () => {
    const paginated = harness({ eventAfter: "opaque-next-page" });
    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), paginated.operatorClient, paginated.dependencies,
    )).rejects.toMatchObject({ kind: "unavailable" });
    expect(paginated.converge).not.toHaveBeenCalled();

    const nonJson = harness({
      eventResponse: new Response("not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    });
    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), nonJson.operatorClient, nonJson.dependencies,
    )).rejects.toMatchObject({ kind: "unavailable" });
    expect(nonJson.converge).not.toHaveBeenCalled();
  });

  it("replays a terminal ticketed projection idempotently without any provider mutation", async () => {
    const readTarget = vi.fn().mockResolvedValue({
      executionScopeSha256: scopeSha256,
      orderStatus: "ticketed",
      issuedTicketCount: 1,
    });
    const test = harness({ readTarget });
    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), test.operatorClient, test.dependencies,
    )).resolves.toMatchObject({ decision: "locally_converged", status: "ticketed" });
    expect(test.converge).toHaveBeenCalledTimes(1);
    expect(test.converge.mock.calls[0][0].leaseTokenSha256).toBeNull();
    expect(test.fetcher.mock.calls.every((call) => call[1].method === "GET")).toBe(true);
  });

  it("fails closed when the durable checkout lease replay does not match the issued tickets", async () => {
    const completeCheckoutReplay = vi.fn().mockResolvedValue({ issuedTicketCount: 2 });
    const test = harness({ completeCheckoutReplay });

    await expect(executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
      input(), test.operatorClient, test.dependencies,
    )).rejects.toMatchObject({ kind: "conflict" });
    expect(test.converge).toHaveBeenCalledTimes(1);
    expect(completeCheckoutReplay).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(test.fetcher.mock.calls.every((call) => call[1].method === "GET")).toBe(true);
  });
});
