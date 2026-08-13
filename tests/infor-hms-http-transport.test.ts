import { describe, expect, it, vi } from "vitest";
import { InforHmsHttpTransport, InforHmsTransportError } from "../services/hotel-suppliers/infor-hms";
import type { InforHmsConfig, InforHmsFetch } from "../services/hotel-suppliers/infor-hms";

const config: InforHmsConfig = {
  baseUrl: "https://mingle-ionapi.inforcloudsuite.example/HMS/",
  accessToken: "infor-token",
  tenantId: "IRATE_TENANT",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "infor-hms" as const,
    propertyCode: "IH-1",
    operation,
    requestId: "IRP-1300",
    payload: { reservationId: "IH/13" },
  };
}

describe("InforHmsHttpTransport", () => {
  it("uses OAuth bearer authentication and tenant scoping", async () => {
    const fetcher = vi.fn<InforHmsFetch>(async () => new Response("{}"));
    await new InforHmsHttpTransport(config, fetcher).execute({
      ...request("availability"),
      payload: { arrival: "2026-11-10", departure: "2026-11-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/IH-1/availability?propertyCode=IH-1&arrival=2026-11-10");
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer infor-token",
      "x-infor-tenant": "IRATE_TENANT",
    }));
  });

  it("creates reservations using property-scoped JSON", async () => {
    const fetcher = vi.fn<InforHmsFetch>(async () => new Response("{}", { status: 201 }));
    await new InforHmsHttpTransport(config, fetcher).execute({
      ...request("create_reservation"),
      payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "IH-1", guest: { lastName: "Patel" },
    });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<InforHmsFetch>(async () => new Response("{}"));
    await new InforHmsHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/IH%2F13/cancel");
  });

  it("supports refreshed tokens and issued tenant header names", async () => {
    const getAccessToken = vi.fn(async () => "fresh-infor-token");
    const fetcher = vi.fn<InforHmsFetch>(async () => new Response("{}"));
    const transport = new InforHmsHttpTransport({
      ...config,
      accessToken: undefined,
      getAccessToken,
      tenantHeader: "x-tenant-id",
    }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer fresh-infor-token",
      "x-tenant-id": "IRATE_TENANT",
    }));
    await expect(transport.execute({ ...request("availability"), providerId: "hotelogix" }))
      .rejects.toThrow("only accepts infor-hms");
  });

  it("requires HTTPS, credentials, and same-origin endpoint mappings", async () => {
    expect(() => new InforHmsHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new InforHmsHttpTransport({ ...config, accessToken: "" }))
      .toThrow("access token or token provider");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new InforHmsHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<InforHmsFetch>(async () => new Response(
      JSON.stringify({ errorCode: "TENANT_DENIED", errorMessage: "Tenant not authorized" }),
      { status: 403 },
    ));
    const error = await new InforHmsHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(InforHmsTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "TENANT_DENIED",
      message: "Tenant not authorized",
      requestId: "IRP-1300",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});
