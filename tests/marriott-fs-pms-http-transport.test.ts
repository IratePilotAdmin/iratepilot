import { describe, expect, it, vi } from "vitest";
import { MarriottFsPmsHttpTransport, MarriottFsPmsTransportError } from "../services/hotel-suppliers/marriott";
import type { MarriottFsPmsConfig, MarriottFsPmsFetch } from "../services/hotel-suppliers/marriott";

const config: MarriottFsPmsConfig = {
  baseUrl: "https://integration.fspms.marriott.example/api/",
  apiCredential: "marriott-fs-pms-token",
  endpoints: {
    availability: { path: "properties/{propertyCode}/availability", method: "GET" },
    create_reservation: { path: "reservations", method: "POST" },
    cancel_reservation: { path: "reservations/{reservationId}/cancel", method: "POST" },
  },
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return { provider: "marriott-fs-pms" as const, propertyCode: "FSPMS-1", operation, requestId: "IRP-3000", payload: { reservationId: "FSPMS/20" } };
}

describe("MarriottFsPmsHttpTransport", () => {
  it("uses Marriott-issued mappings and authentication", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response("{}"));
    await new MarriottFsPmsHttpTransport(config, fetcher).execute({ ...request("availability"), payload: { arrival: "2026-12-10", adults: 2 } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("properties/FSPMS-1/availability?propertyCode=FSPMS-1&arrival=2026-12-10");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer marriott-fs-pms-token" }));
  });

  it("creates property-scoped reservations", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response("{}", { status: 201 }));
    await new MarriottFsPmsHttpTransport(config, fetcher).execute({ ...request("create_reservation"), payload: { guest: { lastName: "Patel" } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ propertyCode: "FSPMS-1", guest: { lastName: "Patel" } });
  });

  it("encodes cancellation reservation IDs", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response("{}"));
    await new MarriottFsPmsHttpTransport(config, fetcher).execute(request("cancel_reservation"));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("reservations/FSPMS%2F20/cancel");
  });

  it("rotates credentials and rejects FOSSE traffic", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response("{}"));
    const transport = new MarriottFsPmsHttpTransport({ ...config, apiCredential: undefined, getApiCredential: async () => "fresh-fspms", credentialHeader: "x-api-key", credentialScheme: "" }, fetcher);
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "fresh-fspms" }));
    await expect(transport.execute({ ...request("availability"), provider: "marriott-fosse" })).rejects.toThrow("only accepts marriott-fs-pms");
  });

  it("requires HTTPS, credentials, and same-origin mappings", async () => {
    expect(() => new MarriottFsPmsHttpTransport({ ...config, baseUrl: "http://api.test" })).toThrow("must use HTTPS");
    expect(() => new MarriottFsPmsHttpTransport({ ...config, apiCredential: "" })).toThrow("credential or credential provider");
    const endpoints = { ...config.endpoints, availability: { path: "https://attacker.invalid", method: "GET" as const } };
    await expect(new MarriottFsPmsHttpTransport({ ...config, endpoints }).execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing credentials", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response(JSON.stringify({ errorCode: "FSPMS_DENIED", errorMessage: "Hotel not authorized" }), { status: 403 }));
    const error = await new MarriottFsPmsHttpTransport(config, fetcher).execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(MarriottFsPmsTransportError);
    expect(error).toMatchObject({ status: 403, responseCode: "FSPMS_DENIED", message: "Hotel not authorized", requestId: "IRP-3000" });
    expect(JSON.stringify(error)).not.toContain(config.apiCredential);
  });
});

