import { describe, expect, it, vi } from "vitest";
import { MaestroHttpTransport, MaestroTransportError } from "../services/hotel-suppliers/maestro";
import type { MaestroConfig, MaestroFetch } from "../services/hotel-suppliers/maestro";

const config: MaestroConfig = {
  baseUrl: "https://partner-api.maestropms.example/v1/",
  accessToken: "maestro-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "maestro-pms" as const,
    propertyCode: "MST-1",
    operation,
    requestId: "IRP-700",
    payload: { reservationId: "RES/9" },
  };
}

describe("MaestroHttpTransport", () => {
  it("uses partner-issued mappings for availability", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response("{}"));
    const transport = new MaestroHttpTransport(config, fetcher);
    await transport.execute({ ...request("availability"), payload: {
      arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://partner-api.maestropms.example/v1/properties/MST-1/availability?propertyCode=MST-1&arrivalDate=2026-09-10&departureDate=2026-09-12&adults=2",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer maestro-token" }));
  });

  it("creates a reservation with JSON", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response("{}", { status: 201 }));
    const transport = new MaestroHttpTransport(config, fetcher);
    await transport.execute({ ...request("create_reservation"), payload: { guest: { lastName: "Lovelace" } } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://partner-api.maestropms.example/v1/reservations");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ propertyCode: "MST-1", guest: { lastName: "Lovelace" } });
  });

  it("encodes the reservation ID for cancellation", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response("{}"));
    const transport = new MaestroHttpTransport(config, fetcher);
    await transport.execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://partner-api.maestropms.example/v1/reservations/RES%2F9/cancel",
    );
  });

  it("supports vendor-specific auth headers and refreshed tokens", async () => {
    const getAccessToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<MaestroFetch>(async () => new Response("{}"));
    const transport = new MaestroHttpTransport({
      ...config, accessToken: undefined, getAccessToken,
      authorizationHeader: "x-api-key", authorizationScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "fresh-token" }));
    await expect(transport.execute({ ...request("availability"), providerId: "hotelogix" }))
      .rejects.toThrow("only accepts maestro-pms");
  });

  it("requires HTTPS, complete mappings, and same-origin endpoints", async () => {
    expect(() => new MaestroHttpTransport({ ...config, baseUrl: "http://api.test/" }))
      .toThrow("must use HTTPS");
    const endpoints = { ...config.endpoints, availability: { path: "https://attacker.invalid", method: "GET" as const } };
    const transport = new MaestroHttpTransport({ ...config, endpoints });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response(
      JSON.stringify({ errorCode: "AUTH", errorMessage: "Property denied" }), { status: 403 },
    ));
    const transport = new MaestroHttpTransport(config, fetcher);
    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(MaestroTransportError);
    expect(error).toMatchObject({
      status: 403, operation: "create_reservation", requestId: "IRP-700",
      responseCode: "AUTH", message: "Property denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});
