import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { POST as search } from "../app/api/flights/search/route";
import { POST as reprice } from "../app/api/flights/offers/[id]/reprice/route";
import { POST as createOrder } from "../app/api/flights/orders/route";

const requestBody = {
  tripType: "oneway",
  origin: "ORD",
  destination: "MIA",
  departureDate: "2099-01-10",
  travelers: "1",
  cabin: "economy",
};

function post(body: unknown) {
  return new Request("https://preview.invalid/api/flights", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("synthetic flight API", () => {
  it("returns deterministic offline offers with every external capability disabled", async () => {
    const response = await search(post(requestBody));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.mode).toBe("synthetic_preview_only");
    expect(payload.offers).toHaveLength(3);
    expect(payload.orchestration).toEqual({
      commerceDomainValidated: true,
      runtimeOperation: "search",
      runtimeAuthorized: true,
      providerId: "synthetic_flight_fixture_v1",
      providerMode: "synthetic_fixture",
      liveProviderBinding: null,
      externalNetworkAccess: false,
      externalSideEffect: false,
    });
    expect(payload.capabilities).toEqual({
      externalRequestMade: false,
      passengerDataAccepted: false,
      paymentAuthorized: false,
      orderAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      productionTrafficAuthorized: false,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects extra fields so the search endpoint cannot become a passenger-data collector", async () => {
    const response = await search(post({ ...requestBody, passengerName: "Do Not Accept" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Only non-sensitive flight-search fields are accepted." });
  });

  it("rejects non-JSON and oversized bodies before parsing search fields", async () => {
    const wrongMediaType = await search(new Request("https://preview.invalid/api/flights", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(requestBody),
    }));
    expect(wrongMediaType.status).toBe(400);
    expect(await wrongMediaType.json()).toMatchObject({ error: "Content-Type must be application/json." });

    const declaredOversize = await search(new Request("https://preview.invalid/api/flights", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "8193" },
      body: "{}",
    }));
    expect(declaredOversize.status).toBe(400);
    expect(await declaredOversize.json()).toMatchObject({ error: "Flight-search JSON exceeds the 8 KiB request limit." });

    const streamedOversize = await search(post({ ...requestBody, origin: "A".repeat(9_000) }));
    expect(streamedOversize.status).toBe(400);
    expect(await streamedOversize.json()).toMatchObject({ error: "Flight-search JSON exceeds the 8 KiB request limit." });
  });

  it("reprices only an offer bound to the exact search", async () => {
    const searchResponse = await search(post(requestBody));
    const searchPayload = await searchResponse.json();
    const response = await reprice(post(requestBody), { params: Promise.resolve({ id: searchPayload.offers[0].id }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.receipt).toMatchObject({
      status: "unchanged",
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      orchestration: { runtimeOperation: "reprice", runtimeAuthorized: true, externalNetworkAccess: false },
    });
    expect(payload.orchestration).toEqual(payload.receipt.orchestration);

    const tamperedSearches = [
      { ...requestBody, destination: "LAX" },
      { ...requestBody, cabin: "business" },
      { ...requestBody, travelers: "2" },
      { ...requestBody, tripType: "roundtrip", returnDate: "2099-01-15" },
      { ...requestBody, tripType: "roundtrip", returnDate: "2099-01-16" },
    ];
    for (const tampered of tamperedSearches) {
      const missing = await reprice(post(tampered), { params: Promise.resolve({ id: searchPayload.offers[0].id }) });
      expect(missing.status).toBe(404);
    }
  });

  it("refuses every order request before reading passenger or payment data", async () => {
    const response = await createOrder();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "flight_consumer_production_order_endpoint_locked",
      mode: "consumer_production_launch_locked",
      capabilities: {
        requestBodyRead: false,
        providerRequestCount: 0,
        paymentProcessorRequestCount: 0,
        orderAuthorized: false,
        paymentAuthorized: false,
        ticketingAuthorized: false,
      },
    });
  });

  it("contains no provider, database, credential, or payment integration path", () => {
    const sources = [
      "app/api/flights/_shared.ts",
      "app/api/flights/search/route.ts",
      "app/api/flights/offers/[id]/reprice/route.ts",
      "app/api/flights/orders/route.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).toMatch(/searchSyntheticFlightMarketplace/);
    expect(sources).toMatch(/repriceSyntheticFlightOffer/);
    expect(sources).not.toMatch(/SyntheticFlightProviderAdapter/);
    expect(sources).not.toMatch(/fetch\s*\(/);
    expect(sources).not.toMatch(/createClient\s*\(/);
    expect(sources).not.toMatch(/process\.env/);
    expect(sources).not.toMatch(/from ["'][^"']*stripe/i);
    expect(sources).not.toMatch(/duffel_test_|duffel_live_/i);
  });
});
