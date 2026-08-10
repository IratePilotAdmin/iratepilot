import { describe, expect, it, vi } from "vitest";
import { MarriottFosseHttpTransport, MarriottFosseTransportError } from "../services/hotel-suppliers/marriott";
import type { MarriottFosseConfig, MarriottFosseFetch } from "../services/hotel-suppliers/marriott";

const config: MarriottFosseConfig = {
  baseUrl: "https://integration.fosse.marriott.example/api/",
  apiCredential: "marriott-fosse-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return { provider: "marriott-fosse" as const, propertyCode: "FOSSE-1", operation, requestId: "IRP-3000", payload: { reservationId: "FOSSE/20" } };
}

describe("MarriottFosseHttpTransport", () => {
  it("uses Marriott-issued mappings and authentication", async () => {
    const fetcher = vi.fn<MarriottFosseFetch>(async () => new Response("{}"));
    await new MarriottFosseHttpTransport(config, fetcher).execute({ ...request("availability"), payload: { arrival: "2026-12-10", adults: 2 } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/FOSSE-1/availability?propertyCode=FOSSE-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer marriott-fosse-token" }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<MarriottFosseFetch>(async () => new Response("{}", { status: 201 }));
    await new MarriottFosseHttpTransport(config, fetcher).execute({ ...request("create_reservation"), payload: { guest: { lastName: "Patel" } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ propertyCode: "FOSSE-1", guest: { lastName: "Patel" } });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<MarriottFosseFetch>(async () => new Response("{}"));
    await new MarriottFosseHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/FOSSE%2F20/cancel");
  });

  it("rotates credentials and rejects FS-PMS traffic", async () => {
    const fetcher = vi.fn<MarriottFosseFetch>(async () => new Response("{}"));
    const transport = new MarriottFosseHttpTransport({ ...config, apiCredential: undefined, getApiCredential: async () => "fresh-fosse", credentialHeader: "x-api-key", credentialScheme: "" }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "fresh-fosse" }));
    await expect(transport.execute({ ...request("availability"), provider: "marriott-fs-pms" })).rejects.toThrow("only accepts marriott-fosse");
  });

  it("requires HTTPS, credentials, and same-origin mappings", async () => {
    expect(() => new MarriottFosseHttpTransport({ ...config, baseUrl: "http://api.test" })).toThrow("must use HTTPS");
    expect(() => new MarriottFosseHttpTransport({ ...config, apiCredential: "" })).toThrow("credential or credential provider");
    const endpoints = { ...config.endpoints, availability: { path: "https://attacker.invalid", method: "GET" as const } };
    await expect(new MarriottFosseHttpTransport({ ...config, endpoints }).execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<MarriottFosseFetch>(async () => new Response(JSON.stringify({ errorCode: "FOSSE_DENIED", errorMessage: "Hotel not authorized" }), { status: 403 }));
    const error = await new MarriottFosseHttpTransport(config, fetcher).execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(MarriottFosseTransportError);
    expect(error).toMatchObject({ status: 403, responseCode: "FOSSE_DENIED", message: "Hotel not authorized", requestId: "IRP-3000" });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});

