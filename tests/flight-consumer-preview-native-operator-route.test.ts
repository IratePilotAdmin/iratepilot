import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockBootstrapError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("provider material must never be rendered");
      this.kind = kind;
    }
  }

  class MockActivationError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("control evidence must never be rendered");
      this.kind = kind;
    }
  }

  class MockRecoveryError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("recovery evidence must never be rendered");
      this.kind = kind;
    }
  }

  return {
    MockActivationError,
    MockBootstrapError,
    MockRecoveryError,
    after: vi.fn(),
    activate: vi.fn(),
    bootstrap: vi.fn(),
    convergeRetainedOrder: vi.fn(),
    notify: vi.fn(),
    recoverReprice: vi.fn(),
    relock: vi.fn(),
    requireRole: vi.fn(),
    sameOrigin: vi.fn(),
    scheduled: null as null | (() => Promise<void>),
  };
});

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/email/flight-notification-delivery.server", () => ({
  queueFlightConsumerPreviewNotification: mocks.notify,
}));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/lib/flights/consumer-preview/duffel-webhook-bootstrap.server", () => ({
  executeFlightConsumerPreviewDuffelRetainedOrderConvergence:
    mocks.convergeRetainedOrder,
  executeFlightConsumerPreviewDuffelWebhookBootstrap: mocks.bootstrap,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_CONVERGENCE_CONFIRMATION:
    "CONVERGE_ONE_SIGNED_PROCESSED_DUFFEL_TEST_ORDER_FROM_RETAINED_EVIDENCE",
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET: {
    customerId: "3020e8bc-1f5d-45ce-a759-dece25c65661",
    orderId: "5249a6d4-40b9-4232-8179-b326ecd8c0e4",
  },
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION:
    "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION:
    "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  FlightConsumerPreviewDuffelWebhookBootstrapError: mocks.MockBootstrapError,
}));
vi.mock("@/lib/flights/consumer-preview/activation-control.server", () => ({
  activateFlightConsumerPreview: mocks.activate,
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION:
    "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
  FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION:
    "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
  FlightConsumerPreviewActivationControlError: mocks.MockActivationError,
  relockFlightConsumerPreview: mocks.relock,
}));
vi.mock("@/lib/flights/consumer-preview/reprice-recovery.server", () => ({
  closeOneTerminalFlightConsumerPreviewReprice: mocks.recoverReprice,
  FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION:
    "CLOSE_ONE_TERMINAL_CONSUMER_PREVIEW_REPRICE_WITHOUT_REDISPATCH",
  FlightConsumerPreviewRepriceRecoveryError: mocks.MockRecoveryError,
}));

import {
  maxDuration,
  POST,
} from "../app/api/admin/flights/consumer-preview/duffel-webhook-bootstrap/native/route";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const actorId = "11111111-1111-4111-8111-111111111111";
const supabase = { rpc: vi.fn() };
const routeUrl =
  "https://preview.example.test/api/admin/flights/consumer-preview/duffel-webhook-bootstrap/native";

const confirmations = Object.freeze({
  bootstrap: "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  ping: "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  converge_retained_order:
    "CONVERGE_ONE_SIGNED_PROCESSED_DUFFEL_TEST_ORDER_FROM_RETAINED_EVIDENCE",
  activate: "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
  recover_reprice: "CLOSE_ONE_TERMINAL_CONSUMER_PREVIEW_REPRICE_WITHOUT_REDISPATCH",
  relock: "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
});

type Operation = keyof typeof confirmations;

