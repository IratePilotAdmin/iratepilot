import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  submitProductionDuffelOrderPlanRehearsal,
  type ProductionDuffelOrderPlanClientDependencies,
  type ProductionDuffelOrderPlanSearch,
} from "../app/admin/flights/consumer-production/order-plan/order-plan-client";

const pageSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/order-plan/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/order-plan/order-plan-client.tsx", import.meta.url),
  "utf8",
);
const endpoint = "/api/admin/flights/consumer-production/order-plan";
const attemptId = "11111111-1111-4111-8111-111111111111";

const safeSearch: ProductionDuffelOrderPlanSearch = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2026-10-10",
  returnDate: "",
  cabin: "economy",
};

function dependencies(fetcher: ReturnType<typeof vi.fn>): ProductionDuffelOrderPlanClientDependencies {
  return { fetcher: fetcher as unknown as typeof fetch };
}

function safeResult(extras: Record<string, unknown> = {}) {
  return {
    version: "flight-consumer-production-duffel-order-plan-rehearsal-result-v1",
    attemptId,
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
    ...extras,
  };
}

function safeResponse(resultExtras: Record<string, unknown> = {}) {
  return Response.json({
    mode: "duffel_live_order_plan_rehearsal",
    result: safeResult(resultExtras),
    consumerReleaseEnabled: false,
    ignoredOuterValue: "outer values are never returned by the sanitizer",
  });
}

describe("Production Duffel inert order-plan admin page", () => {
  it("is a Production-only uncached admin page with no indexing", () => {
    expect(pageSource).toContain('process.env.VERCEL_ENV !== "production"');
    expect(pageSource).toContain("notFound()");
    expect(pageSource).toContain('requireRole(["admin"])');
    expect(pageSource).toContain("/login?next=");
    expect(pageSource).toContain('export const dynamic = "force-dynamic"');
    expect(pageSource).toContain("export const revalidate = 0");
    expect(pageSource).toContain('export const fetchCache = "force-no-store"');
    expect(pageSource).toContain("robots: { index: false, follow: false }");
    expect(pageSource).toContain("ProductionDuffelOrderPlanClient");
  });

  it("submits only the fixed confirmation and one-adult bounded search", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionDuffelOrderPlanRehearsal(
      safeSearch,
      dependencies(fetcher),
    );

    expect(result).toMatchObject({
      ok: true,
      receipt: { attemptId, offerCount: 12, eligibleOfferCount: 4 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init.headers).has("idempotency-key")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
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
    });
  });

  it("returns only the allowlisted hashes, counts, and false capabilities", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionDuffelOrderPlanRehearsal(
      safeSearch,
      dependencies(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      receipt: {
        ...safeResult(),
        consumerReleaseEnabled: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("ignoredOuterValue");
  });

  it("rejects provider references, positive dispatch counts, and true authority", async () => {
    const unsafeReceipts = [
      { providerOfferId: "off_must_never_escape" },
      { providerOrderDispatchCount: 1 },
      { stripeRequestCount: 1 },
      { rawProviderReferencesExposed: true },
      { orderEndpointAuthorized: true },
      { stripeAuthorized: true },
      { bookingAuthorized: true },
      { paymentAuthorized: true },
      { settlementAuthorized: true },
      { ticketingAuthorized: true },
    ];

    for (const unsafe of unsafeReceipts) {
      const fetcher = vi.fn().mockResolvedValue(safeResponse(unsafe));
      const result = await submitProductionDuffelOrderPlanRehearsal(
        safeSearch,
        dependencies(fetcher),
      );
      expect(result).toEqual({
        ok: false,
        status: "The inert order-plan receipt could not be verified.",
      });
      expect(JSON.stringify(result)).not.toContain("off_must_never_escape");
    }
  });

  it("fails closed for invalid searches and discards server error bodies", async () => {
    const invalidFetcher = vi.fn();
    await expect(submitProductionDuffelOrderPlanRehearsal(
      { ...safeSearch, destination: "ORD" },
      dependencies(invalidFetcher),
    )).resolves.toEqual({ ok: false, status: "Enter a valid bounded flight search." });
    expect(invalidFetcher).not.toHaveBeenCalled();

    const leaked = "never-render-provider-secret-off_123-or-order-id";
    const errorFetcher = vi.fn().mockResolvedValue(Response.json({ error: leaked }, { status: 503 }));
    const failure = await submitProductionDuffelOrderPlanRehearsal(
      safeSearch,
      dependencies(errorFetcher),
    );
    expect(failure).toEqual({
      ok: false,
      status: "The Production order-plan rehearsal is unavailable.",
    });
    expect(JSON.stringify(failure)).not.toContain(leaked);
  });

  it("states every inert boundary and persists no authority or provider data", () => {
    expect(clientSource).toContain("Build hashed order plan only");
    expect(clientSource).toContain("cannot call the Duffel order endpoint");
    expect(clientSource).toContain("create a payment or charge");
    expect(clientSource).toContain("book");
    expect(clientSource).toContain("ticket");
    expect(clientSource).toContain("provider IDs");
    expect(clientSource).toContain("Consumer release");
    expect(clientSource).toContain("Duffel order dispatches");
    expect(clientSource).toContain("Stripe requests");
    expect(clientSource).toContain("globalThis.fetch(input, init)");
    expect(clientSource).not.toMatch(/idempotency|randomUUID/i);
    expect(clientSource).not.toMatch(/localStorage|sessionStorage|navigator\.clipboard|console\./);
    expect(clientSource).not.toMatch(/fetch\(["'`]https:\/\/(?:api\.duffel\.com|api\.stripe\.com)/i);
    expect(clientSource).not.toMatch(/\/air\/orders|paymentIntents?\.create|capturePayment\s*\(/i);
  });
});
