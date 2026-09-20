import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockOfferRefreshError extends Error {
    readonly status: 409 | 502 | 503 | 504;
    readonly diagnostic: string;

    constructor(
      status: 409 | 502 | 503 | 504,
      diagnostic = "workflow_unavailable",
    ) {
      super("safe offer-refresh error");
      this.status = status;
      this.diagnostic = diagnostic;
    }
  }

  return {
    MockOfferRefreshError,
    execute: vi.fn(),
    factory: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock(
  "@/lib/flights/consumer-production/duffel-live-offer-refresh-workflow.server",
  () => ({
    FlightConsumerProductionDuffelOfferRefreshError:
      mocks.MockOfferRefreshError,
    createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow:
      mocks.factory,
  }),
);
vi.mock(
  "@/lib/flights/consumer-production/duffel-live-offer-reprice.server",
  () => ({
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION:
      "REPRICE_ONE_BOUND_DUFFEL_LIVE_OFFER_WITHOUT_ORDER_OR_PAYMENT",
  }),
);
vi.mock("@/lib/flights/consumer-production/runtime.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_ORIGIN: "https://www.iratepilot.com",
}));

import {
  POST,
  dynamic,
  maxDuration,
  runtime,
} from "../app/api/admin/flights/consumer-production/live-offer-refresh/route";

const endpoint =
  "https://www.iratepilot.com/api/admin/flights/consumer-production/live-offer-refresh";
const rawOfferId = "off_ephemeralOnly0001";
const validBody = {
  confirmation:
    "REPRICE_ONE_BOUND_DUFFEL_LIVE_OFFER_WITHOUT_ORDER_OR_PAYMENT",
  offerId: rawOfferId,
  sourceShoppingAttemptId: "33333333-3333-4333-8333-333333333333",
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
    headers.set(
      "content-type",
      options.contentType ?? "application/json; charset=utf-8",
    );
  }
  return new Request(endpoint, {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify(validBody),
  });
}

function safeResult() {
  return {
    version: "flight-consumer-production-duffel-live-offer-refresh-result-v1",
    mode:
      "flight_consumer_production_duffel_live_offer_refresh_observation_dark",
    attemptId: "11111111-1111-4111-8111-111111111111",
    state: "observed",
    replay: false,
    providerCode: "duffel",
    providerEnvironment: "live",
    price: { currency: "USD", amountMinor: 24950 },
    owner: {
      name: "Example Air",
      iataCode: "EA",
      identitySha256: "a".repeat(64),
    },
    expiresAt: "2026-09-01T00:00:00.000Z",
    observedAt: "2026-08-27T08:00:00.000Z",
    evidence: {
      offerBindingSha256: "b".repeat(64),
      sourceOfferEvidenceSha256: "c".repeat(64),
      requestSha256: "d".repeat(64),
      responseSha256: "e".repeat(64),
      normalizedOfferSha256: "f".repeat(64),
    },
    providerRetrieveOfferDispatchCount: 1,
    providerRequestsThisInvocation: 1,
    automaticRetryAttempted: false,
    rawProviderReferencesExposed: false,
    finalCheckoutPricingAuthorized: false,
    orderAuthorized: false,
    paymentAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
    refundAuthorized: false,
    servicingAuthorized: false,
    consumerReleaseEnabled: false,
  };
}

describe("Flight Consumer Production Duffel live-offer refresh admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      supabase: {},
      user: { id: "22222222-2222-4222-8222-222222222222" },
      profile: { role: "admin" },
    });
    mocks.factory.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockResolvedValue(safeResult());
  });

  it("runs privately in Node and returns only the opaque observation receipt", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(35);

    const response = await POST(request());

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
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain(rawOfferId);
    expect(JSON.parse(serialized)).toEqual({
      mode: "duffel_live_offer_refresh_observation_dark",
      result: safeResult(),
      finalCheckoutPricingAuthorized: false,
      consumerReleaseEnabled: false,
    });
  });

  it("authenticates before reading or validating the raw request body", async () => {
    mocks.requireRole.mockResolvedValueOnce({
      error: "Authentication required.",
      status: 401,
    });
    const response = await POST(request({ body: "not-json" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Live-offer refresh observation could not be completed.",
    });
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires the exact Production origin, JSON media type, and bounded body", async () => {
    const invalidRequests = [
      request({ origin: "https://attacker.example" }),
      request({ origin: null }),
      request({ contentType: "text/plain" }),
      request({ contentType: null }),
      request({ headers: { "content-length": "not-a-number" } }),
      request({ headers: { "content-length": "8193" } }),
      request({ body: "x" }),
      request({ body: JSON.stringify({ payload: "x".repeat(8_192) }) }),
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST(invalidRequest);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and every non-exact input shape", async () => {
    const invalidBodies: BodyInit[] = [
      "{not-json",
      "[]",
      "null",
      JSON.stringify({ ...validBody, idempotencyKey: "client-controlled" }),
      JSON.stringify({ ...validBody, confirmation: "CREATE_A_LIVE_ORDER" }),
      JSON.stringify({ ...validBody, offerId: "ord_unsafe" }),
      JSON.stringify({ ...validBody, offerId: "off_short" }),
      JSON.stringify({ ...validBody, sourceShoppingAttemptId: "not-a-uuid" }),
    ];

    for (const body of invalidBodies) {
      const response = await POST(request({ body }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only a bounded status and never emits the ephemeral offer ID", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(new mocks.MockOfferRefreshError(
      409,
      "source_offer_unavailable",
    ));

    const response = await POST(request());

    expect(response.status).toBe(409);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe(
      '{"error":"Live-offer refresh observation could not be completed."}',
    );
    expect(serialized).not.toContain(rawOfferId);
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel live-offer refresh observation rejected",
      { diagnostic: "source_offer_unavailable", status: 409 },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawOfferId);
    warn.mockRestore();
  });

  it("streams and bounds the request body instead of buffering it unbounded", () => {
    const source = readFileSync(new URL(
      "../app/api/admin/flights/consumer-production/live-offer-refresh/route.ts",
      import.meta.url,
    ), "utf8");
    expect(source).toContain("request.body?.getReader()");
    expect(source).toContain("bytes > maximumBodyBytes");
    expect(source).not.toMatch(/request\.(?:arrayBuffer|json|text)\s*\(/);
  });
});
