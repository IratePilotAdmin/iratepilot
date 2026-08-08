import { describe, expect, it, vi } from "vitest";
import { OracleOpera5Transport, OracleOpera5TransportError } from "../services/hotel-suppliers/oracle-opera-5";
import type { OracleOpera5Config, OracleOpera5Fetch } from "../services/hotel-suppliers/oracle-opera-5";

const envelope = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body /></soap:Envelope>`;
const config: OracleOpera5Config = {
  baseUrl: "https://ows.opera.example/",
  endpoints: {
    availability: { path: "{propertyCode}/Availability.asmx", soapAction: "Availability" },
    create_reservation: { path: "{propertyCode}/Reservation.asmx", soapAction: "CreateBooking" },
    cancel_reservation: { path: "{propertyCode}/Reservation.asmx", soapAction: "CancelBooking" },
  },
  getSoapHeaders: async () => ({ "x-opera-origin": "IRATEPILOT", "x-opera-password": "secret" }),
  buildEnvelope: () => envelope,
};

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    providerId: "oracle-opera-5" as const,
    propertyCode: "OP/5",
    operation,
    requestId: "IRP-1600",
    payload: { reservationId: "OP5-100" },
  };
}

describe("OracleOpera5Transport", () => {
  it("posts issued SOAP envelopes to property-scoped OWS endpoints", async () => {
    const fetcher = vi.fn<OracleOpera5Fetch>(async () => new Response("<Response />"));
    await new OracleOpera5Transport(config, fetcher).execute(request("availability"));
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("OP%2F5/Availability.asmx");
    expect(init).toMatchObject({ method: "POST", body: envelope });
    expect(init?.headers).toEqual(expect.objectContaining({
      soapaction: "Availability", "content-type": "text/xml; charset=utf-8",
    }));
  });

  it("obtains fresh issued headers for every request", async () => {
    const getSoapHeaders = vi.fn()
      .mockResolvedValueOnce({ "x-opera-password": "first" })
      .mockResolvedValueOnce({ "x-opera-password": "second" });
    const fetcher = vi.fn<OracleOpera5Fetch>(async () => new Response("<Response />"));
    const transport = new OracleOpera5Transport({ ...config, getSoapHeaders }, fetcher);
    await transport.execute(request("availability"));
    await transport.execute(request("availability"));
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({
      "x-opera-password": "second",
    }));
  });

  it("uses an approved response mapper without logging credentials", async () => {
    const parseResponse = vi.fn(() => ({ offers: 2 }));
    const fetcher = vi.fn<OracleOpera5Fetch>(async () => new Response("<AvailabilityResponse />"));
    await expect(new OracleOpera5Transport({ ...config, parseResponse }, fetcher)
      .execute(request("availability"))).resolves.toEqual({ offers: 2 });
    expect(parseResponse).toHaveBeenCalledWith("<AvailabilityResponse />", request("availability"));
  });

  it("rejects insecure, cross-origin, or unmanaged interface settings", async () => {
    expect(() => new OracleOpera5Transport({ ...config, baseUrl: "http://opera.test" }))
      .toThrow("must use HTTPS");
    const endpoints = { ...config.endpoints, availability: {
      path: "https://attacker.invalid/ows", soapAction: "Availability",
    } };
    await expect(new OracleOpera5Transport({ ...config, endpoints }).execute(request("availability")))
      .rejects.toThrow("configured origin");
    const getSoapHeaders = async () => ({ "content-type": "malicious" });
    await expect(new OracleOpera5Transport({ ...config, getSoapHeaders }).execute(request("availability")))
      .rejects.toThrow("managed header cannot be overridden");
  });

  it("rejects wrong providers and invalid SOAP envelopes", async () => {
    const transport = new OracleOpera5Transport(config);
    await expect(transport.execute({ ...request("availability"), providerId: "oracle-opera" }))
      .rejects.toThrow("only accepts oracle-opera-5");
    await expect(new OracleOpera5Transport({ ...config, buildEnvelope: () => "" })
      .execute(request("availability"))).rejects.toThrow("invalid SOAP XML");
  });

  it("returns structured errors for HTTP and SOAP faults", async () => {
    const httpFetch = vi.fn<OracleOpera5Fetch>(async () => new Response("denied", { status: 403 }));
    await expect(new OracleOpera5Transport(config, httpFetch).execute(request("create_reservation")))
      .rejects.toMatchObject({ status: 403, requestId: "IRP-1600" });
    const faultFetch = vi.fn<OracleOpera5Fetch>(async () => new Response(
      `<soap:Fault xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" />`,
    ));
    const error = await new OracleOpera5Transport(config, faultFetch)
      .execute(request("cancel_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(OracleOpera5TransportError);
    expect(error).toMatchObject({ status: 502, operation: "cancel_reservation" });
    expect(JSON.stringify(error)).not.toContain("secret");
  });
});
