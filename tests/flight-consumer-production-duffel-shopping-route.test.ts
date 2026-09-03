import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockShoppingError extends Error {
    readonly status: 409 | 502 | 503 | 504;
    readonly diagnostic: string;

    constructor(
      status: 409 | 502 | 503 | 504,
      diagnostic = "workflow_unavailable",
    ) {
      super("safe shopping error");
      this.status = status;
      this.diagnostic = diagnostic;
    }
  }

  return {
    MockShoppingError,
    execute: vi.fn(),
    factory: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/flights/consumer-production/duffel-shopping.server", () => ({
  FlightConsumerProductionDuffelShoppingError: mocks.MockShoppingError,
  createFlightConsumerProductionDarkDuffelShoppingWorkflow: mocks.factory,
}));
vi.mock("@/lib/flights/consumer-production/runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_ORIGIN: "https://www.iratepilot.com",
}));

import {
  POST,
  dynamic,
  maxDuration,
  runtime,
} from "../app/api/admin/flights/consumer-production/live-search/route";

const endpoint =
  "https://www.iratepilot.com/api/admin/flights/consumer-production/live-search";
const validBody = {
  confirmation: "SEARCH_DUFFEL_LIVE_INVENTORY_WITHOUT_BOOKING",
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

describe("Flight Consumer Production Duffel shopping dark Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      supabase: {},
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "admin" },
    });
    mocks.factory.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockResolvedValue({
      attemptId: "22222222-2222-4222-8222-222222222222",
      state: "succeeded",
      replay: false,
      liveMode: true,
      offerCount: 3,
      rawProviderReferencesExposed: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
    });
  });

  it("runs dynamically in Node and returns a private dark-search receipt", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(30);

    const response = await POST(request({
      headers: { "idempotency-key": "client-header-must-not-control-budget" },
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
      mode: "duffel_live_shopping_dark",
      result: expect.objectContaining({
        state: "succeeded",
        bookingAuthorized: false,
        paymentAuthorized: false,
        ticketingAuthorized: false,
      }),
      consumerReleaseEnabled: false,
    });
  });

  it("rejects unauthenticated and non-admin callers before creating a workflow", async () => {
    mocks.requireRole.mockResolvedValueOnce({
      error: "Authentication required.",
      status: 401,
    });
    const unauthenticated = await POST(request());
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "Authentication required.",
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

  it("contains unexpected role-check failures as a private 503 before workflow creation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const privateFailure = "database-role-check-private-failure";
    mocks.requireRole.mockRejectedValueOnce(new Error(privateFailure));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe(
      '{"error":"Live-shopping diagnostic could not be completed."}',
    );
    expect(serialized).not.toContain(privateFailure);
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel live-shopping dark request rejected",
      { diagnostic: "unexpected_error", status: 503 },
    );
    warn.mockRestore();
  });

  it("requires the Production origin, JSON content type, and a bounded body", async () => {
    const invalidRequests = [
      request({ origin: "https://attacker.example" }),
      request({ origin: null }),
      request({ contentType: "text/plain" }),
      request({ contentType: null }),
      request({ headers: { "content-length": "not-a-number" } }),
      request({ headers: { "content-length": "16385" } }),
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST(invalidRequest);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed, non-object, and oversized bodies before dispatch", async () => {
    const invalidBodies: BodyInit[] = [
      "{not-json",
      "[]",
      "null",
      "x",
      JSON.stringify({ payload: "x".repeat(16_384) }),
    ];

    for (const body of invalidBodies) {
      const response = await POST(request({ body }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("preserves bounded workflow status while returning only a generic failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(new mocks.MockShoppingError(
      409,
      "request_contract_refused",
    ));
    const response = await POST(request({
      body: JSON.stringify({ ...validBody, confirmation: "BOOK_A_LIVE_FLIGHT" }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Live-shopping diagnostic could not be completed.",
    });
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel live-shopping dark request rejected",
      { diagnostic: "request_contract_refused", status: 409 },
    );
    warn.mockRestore();
  });

  it("maps unexpected failures to a generic retryable response", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(new Error("provider secret must not escape"));
    const response = await POST(request());

    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe(
      '{"error":"Live-shopping diagnostic could not be completed."}',
    );
    expect(serialized).not.toMatch(/secret|provider|duffel_live_|offer|order/i);
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel live-shopping dark request rejected",
      { diagnostic: "unexpected_error", status: 503 },
    );
    warn.mockRestore();
  });
});
