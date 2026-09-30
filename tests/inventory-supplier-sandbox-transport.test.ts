import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  executeInventorySandboxRequest,
  InventorySandboxTransportError,
} from "../services/hotel-suppliers/inventory-sandbox-transport.server";
import {
  buildExpediaRapidSandboxAvailabilityRequest,
  buildHotelbedsSandboxAvailabilityRequest,
  buildRatehawkSandboxHotelSearchRequest,
  type InventorySandboxRequest,
} from "../services/hotel-suppliers/inventory-sandbox-request.server";

const hotelbedsRequest = () => buildHotelbedsSandboxAvailabilityRequest({
  apiKey: "hotelbeds-api-key",
  secret: "hotelbeds-secret",
  timestampSeconds: 1_700_000_000,
  payload: { stay: { checkIn: "2026-10-22", checkOut: "2026-10-25" } },
});

function enabledEnvironment(supplierId: InventorySandboxRequest["supplierId"]) {
  if (supplierId === "hotelbeds") {
    return {
      HOTEL_INVENTORY_HOTELBEDS_SANDBOX_ENABLED: "true",
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "hotelbeds-api-key",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "hotelbeds-secret",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE:
        "-----BEGIN CERTIFICATE-----\ncertificate-data\n-----END CERTIFICATE-----",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\nprivate-key-data\n-----END PRIVATE KEY-----",
    };
  }
  if (supplierId === "ratehawk") {
    return {
      HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
      HOTEL_INVENTORY_RATEHAWK_KEY_ID: "partner-id",
      HOTEL_INVENTORY_RATEHAWK_API_KEY: "ratehawk-api-key",
    };
  }
  return {
    HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED: "true",
    HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "expedia-api-key",
    HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "expedia-shared-secret",
  };
}

describe("inventory supplier sandbox transport", () => {
  it("fails closed before calling fetch", async () => {
    const fetcher = vi.fn();
    await expect(executeInventorySandboxRequest(hotelbedsRequest(), {
      environment: {},
      fetcher,
    })).rejects.toMatchObject({ code: "disabled", supplierId: "hotelbeds" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    hotelbedsRequest(),
    buildRatehawkSandboxHotelSearchRequest({
      keyId: "partner-id",
      apiKey: "ratehawk-api-key",
      payload: { hids: [10004873] },
    }),
    buildExpediaRapidSandboxAvailabilityRequest({
      apiKey: "expedia-api-key",
      sharedSecret: "expedia-shared-secret",
      timestampSeconds: 1_700_000_000,
      query: { property_id: "123", occupancy: 2 },
    }),
  ])("executes a validated $supplierId sandbox request", async (request) => {
    const fetcher = vi.fn(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response('{"hotels":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(executeInventorySandboxRequest(request, {
      environment: enabledEnvironment(request.supplierId),
      fetcher,
    })).resolves.toEqual({ hotels: [] });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: request.method,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
    });
  });

  it("rejects a forged production endpoint", async () => {
    const forged: InventorySandboxRequest = {
      ...hotelbedsRequest(),
      url: "https://api.hotelbeds.com/hotel-api/1.0/hotels",
    };
    const fetcher = vi.fn();
    await expect(executeInventorySandboxRequest(forged, {
      environment: enabledEnvironment(forged.supplierId),
      fetcher,
    })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns safe network errors without leaking transport details", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("secret upstream detail");
    });
    let thrown: unknown;
    try {
      await executeInventorySandboxRequest(hotelbedsRequest(), {
        environment: enabledEnvironment("hotelbeds"),
        fetcher,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InventorySandboxTransportError);
    expect(thrown).toMatchObject({ code: "network_error", supplierId: "hotelbeds" });
    expect(String(thrown)).not.toContain("secret upstream detail");
  });

  it("rejects invalid timeout configuration before calling fetch", async () => {
    const fetcher = vi.fn();
    await expect(executeInventorySandboxRequest(hotelbedsRequest(), {
      environment: enabledEnvironment("hotelbeds"),
      timeoutMs: 30_001,
      fetcher,
    })).rejects.toMatchObject({ code: "invalid_timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
