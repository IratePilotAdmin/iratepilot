import { describe, expect, it, vi } from "vitest";
import {
  ApaleoHttpTransport,
  ApaleoTransportError,
} from "../services/hotel-suppliers/apaleo";
import type { ApaleoFetch } from "../services/hotel-suppliers/apaleo";

const config = { accessToken: "oauth-access-token" };

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    propertyCode: "MUC",
    operation,
    requestId: "IRP-300",
    payload: { reservationId: "RES/123" },
  };
}

describe("ApaleoHttpTransport", () => {
  it("requests IBE offers with OAuth bearer authentication", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new ApaleoHttpTransport(config, fetcher);
    await transport.execute({
      ...request("availability"),
      payload: { arrival: "2026-09-10", departure: "2026-09-12", adults: 2 },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.apaleo.com/booking/v1/offers?propertyId=MUC&channelCode=Ibe&arrival=2026-09-10&departure=2026-09-12&adults=2",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer oauth-access-token",
      "x-iratepilot-request-id": "IRP-300",
    }));
  });

  it("creates bookings with JSON and an idempotency key", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async () => new Response("{}", { status: 201 }));
    const transport = new ApaleoHttpTransport(config, fetcher);
    const payload = { booker: { firstName: "Ada" }, reservations: [{ offerId: "OFF-1" }] };
    await transport.execute({ ...request("create_reservation"), payload });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.apaleo.com/booking/v1/bookings");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({
      "content-type": "application/json",
      "idempotency-key": "IRP-300",
    }));
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });

  it("cancels an encoded reservation ID with no request body", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async () => new Response(null, { status: 204 }));
    const transport = new ApaleoHttpTransport(config, fetcher);
    await transport.execute(request("cancel_reservation"));

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.apaleo.com/booking/v1/reservation-actions/RES%2F123/cancel");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBeUndefined();
  });

  it("supports an external token provider for refreshable OAuth sessions", async () => {
    const getAccessToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<ApaleoFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new ApaleoHttpTransport({ getAccessToken }, fetcher);
    await transport.execute({ ...request("availability"), payload: { adults: 1 } });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer fresh-token",
    }));
  });

  it("rejects insecure and cross-origin configuration", async () => {
    expect(() => new ApaleoHttpTransport({ ...config, baseUrl: "http://api.apaleo.test" }))
      .toThrow("must use HTTPS");
    const transport = new ApaleoHttpTransport({
      ...config,
      operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing OAuth credentials", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async () => new Response(
      JSON.stringify({ code: "Forbidden", message: "Missing required scope" }),
      { status: 403, headers: { "content-type": "application/json" } },
    ));
    const transport = new ApaleoHttpTransport(config, fetcher);
    const error = await transport.execute(request("create_reservation")).catch((value) => value);

    expect(error).toBeInstanceOf(ApaleoTransportError);
    expect(error).toMatchObject({
      status: 403,
      operation: "create_reservation",
      requestId: "IRP-300",
      responseCode: "Forbidden",
      message: "Missing required scope",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});
