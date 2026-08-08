import { describe, expect, it, vi } from "vitest";
import { ClockPmsHttpTransport, ClockPmsTransportError } from "../services/hotel-suppliers/clock-pms-plus";
import type { ClockPmsConfig, ClockPmsFetch } from "../services/hotel-suppliers/clock-pms-plus";

const getDigestAuthorization = vi.fn(async () => 'Digest username="api-user", response="signed"');
const config: ClockPmsConfig = {
  baseUrl: "https://sky-eu1.clock-software.example/pms_api/11111/22222/",
  apiUser: "api-user",
  apiKey: "api-secret",
  getDigestAuthorization,
  endpoints: {
    availability: { path: "availability", method: "GET" },
    create_reservation: { path: "bookings", method: "POST" },
    cancel_reservation: { path: "bookings/{bookingId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "clock-pms-plus" as const,
    propertyCode: "22222",
    operation,
    requestId: "IRP-1100",
    payload: { bookingId: "BK/11" },
  };
}

describe("ClockPmsHttpTransport", () => {
  it("signs the final availability URL using Digest authentication", async () => {
    getDigestAuthorization.mockClear();
    const fetcher = vi.fn<ClockPmsFetch>(async () => new Response("{}"));
    const transport = new ClockPmsHttpTransport(config, fetcher);
    await transport.execute({
      ...request("availability"),
      payload: { arrival: "2026-09-10", departure: "2026-09-12", adults: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("availability?propertyCode=22222&arrival=2026-09-10");
    expect(getDigestAuthorization).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET", apiUser: "api-user", apiKey: "api-secret",
    }));
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: expect.stringMatching(/^Digest /),
    }));
  });

  it("creates bookings using JSON", async () => {
    const fetcher = vi.fn<ClockPmsFetch>(async () => new Response("{}", { status: 201 }));
    await new ClockPmsHttpTransport(config, fetcher).execute({
      ...request("create_reservation"),
      payload: { guest: { lastName: "Patel" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      propertyCode: "22222", guest: { lastName: "Patel" },
    });
  });

  it("encodes booking IDs for cancellation", async () => {
    const fetcher = vi.fn<ClockPmsFetch>(async () => new Response("{}"));
    await new ClockPmsHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("bookings/BK%2F11/cancel");
  });

  it("rejects wrong providers and non-Digest signer output", async () => {
    const fetcher = vi.fn<ClockPmsFetch>(async () => new Response("{}"));
    const transport = new ClockPmsHttpTransport(config, fetcher);
    await expect(transport.execute({ ...request("availability"), providerId: "hotelogix" }))
      .rejects.toThrow("only accepts clock-pms-plus");
    const invalidSigner = new ClockPmsHttpTransport({
      ...config, getDigestAuthorization: async () => "Bearer wrong",
    }, fetcher);
    await expect(invalidSigner.execute(request("availability"))).rejects.toThrow("must return a Digest");
  });

  it("requires HTTPS, credentials, and same-origin mappings", async () => {
    expect(() => new ClockPmsHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    expect(() => new ClockPmsHttpTransport({ ...config, apiKey: "" }))
      .toThrow("API user and API key");
    const endpoints = {
      ...config.endpoints,
      availability: { path: "https://attacker.invalid", method: "GET" as const },
    };
    await expect(new ClockPmsHttpTransport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing API credentials", async () => {
    const fetcher = vi.fn<ClockPmsFetch>(async () => new Response(
      JSON.stringify({ error_code: "ACCOUNT_DENIED", error_message: "Account not authorized" }),
      { status: 403 },
    ));
    const error = await new ClockPmsHttpTransport(config, fetcher)
      .execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(ClockPmsTransportError);
    expect(error).toMatchObject({
      status: 403,
      responseCode: "ACCOUNT_DENIED",
      message: "Account not authorized",
      requestId: "IRP-1100",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });
});
