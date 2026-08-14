import { describe, expect, it, vi } from "vitest";
import {
  buildSynxisInventoryXml,
  buildSynxisRateAmountXml,
  SynxisSoapTransport,
  SynxisTransportError,
} from "../services/hotel-suppliers/synxis";
import type {
  SynxisFetch,
  SynxisTransportConfig,
  SynxisTransportRequest,
} from "../services/hotel-suppliers/synxis";

const rateBody = buildSynxisRateAmountXml({
  hotelCode: "10001",
  roomTypeCode: "KING",
  ratePlanCode: "RACK",
  startDate: "2026-09-01",
  endDate: "2026-09-02",
  currencyCode: "USD",
  amountBeforeTax: 120,
  numberOfGuests: 2,
  timestamp: "2026-08-13T18:00:00Z",
  echoToken: "IRP-2000",
});

const request: SynxisTransportRequest = {
  operation: "rate_push",
  requestId: "IRP-2000",
  body: rateBody,
};

const config: SynxisTransportConfig = {
  baseUrl: "https://integcert.synxis.com/",
  endpointPath: "/ChannelConnect/api/soap12",
  soapVersion: "1.2",
  authenticationProfile: "ws-security",
  soapActions: {
    rate_push: "urn:synxis:OTA_HotelRateAmountNotif",
    inventory_push: "urn:synxis:OTA_HotelInvCountNotif",
  },
  credentials: {
    username: "property-user",
    password: "property-password",
  },
  environment: "certification",
  trafficMode: "certification",
  authorizeTraffic: async () => undefined,
  executionJournal: {
    begin: async () => "attempt-1",
    complete: async () => undefined,
  },
};

describe("SynXis ARI mapping", () => {
  it("builds a property- and product-scoped rate amount update", () => {
    expect(rateBody).toContain('<RateAmountMessages HotelCode="10001">');
    expect(rateBody).toContain('InvTypeCode="KING" RatePlanCode="RACK"');
    expect(rateBody).toContain('Start="2026-09-01" End="2026-09-02" CurrencyCode="USD"');
    expect(rateBody).toContain(
      'AmountBeforeTax="120" NumberOfGuests="2" AgeQualifyingCode="10"',
    );
  });

  it("builds definitive inventory and optional sell-limit updates", () => {
    const body = buildSynxisInventoryXml({
      hotelCode: "10001",
      roomTypeCode: "KING",
      channelCode: "330",
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      availableCount: 8,
      sellLimit: 10,
      timestamp: "2026-08-13T18:00:00Z",
      echoToken: "IRP-2001",
    });

    expect(body).toContain('<Inventories HotelCode="10001">');
    expect(body).toContain('<DestinationSystemCode>330</DestinationSystemCode>');
    expect(body).toContain('<InvCount CountType="2" Count="8"/>');
    expect(body).toContain('<InvCount CountType="3" Count="10"/>');
  });

  it("escapes identifiers and rejects unsafe values", () => {
    const body = buildSynxisInventoryXml({
      hotelCode: "10&01",
      roomTypeCode: 'K"ING',
      channelCode: "330",
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      availableCount: 0,
      timestamp: "2026-08-13T18:00:00Z",
      echoToken: "IRP-2002",
    });
    expect(body).toContain('HotelCode="10&amp;01"');
    expect(body).toContain('InvTypeCode="K&quot;ING"');

    expect(() => buildSynxisInventoryXml({
      hotelCode: "10001",
      roomTypeCode: "KING",
      channelCode: "330",
      startDate: "2026-09-02",
      endDate: "2026-09-01",
      availableCount: -1,
      timestamp: "2026-08-13T18:00:00Z",
      echoToken: "IRP-2003",
    })).toThrow("end date cannot precede");
  });
});

