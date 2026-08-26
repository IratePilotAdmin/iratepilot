import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockStripeAccountPreflightError extends Error {
    readonly status: 409 | 502 | 503 | 504;
    readonly diagnostic: string;
    readonly code: string;

    constructor(
      status: 409 | 502 | 503 | 504 = 503,
      diagnostic = "runtime_unavailable",
    ) {
      super("safe Stripe account preflight error");
      this.status = status;
      this.diagnostic = diagnostic;
      this.code = diagnostic;
    }
  }

  return {
    MockStripeAccountPreflightError,
    execute: vi.fn(),
    factory: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/flights/consumer-production/stripe-account-preflight.server", () => ({
  FlightConsumerProductionStripeAccountPreflightError:
    mocks.MockStripeAccountPreflightError,
  createFlightConsumerProductionStripeAccountPreflightWorkflow: mocks.factory,
}));
vi.mock("@/lib/flights/consumer-production/runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_ORIGIN: "https://www.iratepilot.com",
}));
vi.mock("@/lib/flights/consumer-production/stripe-runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION:
    "VERIFY_STRIPE_LIVE_ACCOUNT_WITHOUT_PAYMENT_OR_CHARGE",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE:
    "flight_consumer_production_stripe_account_preflight",
}));

import {
  POST,
  dynamic,
  maxDuration,
  runtime,
} from "../app/api/admin/flights/consumer-production/stripe-account/route";

const endpoint =
  "https://www.iratepilot.com/api/admin/flights/consumer-production/stripe-account";
const confirmation =
  "VERIFY_STRIPE_LIVE_ACCOUNT_WITHOUT_PAYMENT_OR_CHARGE";
const validBody = { confirmation };

type RequestOptions = Readonly<{
  body?: BodyInit | null;
  contentType?: string | null;
  origin?: string | null;
  headers?: Record<string, string>;
}>;

function request(options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? "https://www.iratepilot.com");
  }
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json; charset=utf-8");
  }
  return new Request(endpoint, {
    method: "POST",
    headers,
    body: options.body === null
      ? undefined
      : options.body ?? JSON.stringify(validBody),
  });
}

function safeResult() {
  return {
    version: "flight-consumer-production-stripe-account-preflight-result-v1",
    ready: true,
    liveMode: true,
    executionScopeSha256: "a".repeat(64),
    accountSha256: "b".repeat(64),
    accountProjectionSha256: "c".repeat(64),
    accountObjectVerified: true,
    accountBindingMatched: true,
    credentialBindingMatched: true,
    publishableKeyBindingMatched: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    defaultCurrencyUsd: true,
    providerReadCount: 1,
    stripeRequestCount: 1,
    stripeMutationCount: 0,
    paymentIntentCount: 0,
    chargeCount: 0,
    refundCount: 0,
    providerOrderDispatchCount: 0,
    ticketDispatchCount: 0,
    rawProviderReferencesExposed: false,
    rawProviderResponseStored: false,
    orderEndpointAuthorized: false,
    paymentAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
    consumerReleaseEnabled: false,
  };
}

describe("Flight Consumer Production Stripe account preflight route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.requireRole.mockResolvedValue({
      supabase: {},
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "admin" },
    });
    mocks.factory.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockResolvedValue(safeResult());
  });

  it("runs dynamically in Node and returns only the private read-only receipt", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(30);

    const response = await POST(request({
      headers: { "idempotency-key": "the-client-must-not-control-this" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, private, max-age=0",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(response.headers.get("permissions-policy")).toContain("payment=()");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith(validBody);
    await expect(response.json()).resolves.toEqual({
      mode: "flight_consumer_production_stripe_account_preflight",
      result: safeResult(),
      consumerReleaseEnabled: false,
    });
  });

  it("authenticates before validating input or constructing the workflow", async () => {
    mocks.requireRole.mockResolvedValueOnce({
      error: "Authentication required.",
      status: 401,
    });
    const unauthenticated = await POST(request({ body: "not-json" }));
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "Stripe account preflight could not be completed.",
    });
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("is unavailable outside Production after authenticating", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await POST(request());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe account preflight could not be completed.",
    });
    expect(mocks.requireRole).toHaveBeenCalledTimes(1);
    expect(mocks.factory).not.toHaveBeenCalled();
  });

  it("requires the canonical Origin, JSON media type, and a bounded body", async () => {
    const invalidRequests = [
      request({ origin: "https://attacker.example" }),
      request({ origin: null }),
      request({ contentType: "text/plain" }),
      request({ contentType: null }),
      request({ headers: { "content-length": "not-a-number" } }),
      request({ headers: { "content-length": "1025" } }),
      request({ body: null }),
      request({ body: "x".repeat(1_025) }),
      request({ body: new Uint8Array([0xff, 0xfe]) }),
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST(invalidRequest);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("accepts only the exact confirmation-only object", async () => {
    const invalidBodies = [
      "{not-json",
      "[]",
      "null",
      JSON.stringify({}),
      JSON.stringify({ confirmation: "CREATE_A_PAYMENT_INTENT" }),
      JSON.stringify({ confirmation, accountId: "acct_must_not_be_accepted" }),
      JSON.stringify({ confirmation, idempotencyKey: "client-controlled" }),
    ];

    for (const body of invalidBodies) {
      const response = await POST(request({ body }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only a generic bounded failure while logging safe diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(
      new mocks.MockStripeAccountPreflightError(409, "account_binding_mismatch"),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"Stripe account preflight could not be completed."}',
    );
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Stripe account preflight rejected",
      { diagnostic: "account_binding_mismatch", status: 409 },
    );
    warn.mockRestore();
  });

  it("contains unexpected authentication failures before workflow creation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.requireRole.mockRejectedValueOnce(new Error("private-auth-detail"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"Stripe account preflight could not be completed."}',
    );
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
