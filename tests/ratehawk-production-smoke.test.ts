import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildRatehawkProductionHotelSearchRequest } from "../services/hotel-suppliers/inventory-sandbox-request.server";
import { runRatehawkProductionSmoke } from "../services/hotel-suppliers/ratehawk-production-smoke.server";
import {
  executeRatehawkProductionSmokeRequest,
  RatehawkProductionTransportError,
} from "../services/hotel-suppliers/ratehawk-production-transport.server";

const environment = {
  HOTEL_INVENTORY_RATEHAWK_KEY_ID: "sandbox-key",
  HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-secret",
  HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED: "true",
  HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID: "production-key",
  HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY: "production-secret",
  HOTEL_INVENTORY_RATEHAWK_PRODUCTION_SMOKE_HOTEL_ID: "123456",
};

function request() {
  return buildRatehawkProductionHotelSearchRequest({
    keyId: "production-key",
    apiKey: "production-secret",
    payload: { hids: [123456] },
  });
}

describe("RateHawk production smoke", () => {
  it("uses only the documented production search endpoint", () => {
    const value = request();
    expect(value.url).toBe("https://api.ratehawk.com/api/b2b/v3/search/serp/hotels/");
    expect(value.headers.Authorization).toMatch(/^Basic /);
  });

  it("fails closed without vendor approval or with reused sandbox credentials", async () => {
    await expect(executeRatehawkProductionSmokeRequest(request(), {
      environment: { ...environment, HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED: "false" },
    })).rejects.toMatchObject({ code: "certification_not_approved" });

    await expect(executeRatehawkProductionSmokeRequest(request(), {
      environment: {
        ...environment,
        HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID: "sandbox-key",
        HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY: "sandbox-secret",
      },
    })).rejects.toMatchObject({ code: "credentials_not_ready" });
  });

  it("rejects every production endpoint except read-only hotel search", async () => {
    await expect(executeRatehawkProductionSmokeRequest({
      ...request(),
      url: "https://api.ratehawk.com/api/b2b/v3/hotel/order/booking/form/",
    }, { environment })).rejects.toBeInstanceOf(RatehawkProductionTransportError);
  });

  it("returns only sanitized counts from a successful production response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: { hotels: [{ id: 123456, rates: [{ book_hash: "do-not-return" }] }] },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await runRatehawkProductionSmoke({
      environment,
      now: new Date("2026-11-01T12:00:00.000Z"),
      fetcher,
    });

    expect(result).toMatchObject({
      testedAt: "2026-11-01T12:00:00.000Z",
      checkin: "2026-12-01",
      checkout: "2026-12-03",
      hotelCount: 1,
      rateCount: 1,
    });
    expect(result.configurationFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain("do-not-return");
  });
});
