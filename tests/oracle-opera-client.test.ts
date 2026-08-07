import { describe, expect, it, vi } from "vitest";
import { OracleOperaClient, OracleOperaClientError } from "../services/hotel-suppliers/oracle-opera/client";
import { loadOracleOperaConfig } from "../services/hotel-suppliers/oracle-opera/config";

const config = {
  baseUrl: "https://gateway.example.invalid",
  tokenUrl: "https://gateway.example.invalid/oauth/v1/tokens",
  clientId: "client-id",
  clientSecret: "super-secret",
  appKey: "app-key",
  timeoutMs: 100,
};

describe("OracleOperaClient", () => {
  it("uses client credentials and reuses the access token", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 })))
      .mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ reservations: [] })),
      ));
    const client = new OracleOperaClient(config, fetcher);

    await client.request("/rsv/v1/hotels/TEST/reservations", { hotelId: "TEST" });
    await client.request("/rsv/v1/hotels/TEST/reservations", { hotelId: "TEST" });

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0];
    expect(tokenUrl).toBe(config.tokenUrl);
    expect(tokenInit.method).toBe("POST");
    expect(String(tokenInit.body)).toBe("grant_type=client_credentials");
    expect(new Headers(tokenInit.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("client-id:super-secret").toString("base64")}`,
    );

    const requestHeaders = new Headers(fetcher.mock.calls[1][1].headers);
    expect(requestHeaders.get("Authorization")).toBe("Bearer token");
    expect(requestHeaders.get("x-app-key")).toBe("app-key");
    expect(requestHeaders.get("x-hotelid")).toBe("TEST");
  });

  it("returns sanitized upstream errors", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockResolvedValueOnce(new Response("sensitive upstream body", { status: 500 }));
    const client = new OracleOperaClient(config, fetcher);

    const error = await client.request("/broken").catch((value) => value);
    expect(error).toBeInstanceOf(OracleOperaClientError);
    expect(error).toMatchObject({ code: "request_failed", status: 500 });
    expect(JSON.stringify(error)).not.toContain("sensitive upstream body");
    expect(String(error)).not.toContain(config.clientSecret);
  });

  it("aborts timed-out authentication without leaking credentials", async () => {
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }));
    const client = new OracleOperaClient({ ...config, timeoutMs: 1 }, fetcher);

    const error = await client.request("/slow").catch((value) => value);
    expect(error).toMatchObject({ code: "timeout" });
    expect(String(error)).not.toContain(config.clientSecret);
  });

  it("shares one in-flight token refresh across concurrent requests", async () => {
    let releaseToken!: (response: Response) => void;
    const tokenResponse = new Promise<Response>((resolve) => {
      releaseToken = resolve;
    });
    const fetcher = vi.fn()
      .mockImplementationOnce(() => tokenResponse)
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }))));
    const client = new OracleOperaClient(config, fetcher);

    const first = client.request("/one");
    const second = client.request("/two");
    expect(fetcher).toHaveBeenCalledTimes(1);

    releaseToken(new Response(JSON.stringify({ access_token: "shared", expires_in: 3600 })));
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockImplementationOnce((_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
    const client = new OracleOperaClient(config, fetcher);

    const request = client.request("/cancelled", { signal: controller.signal });
    controller.abort();
    const error = await request.catch((value) => value);
    expect(error).toMatchObject({ code: "request_failed" });
  });

  it("sanitizes malformed JSON and keeps the timeout active while parsing", async () => {
    const malformed = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockResolvedValueOnce(new Response("customer-secret-not-json"));
    const malformedClient = new OracleOperaClient(config, malformed);
    const malformedError = await malformedClient.request("/malformed").catch((value) => value);
    expect(malformedError).toMatchObject({ code: "request_failed" });
    expect(String(malformedError)).not.toContain("customer-secret-not-json");

    const stalled = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockImplementationOnce((_url, init?: RequestInit) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
        } as Response);
      });
    const stalledClient = new OracleOperaClient({ ...config, timeoutMs: 1 }, stalled);
    const timeoutError = await stalledClient.request("/stalled").catch((value) => value);
    expect(timeoutError).toMatchObject({ code: "timeout" });
  });
});

describe("loadOracleOperaConfig", () => {
  it("reports missing key names without exposing other credential values", () => {
    expect(() => loadOracleOperaConfig({
      PMS_ORACLE_OPERA_BASE_URL: config.baseUrl,
      PMS_ORACLE_OPERA_CLIENT_ID: config.clientId,
      PMS_ORACLE_OPERA_CLIENT_SECRET: config.clientSecret,
    })).toThrow("PMS_ORACLE_OPERA_APP_KEY");

    try {
      loadOracleOperaConfig({
        PMS_ORACLE_OPERA_BASE_URL: config.baseUrl,
        PMS_ORACLE_OPERA_CLIENT_ID: config.clientId,
        PMS_ORACLE_OPERA_CLIENT_SECRET: config.clientSecret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(config.clientSecret);
    }
  });
});
