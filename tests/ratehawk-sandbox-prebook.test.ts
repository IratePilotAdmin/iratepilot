import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const environment = {
  HOTEL_INVENTORY_RATEHAWK_KEY_ID: "test-key-id",
  HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-api-key-value",
  HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
};

describe("RateHawk sandbox prebook validation", () => {
  it("validates a bookable sandbox rate without exposing its returned hash", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBe('{"hash":"h-search-rate","price_increase_percent":10}');
      return new Response(JSON.stringify({
        status: "ok",
        data: {
          changes: { price_changed: true },
          hotels: [{ hid: 8819557, rates: [{ book_hash: "h-bookable-rate" }] }],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const { runRatehawkSandboxPrebookValidation } = await import(
      "../services/hotel-suppliers/ratehawk-prebook-validation.server"
    );

    await expect(runRatehawkSandboxPrebookValidation({
      environment,
      rateHash: "h-search-rate",
      priceIncreasePercent: 10,
      fetcher,
      now: new Date("2026-10-27T13:00:00.000Z"),
    })).resolves.toEqual({
      testedAt: "2026-10-27T13:00:00.000Z",
      priceChanged: true,
      hotelCount: 1,
      rateCount: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/prebook/",
      expect.objectContaining({ method: "POST", credentials: "omit", redirect: "error" }),
    );
  });

  it("fails closed before transport when credentials or inputs are invalid", async () => {
    const fetcher = vi.fn();
    const { runRatehawkSandboxPrebookValidation } = await import(
      "../services/hotel-suppliers/ratehawk-prebook-validation.server"
    );

    await expect(runRatehawkSandboxPrebookValidation({
      environment: {},
      rateHash: "h-search-rate",
      fetcher,
    })).rejects.toMatchObject({ code: "credentials_not_ready" });
    await expect(runRatehawkSandboxPrebookValidation({
      environment,
      rateHash: "",
      fetcher,
    })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-bookable prebook responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      data: { changes: { price_changed: false }, hotels: [{ rates: [{}] }] },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const { runRatehawkSandboxPrebookValidation } = await import(
      "../services/hotel-suppliers/ratehawk-prebook-validation.server"
    );

    await expect(runRatehawkSandboxPrebookValidation({
      environment,
      rateHash: "h-search-rate",
      fetcher,
    })).rejects.toMatchObject({ code: "invalid_response" });
  });
});
