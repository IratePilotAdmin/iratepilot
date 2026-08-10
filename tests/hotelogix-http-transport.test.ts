import { describe, expect, it, vi } from "vitest";
import { HotelogixHttpTransport, HotelogixTransportError } from "../services/hotel-suppliers/hotelogix";
import type { HotelogixConfig, HotelogixFetch } from "../services/hotel-suppliers/hotelogix";

const config: HotelogixConfig = {
  baseUrl: "https://partner.hotelogix.example/api/",
  apiKey: "hotelogix-key",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "hotelogix" as const,
    propertyCode: "HX-1",
    operation,
    requestId: "IRP-1200",
    payload: { reservationId: "HX/12" },
  };
}

describe("HotelogixHttpTransport", () => {
  it("uses partner-issued availability mappings and API-key authentication", async () => {
    const fetcher = vi.fn<HotelogixFetch>(async () => new Response("{}"));
    await new HotelogixHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-10-10", departure: "2026-10-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://partner.hotelogix.example/api/properties/HX-1/availability?propertyCode=HX-1&arrival=2026-10-10&departure=2026-10-12&adults=2",
    );
    expect(init?.headers).toEqual(expect.objectContaining({ "x-api-key": "hotelogix-key" }));
  });

  it("creates reservations using property-scoped JSON", async () => {
    const fetcher = vi.fn<HotelogixFetch>(async () => new Response("{}", { status: 201 }));
    await new HotelogixHttpTransport(config, fetcher).execute({
      ...request("create_reservation"),
      payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "HX-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<HotelogixFetch>(async () => new Response("{}"));
    await new HotelogixHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/HX%2F12/cancel");
  });

  it("supports rotated keys and partner-specific authentication headers", async () => {
    const getApiKey = vi.fn(async () => "fresh-key");
    const fetcher = vi.fn<HotelogixFetch>(async () => new Response("{}"));
    const transport = new HotelogixHttpTransport({
      ...config,
      apiKey: undefined,
      getApiKey,
      apiKeyHeader: "authorization",
      apiKeyScheme: "Bearer",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ authorization: "Bearer fresh-key" }),
    );
    await expect(transport.execute({ ...request("availability"), providerId: "clock-pms-plus" }))
      .rejects.toThrow("only accepts hotelogix");
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new HotelogixHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new HotelogixHttpTransport({ ...config, apiKey: "" }))
      .toThrow("API key or API key provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new HotelogixHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<HotelogixFetch>(async () => new Response(
      JSON.stringify({ errorCode: "PROPERTY_DENIED", errorMessage: "Property not authorized" }),
      { status: 403 },
    ));
    const error = await new HotelogixHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(HotelogixTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "PROPERTY_DENIED",
      message: "Property not authorized",
      requestId: "IRP-1200",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });
});
