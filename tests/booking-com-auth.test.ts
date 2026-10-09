import { describe, expect, it, vi } from "vitest";
import { exchangeBookingComMachineAccountToken } from "../services/hotel-channels/booking-com/auth";

const endpoint = "https://connectivity-authentication.booking.com/token-based-authentication/exchange";
const credentials = { clientId: "client-test-id", clientSecret: "secret-test-value" };
const jwt = `${"a".repeat(16)}.${"b".repeat(24)}.${"c".repeat(16)}`;

describe("Booking.com machine-account token exchange", () => {
  it("exchanges credentials only at Booking.com's official endpoint and returns a short cache lifetime", async () => {
    const fetcher = vi.fn(async () => Response.json({ jwt, ruid: "provider-diagnostic-id" }));
    const result = await exchangeBookingComMachineAccountToken(credentials, {
      fetcher,
      now: () => 1_800_000_000_000,
    });
    expect(result).toEqual({ accessToken: jwt, expiresAt: 1_800_000_000_000 + 55 * 60 * 1000 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ client_id: credentials.clientId, client_secret: credentials.clientSecret });
  });

  it("rejects missing credentials before any network call", async () => {
    const fetcher = vi.fn(async () => Response.json({ jwt }));
    await expect(exchangeBookingComMachineAccountToken({ clientId: "", clientSecret: credentials.clientSecret }, { fetcher }))
      .rejects.toThrow("booking_com_credentials_invalid");
    await expect(exchangeBookingComMachineAccountToken({ clientId: credentials.clientId, clientSecret: "bad\nsecret" }, { fetcher }))
      .rejects.toThrow("booking_com_credentials_invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps provider failures to safe errors without leaking provider bodies or credentials", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: `${credentials.clientSecret} invalid` }), { status: 401 }));
    await expect(exchangeBookingComMachineAccountToken(credentials, { fetcher }))
      .rejects.toThrow("booking_com_auth_rejected");
  });

  it("fails closed on malformed, oversized, or non-JWT success bodies", async () => {
    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => Response.json({ jwt: "not-a-jwt" })),
    })).rejects.toThrow("booking_com_auth_response_invalid");

    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => new Response("x".repeat(16_100), { status: 200 })),
    })).rejects.toThrow("booking_com_auth_response_invalid");

    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => new Response("not json", { status: 200 })),
    })).rejects.toThrow("booking_com_auth_response_invalid");
  });

  it("classifies rate limits and server errors without returning response data", async () => {
    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => new Response("rate limit", { status: 429 })),
    })).rejects.toThrow("booking_com_auth_temporarily_unavailable");
    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => new Response("internal error", { status: 503 })),
    })).rejects.toThrow("booking_com_auth_temporarily_unavailable");

    await expect(exchangeBookingComMachineAccountToken(credentials, {
      fetcher: vi.fn(async () => { throw new Error("network detail with secret"); }),
    })).rejects.toThrow("booking_com_auth_transport_failed");
  });

  it("aborts a stalled token exchange and reports a safe timeout", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await expect(exchangeBookingComMachineAccountToken(credentials, { fetcher, timeoutMs: 100 }))
      .rejects.toThrow("booking_com_auth_timeout");
  });
});
