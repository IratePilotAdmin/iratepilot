import { describe, expect, it, vi } from "vitest";
import { SihotHttpTransport, SihotTransportError } from "../services/hotel-suppliers/sihot";
import type { SihotFetch } from "../services/hotel-suppliers/sihot";

const config = {
  baseUrl: "https://api.sihot.example/customer/services/v2.0/",
  securityId: "sihot-security-id",
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "sihot" as const,
    propertyCode: "4711",
    operation,
    requestId: "IRP-500",
    payload: { "RESERVATION-OBJID": "8885" },
  };
}

describe("SihotHttpTransport", () => {
  it("searches availability with the SecurityID envelope", async () => {
    const fetcher = vi.fn<SihotFetch>(async () => new Response('{"Result":{"Success":true}}'));
    const transport = new SihotHttpTransport(config, fetcher);
    await transport.execute({
      ...request("availability"),
      payload: { arrival: "2026-09-10", departure: "2026-09-12", noofpax: 2 },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.sihot.example/customer/services/v2.0/S_AVAILABILITY_SEARCH");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      TransactionID: "IRP-500",
      Authentication: { SecurityID: "sihot-security-id" },
      "AVAILABILITY-SEARCH": {
        hotel: "4711", arrival: "2026-09-10", departure: "2026-09-12", noofpax: 2,
      },
    });
  });

  it("creates a reservation through the documented service", async () => {
    const fetcher = vi.fn<SihotFetch>(async () => new Response('{"Result":{"Success":true}}'));
    const transport = new SihotHttpTransport(config, fetcher);
    await transport.execute({
      ...request("create_reservation"),
      payload: { arrival: "2026-09-10", departure: "2026-09-12", "ORDERER-OBJID": "42" },
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("S_RESERVATION_CREATE");
    expect(JSON.parse(String(init?.body)).RESERVATION).toEqual({
      hotel: "4711", arrival: "2026-09-10", departure: "2026-09-12", "ORDERER-OBJID": "42",
    });
  });

  it("cancels by reservation object ID", async () => {
    const fetcher = vi.fn<SihotFetch>(async () => new Response('{"Result":{"Success":true}}'));
    const transport = new SihotHttpTransport(config, fetcher);
    await transport.execute({ ...request("cancel_reservation"), payload: {
      "RESERVATION-OBJID": "8885", reason: "GUEST", note: "Plans changed",
    } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("S_RESERVATION_CANCEL_V002");
    expect(JSON.parse(String(init?.body)).RESERVATION).toEqual({
      "RESERVATION-OBJID": "8885", reasonforcancellation: "GUEST", note: "Plans changed",
    });
  });

  it("supports refreshed SecurityIDs and rejects another provider", async () => {
    const getSecurityId = vi.fn(async () => "fresh-id");
    const fetcher = vi.fn<SihotFetch>(async () => new Response('{"Result":{"Success":true}}'));
    const transport = new SihotHttpTransport({ ...config, securityId: undefined, getSecurityId }, fetcher);
    await transport.execute(request("availability"));
    expect(getSecurityId).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("fresh-id");
    await expect(transport.execute({ ...request("availability"), providerId: "rms-cloud" }))
      .rejects.toThrow("only accepts sihot");
  });

  it("rejects insecure or cross-origin endpoints", async () => {
    expect(() => new SihotHttpTransport({ ...config, baseUrl: "http://api.test/" }))
      .toThrow("must use HTTPS");
    const transport = new SihotHttpTransport({
      ...config, operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("turns SIHOT Result failures into redacted structured errors", async () => {
    const fetcher = vi.fn<SihotFetch>(async () => new Response(
      JSON.stringify({ Result: { Success: false, ErrorMsg: "Hotel access denied", ErrorCode: "AUTH" } }),
      { status: 200 },
    ));
    const transport = new SihotHttpTransport(config, fetcher);
    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(SihotTransportError);
    expect(error).toMatchObject({
      status: 422, operation: "create_reservation", requestId: "IRP-500",
      responseCode: "AUTH", message: "Hotel access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.securityId);
  });
});
