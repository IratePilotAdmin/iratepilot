import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  createInjectedFlightConsumerPreviewDuffelWebhookWorkflow,
  FlightConsumerPreviewDuffelWebhookError,
  type FlightConsumerPreviewDuffelOrderConvergencePort,
  type FlightConsumerPreviewDuffelWebhookLedgerPort,
  verifyFlightConsumerPreviewDuffelPing,
} from "../lib/flights/consumer-preview/duffel-webhook.server";
import { sha256FlightConsumerPreviewReference } from "../lib/flights/consumer-preview/reference-crypto.server";

const secret = "duffel-preview-webhook-secret-123456";
const nowSeconds = 1_787_686_400;
const executionScopeSha256 = "a".repeat(64);
const orderId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";
const ledgerId = "00000000-0000-4000-8000-000000000004";
const reconciliationCaseId = "00000000-0000-4000-8000-000000000005";
const pendingLinkId = "00000000-0000-4000-8000-000000000006";

function eventBody(input: Readonly<{
  type?: string;
  liveMode?: boolean;
  orderId?: string;
  offerId?: string;
  createdAt?: string;
}> = {}) {
  return Buffer.from(JSON.stringify({
    id: "wev_0000A3tQSmKyqOrcySrGbo",
    api_version: "v2",
    type: input.type ?? "order.created",
    live_mode: input.liveMode ?? false,
    idempotency_key: "ord_0000ABd6wggSct7BoraU1o",
    created_at: input.createdAt ?? "2026-08-25T20:00:00.000Z",
    data: {
      object: {
        order_id: input.orderId ?? "ord_0000ABd6wggSct7BoraU1o",
        offer_id: input.offerId ?? "off_0000ABd6wggSct7BoraU1o",
      },
    },
  }), "utf8");
}

function signature(
  rawBody: Uint8Array,
  timestamp = nowSeconds,
  version: "v1" | "v2" = "v1",
) {
  const digest = createHmac("sha256", secret)
    .update(Buffer.from(`${timestamp}.`, "ascii"))
    .update(rawBody)
    .digest("hex");
  return `t=${timestamp},${version}=${digest}`;
}

function ledger(overrides: Partial<FlightConsumerPreviewDuffelWebhookLedgerPort> = {}) {
  return {
    resolveReplayLink: vi.fn(async () => []),
    resolveLink: vi.fn(async () => [{
      order_id: orderId,
      customer_id: customerId,
      provider_attempt_id: attemptId,
      order_status: "requires_review",
      execution_scope_sha256: executionScopeSha256,
    }]),
    recordLinked: vi.fn(async () => [{
      decision: "created",
      ledger_id: ledgerId,
      ledger_revision: 0,
      ledger_state: "verified",
    }]),
    recordUnlinked: vi.fn(async () => [{
      decision: "created",
      ledger_id: ledgerId,
      ledger_revision: 0,
      ledger_state: "verified",
    }]),
    enqueuePending: vi.fn(async () => []),
    resolvePending: vi.fn(async () => {
      throw new Error("pending association was not enqueued");
    }),
    claim: vi.fn(async (parameters) => [{
      ledger_id: ledgerId,
      ledger_revision: 1,
      ledger_state: "processing",
      processing_lease_token_sha256: parameters.p_lease_token_sha256,
      processing_lease_expires_at: "2026-08-25T20:01:00.000Z",
      processing_attempt_count: 1,
    }]),
    reclaim: vi.fn(async () => null),
    escalate: vi.fn(async (parameters) => [{
      decision: "created",
      reconciliation_case_id: reconciliationCaseId,
      order_id: orderId,
      event_type: parameters.p_expected_event_type,
      case_status: "open",
    }]),
    complete: vi.fn(async (parameters) => [{
      ledger_id: ledgerId,
      ledger_revision: 2,
      ledger_state: parameters.p_outcome,
    }]),
    ...overrides,
  } satisfies FlightConsumerPreviewDuffelWebhookLedgerPort;
}

function orderConvergence(
  overrides: Partial<FlightConsumerPreviewDuffelOrderConvergencePort> = {},
) {
  return {
    converge: vi.fn(async () => ({
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
      reconciliationCaseId: null,
      webhookLeaseCompletionRequired: false,
    })),
    ...overrides,
  } satisfies FlightConsumerPreviewDuffelOrderConvergencePort;
}

