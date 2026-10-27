import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RateHawk sandbox prebook evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
  });

  it("uses a search hash internally and returns only sanitized prebook evidence", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "ok",
        data: { hotels: [{ id: "test-hotel", rates: [{ book_hash: "search-rate-secret" }] }] },
      }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "ok",
        data: {
          changes: { price_changed: false },
          hotels: [{ id: "test-hotel", rates: [{ book_hash: "prebook-rate-secret" }] }],
        },
      }), { headers: { "content-type": "application/json" } }));
    const { runRatehawkSandboxPrebookEvidence } = await import(
      "../services/hotel-suppliers/ratehawk-prebook-evidence.server"
    );

    const result = await runRatehawkSandboxPrebookEvidence({
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
      rateCount: 1,
      priceChanged: false,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      hash: "search-rate-secret",
    });
    expect(JSON.stringify(result)).not.toContain("search-rate-secret");
    expect(JSON.stringify(result)).not.toContain("prebook-rate-secret");
    expect(JSON.stringify(result)).not.toContain("sandbox-api-key-value");
  });

  it("stops before prebook when the search response has no usable hash", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      data: { hotels: [{ id: "test-hotel", rates: [{ id: "rate-without-hash" }] }] },
    }), { headers: { "content-type": "application/json" } }));
    const { runRatehawkSandboxPrebookEvidence } = await import(
      "../services/hotel-suppliers/ratehawk-prebook-evidence.server"
    );

    await expect(runRatehawkSandboxPrebookEvidence({
      environment: {
        HOTEL_INVENTORY_RATEHAWK_KEY_ID: "test-key-id",
        HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-api-key-value",
        HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
      },
      fetcher,
    })).rejects.toEqual(expect.objectContaining({ code: "invalid_response" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
