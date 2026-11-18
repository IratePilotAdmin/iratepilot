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

  it("calls the geographic SERP method for Los Angeles and maps available rates", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: {
        hotels: [{
          id: "la-test-hotel",
          rates: [{ daily_prices: ["200.00", "240.00"] }],
        }],
      },
    }), { headers: { "content-type": "application/json" } }));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    const result = await getRatehawkCertificationHotels(criteria, { environment, fetcher });

    expect(result).toEqual([expect.objectContaining({
      slug: "ratehawk-sandbox-la-test-hotel",
      city: "Los Angeles",
      price: 220,
    })]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/geo/",
      expect.objectContaining({ method: "POST", cache: "no-store", redirect: "error" }),
    );
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      checkin: "2026-12-10",
      checkout: "2026-12-12",
      guests: [{ adults: 2, children: [8] }],
      latitude: 34.077194,
      longitude: -118.36068,
      radius: 20_000,
      hotels_limit: 20,
    });
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

  it("fails closed without leaking supplier errors into the page", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("credential details"));
    const { getRatehawkCertificationHotels } = await import(
      "../services/hotel-suppliers/ratehawk-certification-search.server"
    );

    await expect(getRatehawkCertificationHotels(criteria, { environment, fetcher }))
      .resolves.toEqual([]);
  });
});
