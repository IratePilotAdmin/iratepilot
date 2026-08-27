import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionPrivatePreviewRouteHandler,
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MAX_BODY_BYTES,
} from "../lib/flights/consumer-production/private-preview-live-shopping-http.server";
import {
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED,
  FlightConsumerProductionPrivatePreviewLiveShoppingError,
} from "../lib/flights/consumer-production/private-preview-live-shopping.server";

const endpoint = "https://www.iratepilot.com/api/flights/private-preview/live-search";
const customerId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const body = { search: {
  origin: "ORD",
  destination: "LHR",
  departureDate: "2026-09-10",
  returnDate: null,
  cabin: "economy",
  adults: 1,
} };
const result = {
  status: "complete",
  replay: false,
  offerCount: 0,
  offers: [],
  providerReferenceExposed: false,
  orderAuthorized: false,
  paymentAuthorized: false,
  captureAuthorized: false,
  refundAuthorized: false,
  ticketingAuthorized: false,
  servicingAuthorized: false,
  consumerPublicReleaseAuthorized: false,
  blindRetryAuthorized: false,
};

function request(overrides: Readonly<{
  url?: string;
  body?: string;
  headers?: Record<string, string | null>;
}> = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    cookie: "sb-session=opaque-cookie-value",
    "idempotency-key": idempotencyKey,
    origin: "https://www.iratepilot.com",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  });
  for (const [name, value] of Object.entries(overrides.headers ?? {})) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return new Request(overrides.url ?? endpoint, {
    method: "POST",
    headers,
    body: overrides.body ?? JSON.stringify(body),
  });
}

function dependencies() {
  return {
    environment: vi.fn(() => ({
      VERCEL_ENV: "production",
      [FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]: "true",
    })),
    authenticate: vi.fn(async () => ({ userId: customerId })),
    execute: vi.fn(async () => result),
  };
}

describe("Gate140 private-preview live-shopping Route Handler", () => {
  it("uses the Node route dynamically and calls cookie auth with no Request", () => {
    const source = readFileSync(
      "app/api/flights/private-preview/live-search/route.ts",
      "utf8",
    );
    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toMatch(/await requireUser\(\)/);
    expect(source).not.toMatch(/requireUser\(request\)/);
  });

  it("requires exact browser metadata and returns only a private no-store DTO", async () => {
    const ports = dependencies();
    const response = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      ports,
    )(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("vary")).toBe("Cookie, Origin");
    await expect(response.json()).resolves.toEqual({ data: result });
    expect(ports.authenticate).toHaveBeenCalledWith();
    expect(ports.execute).toHaveBeenCalledWith({
      authenticatedCustomerId: customerId,
      idempotencyKey,
      search: body.search,
    });
  });

  it("stays indistinguishable from missing while the dedicated flag is off", async () => {
    const ports = dependencies();
    ports.environment.mockReturnValue({
      VERCEL_ENV: "production",
      [FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]: "false",
    });
    const response = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      ports,
    )(request());
    expect(response.status).toBe(404);
    expect(ports.authenticate).not.toHaveBeenCalled();
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("cannot be enabled in a Vercel Preview deployment", async () => {
    const ports = dependencies();
    ports.environment.mockReturnValue({
      VERCEL_ENV: "preview",
      [FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]: "true",
    });
    const response = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      ports,
    )(request());
    expect(response.status).toBe(404);
    expect(ports.authenticate).not.toHaveBeenCalled();
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("rejects missing or mismatched Origin, Fetch Metadata, cookie, and bearer auth", async () => {
    const invalid = [
      request({ headers: { origin: null } }),
      request({ headers: { origin: "https://attacker.example" } }),
      request({ headers: { "sec-fetch-site": null } }),
      request({ headers: { "sec-fetch-site": "cross-site" } }),
      request({ headers: { "sec-fetch-site": "SAME-ORIGIN" } }),
      request({ headers: { "sec-fetch-mode": "navigate" } }),
      request({ headers: { "sec-fetch-dest": "document" } }),
      request({ headers: { cookie: null } }),
      request({ headers: { authorization: "Bearer attacker" } }),
      request({ url: `${endpoint}?leak=true` }),
    ];
    const ports = dependencies();
    const handler = createFlightConsumerProductionPrivatePreviewRouteHandler(ports);
    for (const candidate of invalid) {
      const response = await handler(candidate);
      expect(response.status).toBe(403);
    }
    expect(ports.authenticate).not.toHaveBeenCalled();
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("requires a UUID idempotency key and strict bounded no-PII JSON", async () => {
    const invalid = [
      request({ headers: { "idempotency-key": "not-a-uuid" } }),
      request({ headers: { "content-type": "text/plain" } }),
      request({ headers: { "content-encoding": "gzip" } }),
      request({ body: "{" }),
      request({ body: JSON.stringify({ ...body, email: "pii@example.com" }) }),
      request({ body: JSON.stringify({ search: { ...body.search, adults: 10 } }) }),
      request({ body: JSON.stringify({ payload: "x".repeat(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MAX_BODY_BYTES,
      ) }) }),
    ];
    const ports = dependencies();
    const handler = createFlightConsumerProductionPrivatePreviewRouteHandler(ports);
    for (const candidate of invalid) {
      const response = await handler(candidate);
      expect(response.status).toBe(400);
    }
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("uses generic authentication, limiter, and unexpected failure responses", async () => {
    const unauthenticatedPorts = dependencies();
    unauthenticatedPorts.authenticate.mockResolvedValueOnce({
      error: "private auth detail",
      status: 401,
    } as never);
    const unauthenticated = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      unauthenticatedPorts,
    )(request());
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "Authentication required.",
    });

    const limitedPorts = dependencies();
    limitedPorts.execute.mockRejectedValueOnce(
      new FlightConsumerProductionPrivatePreviewLiveShoppingError(
        "membership_or_budget_refused",
        429,
      ),
    );
    const limited = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      limitedPorts,
    )(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const failedPorts = dependencies();
    failedPorts.execute.mockRejectedValueOnce(new Error("secret provider id off_12345678"));
    const failed = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      failedPorts,
    )(request());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toMatch(/secret|provider|off_/i);
  });

  it("rejects a dependency result containing extra provider or commerce fields", async () => {
    const ports = dependencies();
    ports.execute.mockResolvedValueOnce({
      ...result,
      providerOfferId: "off_12345678",
      paymentAuthorized: true,
    } as never);
    const response = await createFlightConsumerProductionPrivatePreviewRouteHandler(
      ports,
    )(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/off_|payment/i);
  });
});
