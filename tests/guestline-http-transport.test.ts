import { describe, expect, it, vi } from "vitest";
import { GuestlineHttpTransport, GuestlineTransportError } from "../services/hotel-suppliers/guestline";
import type { GuestlineConfig, GuestlineFetch } from "../services/hotel-suppliers/guestline";

const config: GuestlineConfig = {
  baseUrl: "https://api.guestline.example/rezlynx/",
  accessToken: "guestline-token",
  endpoints: {
    availability: { path: "sites/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "guestline" as const,
    propertyCode: "GL-1",
    operation,
    requestId: "IRP-900",
    payload: { reservationId: "RES/10" },
  };
}

describe("GuestlineHttpTransport", () => {
  it("uses Rezlynx partner-issued availability mappings", async () => {
    const fetcher = vi.fn<GuestlineFetch>(async () => new Response("{}"));
    const transport = new GuestlineHttpTransport(config, fetcher);
    await transport.execute({ ...request("availability"), payload: { arrival: "2026-09-10", adults: 2 } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.guestline.example/rezlynx/sites/GL-1/availability?propertyCode=GL-1&arrival=2026-09-10&adults=2",
    );
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer guestline-token" }));
  });

  it("creates reservations using JSON", async () => {
    const fetcher = vi.fn<GuestlineFetch>(async () => new Response("{}", { status: 201 }));
    const transport = new GuestlineHttpTransport(config, fetcher);
    await transport.execute({ ...request("create_reservation"), payload: { guest: { lastName: "Patel" } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "GL-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<GuestlineFetch>(async () => new Response("{}"));
    await new GuestlineHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/RES%2F10/cancel");
  });

  it("supports refreshed tokens and vendor-specific authentication headers", async () => {
    const getAccessToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<GuestlineFetch>(async () => new Response("{}"));
    const transport = new GuestlineHttpTransport({
      ...config,
      accessToken: undefined,
      getAccessToken,
      authorizationHeader: "x-api-key",
      authorizationScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "fresh-token" }));
    await expect(transport.execute({ ...request("availability"), providerId: "hotelogix" }))
      .rejects.toThrow("only accepts guestline");
  });

  it("requires HTTPS and same-origin endpoint mappings", async () => {
    expect(() => new GuestlineHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new GuestlineHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<GuestlineFetch>(async () => new Response(
      JSON.stringify({ code: "SITE_DENIED", message: "Site not authorized" }), { status: 403 },
    ));
    const error = await new GuestlineHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(GuestlineTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "SITE_DENIED",
      message: "Site not authorized",
      requestId: "IRP-900",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});

