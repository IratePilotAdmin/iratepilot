import { describe, expect, it, vi } from "vitest";
import {
  ClockPmsConnectionTestError,
  testClockPmsConnection,
} from "../services/hotel-suppliers/clock-pms-plus";
import type { ClockPmsFetch } from "../services/hotel-suppliers/clock-pms-plus";

const config = {
  baseUrl: "https://sky-eu1.clock-software.example/pms_api/11111/22222/",
  apiUser: "api-user",
  apiKey: "api-secret",
  availabilityPath: "availability",
  propertyCode: "22222",
};

describe("testClockPmsConnection", () => {
  it("answers a Digest auth challenge and performs a read-only validation request", async () => {
    const fetcher = vi.fn<ClockPmsFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": 'Digest realm="Clock", nonce="server-nonce", qop="auth", algorithm=MD5, opaque="opaque-value"',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "room-1" }]), { status: 200 }));

    await expect(testClockPmsConnection(config, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("availability?propertyCode=22222");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    const authorization = (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>).authorization;
    expect(authorization).toMatch(/^Digest /);
    expect(authorization).toContain('username="api-user"');
    expect(authorization).toContain('realm="Clock"');
    expect(authorization).toContain('uri="\/pms_api\/11111\/22222\/availability\?propertyCode=22222"');
    expect(authorization).not.toContain(config.apiKey);

    const values = Object.fromEntries(Array.from(authorization.matchAll(/(\w+)=(?:"([^"]*)"|([^, ]+))/g))
      .map((match) => [match[1], match[2] ?? match[3]]));
    expect(values.response).toMatch(/^[a-f0-9]{32}$/);
    expect(values.nc).toBe("00000001");
    expect(values.cnonce).toMatch(/^[a-f0-9]{32}$/);
  });

  it("supports SHA-256 challenges without qop", async () => {
    const fetcher = vi.fn<ClockPmsFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 401,
        headers: { "www-authenticate": 'Digest realm="Clock", nonce="nonce", algorithm=SHA-256' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(testClockPmsConnection(config, fetcher)).resolves.toEqual({ resourceCount: 0 });
    const authorization = (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>).authorization;
    expect(authorization).toContain("algorithm=SHA-256");
    expect(authorization).not.toContain("qop=");
  });

  it("rejects missing challenges, unsupported qop, and bad credentials safely", async () => {
    const noChallenge = vi.fn<ClockPmsFetch>(async () => new Response("{}"));
    await expect(testClockPmsConnection(config, noChallenge)).rejects.toMatchObject({
      detailCode: "clock_pms_digest_challenge_missing",
    });

    const unsupported = vi.fn<ClockPmsFetch>(async () => new Response(null, {
      status: 401,
      headers: { "www-authenticate": 'Digest realm="Clock", nonce="nonce", qop="auth-int"' },
    }));
    await expect(testClockPmsConnection(config, unsupported)).rejects.toMatchObject({
      detailCode: "clock_pms_digest_qop_unsupported",
    });

    const denied = vi.fn<ClockPmsFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 401,
        headers: { "www-authenticate": 'Digest realm="Clock", nonce="nonce", qop="auth"' },
      }))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const error = await testClockPmsConnection(config, denied).catch((value) => value);
    expect(error).toBeInstanceOf(ClockPmsConnectionTestError);
    expect(error).toMatchObject({ detailCode: "clock_pms_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });

  it("requires HTTPS and keeps the validation path on the configured origin", async () => {
    await expect(testClockPmsConnection({ ...config, baseUrl: "http://clock.test" }))
      .rejects.toThrow("must use HTTPS");
    await expect(testClockPmsConnection({ ...config, availabilityPath: "https://attacker.invalid/read" }))
      .rejects.toThrow("configured API origin");
  });
});