describe("SynxisSoapTransport", () => {
  it("sends SOAP 1.2 ARI requests with WS-Addressing and WS-Security", async () => {
    const fetcher = vi.fn<SynxisFetch>(async () => new Response("<Success/>"));
    await new SynxisSoapTransport(config, fetcher).execute(request);

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://integcert.synxis.com/ChannelConnect/api/soap12");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({
      "content-type": 'application/soap+xml; charset=utf-8; action="urn:synxis:OTA_HotelRateAmountNotif"',
      "x-iratepilot-request-id": "IRP-2000",
    }));
    expect(String(init?.body)).toContain("<wss:Username>property-user</wss:Username>");
    expect(String(init?.body)).toContain("<wsa:MessageID>urn:uuid:IRP-2000</wsa:MessageID>");
    expect(String(init?.body)).toContain(rateBody);
  });

  it("supports the Sabre HTNG 1.1 Channel Connect authentication profile", async () => {
    const fetcher = vi.fn<SynxisFetch>(async () => new Response("<Success/>"));
    const transport = new SynxisSoapTransport({
      ...config,
      endpointPath: "/ChannelConnect/api",
      soapVersion: "1.1",
      authenticationProfile: "htng-1.1",
    }, fetcher);
    await transport.execute(request);

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toEqual(expect.objectContaining({
      "content-type": "text/xml; charset=utf-8",
      soapaction: "urn:synxis:OTA_HotelRateAmountNotif",
    }));
    expect(String(init?.body)).toContain('<HTNGHeader xmlns="http://htng.org/1.1/Header/">');
    expect(String(init?.body)).toContain("<userName>property-user</userName>");
  });

  it("fails closed when the persisted runtime gate rejects traffic", async () => {
    const fetcher = vi.fn<SynxisFetch>(async () => new Response("<Success/>"));
    const credentials = vi.fn(async () => ({ username: "user", password: "password" }));

    await expect(new SynxisSoapTransport({
      ...config,
      credentials: undefined,
      getCredentials: credentials,
      authorizeTraffic: async () => { throw new Error("persisted launch gate denied"); },
    }, fetcher).execute(request)).rejects.toThrow("persisted launch gate denied");

    expect(fetcher).not.toHaveBeenCalled();
    expect(credentials).not.toHaveBeenCalled();
  });

  it("creates a receipt before credentials or network access", async () => {
    const order: string[] = [];
    const transport = new SynxisSoapTransport({
      ...config,
      authorizeTraffic: async () => { order.push("authorize"); },
      executionJournal: {
        begin: async () => { order.push("journal"); return "attempt-1"; },
        complete: async () => { order.push("complete"); },
      },
      credentials: undefined,
      getCredentials: async () => { order.push("credentials"); return { username: "user", password: "password" }; },
    }, async () => { order.push("fetch"); return new Response("<Success/>"); });
    await transport.execute(request);
    expect(order).toEqual(["authorize", "journal", "credentials", "fetch", "complete"]);
  });

  it("blocks the network when the request receipt cannot be created", async () => {
    const fetcher = vi.fn<SynxisFetch>();
    await expect(new SynxisSoapTransport({
      ...config,
      executionJournal: {
        begin: async () => { throw new Error("receipt unavailable"); },
        complete: async () => undefined,
      },
    }, fetcher).execute(request)).rejects.toThrow("receipt unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("marks an uncertain receipt completion as non-retryable", async () => {
    const error = await new SynxisSoapTransport({
      ...config,
      executionJournal: {
        begin: async () => "attempt-1",
        complete: async () => { throw new Error("database response lost"); },
      },
    }, async () => new Response("<Success/>")).execute(request).catch((value) => value);
    expect(error).toBeInstanceOf(SynxisTransportError);
    expect(error).toMatchObject({
      status: 500,
      message: "SynXis request receipt completion failed",
    });
  });

  it("rejects insecure, cross-origin, and incompatible transport configuration", async () => {
    expect(() => new SynxisSoapTransport({
      ...config,
      baseUrl: "http://integcert.synxis.com",
    })).toThrow("must use HTTPS");

    expect(() => new SynxisSoapTransport({
      ...config,
      soapVersion: "1.1",
    })).toThrow("WS-Security ARI requires SOAP 1.2");

    expect(() => new SynxisSoapTransport({
      ...config,
      environment: "production",
    })).toThrow("production smoke or live traffic mode");

    const transport = new SynxisSoapTransport({
      ...config,
      endpointPath: "https://attacker.invalid/collect",
    });
    await expect(transport.execute(request)).rejects.toThrow("configured origin");
  });

  it("returns structured SOAP errors without exposing credentials", async () => {
    const fetcher = vi.fn<SynxisFetch>(async () => new Response(
      '<soap2:Fault xmlns:soap2="http://www.w3.org/2003/05/soap-envelope"/>',
      { status: 500 },
    ));
    const error = await new SynxisSoapTransport(config, fetcher)
      .execute(request)
      .catch((value) => value);

    expect(error).toBeInstanceOf(SynxisTransportError);
    expect(error).toMatchObject({
      status: 500,
      operation: "rate_push",
      requestId: "IRP-2000",
      message: "SynXis SOAP request failed",
    });
    expect(JSON.stringify(error)).not.toContain(config.credentials?.password);
  });
});
