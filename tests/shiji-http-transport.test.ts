import { describe, expect, it, vi } from "vitest";
import { ShijiHttpTransport, ShijiTransportError } from "../services/hotel-suppliers/shiji";
import type { ShijiConfig, ShijiFetch } from "../services/hotel-suppliers/shiji";

const config: ShijiConfig = { baseUrl: "https://api.shiji.example/v1/", accessToken: "shiji-token", endpoints: {
  availability: { path: "hotels/{propertyCode}/availability", method: "GET" },
  create_reservation: { path: "reservations", method: "POST" },
  cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
} };
function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return { providerId: "shiji-pms" as const, propertyCode: "S-1", operation,
    requestId: "IRP-800", payload: { reservationId: "R/8" } };
}
describe("ShijiHttpTransport", () => {
  it("uses Shiji-issued availability mappings", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response("{}"));
    const transport = new ShijiHttpTransport(config, fetcher);
    await transport.execute({ ...request("availability"), payload: { arrival: "2026-09-10", adults: 2 } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.shiji.example/v1/hotels/S-1/availability?propertyCode=S-1&arrival=2026-09-10&adults=2");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer shiji-token" }));
  });
  it("creates reservations with JSON", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response("{}", { status: 201 }));
    const transport = new ShijiHttpTransport(config, fetcher);
    await transport.execute({ ...request("create_reservation"), payload: { guest: { lastName: "Patel" } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ propertyCode: "S-1", guest: { lastName: "Patel" } });
  });
  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response("{}"));
    await new ShijiHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/R%2F8/cancel");
  });
  it("supports refreshed tokens and Basic authentication", async () => {
    const getAccessToken = vi.fn(async () => "credentials");
    const fetcher = vi.fn<ShijiFetch>(async () => new Response("{}"));
    const transport = new ShijiHttpTransport({ ...config, accessToken: undefined, getAccessToken,
      authorizationScheme: "Basic" }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ authorization: "Basic credentials" }));
    await expect(transport.execute({ ...request("availability"), providerId: "guestline" })).rejects.toThrow("only accepts shiji-pms");
  });
  it("rejects insecure and cross-origin endpoints", async () => {
    expect(() => new ShijiHttpTransport({ ...config, baseUrl: "http://api.test" })).toThrow("must use HTTPS");
    const endpoints = { ...config.endpoints, availability: { path: "https://attacker.invalid", method: "GET" as const } };
    await expect(new ShijiHttpTransport({ ...config, endpoints }).execute(request("availability"))).rejects.toThrow("configured origin");
  });
  it("returns structured redacted errors", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response(JSON.stringify({ type: "AUTH", detail: "Hotel denied" }), { status: 403 }));
    const error = await new ShijiHttpTransport(config, fetcher).execute(request("create_reservation")).catch(value => value);
    expect(error).toBeInstanceOf(ShijiTransportError);
    expect(error).toMatchObject({ status: 403, responseCode: "AUTH", message: "Hotel denied" });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});

