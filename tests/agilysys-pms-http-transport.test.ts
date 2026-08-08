import { describe, expect, it, vi } from "vitest";
import { AgilysysPmsHttpTransport, AgilysysPmsTransportError } from "../services/hotel-suppliers/agilysys-pms";
import type { AgilysysPmsConfig, AgilysysPmsFetch } from "../services/hotel-suppliers/agilysys-pms";

const config: AgilysysPmsConfig = {
  baseUrl: "https://partner.agilysys.example/pms/",
  apiCredential: "agilysys-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "agilysys-pms" as const,
    propertyCode: "AG-1",
    operation,
    requestId: "IRP-1400",
    payload: { reservationId: "AG/14" },
  };
}

describe("AgilysysPmsHttpTransport", () => {
  it("uses issued mappings and bearer authentication", async () => {
    const fetcher = vi.fn<AgilysysPmsFetch>(async () => new Response("{}"));
    await new AgilysysPmsHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-12-10", departure: "2026-12-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/AG-1/availability?propertyCode=AG-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer agilysys-token",
    }));
  });

  it("creates reservations using property-scoped JSON", async () => {
    const fetcher = vi.fn<AgilysysPmsFetch>(async () => new Response("{}", { status: 201 }));
    await new AgilysysPmsHttpTransport(config, fetcher).execute({
      ...request("create_reservation"),
      payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "AG-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<AgilysysPmsFetch>(async () => new Response("{}"));
    await new AgilysysPmsHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/AG%2F14/cancel");
  });

  it("supports rotated credentials and issued authentication headers", async () => {
    const getApiCredential = vi.fn(async () => "fresh-agilysys-key");
    const fetcher = vi.fn<AgilysysPmsFetch>(async () => new Response("{}"));
    const transport = new AgilysysPmsHttpTransport({
      ...config,
      apiCredential: undefined,
      getApiCredential,
      credentialHeader: "x-api-key",
      credentialScheme: "",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      "x-api-key": "fresh-agilysys-key",
    }));
    await expect(transport.execute({ ...request("availability"), providerId: "infor-hms" }))
      .rejects.toThrow("only accepts agilysys-pms");
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new AgilysysPmsHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new AgilysysPmsHttpTransport({ ...config, apiCredential: "" }))
      .toThrow("API credential or credential provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new AgilysysPmsHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<AgilysysPmsFetch>(async () => new Response(
      JSON.stringify({ errorCode: "PROPERTY_DENIED", errorMessage: "Property not authorized" }),
      { status: 403 },
    ));
    const error = await new AgilysysPmsHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(AgilysysPmsTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "PROPERTY_DENIED",
      message: "Property not authorized",
      requestId: "IRP-1400",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});
