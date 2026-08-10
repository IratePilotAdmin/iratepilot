import { describe, expect, it, vi } from "vitest";
import { HiltonOnQHttpTransport, HiltonOnQTransportError } from "../services/hotel-suppliers/hilton";
import type { HiltonOnQConfig, HiltonOnQFetch } from "../services/hotel-suppliers/hilton";

const config: HiltonOnQConfig = {
  baseUrl: "https://integration.onq.hilton.example/api/",
  apiCredential: "hilton-onq-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return { provider: "hilton-onq" as const, propertyCode: "ONQ-1", operation, requestId: "IRP-2000", payload: { reservationId: "ONQ/20" } };
}

describe("HiltonOnQHttpTransport", () => {
  it("uses Hilton-issued mappings and authentication", async () => {
    const fetcher = vi.fn<HiltonOnQFetch>(async () => new Response("{}"));
    await new HiltonOnQHttpTransport(config, fetcher).execute({ ...request("availability"), payload: { arrival: "2026-12-10", adults: 2 } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/ONQ-1/availability?propertyCode=ONQ-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer hilton-onq-token" }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<HiltonOnQFetch>(async () => new Response("{}", { status: 201 }));
    await new HiltonOnQHttpTransport(config, fetcher).execute({ ...request("create_reservation"), payload: { guest: { lastName: "Patel" } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ propertyCode: "ONQ-1", guest: { lastName: "Patel" } });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<HiltonOnQFetch>(async () => new Response("{}"));
    await new HiltonOnQHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/ONQ%2F20/cancel");
  });

  it("rotates credentials and rejects PEP traffic", async () => {
    const fetcher = vi.fn<HiltonOnQFetch>(async () => new Response("{}"));
    const transport = new HiltonOnQHttpTransport({ ...config, apiCredential: undefined, getApiCredential: async () => "fresh-onq", credentialHeader: "x-api-key", credentialScheme: "" }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "fresh-onq" }));
    await expect(transport.execute({ ...request("availability"), provider: "hilton-pep" })).rejects.toThrow("only accepts hilton-onq");
  });

  it("requires HTTPS, credentials, and same-origin mappings", async () => {
    expect(() => new HiltonOnQHttpTransport({ ...config, baseUrl: "http://api.test" })).toThrow("must use HTTPS");
    expect(() => new HiltonOnQHttpTransport({ ...config, apiCredential: "" })).toThrow("credential or credential provider");
    const endpoints = { ...config.endpoints, availability: { path: "https://attacker.invalid", method: "GET" as const } };
    await expect(new HiltonOnQHttpTransport({ ...config, endpoints }).execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<HiltonOnQFetch>(async () => new Response(JSON.stringify({ errorCode: "ONQ_DENIED", errorMessage: "Hotel not authorized" }), { status: 403 }));
    const error = await new HiltonOnQHttpTransport(config, fetcher).execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(HiltonOnQTransportError);
    expect(error).toMatchObject({ status: 403, responseCode: "ONQ_DENIED", message: "Hotel not authorized", requestId: "IRP-2000" });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});

