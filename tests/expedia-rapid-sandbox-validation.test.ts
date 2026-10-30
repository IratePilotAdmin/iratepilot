import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Expedia Rapid sandbox validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
  });

  it("runs the documented read-only sandbox availability search and returns a safe summary", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      property_id: "19248",
      status: "available",
      rooms: [
        { id: "room-1", rates: [{ id: "rate-1" }, { id: "rate-2" }] },
      ],
    }]), { headers: { "content-type": "application/json" } }));
    const { runExpediaRapidSandboxValidation } = await import(
      "../services/hotel-suppliers/expedia-rapid-sandbox-validation.server"
    );

    const result = await runExpediaRapidSandboxValidation({
      environment: {
        HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "expedia-api-key",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "expedia-shared-secret",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED: "true",
      },
      fetcher,
      now: new Date("2026-10-30T12:00:00.000Z"),
    });

    expect(result).toEqual({
      testedAt: "2026-10-30T12:00:00.000Z",
      checkin: "2026-11-29",
      checkout: "2026-12-01",
      hotelCount: 1,
      rateCount: 2,
    });
    const [urlValue, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const url = new URL(urlValue);
    expect(url.origin).toBe("https://test.ean.com");
    expect(url.pathname).toBe("/v3/properties/availability");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      property_id: "19248",
      checkin: "2026-11-29",
      checkout: "2026-12-01",
      currency: "USD",
      country_code: "US",
      language: "en-US",
      occupancy: "2",
      rate_plan_count: "1",
      sales_channel: "website",
      sales_environment: "hotel_only",
      travel_purpose: "leisure",
    });
    expect(init).toEqual(expect.objectContaining({
      method: "GET",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
    }));
    expect(JSON.stringify(result)).not.toContain("expedia-shared-secret");
    expect(JSON.stringify(result)).not.toContain("expedia-api-key");
  });

  it("fails before transport when credentials are absent", async () => {
    const { runExpediaRapidSandboxValidation } = await import(
      "../services/hotel-suppliers/expedia-rapid-sandbox-validation.server"
    );
    await expect(runExpediaRapidSandboxValidation({ environment: {} }))
      .rejects.toEqual(expect.objectContaining({ code: "credentials_not_ready" }));
  });

  it("does not pass when Rapid returns no usable rates", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      property_id: "19248",
      status: "unavailable",
      rooms: [],
    }]), { headers: { "content-type": "application/json" } }));
    const { runExpediaRapidSandboxValidation } = await import(
      "../services/hotel-suppliers/expedia-rapid-sandbox-validation.server"
    );

    await expect(runExpediaRapidSandboxValidation({
      environment: {
        HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "expedia-api-key",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "expedia-shared-secret",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED: "true",
      },
      fetcher,
      now: new Date("2026-10-30T12:00:00.000Z"),
    })).rejects.toEqual(expect.objectContaining({ code: "invalid_response" }));
  });

  it("rejects malformed room and rate entries", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      property_id: "19248",
      rooms: [{ rates: [null] }],
    }]), { headers: { "content-type": "application/json" } }));
    const { runExpediaRapidSandboxValidation } = await import(
      "../services/hotel-suppliers/expedia-rapid-sandbox-validation.server"
    );

    await expect(runExpediaRapidSandboxValidation({
      environment: {
        HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "expedia-api-key",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "expedia-shared-secret",
        HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED: "true",
      },
      fetcher,
      now: new Date("2026-10-30T12:00:00.000Z"),
    })).rejects.toEqual(expect.objectContaining({ code: "invalid_response" }));
  });
});
