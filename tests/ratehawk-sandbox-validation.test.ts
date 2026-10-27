import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RateHawk sandbox validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
  });

  it("runs a fixed read-only sandbox search and returns only a summary", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: {
        hotels: [
          { id: "test-hotel", rates: [{ id: "a" }, { id: "b" }] },
        ],
      },
    }), { headers: { "content-type": "application/json" } }));
    const { runRatehawkSandboxValidation } = await import("../services/hotel-suppliers/ratehawk-sandbox-validation.server");

    const result = await runRatehawkSandboxValidation({
      environment: {
        HOTEL_INVENTORY_RATEHAWK_KEY_ID: "test-key-id",
        HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-api-key-value",
        HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
      },
      fetcher,
      now: new Date("2026-10-27T12:00:00.000Z"),
    });

    expect(result).toEqual({
      testedAt: "2026-10-27T12:00:00.000Z",
      checkin: "2026-11-26",
      checkout: "2026-11-28",
      hotelCount: 1,
      rateCount: 2,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/hotels/",
      expect.objectContaining({ method: "POST", redirect: "error", cache: "no-store" }),
    );
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      checkin: "2026-11-26",
      checkout: "2026-11-28",
      residency: "us",
      language: "en",
      guests: [{ adults: 2, children: [] }],
      hids: [10004834],
      currency: "USD",
    });
    expect(JSON.stringify(result)).not.toContain("sandbox-api-key-value");
    expect(JSON.stringify(result)).not.toContain("test-key-id");
  });

  it("fails before transport when credentials are absent", async () => {
    const { runRatehawkSandboxValidation } = await import("../services/hotel-suppliers/ratehawk-sandbox-validation.server");
    await expect(runRatehawkSandboxValidation({ environment: {} }))
      .rejects.toEqual(expect.objectContaining({
        code: "credentials_not_ready",
      }));
  });
});
