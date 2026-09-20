import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  submitProductionDuffelLiveShoppingDiagnostic,
  type ProductionDuffelLiveShoppingClientDependencies,
  type ProductionDuffelLiveShoppingSearch,
} from "../app/admin/flights/consumer-production/live-search/live-search-client";

const pageSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/live-search/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/live-search/live-search-client.tsx", import.meta.url),
  "utf8",
);
const endpoint = "/api/admin/flights/consumer-production/live-search";
const attemptId = "11111111-1111-4111-8111-111111111111";
const responseSha256 = "a".repeat(64);

const safeSearch: ProductionDuffelLiveShoppingSearch = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2026-10-10",
  returnDate: "",
  cabin: "economy",
  adults: 1,
};

function dependencies(fetcher: ReturnType<typeof vi.fn>): ProductionDuffelLiveShoppingClientDependencies {
  return {
    fetcher: fetcher as unknown as typeof fetch,
  };
}

function safeResponse(extras: Record<string, unknown> = {}) {
  return Response.json({
    mode: "duffel_live_shopping_dark",
    result: {
      version: "flight-consumer-production-duffel-shopping-result-v1",
      attemptId,
      state: "succeeded",
      replay: false,
      liveMode: true,
      offerCount: 12,
      responseSha256,
      rawProviderReferencesExposed: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      ...extras,
    },
    consumerReleaseEnabled: false,
    providerOfferId: "off_never_render_this",
    passengerName: "Never Render",
  });
}

describe("Production Duffel live-shopping dark admin page", () => {
  it("is a Production-only uncached admin page with no indexing", () => {
    expect(pageSource).toContain('process.env.VERCEL_ENV !== "production"');
    expect(pageSource).toContain("notFound()");
    expect(pageSource).toContain('requireRole(["admin"])');
    expect(pageSource).toContain('/login?next=');
    expect(pageSource).toContain('export const dynamic = "force-dynamic"');
    expect(pageSource).toContain("export const revalidate = 0");
    expect(pageSource).toContain('export const fetchCache = "force-no-store"');
    expect(pageSource).toContain("robots: { index: false, follow: false }");
    expect(pageSource).toContain("ProductionDuffelLiveShoppingClient");
  });

  it("submits the fixed shopping-only confirmation as one same-origin JSON request", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionDuffelLiveShoppingDiagnostic(
      safeSearch,
      dependencies(fetcher),
    );

    expect(result).toMatchObject({
      ok: true,
      receipt: { attemptId, offerCount: 12, responseSha256 },
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
      confirmation: "SEARCH_DUFFEL_LIVE_INVENTORY_WITHOUT_BOOKING",
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

  it("returns only the allowlisted sanitized receipt fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionDuffelLiveShoppingDiagnostic(
      safeSearch,
      dependencies(fetcher),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("off_never_render_this");
    expect(serialized).not.toContain("Never Render");
    expect(result).toEqual({
      ok: true,
      receipt: {
        version: "flight-consumer-production-duffel-shopping-result-v1",
        attemptId,
        state: "succeeded",
        replay: false,
        liveMode: true,
        offerCount: 12,
        responseSha256,
        rawProviderReferencesExposed: false,
        consumerReleaseEnabled: false,
        bookingAuthorized: false,
        paymentAuthorized: false,
        ticketingAuthorized: false,
      },
    });
  });

  it("fails closed for invalid searches, unsafe receipts, and server error bodies", async () => {
    const invalidFetcher = vi.fn();
    await expect(submitProductionDuffelLiveShoppingDiagnostic(
      { ...safeSearch, destination: "ORD" },
      dependencies(invalidFetcher),
    )).resolves.toEqual({ ok: false, status: "Enter a valid bounded flight search." });
    expect(invalidFetcher).not.toHaveBeenCalled();

    const unsafeFetcher = vi.fn().mockResolvedValue(safeResponse({ bookingAuthorized: true }));
    await expect(submitProductionDuffelLiveShoppingDiagnostic(
      safeSearch,
      dependencies(unsafeFetcher),
    )).resolves.toEqual({
      ok: false,
      status: "The Production dark receipt could not be verified.",
    });

    const leaked = "never-render-provider-secret-or-order-id";
    const errorFetcher = vi.fn().mockResolvedValue(Response.json({ error: leaked }, { status: 503 }));
    const failure = await submitProductionDuffelLiveShoppingDiagnostic(
      safeSearch,
      dependencies(errorFetcher),
    );
    expect(failure).toEqual({
      ok: false,
      status: "The Production dark shopping diagnostic is unavailable.",
    });
    expect(JSON.stringify(failure)).not.toContain(leaked);
  });

  it("renders shopping-only guardrails and persists no authority or provider data", () => {
    expect(clientSource).toContain("Run shopping-only live diagnostic");
    expect(clientSource).toContain("cannot select an offer, create");
    expect(clientSource).toContain("collect or capture payment");
    expect(clientSource).toContain("Consumer release");
    expect(clientSource).toContain("Provider references exposed");
    expect(clientSource).toContain("Booking authorized");
    expect(clientSource).toContain("Payment authorized");
    expect(clientSource).toContain("Ticketing authorized");
    expect(clientSource).toContain("globalThis.fetch(input, init)");
    expect(clientSource).not.toMatch(/idempotency|randomUUID/i);
    expect(clientSource).not.toMatch(/localStorage|sessionStorage|navigator\.clipboard|console\./);
    expect(clientSource).not.toMatch(/createOrder\s*\(|paymentIntent|capturePayment\s*\(|\/api\/.*(?:orders|payments|tickets)/i);
  });
});