function request(
  operation: Operation = "bootstrap",
  options: Readonly<{
    body?: string;
    contentType?: string;
    destination?: string;
    mode?: string;
    origin?: string;
    site?: string;
  }> = {},
) {
  const body = options.body ?? new URLSearchParams({
    transport: "NATIVE_OPERATOR_FORM_V1",
    operation,
    confirmation: confirmations[operation],
  }).toString();
  const headers = new Headers({
    "Content-Type": options.contentType ?? "application/x-www-form-urlencoded",
    Origin: options.origin ?? "https://preview.example.test",
    "Sec-Fetch-Dest": options.destination ?? "document",
    "Sec-Fetch-Mode": options.mode ?? "navigate",
    "Sec-Fetch-Site": options.site ?? "same-origin",
  });
  if (options.origin === "") headers.delete("Origin");
  return new Request(routeUrl, { method: "POST", headers, body });
}

afterAll(() => {
  if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnvironment;
});

describe("temporary native Consumer Flight Preview operator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "preview";
    mocks.sameOrigin.mockReturnValue(true);
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      mocks.scheduled = callback;
    });
    mocks.scheduled = null;
    mocks.requireRole.mockResolvedValue({ supabase, user: { id: actorId } });
    mocks.bootstrap.mockResolvedValue({
      decision: "created",
      mode: "duffel_test_mode",
      signingSecret: "safe-one-time-signing-secret",
      webhookIdSha256: "a".repeat(64),
    });
    mocks.convergeRetainedOrder.mockResolvedValue({
      decision: "locally_converged",
      mode: "duffel_test_mode",
      status: "ticketed",
      issuedTicketCount: 1,
    });
    mocks.activate.mockResolvedValue({ decision: "activated", controlKey: "global" });
    mocks.recoverReprice.mockResolvedValue({
      decision: "closed",
      terminalState: "succeeded",
      idempotencyStatus: "failed",
      offerStatus: "expired",
    });
    mocks.relock.mockResolvedValue({ decision: "relocked", controlKey: "global" });
  });

  it("accepts only a same-origin native document navigation by an authenticated admin", async () => {
    for (const candidate of [
      request("bootstrap", { origin: "" }),
      request("bootstrap", { site: "cross-site" }),
      request("bootstrap", { mode: "cors" }),
      request("bootstrap", { destination: "empty" }),
    ]) {
      const response = await POST(candidate);
      expect(response.status).toBe(403);
    }
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.convergeRetainedOrder).not.toHaveBeenCalled();

    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const unauthenticated = await POST(request());
    expect(unauthenticated.status).toBe(401);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.convergeRetainedOrder).not.toHaveBeenCalled();
  });

  it("is unavailable outside Preview before origin or authentication evaluation", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.sameOrigin).not.toHaveBeenCalled();
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });

  it("strictly rejects malformed, duplicate, extra, mismatched, and oversized forms", async () => {
    const invalidRequests = [
      request("bootstrap", { contentType: "application/json" }),
      request("bootstrap", { body: "transport=NATIVE_OPERATOR_FORM_V1&operation=bootstrap" }),
      request("bootstrap", {
        body: `transport=NATIVE_OPERATOR_FORM_V1&operation=bootstrap&operation=ping&confirmation=${confirmations.bootstrap}`,
      }),
      request("bootstrap", {
        body: `transport=NATIVE_OPERATOR_FORM_V1&operation=bootstrap&confirmation=${confirmations.bootstrap}&token=never`,
      }),
      request("bootstrap", {
        body: `transport=NATIVE_OPERATOR_FORM_V1&operation=bootstrap&confirmation=${confirmations.ping}`,
      }),
      request("bootstrap", { body: "x".repeat(769) }),
    ];
    for (const candidate of invalidRequests) {
      const response = await POST(candidate);
      expect(response.status).toBe(400);
    }
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.convergeRetainedOrder).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.recoverReprice).not.toHaveBeenCalled();
    expect(mocks.relock).not.toHaveBeenCalled();
  });

  it("locally converges only the fixed retained-evidence order and schedules notification fail-open", async () => {
    expect(maxDuration).toBe(300);
    const response = await POST(request("converge_retained_order"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("converged locally from retained signed evidence");
    expect(html).toContain("No Duffel provider write was sent");
    expect(html).not.toMatch(/5249a6d4|3020e8bc|b0c13dde|ord_|wev_|receipt|digest/i);
    expect(mocks.convergeRetainedOrder).toHaveBeenCalledWith({
      actorId,
      confirmation: confirmations.converge_retained_order,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    }, supabase);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.scheduled).not.toBeNull();
    await expect(mocks.scheduled!()).resolves.toBeUndefined();
    expect(mocks.notify).toHaveBeenCalledWith({
      customerId: "3020e8bc-1f5d-45ce-a759-dece25c65661",
      orderId: "5249a6d4-40b9-4232-8179-b326ecd8c0e4",
      event: "ticketed",
    });

    mocks.notify.mockRejectedValueOnce(new Error("notification provider unavailable"));
    const replay = await POST(request("converge_retained_order"));
    expect(replay.status).toBe(200);
    await expect(mocks.scheduled!()).resolves.toBeUndefined();
  });

  it("creates exactly one webhook and HTML-escapes only the one-time secret", async () => {
    const secret = `Duffel<&>"'one-time-secret`;
    const digest = "d".repeat(64);
    mocks.bootstrap.mockResolvedValueOnce({
      decision: "created",
      mode: "duffel_test_mode",
      signingSecret: secret,
      webhookIdSha256: digest,
    });
    const response = await POST(request("bootstrap"));
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await response.text();
    expect(html).toContain('data-testid="duffel-webhook-signing-secret"');
    expect(html).toContain("Duffel&lt;&amp;&gt;&quot;&#39;one-time-secret");
    expect(html).not.toContain(secret);
    expect(html).not.toContain(digest);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.bootstrap).toHaveBeenCalledWith({
      actorId,
      confirmation: confirmations.bootstrap,
      idempotencyKey: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });
  });

  it.each([
    ["ping" as const, "ping_requested", mocks.bootstrap],
    ["activate" as const, "activated", mocks.activate],
    ["recover_reprice" as const, "closed", mocks.recoverReprice],
    ["relock" as const, "relocked", mocks.relock],
  ])("runs only the bounded %s operation without rendering evidence", async (operation, decision, executor) => {
    const evidence = "e".repeat(64);
    if (operation === "ping") {
      mocks.bootstrap.mockResolvedValueOnce({
        decision,
        mode: "duffel_test_mode",
        webhookIdSha256: evidence,
      });
    } else if (operation === "recover_reprice") {
      executor.mockResolvedValueOnce({
        decision,
        terminalState: "succeeded",
        idempotencyStatus: "failed",
        offerStatus: "expired",
      });
    } else {
      executor.mockResolvedValueOnce({
        decision,
        controlKey: "global",
        runtimeControlReceiptSha256: evidence,
      });
    }

    const response = await POST(request(operation));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain(evidence);
    expect(executor).toHaveBeenCalledTimes(1);
    const call = executor.mock.calls[0];
    const input = operation === "ping" || operation === "recover_reprice"
      ? call[0]
      : call[1];
    expect(input).toMatchObject({
      actorId,
      confirmation: confirmations[operation],
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    if (operation === "activate" || operation === "relock") {
      expect(call[0]).toBe(supabase);
    }
  });

  it("fails closed on inconsistent decisions, conflicts, and outages without rendering internals", async () => {
    mocks.bootstrap.mockResolvedValueOnce({ decision: "ping_requested" });
    const inconsistent = await POST(request("bootstrap"));
    expect(inconsistent.status).toBe(503);

    mocks.bootstrap.mockRejectedValueOnce(new mocks.MockBootstrapError("conflict"));
    const conflict = await POST(request("bootstrap"));
    expect(conflict.status).toBe(409);

    mocks.activate.mockRejectedValueOnce(new mocks.MockActivationError("unavailable"));
    const unavailable = await POST(request("activate"));
    expect(unavailable.status).toBe(503);
    const serialized = await unavailable.text();
    expect(serialized).not.toMatch(/provider material|control evidence|secret|receipt|token|digest/i);
  });
});
