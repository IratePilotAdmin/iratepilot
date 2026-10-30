import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  buildExpediaRapidSandboxAvailabilityRequest,
  buildHotelbedsSandboxAvailabilityRequest,
  buildRatehawkSandboxHotelPrebookRequest,
  buildRatehawkSandboxHotelSearchRequest,
  buildStubaSandboxHotelSearchRequest,
} from "../services/hotel-suppliers/inventory-sandbox-request.server";

describe("inventory supplier sandbox request builders", () => {
  it("builds a Hotelbeds sandbox availability request", () => {
    const request = buildHotelbedsSandboxAvailabilityRequest({
      apiKey: "hotelbeds-api-key",
      secret: "hotelbeds-secret",
      timestampSeconds: 1_700_000_000,
      payload: { stay: { checkIn: "2026-10-22", checkOut: "2026-10-25" } },
    });

    expect(request).toMatchObject({
      supplierId: "hotelbeds",
      url: "https://api.test.hotelbeds.com/hotel-api/1.0/hotels",
      method: "POST",
      headers: {
        "Api-key": "hotelbeds-api-key",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: '{"stay":{"checkIn":"2026-10-22","checkOut":"2026-10-25"}}',
    });
    expect(request.headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a RateHawk sandbox hotel-ID search request", () => {
    const request = buildRatehawkSandboxHotelSearchRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      payload: { hids: [10004873], checkin: "2026-10-22", checkout: "2026-10-25" },
    });

    expect(request).toEqual({
      supplierId: "ratehawk",
      url: "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/hotels/",
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("partner-id:ratehawk-api-key").toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: '{"hids":[10004873],"checkin":"2026-10-22","checkout":"2026-10-25"}',
    });
  });

  it("builds a RateHawk sandbox hotel prebook request", () => {
    const request = buildRatehawkSandboxHotelPrebookRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      rateHash: " h-sandbox-rate ",
      priceIncreasePercent: 10,
    });

    expect(request).toEqual({
      supplierId: "ratehawk",
      url: "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/prebook/",
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("partner-id:ratehawk-api-key").toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: '{"hash":"h-sandbox-rate","price_increase_percent":10}',
    });
  });

  it("builds an Expedia Rapid sandbox availability request", () => {
    const request = buildExpediaRapidSandboxAvailabilityRequest({
      apiKey: "expedia-api-key",
      sharedSecret: "expedia-shared-secret",
      timestampSeconds: 1_700_000_000,
      query: {
        property_id: ["123", "456"],
        checkin: "2026-10-22",
        checkout: "2026-10-25",
        occupancy: 2,
      },
    });

    const url = new URL(request.url);
    expect(request.supplierId).toBe("expedia-rapid");
    expect(request.method).toBe("GET");
    expect(url.origin).toBe("https://test.ean.com");
    expect(url.pathname).toBe("/v3/properties/availability");
    expect(url.searchParams.getAll("property_id")).toEqual(["123", "456"]);
    expect(request.headers.Authorization).toMatch(
      /^EAN APIKey=expedia-api-key,Signature=[a-f0-9]{128},timestamp=1700000000$/,
    );
    expect(request.headers).toMatchObject({
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "User-Agent": "iRatePilot/1.0",
    });
  });

  it("builds a Stuba JSON sandbox hotel search request", () => {
    const request = buildStubaSandboxHotelSearchRequest({
      authApiKey: "issued-stuba-sandbox-key",
      payload: {
        checkIn: "2026-10-22",
        checkOut: "2026-10-25",
        hotelIds: [55492],
      },
    });

    expect(request).toEqual({
      supplierId: "stuba",
      url: "https://testapijson.stuba.com/HotelSearch",
      method: "POST",
      headers: {
        AuthApiKey: "issued-stuba-sandbox-key",
        Accept: "application/json",
        "Accept-Encoding": "gzip,br",
        "Content-Type": "application/json",
      },
      body: '{"checkIn":"2026-10-22","checkOut":"2026-10-25","hotelIds":[55492]}',
    });
  });

  it("rejects invalid bodies and query values", () => {
    expect(() => buildHotelbedsSandboxAvailabilityRequest({
      apiKey: "hotelbeds-api-key",
      secret: "hotelbeds-secret",
      timestampSeconds: 1,
      payload: [] as unknown as Record<string, unknown>,
    })).toThrow("payload must be an object");

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => buildRatehawkSandboxHotelSearchRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      payload: circular,
    })).toThrow("not JSON serializable");

    expect(() => buildExpediaRapidSandboxAvailabilityRequest({
      apiKey: "expedia-api-key",
      sharedSecret: "expedia-shared-secret",
      timestampSeconds: 1,
      query: {},
    })).toThrow("query parameters are required");

    expect(() => buildStubaSandboxHotelSearchRequest({
      authApiKey: "bad\nInjected: yes",
      payload: { hotelIds: [55492] },
    })).toThrow("API key is invalid");

    expect(() => buildRatehawkSandboxHotelPrebookRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      rateHash: "bad\nrate",
    })).toThrow("rate hash is invalid");

    expect(() => buildRatehawkSandboxHotelPrebookRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      rateHash: "h-sandbox-rate",
      priceIncreasePercent: 101,
    })).toThrow("price increase percentage is invalid");
  });
});
