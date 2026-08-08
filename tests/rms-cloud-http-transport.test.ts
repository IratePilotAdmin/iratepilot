import { describe, expect, it, vi } from "vitest";
import { RmsCloudHttpTransport, RmsCloudTransportError } from "../services/hotel-suppliers/rms-cloud";
import type { RmsCloudFetch } from "../services/hotel-suppliers/rms-cloud";

const config = { baseUrl: "https://restapi8.rmscloud.com/", authToken: "rms-auth-token" };

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "rms-cloud" as const,
    propertyCode: "43838175",
    operation,
    requestId: "IRP-600",
    payload: { reservationId: 9001 },
  };
}

describe("RmsCloudHttpTransport", () => {
  it("requests property availability with the authtoken header", async () => {
    const fetcher = vi.fn<RmsCloudFetch>(async () => new Response("[]"));
    const transport = new RmsCloudHttpTransport(config, fetcher);
    await transport.execute({ ...request("availability"), payload: {
      adults: 2, children: 0, dateFrom: "2026-09-10", dateTo: "2026-09-12",
    } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://restapi8.rmscloud.com/availableFacilities");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({ authtoken: "rms-auth-token" }));
    expect(JSON.parse(String(init?.body))).toEqual({
      propertyId: 43838175, adults: 2, children: 0,
      dateFrom: "2026-09-10", dateTo: "2026-09-12",
    });
  });

  it("creates an unconfirmed reservation", async () => {
    const fetcher = vi.fn<RmsCloudFetch>(async () => new Response("[]", { status: 201 }));
    const transport = new RmsCloudHttpTransport(config, fetcher);
    await transport.execute({ ...request("create_reservation"), payload: {
      arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://restapi8.rmscloud.com/reservations?ignoreMandatoryFieldWarnings=false",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      propertyId: 43838175, arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    });
  });

  it("cancels through the reservation status endpoint", async () => {
    const fetcher = vi.fn<RmsCloudFetch>(async () => new Response("[]", { status: 201 }));
    const transport = new RmsCloudHttpTransport(config, fetcher);
    await transport.execute({ ...request("cancel_reservation"), payload: {
      reservationId: 9001, reasonId: 4, reason: "Plans changed",
    } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://restapi8.rmscloud.com/reservations/9001/status");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      status: "cancelled", reasonid: 4, cancellationNote: "Plans changed",
    });
  });

  it("supports refreshed tokens and rejects other providers", async () => {
    const getAuthToken = vi.fn(async () => "fresh-token");
    const fetcher = vi.fn<RmsCloudFetch>(async () => new Response("[]"));
    const transport = new RmsCloudHttpTransport({ ...config, authToken: undefined, getAuthToken }, fetcher);
    await transport.execute(request("availability"));
    expect(getAuthToken).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ authtoken: "fresh-token" }));
    await expect(transport.execute({ ...request("availability"), providerId: "maestro-pms" }))
      .rejects.toThrow("only accepts rms-cloud");
  });

  it("rejects insecure or cross-origin endpoints", async () => {
    expect(() => new RmsCloudHttpTransport({ ...config, baseUrl: "http://api.test/" }))
      .toThrow("must use HTTPS");
    const transport = new RmsCloudHttpTransport({
      ...config, operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing the auth token", async () => {
    const fetcher = vi.fn<RmsCloudFetch>(async () => new Response(
      JSON.stringify({ errorCode: "AUTH", message: "Property access denied" }),
      { status: 403 },
    ));
    const transport = new RmsCloudHttpTransport(config, fetcher);
    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(RmsCloudTransportError);
    expect(error).toMatchObject({
      status: 403, operation: "create_reservation", requestId: "IRP-600",
      responseCode: "AUTH", message: "Property access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.authToken);
  });
});
