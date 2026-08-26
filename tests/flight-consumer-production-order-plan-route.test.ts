import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockOrderPlanError extends Error {
    readonly status: 409 | 502 | 503 | 504;
    readonly diagnostic: string;

    constructor(
      status: 409 | 502 | 503 | 504,
      diagnostic = "workflow_unavailable",
    ) {
      super("safe order-plan error");
      this.status = status;
      this.diagnostic = diagnostic;
    }
  }

  return {
    MockOrderPlanError,
    execute: vi.fn(),
    factory: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/flights/consumer-production/duffel-order-plan-rehearsal.server", () => ({
  FlightConsumerProductionDuffelOrderPlanRehearsalError: mocks.MockOrderPlanError,
  createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow: mocks.factory,
}));
vi.mock("@/lib/flights/consumer-production/runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_ORIGIN: "https://www.iratepilot.com",
}));
vi.mock("@/lib/flights/consumer-production/shopping-runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION:
    "PLAN_ONE_DUFFEL_LIVE_OFFER_WITH_FICTIONAL_TRAVELER_WITHOUT_ORDER_OR_PAYMENT",
}));

import {
  POST,
  dynamic,
  maxDuration,
  runtime,
} from "../app/api/admin/flights/consumer-production/order-plan/route";

const endpoint =
  "https://www.iratepilot.com/api/admin/flights/consumer-production/order-plan";
const validBody = {
  confirmation:
    "PLAN_ONE_DUFFEL_LIVE_OFFER_WITH_FICTIONAL_TRAVELER_WITHOUT_ORDER_OR_PAYMENT",
  search: {
    origin: "ORD",
    destination: "MIA",
    departureDate: "2026-10-10",
    returnDate: null,
    cabin: "economy",
    adults: 1,
  },
};

type RequestOptions = Readonly<{
  body?: BodyInit;
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
    body: options.body ?? JSON.stringify(validBody),
  });
}

function safeResult() {
  return {
    version: "flight-consumer-production-duffel-order-plan-rehearsal-result-v1",
    attemptId: "22222222-2222-4222-8222-222222222222",
    state: "succeeded",
    replay: false,
    liveMode: true,
    offerCount: 12,
    eligibleOfferCount: 4,
    responseSha256: "a".repeat(64),
    selectionPolicySha256: "b".repeat(64),
    fictionalTravelerFixtureSha256: "c".repeat(64),
    orderRequestBodySha256: "d".repeat(64),
    orderRequestEnvelopeSha256: "e".repeat(64),
    providerOfferRequestCount: 1,
    providerOrderDispatchCount: 0,
    stripeRequestCount: 0,
    rawProviderReferencesExposed: false,
    orderEndpointAuthorized: false,
    stripeAuthorized: false,
    bookingAuthorized: false,
    paymentAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
  };
}

describe("Flight Consumer Production Duffel inert order-plan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      supabase: {},
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "admin" },
    });
    mocks.factory.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockResolvedValue(safeResult());
  });

  it("runs dynamically in Node and returns only a private inert-plan receipt", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(30);

    const response = await POST(request({
      headers: { "idempotency-key": "the-client-must-not-control-this" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith(validBody);
    await expect(response.json()).resolves.toEqual({
      mode: "duffel_live_order_plan_rehearsal",
      result: safeResult(),
      consumerReleaseEnabled: false,
    });
  });

  it("authenticates before validating or constructing the workflow", async () => {
    mocks.requireRole.mockResolvedValueOnce({
      error: "Authentication required.",
      status: 401,
    });
    const unauthenticated = await POST(request({ body: "not-json" }));
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "Order-plan rehearsal could not be completed.",
    });

    mocks.requireRole.mockResolvedValueOnce({
      error: "You do not have permission to perform this action.",
      status: 403,
    });
    const forbidden = await POST(request());
    expect(forbidden.status).toBe(403);
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires the exact Production origin, JSON media type, and a bounded body", async () => {
    const invalidRequests = [
      request({ origin: "https://attacker.example" }),
      request({ origin: null }),
      request({ contentType: "text/plain" }),
      request({ contentType: null }),
      request({ headers: { "content-length": "not-a-number" } }),
      request({ headers: { "content-length": "16385" } }),
      request({ body: "x" }),
      request({ body: JSON.stringify({ payload: "x".repeat(16_384) }) }),
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST(invalidRequest);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-object JSON and every non-exact input shape", async () => {
    const invalidBodies: BodyInit[] = [
      "{not-json",
      "[]",
      "null",
      JSON.stringify({ ...validBody, idempotencyKey: "client-controlled" }),
      JSON.stringify({ ...validBody, confirmation: "CREATE_A_LIVE_ORDER" }),
      JSON.stringify({ ...validBody, search: { ...validBody.search, adults: 2 } }),
      JSON.stringify({ ...validBody, search: { ...validBody.search, providerOfferId: "off_unsafe" } }),
      JSON.stringify({ ...validBody, search: { ...validBody.search, destination: "ORD" } }),
      JSON.stringify({ ...validBody, search: { ...validBody.search, departureDate: "2026-02-30" } }),
    ];

    for (const body of invalidBodies) {
      const response = await POST(request({ body }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("preserves only a bounded workflow status and never returns diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(new mocks.MockOrderPlanError(
      409,
      "request_contract_refused",
    ));

    const response = await POST(request());

    expect(response.status).toBe(409);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe(
      '{"error":"Order-plan rehearsal could not be completed."}',
    );
    expect(serialized).not.toMatch(/diagnostic|duffel|offer|order[_-]?id|provider/i);
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel order-plan rehearsal rejected",
      { diagnostic: "request_contract_refused", status: 409 },
    );
    warn.mockRestore();
  });

  it("contains unexpected authentication failures before workflow creation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.requireRole.mockRejectedValueOnce(new Error("private-role-database-detail"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"Order-plan rehearsal could not be completed."}',
    );
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
