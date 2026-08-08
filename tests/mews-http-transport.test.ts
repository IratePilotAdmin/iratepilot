import { describe, expect, it, vi } from "vitest";
import {
  MewsHttpTransport,
  MewsTransportError,
} from "../services/hotel-suppliers/mews";
import type { MewsFetch } from "../services/hotel-suppliers/mews";

const config = {
  baseUrl: "https://api.mews-demo.test",
  clientToken: "client-secret-token",
  accessToken: "property-access-token",
  client: "iRatePilot 1.0.0",
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    propertyCode: "hotel-1",
    operation,
    requestId: "IRP-100",
    payload: { ServiceId: "service-1" },
  };
}

describe("MewsHttpTransport", () => {
  it("adds Mews authentication to availability requests", async () => {
    const fetcher = vi.fn<MewsFetch>(async () => new Response(
      JSON.stringify({ TimeUnitStartsUtc: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const transport = new MewsHttpTransport(config, fetcher);

    await transport.execute(request("availability"));

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.mews-demo.test/api/connector/v1/services/getAvailability");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({
      "content-type": "application/json",
      "x-iratepilot-request-id": "IRP-100",
    }));
    expect(JSON.parse(String(init?.body))).toEqual({
      ClientToken: "client-secret-token",
      AccessToken: "property-access-token",
      Client: "iRatePilot 1.0.0",
      ServiceId: "service-1",
    });
  });

  it.each([
    ["create_reservation", "/api/connector/v1/reservations/add"],
    ["cancel_reservation", "/api/connector/v1/reservations/cancel"],
  ] as const)("routes %s to the allowlisted endpoint", async (operation, path) => {
    const fetcher = vi.fn<MewsFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new MewsHttpTransport(config, fetcher);
    await transport.execute(request(operation));
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`https://api.mews-demo.test${path}`);
  });

  it("rejects insecure base URLs", () => {
    expect(() => new MewsHttpTransport({ ...config, baseUrl: "http://api.mews.test" }))
      .toThrow("Mews base URL must use HTTPS");
  });

  it("prevents operation overrides from sending credentials to another origin", async () => {
    const transport = new MewsHttpTransport({
      ...config,
      operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without including credentials", async () => {
    const fetcher = vi.fn<MewsFetch>(async () => new Response(
      JSON.stringify({ Code: "InvalidAccessToken", Message: "Access denied" }),
      { status: 401, headers: { "content-type": "application/json" } },
    ));
    const transport = new MewsHttpTransport(config, fetcher);

    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(MewsTransportError);
    expect(error).toMatchObject({
      status: 401,
      operation: "create_reservation",
      requestId: "IRP-100",
      responseCode: "InvalidAccessToken",
      message: "Access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.clientToken);
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});