function workflow(
  port: FlightConsumerPreviewDuffelWebhookLedgerPort,
  convergence: FlightConsumerPreviewDuffelOrderConvergencePort = orderConvergence(),
  onOrderTicketed: (input: Readonly<{ customerId: string; orderId: string }>) => void = vi.fn(),
) {
  return createInjectedFlightConsumerPreviewDuffelWebhookWorkflow({
    executionScopeSha256,
    webhookSecret: secret,
    ledger: port,
    orderConvergence: convergence,
    onOrderTicketed,
    nowSeconds: () => nowSeconds,
  });
}

describe("Consumer Preview Duffel webhook", () => {
  it("verifies, links, journals, and acknowledges order.created without direct mutation", async () => {
    const port = ledger();
    const convergence = orderConvergence();
    const onOrderTicketed = vi.fn();
    const rawBody = eventBody();
    await expect(workflow(port, convergence, onOrderTicketed).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toEqual({
      version: "flight-consumer-preview-duffel-webhook-result-v1",
      decision: "processed",
      eventType: "order.created",
      linkedOrderId: orderId,
      reconciliationRequired: true,
      directMutationAuthorized: false,
    });
    expect(port.resolveLink).toHaveBeenCalledWith({
      providerOrderRefSha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_order",
        value: "ord_0000ABd6wggSct7BoraU1o",
      }),
      providerOfferRefSha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_offer",
        value: "off_0000ABd6wggSct7BoraU1o",
      }),
    });
    expect(port.recordLinked).toHaveBeenCalledWith(expect.objectContaining({
      p_event_type: "order.created",
      p_live_mode: false,
      p_provider_order_ref_sha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_order",
        value: "ord_0000ABd6wggSct7BoraU1o",
      }),
      p_provider_offer_ref_sha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_offer",
        value: "off_0000ABd6wggSct7BoraU1o",
      }),
    }));
    expect(port.recordUnlinked).not.toHaveBeenCalled();
    expect(port.claim).toHaveBeenCalledWith(expect.objectContaining({
      p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 60,
    }));
    expect(convergence.converge).toHaveBeenCalledWith(expect.objectContaining({
      customerId,
      orderId,
      attemptId,
      ledgerId,
      leaseTokenSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      providerOrderId: "ord_0000ABd6wggSct7BoraU1o",
    }));
    expect(vi.mocked(convergence.converge).mock.calls[0]![0].leaseTokenSha256)
      .toBe(vi.mocked(port.claim).mock.calls[0]![0].p_lease_token_sha256);
    expect(port.complete).not.toHaveBeenCalled();
    expect(port.escalate).not.toHaveBeenCalled();
    expect(onOrderTicketed).toHaveBeenCalledWith({ customerId, orderId });
  });

  it("closes a delayed order.created lease for an already-ticketed exact link without provider recovery", async () => {
    const port = ledger({
      resolveLink: vi.fn(async () => [{
        order_id: orderId,
        customer_id: customerId,
        provider_attempt_id: attemptId,
        order_status: "ticketed",
        execution_scope_sha256: executionScopeSha256,
      }]),
    });
    const convergence = orderConvergence({
      converge: vi.fn(async () => ({
        orderId,
        status: "ticketed",
        issuedTicketCount: 1,
        reconciliationCaseId: null,
        webhookLeaseCompletionRequired: true,
      })),
    });
    const rawBody = eventBody();

    await expect(workflow(port, convergence).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toMatchObject({ decision: "processed", linkedOrderId: orderId });

    expect(convergence.converge).toHaveBeenCalledWith(expect.objectContaining({
      leaseTokenSha256: vi.mocked(port.claim).mock.calls[0]![0].p_lease_token_sha256,
    }));
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_ledger_id: ledgerId,
      p_expected_revision: 1,
      p_lease_token_sha256: vi.mocked(port.claim).mock.calls[0]![0].p_lease_token_sha256,
      p_outcome: "processed",
      p_outcome_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it.each([
    "order.creation_failed",
    "air.order.changed",
    "order.airline_initiated_change_detected",
  ] as const)("opens one durable operational case before blocking %s", async (eventType) => {
    const port = ledger();
    const rawBody = eventBody({ type: eventType });
    await expect(workflow(port).ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({
        decision: "blocked",
        eventType,
        linkedOrderId: orderId,
      });
    expect(port.escalate).toHaveBeenCalledWith({
      p_ledger_id: ledgerId,
      p_expected_event_type: eventType,
      p_expected_semantic_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_expected_lease_token_sha256:
        vi.mocked(port.claim).mock.calls[0]![0].p_lease_token_sha256,
    });
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_outcome: "blocked",
      p_lease_token_sha256:
        vi.mocked(port.claim).mock.calls[0]![0].p_lease_token_sha256,
    }));
    expect(vi.mocked(port.escalate).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(port.complete).mock.invocationCallOrder[0]!);
  });

  it("durably blocks an authentic event that cannot be linked", async () => {
    const onOrderTicketed = vi.fn();
    const port = ledger({ resolveLink: vi.fn(async () => []) });
    const rawBody = eventBody();
    await expect(workflow(port, orderConvergence(), onOrderTicketed)
      .ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "blocked", linkedOrderId: null });
    expect(port.recordUnlinked).toHaveBeenCalledWith(expect.objectContaining({
      p_event_type: "order.created",
      p_live_mode: false,
      p_provider_order_ref_sha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_order",
        value: "ord_0000ABd6wggSct7BoraU1o",
      }),
      p_provider_offer_ref_sha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_offer",
        value: "off_0000ABd6wggSct7BoraU1o",
      }),
    }));
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_outcome: "blocked",
    }));
    expect(port.escalate).not.toHaveBeenCalled();
    expect(onOrderTicketed).not.toHaveBeenCalled();
  });

  it("defers an early order.created race and closes its exact replay from append-only linkage", async () => {
    const historicalUnlinked = {
      replay_found: true as const,
      order_id: null,
      customer_id: null,
      provider_attempt_id: null,
      order_status: null,
      execution_scope_sha256: executionScopeSha256,
    };
    const port = ledger({
      resolveReplayLink: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([historicalUnlinked]),
      resolveLink: vi.fn().mockResolvedValueOnce([]),
      recordUnlinked: vi.fn()
        .mockResolvedValueOnce([{
          decision: "created",
          ledger_id: ledgerId,
          ledger_revision: 0,
          ledger_state: "verified",
        }])
        .mockResolvedValueOnce([{
          decision: "replay",
          ledger_id: ledgerId,
          ledger_revision: 0,
          ledger_state: "verified",
        }]),
      enqueuePending: vi.fn()
        .mockResolvedValueOnce([{
          pending_link_id: pendingLinkId,
          pending_revision: 0,
          pending_state: "pending",
        }])
        .mockResolvedValueOnce([{
          pending_link_id: pendingLinkId,
          pending_revision: 1,
          pending_state: "linked",
        }]),
      resolvePending: vi.fn()
        .mockResolvedValueOnce([{
          pending_link_id: pendingLinkId,
          pending_revision: 0,
          pending_state: "pending",
          order_id: null,
          customer_id: null,
          provider_attempt_id: null,
          order_status: null,
          execution_scope_sha256: null,
        }])
        .mockResolvedValueOnce([{
          pending_link_id: pendingLinkId,
          pending_revision: 1,
          pending_state: "linked",
          order_id: orderId,
          customer_id: customerId,
          provider_attempt_id: attemptId,
          order_status: "ticketed",
          execution_scope_sha256: executionScopeSha256,
        }]),
    });
    const convergence = orderConvergence();
    const rawBody = eventBody();
    const created = workflow(port, convergence);

    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "deferred", linkedOrderId: null });
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(convergence.converge).not.toHaveBeenCalled();

    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "processed", linkedOrderId: orderId });
    expect(port.resolveLink).toHaveBeenCalledTimes(1);
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.recordUnlinked).toHaveBeenCalledTimes(2);
    expect(port.enqueuePending).toHaveBeenCalledTimes(2);
    expect(port.resolvePending).toHaveBeenNthCalledWith(1, {
      p_pending_link_id: pendingLinkId,
      p_expected_pending_revision: 0,
    });
    expect(port.resolvePending).toHaveBeenNthCalledWith(2, {
      p_pending_link_id: pendingLinkId,
      p_expected_pending_revision: 1,
    });
    expect(port.claim).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_ledger_id: ledgerId,
      p_outcome: "processed",
    }));
    expect(convergence.converge).not.toHaveBeenCalled();
  });

  it("relinks a historical terminal-unlinked replay without rewriting its envelope or refetching", async () => {
    const port = ledger({
      resolveReplayLink: vi.fn(async () => [{
        replay_found: true,
        order_id: null,
        customer_id: null,
        provider_attempt_id: null,
        order_status: null,
        execution_scope_sha256: executionScopeSha256,
      }]),
      resolveLink: vi.fn(async () => {
        throw new Error("historical replay must not consult mutable linkage");
      }),
      recordUnlinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 2,
        ledger_state: "blocked",
      }]),
      enqueuePending: vi.fn(async () => [{
        pending_link_id: pendingLinkId,
        pending_revision: 1,
        pending_state: "linked",
      }]),
      resolvePending: vi.fn(async () => [{
        pending_link_id: pendingLinkId,
        pending_revision: 1,
        pending_state: "linked",
        order_id: orderId,
        customer_id: customerId,
        provider_attempt_id: attemptId,
        order_status: "ticketed",
        execution_scope_sha256: executionScopeSha256,
      }]),
    });
    const convergence = orderConvergence();
    const rawBody = eventBody();

    await expect(workflow(port, convergence).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toMatchObject({ decision: "replayed", linkedOrderId: orderId });

    expect(port.resolveLink).not.toHaveBeenCalled();
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.recordUnlinked).toHaveBeenCalledTimes(1);
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(convergence.converge).not.toHaveBeenCalled();
  });

  it("keeps a failed, ambiguous, or digest-conflicting association in review without provider recovery", async () => {
    const port = ledger({
      resolveLink: vi.fn(async () => []),
      enqueuePending: vi.fn(async () => [{
        pending_link_id: pendingLinkId,
        pending_revision: 1,
        pending_state: "review",
      }]),
      resolvePending: vi.fn(async () => [{
        pending_link_id: pendingLinkId,
        pending_revision: 1,
        pending_state: "review",
        order_id: null,
        customer_id: null,
        provider_attempt_id: null,
        order_status: null,
        execution_scope_sha256: null,
      }]),
    });
    const convergence = orderConvergence();
    const rawBody = eventBody();

    await expect(workflow(port, convergence).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toMatchObject({ decision: "blocked", linkedOrderId: null });

    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_outcome: "blocked",
    }));
    expect(convergence.converge).not.toHaveBeenCalled();
  });

  it("replays the exact immutable unlinked envelope without mutable linkage", async () => {
    const historicalUnlinked = {
      replay_found: true as const,
      order_id: null,
      customer_id: null,
      provider_attempt_id: null,
      order_status: null,
      execution_scope_sha256: executionScopeSha256,
    };
    const port = ledger({
      resolveReplayLink: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([historicalUnlinked]),
      resolveLink: vi.fn()
        .mockResolvedValueOnce([])
        .mockRejectedValue(new Error("mutable linkage must not run on unlinked replay")),
      recordUnlinked: vi.fn()
        .mockResolvedValueOnce([{
          decision: "created",
          ledger_id: ledgerId,
          ledger_revision: 0,
          ledger_state: "verified",
        }])
        .mockResolvedValueOnce([{
          decision: "replay",
          ledger_id: ledgerId,
          ledger_revision: 2,
          ledger_state: "blocked",
        }]),
    });
    const rawBody = eventBody();
    const created = workflow(port);

    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "blocked", linkedOrderId: null });
    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "replayed", linkedOrderId: null });

    const expectedProviderOrderRefSha256 = sha256FlightConsumerPreviewReference({
      kind: "duffel_order",
      value: "ord_0000ABd6wggSct7BoraU1o",
    });
    const expectedProviderOfferRefSha256 = sha256FlightConsumerPreviewReference({
      kind: "duffel_offer",
      value: "off_0000ABd6wggSct7BoraU1o",
    });
    expect(port.resolveLink).toHaveBeenCalledTimes(1);
    expect(port.recordUnlinked).toHaveBeenCalledTimes(2);
    for (const [parameters] of vi.mocked(port.recordUnlinked).mock.calls) {
      expect(parameters).toMatchObject({
        p_event_type: "order.created",
        p_live_mode: false,
        p_provider_order_ref_sha256: expectedProviderOrderRefSha256,
        p_provider_offer_ref_sha256: expectedProviderOfferRefSha256,
      });
    }
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.claim).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
  });

  it("accepts a signed ping without writing the commerce ledger", async () => {
    const port = ledger();
    const rawBody = eventBody({ type: "ping.triggered" });
    await expect(workflow(port).ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "verified_ping", eventType: "ping.triggered" });
    expect(port.resolveLink).not.toHaveBeenCalled();
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.recordUnlinked).not.toHaveBeenCalled();
    expect(port.enqueuePending).not.toHaveBeenCalled();
    expect(port.resolvePending).not.toHaveBeenCalled();
  });

  it("verifies signed pings before activation without authorizing non-ping processing", () => {
    const ping = eventBody({ type: "ping.triggered" });
    expect(verifyFlightConsumerPreviewDuffelPing(
      { rawBody: ping, signature: signature(ping) },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toMatchObject({
      decision: "verified_ping",
      eventType: "ping.triggered",
      linkedOrderId: null,
      directMutationAuthorized: false,
    });

    expect(verifyFlightConsumerPreviewDuffelPing(
      { rawBody: ping, signature: signature(ping, nowSeconds, "v2") },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toMatchObject({
      decision: "verified_ping",
      eventType: "ping.triggered",
    });

    const order = eventBody();
    expect(verifyFlightConsumerPreviewDuffelPing(
      { rawBody: order, signature: signature(order) },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toBeNull();
    expect(() => verifyFlightConsumerPreviewDuffelPing(
      { rawBody: ping, signature: `t=${nowSeconds},v1=${"0".repeat(64)}` },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toThrow(FlightConsumerPreviewDuffelWebhookError);
  });

  it("fails preactivation ping verification closed for stale, live, or unconfigured input", () => {
    const ping = eventBody({ type: "ping.triggered" });
    expect(() => verifyFlightConsumerPreviewDuffelPing(
      { rawBody: ping, signature: signature(ping, nowSeconds - 301) },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toThrow(expect.objectContaining({ status: 400 }));

    const livePing = eventBody({ type: "ping.triggered", liveMode: true });
    expect(() => verifyFlightConsumerPreviewDuffelPing(
      { rawBody: livePing, signature: signature(livePing) },
      { webhookSecret: secret, nowSeconds: () => nowSeconds },
    )).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => verifyFlightConsumerPreviewDuffelPing(
      { rawBody: ping, signature: signature(ping) },
      { webhookSecret: "", nowSeconds: () => nowSeconds },
    )).toThrow(expect.objectContaining({ status: 503 }));
  });

  it("accepts a live-style v2 ping with six-digit created_at without any ledger operation", async () => {
    const port = ledger();
    const convergence = orderConvergence();
    const rawBody = eventBody({
      type: "ping.triggered",
      createdAt: "2026-08-25T20:00:00.123456Z",
    });

    await expect(workflow(port, convergence).ingest({
      rawBody,
      signature: signature(rawBody, nowSeconds, "v2"),
    })).resolves.toMatchObject({
      decision: "verified_ping",
      eventType: "ping.triggered",
      linkedOrderId: null,
    });

    expect(port.resolveReplayLink).not.toHaveBeenCalled();
    expect(port.resolveLink).not.toHaveBeenCalled();
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.recordUnlinked).not.toHaveBeenCalled();
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.reclaim).not.toHaveBeenCalled();
    expect(port.escalate).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(convergence.converge).not.toHaveBeenCalled();
  });

  it("fails closed on a bad signature, live event, or incomplete linkage payload", async () => {
    const port = ledger();
    const valid = eventBody();
    await expect(workflow(port).ingest({ rawBody: valid, signature: `t=${nowSeconds},v1=${"0".repeat(64)}` }))
      .rejects.toMatchObject({ status: 400 });
    const live = eventBody({ liveMode: true });
    await expect(workflow(port).ingest({ rawBody: live, signature: signature(live) }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewDuffelWebhookError);
    const incomplete = eventBody({ offerId: "invalid" });
    await expect(workflow(port).ingest({ rawBody: incomplete, signature: signature(incomplete) }))
      .rejects.toMatchObject({ status: 400 });
    expect(port.recordLinked).not.toHaveBeenCalled();
    expect(port.recordUnlinked).not.toHaveBeenCalled();
  });

  it("returns terminal replays without claiming or completing twice", async () => {
    const convergence = orderConvergence();
    const onOrderTicketed = vi.fn();
    const port = ledger({
      resolveReplayLink: vi.fn(async () => [{
        replay_found: true,
        order_id: orderId,
        customer_id: customerId,
        provider_attempt_id: attemptId,
        order_status: "ticketed",
        execution_scope_sha256: executionScopeSha256,
      }]),
      recordLinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 2,
        ledger_state: "processed",
      }]),
    });
    const rawBody = eventBody();
    await expect(workflow(port, convergence, onOrderTicketed)
      .ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "replayed" });
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(convergence.converge).toHaveBeenCalledWith(expect.objectContaining({
      leaseTokenSha256: null,
      ledgerId,
    }));
    expect(onOrderTicketed).toHaveBeenCalledWith({ customerId, orderId });
  });

  it("resumes retained convergence for a processed order.created replay still in review", async () => {
    const convergence = orderConvergence();
    const onOrderTicketed = vi.fn();
    const port = ledger({
      resolveReplayLink: vi.fn(async () => [{
        replay_found: true,
        order_id: orderId,
        customer_id: customerId,
        provider_attempt_id: attemptId,
        order_status: "requires_review",
        execution_scope_sha256: executionScopeSha256,
      }]),
      resolveLink: vi.fn(async () => {
        throw new Error("exact replay must not consult mutable linkage");
      }),
      recordLinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 2,
        ledger_state: "processed",
      }]),
    });
    const rawBody = eventBody();

    await expect(workflow(port, convergence, onOrderTicketed).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toEqual({
      version: "flight-consumer-preview-duffel-webhook-result-v1",
      decision: "replayed",
      eventType: "order.created",
      linkedOrderId: orderId,
      reconciliationRequired: true,
      directMutationAuthorized: false,
    });

    expect(convergence.converge).toHaveBeenCalledTimes(1);
    expect(convergence.converge).toHaveBeenCalledWith({
      customerId,
      orderId,
      attemptId,
      ledgerId,
      leaseTokenSha256: null,
      providerOrderId: "ord_0000ABd6wggSct7BoraU1o",
      providerOrderRefSha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_order",
        value: "ord_0000ABd6wggSct7BoraU1o",
      }),
      providerOfferRefSha256: sha256FlightConsumerPreviewReference({
        kind: "duffel_offer",
        value: "off_0000ABd6wggSct7BoraU1o",
      }),
    });
    expect(onOrderTicketed).toHaveBeenCalledWith({ customerId, orderId });
    expect(port.resolveLink).not.toHaveBeenCalled();
    expect(port.enqueuePending).not.toHaveBeenCalled();
    expect(port.resolvePending).not.toHaveBeenCalled();
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.reclaim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(port.escalate).not.toHaveBeenCalled();
  });

  it("acknowledges terminal order.created after a later lifecycle change without recovery", async () => {
    const convergence = orderConvergence({
      converge: vi.fn(async () => {
        throw new Error("terminal lifecycle replay must not recover the provider order");
      }),
    });
    const onOrderTicketed = vi.fn();
    const port = ledger({
      resolveReplayLink: vi.fn(async () => [{
        replay_found: true,
        order_id: orderId,
        customer_id: customerId,
        provider_attempt_id: attemptId,
        order_status: "servicing",
        execution_scope_sha256: executionScopeSha256,
      }]),
      resolveLink: vi.fn(async () => {
        throw new Error("mutable linkage must not run on terminal replay");
      }),
      recordLinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 2,
        ledger_state: "processed",
      }]),
    });
    const rawBody = eventBody();

    await expect(workflow(port, convergence, onOrderTicketed).ingest({
      rawBody,
      signature: signature(rawBody),
    })).resolves.toMatchObject({
      decision: "replayed",
      eventType: "order.created",
      linkedOrderId: orderId,
    });
    expect(port.resolveLink).not.toHaveBeenCalled();
    expect(convergence.converge).not.toHaveBeenCalled();
    expect(onOrderTicketed).not.toHaveBeenCalled();
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
  });

  it("backfills a missing adverse operational case on terminal replay", async () => {
    const port = ledger({
      recordLinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 2,
        ledger_state: "processed",
      }]),
    });
    const rawBody = eventBody({ type: "air.order.changed" });
    await expect(workflow(port).ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "replayed" });
    expect(port.escalate).toHaveBeenCalledWith(expect.objectContaining({
      p_ledger_id: ledgerId,
      p_expected_event_type: "air.order.changed",
      p_expected_lease_token_sha256: null,
    }));
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
  });

  it("replays the immutable adverse link after later order/payment lifecycle changes", async () => {
    const storedReplay = {
      replay_found: true as const,
      order_id: orderId,
      customer_id: customerId,
      provider_attempt_id: attemptId,
      order_status: "refunded" as const,
      execution_scope_sha256: executionScopeSha256,
    };
    const port = ledger({
      resolveReplayLink: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([storedReplay]),
      resolveLink: vi.fn()
        .mockResolvedValueOnce([{
          order_id: orderId,
          customer_id: customerId,
          provider_attempt_id: attemptId,
          order_status: "requires_review",
          execution_scope_sha256: executionScopeSha256,
        }])
        .mockRejectedValue(new Error("mutable linkage must not run on replay")),
      recordLinked: vi.fn()
        .mockResolvedValueOnce([{
          decision: "created",
          ledger_id: ledgerId,
          ledger_revision: 0,
          ledger_state: "verified",
        }])
        .mockResolvedValueOnce([{
          decision: "replay",
          ledger_id: ledgerId,
          ledger_revision: 2,
          ledger_state: "blocked",
        }]),
      escalate: vi.fn()
        .mockResolvedValueOnce([{
          decision: "created",
          reconciliation_case_id: reconciliationCaseId,
          order_id: orderId,
          event_type: "air.order.changed",
          case_status: "open",
        }])
        .mockResolvedValueOnce([{
          decision: "replay",
          reconciliation_case_id: reconciliationCaseId,
          order_id: orderId,
          event_type: "air.order.changed",
          case_status: "open",
        }]),
    });
    const rawBody = eventBody({ type: "air.order.changed" });
    const created = workflow(port);

    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "blocked", linkedOrderId: orderId });
    await expect(created.ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "replayed", linkedOrderId: orderId });

    expect(port.resolveLink).toHaveBeenCalledTimes(1);
    expect(port.recordLinked).toHaveBeenCalledTimes(2);
    expect(port.recordUnlinked).not.toHaveBeenCalled();
    expect(port.escalate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(port.escalate).mock.results.every((result) =>
      result.type === "return")).toBe(true);
  });

  it("reclaims a stale lease and fences completion to the replacement token", async () => {
    const convergence = orderConvergence();
    const port = ledger({
      recordLinked: vi.fn(async () => [{
        decision: "replay",
        ledger_id: ledgerId,
        ledger_revision: 1,
        ledger_state: "processing",
      }]),
      reclaim: vi.fn(async (parameters) => [{
        ledger_id: ledgerId,
        ledger_revision: 1,
        ledger_state: "processing",
        processing_lease_token_sha256: parameters.p_lease_token_sha256,
        processing_lease_expires_at: "2026-08-25T20:01:00.000Z",
        processing_attempt_count: 2,
      }]),
    });
    const rawBody = eventBody();
    await expect(workflow(port, convergence).ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "processed" });
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.reclaim).toHaveBeenCalledWith(expect.objectContaining({
      p_stale_before: new Date((nowSeconds - 180) * 1_000).toISOString(),
      p_recovery_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 60,
    }));
    expect(vi.mocked(convergence.converge).mock.calls[0]![0].leaseTokenSha256)
      .toBe(vi.mocked(port.reclaim).mock.calls[0]![0].p_lease_token_sha256);
    expect(port.complete).not.toHaveBeenCalled();
  });

  it("returns retryable failure when async order convergence is incomplete", async () => {
    const port = ledger();
    const onOrderTicketed = vi.fn();
    const convergence = orderConvergence({
      converge: vi.fn(async () => { throw new Error("not issued"); }),
    });
    const rawBody = eventBody();
    await expect(workflow(port, convergence, onOrderTicketed)
      .ingest({ rawBody, signature: signature(rawBody) }))
      .rejects.toMatchObject({ status: 503 });
    expect(port.complete).not.toHaveBeenCalled();
    expect(port.escalate).not.toHaveBeenCalled();
    expect(onOrderTicketed).not.toHaveBeenCalled();
  });

  it("keeps ticketed webhook acknowledgement independent from notification scheduling", async () => {
    const port = ledger();
    const convergence = orderConvergence();
    const onOrderTicketed = vi.fn(() => { throw new Error("queue unavailable"); });
    const rawBody = eventBody();
    await expect(workflow(port, convergence, onOrderTicketed)
      .ingest({ rawBody, signature: signature(rawBody) }))
      .resolves.toMatchObject({ decision: "processed" });
    expect(onOrderTicketed).toHaveBeenCalledWith({ customerId, orderId });
  });
});
