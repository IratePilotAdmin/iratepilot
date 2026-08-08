import { describe, expect, it, vi } from "vitest";
import {
  StayntouchHttpTransport,
  StayntouchTransportError,
} from "../services/hotel-suppliers/stayntouch";
import type { StayntouchFetch } from "../services/hotel-suppliers/stayntouch";

const config = { accessToken: "stayntouch-oauth-token" };

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "stayntouch" as const,
    propertyCode: "105",
    operation,
    requestId: "IRP-400",
    payload: { reservation_id: 9001 },
  };
}

describe("StayntouchHttpTransport", () => {
  it("requests hotel availability with required API headers", async () => {
    const fetcher = vi.fn<StayntouchFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new StayntouchHttpTransport(config, fetcher);
    await transport.execute({
      ...request("availability"),
      payload: { from_date: "2026-09-10", to_date: "2026-09-12", adults: 2, children: 0 },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.stayntouch.com/connect/hotels/105/availability?from_date=2026-09-10&to_date=2026-09-12&adults=2&children=0",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer stayntouch-oauth-token",
      "api-version": "2.0",
      "x-iratepilot-request-id": "IRP-400",
    }));
  });

  it("creates a reservation with the hotel ID in JSON", async () => {
    const fetcher = vi.fn<StayntouchFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new StayntouchHttpTransport(config, fetcher);
    const payload = { rate_id: 44, room_type_id: 12, guests: [{ first_name: "Ada" }] };
    await transport.execute({ ...request("create_reservation"), payload });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.stayntouch.com/connect/reservations");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({ "content-type": "application/json" }));
    expect(JSON.parse(String(init?.body))).toEqual({ hotel_id: 105, ...payload });
  });

  it("cancels through the documented reservation action", async () => {
    const fetcher = vi.fn<StayntouchFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new StayntouchHttpTransport(config, fetcher);
    await transport.execute(request("cancel_reservation"));
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.stayntouch.com/connect/reservations/9001/cancel");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("supports refreshable OAuth tokens and rejects other providers", async () => {
    const getAccessToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<StayntouchFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new StayntouchHttpTransport({ getAccessToken }, fetcher);
    await transport.execute({ ...request("availability"), payload: { adults: 1 } });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer fresh-token",
    }));
    await expect(transport.execute({ ...request("availability"), providerId: "sihot" }))
      .rejects.toThrow("only accepts stayntouch");
  });

  it("rejects insecure and cross-origin configuration", async () => {
    expect(() => new StayntouchHttpTransport({ ...config, baseUrl: "http://api.test" }))
      .toThrow("must use HTTPS");
    const transport = new StayntouchHttpTransport({
      ...config,
      operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing OAuth credentials", async () => {
    const fetcher = vi.fn<StayntouchFetch>(async () => new Response(
      JSON.stringify({ type: [{ code: "UNAUTHORIZED", message: "Hotel access denied" }] }),
      { status: 403, headers: { "content-type": "application/json" } },
    ));
    const transport = new StayntouchHttpTransport(config, fetcher);
    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(StayntouchTransportError);
    expect(error).toMatchObject({
      status: 403,
      operation: "create_reservation",
      requestId: "IRP-400",
      responseCode: "UNAUTHORIZED",
      message: "Hotel access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
  });
});
