import { describe, expect, it, vi } from "vitest";
import { HotelKeyHttpTransport, HotelKeyTransportError } from "../services/hotel-suppliers/hotelkey";
import type { HotelKeyConfig, HotelKeyFetch } from "../services/hotel-suppliers/hotelkey";

const config: HotelKeyConfig = {
  baseUrl: "https://integration.hotelkey.example/api/",
  apiCredential: "hotelkey-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    propertyCode: "HK-1",
    operation,
    requestId: "IRP-1800",
    payload: { reservationId: "HK/18" },
  };
}

describe("HotelKeyHttpTransport", () => {
  it("uses partner-issued mappings and bearer authentication", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response("{}"));
    await new HotelKeyHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-12-10", departure: "2026-12-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/HK-1/availability?propertyCode=HK-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer hotelkey-token" }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response("{}", { status: 201 }));
    await new HotelKeyHttpTransport(config, fetcher).execute({
      ...request("create_reservation"), payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "HK-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response("{}"));
    await new HotelKeyHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/HK%2F18/cancel");
  });

  it("supports rotated credentials and partner-issued authentication headers", async () => {
    const getApiCredential = vi.fn(async () => "fresh-hotelkey-key");
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response("{}"));
    const transport = new HotelKeyHttpTransport({
      ...config, apiCredential: undefined, getApiCredential,
      credentialHeader: "x-api-key", credentialScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      "x-api-key": "fresh-hotelkey-key",
    }));
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new HotelKeyHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new HotelKeyHttpTransport({ ...config, apiCredential: "" }))
      .toThrow("API credential or credential provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new HotelKeyHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response(
      JSON.stringify({ errorCode: "PROPERTY_DENIED", errorMessage: "Property not authorized" }),
      { status: 403 },
    ));
    const error = await new HotelKeyHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(HotelKeyTransportError);
    expect(error).toMatchObject({
      status: 403, responseCode: "PROPERTY_DENIED", message: "Property not authorized",
      requestId: "IRP-1800",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});
