import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/flights/orders/route";

const runtimeFlags = [
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
  "FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED",
  "FLIGHT_RUNTIME_ENABLED",
  "FLIGHT_PROVIDER_TRAFFIC_ENABLED",
  "FLIGHT_BOOKING_ENABLED",
  "FLIGHT_PAYMENT_ENABLED",
  "FLIGHT_PRODUCTION_TRAFFIC_ENABLED",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public flight order endpoint lock", () => {
  it.each([
    ["all absent", {}],
    ["all false", Object.fromEntries(runtimeFlags.map((name) => [name, "false"]))],
    ["all true", Object.fromEntries(runtimeFlags.map((name) => [name, "true"]))],
    ["mixed values", Object.fromEntries(runtimeFlags.map((name, index) => [
      name,
      index % 2 === 0 ? "true" : "unexpected",
    ]))],
  ])("remains the same 503 response with %s", async (_label, flags) => {
    for (const [name, value] of Object.entries(flags)) {
      vi.stubEnv(name, value);
    }

    const response = await POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "Flight booking is not open. No passenger or payment payload was inspected.",
      code: "flight_consumer_production_order_endpoint_locked",
      mode: "consumer_production_launch_locked",
      capabilities: {
        requestBodyRead: false,
        externalRequestMade: false,
        providerRequestCount: 0,
        paymentProcessorRequestCount: 0,
        passengerDataAccepted: false,
        orderAuthorized: false,
        paymentAuthorized: false,
        ticketingAuthorized: false,
        consumerReleaseEnabled: false,
      },
    });
    expect(response.headers.get("cache-control"))
      .toBe("no-store, private, max-age=0");
    expect(response.headers.get("content-security-policy"))
      .toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not inspect any request property or body method", async () => {
    const request = new Proxy({} as Request, {
      get(_target, property) {
        throw new Error(`request property ${String(property)} was inspected`);
      },
    });

    const response = await (
      POST as unknown as (request: Request) => Promise<Response>
    )(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      capabilities: { requestBodyRead: false },
    });
  });

  it("has no application, provider, payment, environment, network, or request-body dependency", () => {
    const source = readFileSync("app/api/flights/orders/route.ts", "utf8");
    expect(source.match(/^import .+;$/gm) ?? []).toEqual([]);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/request\.(json|text|arrayBuffer|formData)\s*\(/);
    expect(source).not.toMatch(/from ["'][^"']*(duffel|stripe|synthetic-marketplace)/i);
  });
});
