import { describe, expect, it, vi } from "vitest";
import {
  OracleOperaConnectionTestError,
  testOracleOperaSandboxConnection,
} from "../services/hotel-suppliers/oracle-opera";

const config = {
  baseUrl: "https://sandbox.example.oraclehospitality.com",
  tokenUrl: "https://sandbox.example.oraclehospitality.com/oauth/v1/tokens",
  clientId: "client-id",
  clientSecret: "client-secret",
  appKey: "app-key",
  hotelId: "HOTEL-1",
  timeoutMs: 5_000,
};

describe("Oracle OPERA sandbox connection test", () => {
  it("authenticates and verifies read-only hotel scope", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "short-lived-token",
        expires_in: 3600,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));

    await expect(testOracleOperaSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 1 });

    const [tokenUrl, tokenInit] = fetcher.mock.calls[0] ?? [];
    expect(String(tokenUrl)).toBe(config.tokenUrl);
    expect(tokenInit?.method).toBe("POST");
    expect(new Headers(tokenInit?.headers).get("x-app-key")).toBe(config.appKey);

    const [lovUrl, lovInit] = fetcher.mock.calls[1] ?? [];
    expect(String(lovUrl)).toContain("/lov/v1/listOfValues/Titles?");
    expect(lovInit?.method).toBe("GET");
    const headers = new Headers(lovInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer short-lived-token");
    expect(headers.get("x-app-key")).toBe(config.appKey);
    expect(headers.get("x-hotelid")).toBe(config.hotelId);
  });

  it("requires a safe hotel identifier", async () => {
    await expect(testOracleOperaSandboxConnection({ ...config, hotelId: "" }))
      .rejects.toThrow("hotel ID is required");
    await expect(testOracleOperaSandboxConnection({ ...config, hotelId: "../other" }))
      .rejects.toThrow("hotel ID is invalid");
  });

  it("returns structured redacted authentication errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 401 }));
    const error = await testOracleOperaSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(OracleOperaConnectionTestError);
    expect(error).toMatchObject({
      status: 401,
      detailCode: "oracle_opera_authentication_failed",
    });
    expect(JSON.stringify(error)).not.toContain(config.clientSecret);
  });

  it("does not perform the hotel read when authentication fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 403 }));
    await expect(testOracleOperaSandboxConnection(config, fetcher)).rejects.toBeInstanceOf(
      OracleOperaConnectionTestError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
