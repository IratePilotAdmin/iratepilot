import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RateHawk certification marketplace search", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
  });

  const criteria = {
    destination: "Los Angeles",
    checkIn: "2026-12-10",
    checkOut: "2026-12-12",
    guests: 3,
    childAges: [8],
  };

  const environment = {
    VERCEL_ENV: "preview",
    HOTEL_INVENTORY_RATEHAWK_KEY_ID: "test-key-id",
    HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-api-key-value",
    HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
  };

  it("calls the hotel SERP method for Los Angeles and maps both certification hotels", async () => {
    const logger = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: {
        hotels: [
          {
            id: "conrad_los_angeles",
            hid: 10004834,
            rates: [{ daily_prices: ["200.00", "240.00"] }],
          },
          {
            id: "rosa_bell_motel",
            hid: 8819557,
            rates: [{ daily_prices: ["160.00", "180.00"] }],
          },
        ],
      },
    }), { headers: { "content-type": "application/json" } }));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    const result = await getRatehawkCertificationHotels(criteria, { environment, fetcher, logger });

    expect(result).toEqual([
      expect.objectContaining({
        slug: "ratehawk-sandbox-10004834",
        name: "Conrad Los Angeles",
        city: "Los Angeles",
        price: 220,
      }),
      expect.objectContaining({
        slug: "ratehawk-sandbox-8819557",
        name: "Rosa Bell Motel",
        city: "Los Angeles",
        price: 170,
      }),
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/hotels/",
      expect.objectContaining({ method: "POST", cache: "no-store", redirect: "error" }),
    );
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      checkin: "2026-12-10",
      checkout: "2026-12-12",
      guests: [{ adults: 2, children: [8] }],
      hids: [10004834, 8819557],
    });
    expect(logger).toHaveBeenCalledWith({
      event: "ratehawk_certification_search",
      outcome: "mapped",
      hotelCount: 2,
      certificationHotelCount: 2,
      mappedHotelCount: 2,
    });
  });

  it("ignores unrelated hotel records returned by the supplier", async () => {
    const logger = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: {
        hotels: [{
          hid: 12345678,
          rates: [{ daily_prices: ["180.00", "220.00"] }],
        }],
      },
    }), { headers: { "content-type": "application/json" } }));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, { environment, fetcher, logger }))
      .resolves.toEqual([]);
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "no_certification_hotels",
      hotelCount: 1,
      certificationHotelCount: 0,
      mappedHotelCount: 0,
    }));
  });

  it("distinguishes certification hotels returned without usable rates", async () => {
    const logger = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: { hotels: [{ hid: 10004834, rates: [] }] },
    }), { headers: { "content-type": "application/json" } }));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, { environment, fetcher, logger }))
      .resolves.toEqual([]);
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "no_usable_rates",
      hotelCount: 1,
      certificationHotelCount: 1,
      mappedHotelCount: 0,
    }));
  });

  it("never calls sandbox from production", async () => {
    const fetcher = vi.fn();
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, {
      environment: { ...environment, VERCEL_ENV: "production" },
      fetcher,
    })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not intercept other destinations", async () => {
    const fetcher = vi.fn();
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels({ ...criteria, destination: "Miami" }, {
      environment,
      fetcher,
    })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not intercept when the RateHawk sandbox flag is disabled", async () => {
    const fetcher = vi.fn();
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, {
      environment: { ...environment, HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "false" },
      fetcher,
    })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not intercept searches beyond RateHawk's 730-day horizon", async () => {
    const fetcher = vi.fn();
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );
    const farFuture = new Date();
    farFuture.setUTCDate(farFuture.getUTCDate() + 731);

    await expect(getRatehawkCertificationHotels({
      ...criteria,
      checkIn: farFuture.toISOString().slice(0, 10),
      checkOut: new Date(farFuture.getTime() + 86_400_000).toISOString().slice(0, 10),
    }, { environment, fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed without leaking supplier errors into the page", async () => {
    const logger = vi.fn();
    const fetcher = vi.fn().mockRejectedValue(new Error("credential details"));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, { environment, fetcher, logger }))
      .resolves.toEqual([]);
    expect(logger).toHaveBeenCalledWith({
      event: "ratehawk_certification_search",
      outcome: "transport_error",
      errorCode: "network_error",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("credential details");
  });
});
