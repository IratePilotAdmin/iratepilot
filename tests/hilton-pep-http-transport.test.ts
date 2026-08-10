import { describe, expect, it, vi } from "vitest";
import { HiltonPepHttpTransport, HiltonPepTransportError } from "../services/hotel-suppliers/hilton";
import type { HiltonPepConfig, HiltonPepFetch } from "../services/hotel-suppliers/hilton";

const config: HiltonPepConfig = {
  baseUrl: "https://integration.pep.hilton.example/api/",
  apiCredential: "hilton-issued-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    provider: "hilton-pep" as const,
    propertyCode: "HIL-1",
    operation,
    requestId: "IRP-1900",
    payload: { reservationId: "PEP/19" },
  };
}

describe("HiltonPepHttpTransport", () => {
  it("uses Hilton-issued endpoint mappings and authentication", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response("{}"));
    await new HiltonPepHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-12-10", departure: "2026-12-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/HIL-1/availability?propertyCode=HIL-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer hilton-issued-token",
    }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response("{}", { status: 201 }));
    await new HiltonPepHttpTransport(config, fetcher).execute({
      ...request("create_reservation"), payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "HIL-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response("{}"));
    await new HiltonPepHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/PEP%2F19/cancel");
  });

  it("supports rotated credentials and rejects Hilton OnQ traffic", async () => {
    const getApiCredential = vi.fn(async () => "fresh-pep-key");
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response("{}"));
    const transport = new HiltonPepHttpTransport({
      ...config, apiCredential: undefined, getApiCredential,
      credentialHeader: "x-api-key", credentialScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      "x-api-key": "fresh-pep-key",
    }));
    await expect(transport.execute({ ...request("availability"), provider: "hilton-onq" }))
      .rejects.toThrow("only accepts hilton-pep");
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new HiltonPepHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new HiltonPepHttpTransport({ ...config, apiCredential: "" }))
      .toThrow("API credential or credential provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new HiltonPepHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response(
      JSON.stringify({ errorCode: "HOTEL_DENIED", errorMessage: "Hotel not authorized" }),
      { status: 403 },
    ));
    const error = await new HiltonPepHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(HiltonPepTransportError);
    expect(error).toMatchObject({
      status: 403, responseCode: "HOTEL_DENIED", message: "Hotel not authorized",
      requestId: "IRP-1900",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});
