import { describe, expect, it, vi } from "vitest";
import {
  testStayntouchSandboxConnection,
} from "../services/hotel-suppliers/stayntouch";
import type { StayntouchFetch } from "../services/hotel-suppliers/stayntouch";

const config = {
  baseUrl: "https://api.stayntouch.com/connect/",
  accessToken: "sandbox-access-token",
};

describe("Stayntouch sandbox connection test", () => {
  it("uses the documented read-only hotels endpoint and returns the hotel count", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      results: [{ id: 12, code: "IRP" }],
      total_count: 3,
    }), { status: 200 })) as unknown as StayntouchFetch;

    await expect(testStayntouchSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 3 });

    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe(
      "https://api.stayntouch.com/connect/hotels?page=1&per_page=1",
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        authorization: "Bearer sandbox-access-token",
        "api-version": "2.0",
        accept: "application/json",
      },
    });
  });

  it("uses results length when total_count is omitted", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      results: [{ id: 12 }, { id: 13 }],
    }), { status: 200 })) as unknown as StayntouchFetch;

    await expect(testStayntouchSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 2 });
  });

  it("returns a stable vendor error code without exposing credentials", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      type: [{ code: "AUTHENTICATION_FAILED", message: "Bad token" }],
    }), { status: 401 })) as unknown as StayntouchFetch;

    await expect(testStayntouchSandboxConnection(config, fetcher))
      .rejects.toMatchObject({
        status: 401,
        detailCode: "stayntouch_authentication_failed",
      });
  });

  it("rejects malformed successful responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
    })) as unknown as StayntouchFetch;

    await expect(testStayntouchSandboxConnection(config, fetcher))
      .rejects.toMatchObject({ detailCode: "stayntouch_invalid_hotels_response" });
  });

  it("rejects insecure base URLs", async () => {
    await expect(testStayntouchSandboxConnection({
      ...config,
      baseUrl: "http://api.stayntouch.test/connect/",
    })).rejects.toThrow("Stayntouch base URL must use HTTPS");
  });
});
