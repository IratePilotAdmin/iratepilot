import { describe, expect, it, vi } from "vitest";
import { PlanetProtelHttpTransport, PlanetProtelTransportError } from "../services/hotel-suppliers/planet-protel";
import type { PlanetProtelConfig, PlanetProtelFetch } from "../services/hotel-suppliers/planet-protel";

const config: PlanetProtelConfig = {
  baseUrl: "https://integration.protel.example/api/",
  apiCredential: "planet-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "planet-protel" as const,
    propertyCode: "PT-1",
    operation,
    requestId: "IRP-1500",
    payload: { reservationId: "PT/15" },
  };
}

describe("PlanetProtelHttpTransport", () => {
  it("uses partner-issued mappings and bearer authentication", async () => {
    const fetcher = vi.fn<PlanetProtelFetch>(async () => new Response("{}"));
    await new PlanetProtelHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-12-10", departure: "2026-12-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/PT-1/availability?propertyCode=PT-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer planet-token" }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<PlanetProtelFetch>(async () => new Response("{}", { status: 201 }));
    await new PlanetProtelHttpTransport(config, fetcher).execute({
      ...request("create_reservation"), payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "PT-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<PlanetProtelFetch>(async () => new Response("{}"));
    await new PlanetProtelHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/PT%2F15/cancel");
  });

  it("supports rotated credentials and issued authentication headers", async () => {
    const getApiCredential = vi.fn(async () => "fresh-planet-key");
    const fetcher = vi.fn<PlanetProtelFetch>(async () => new Response("{}"));
    const transport = new PlanetProtelHttpTransport({
      ...config, apiCredential: undefined, getApiCredential,
      credentialHeader: "x-api-key", credentialScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      "x-api-key": "fresh-planet-key",
    }));
    await expect(transport.execute({ ...request("availability"), providerId: "agilysys-pms" }))
      .rejects.toThrow("only accepts planet-protel");
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new PlanetProtelHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new PlanetProtelHttpTransport({ ...config, apiCredential: "" }))
      .toThrow("API credential or credential provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new PlanetProtelHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<PlanetProtelFetch>(async () => new Response(
      JSON.stringify({ errorCode: "HOTEL_DENIED", errorMessage: "Hotel not authorized" }),
      { status: 403 },
    ));
    const error = await new PlanetProtelHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(PlanetProtelTransportError);
    expect(error).toMatchObject({
      status: 403, responseCode: "HOTEL_DENIED", message: "Hotel not authorized", requestId: "IRP-1500",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});
