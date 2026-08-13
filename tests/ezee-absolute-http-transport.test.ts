import { describe, expect, it, vi } from "vitest";
import {
  EzeeAbsoluteHttpTransport,
  EzeeAbsoluteTransportError,
} from "../services/hotel-suppliers/ezee-absolute";
import type {
  EzeeAbsoluteConfig,
  EzeeAbsoluteFetch,
} from "../services/hotel-suppliers/ezee-absolute";

const config: EzeeAbsoluteConfig = {
  baseUrl: "https://api.ezee.example/pms/",
  accessToken: "ezee-token",
  endpoints: {
    availability: { path: "hotels/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "ezee-absolute" as const,
    propertyCode: "EZ-1",
    operation,
    requestId: "IRP-1000",
    payload: { reservationId: "EZ/10" },
  };
}

describe("EzeeAbsoluteHttpTransport", () => {
  it("uses partner-issued availability mappings", async () => {
    const fetcher = vi.fn<EzeeAbsoluteFetch>(async () => new Response("{}"));
    const transport = new EzeeAbsoluteHttpTransport(config, fetcher);
    await transport.execute({
      ...request("availability"),
      payload: { arrival: "2026-09-10", departure: "2026-09-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.ezee.example/pms/hotels/EZ-1/availability?propertyCode=EZ-1&arrival=2026-09-10&departure=2026-09-12&adults=2",
    );
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer ezee-token" }));
  });

  it("creates reservations using JSON", async () => {
    const fetcher = vi.fn<EzeeAbsoluteFetch>(async () => new Response("{}", { status: 201 }));
    const transport = new EzeeAbsoluteHttpTransport(config, fetcher);
    await transport.execute({
      ...request("create_reservation"),
      payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "EZ-1",
      guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<EzeeAbsoluteFetch>(async () => new Response("{}"));
    await new EzeeAbsoluteHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/EZ%2F10/cancel");
  });

  it("supports refreshed tokens and vendor-specific authentication headers", async () => {
    const getAccessToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<EzeeAbsoluteFetch>(async () => new Response("{}"));
    const transport = new EzeeAbsoluteHttpTransport({
      ...config,
      accessToken: undefined,
      getAccessToken,
      authorizationHeader: "x-api-key",
      authorizationScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ "x-api-key": "fresh-token" }),
    );
    await expect(transport.execute({ ...request("availability"), providerId: "hotelogix" }))
      .rejects.toThrow("only accepts ezee-absolute");
  });

  it("requires HTTPS and same-origin endpoint mappings", async () => {
    expect(() => new EzeeAbsoluteHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new EzeeAbsoluteHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<EzeeAbsoluteFetch>(async () => new Response(
      JSON.stringify({ errorCode: "HOTEL_DENIED", errorMessage: "Hotel not authorized" }),
      { status: 403 },
    ));
    const error = await new EzeeAbsoluteHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(EzeeAbsoluteTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "HOTEL_DENIED",
      message: "Hotel not authorized",
      requestId: "IRP-1000",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});

