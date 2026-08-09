import { describe, expect, it, vi } from "vitest";
import {
  MewsConnectionTestError,
  testMewsSandboxConnection,
} from "../services/hotel-suppliers/mews";
import type { MewsConnectorConfig, MewsFetch } from "../services/hotel-suppliers/mews";

const config: MewsConnectorConfig = {
  baseUrl: "https://api.mews-demo.com",
  clientToken: "client-token-value",
  accessToken: "access-token-value",
  client: "iRatePilot 1.0.0",
};

describe("Mews sandbox connection test", () => {
  it("performs the documented read-only services request", async () => {
    const fetcher = vi.fn<MewsFetch>(async () =>
      new Response(JSON.stringify({ Services: [{ Id: "service-1" }] })));
    await expect(testMewsSandboxConnection(config, fetcher))
      .resolves.toEqual({ serviceCount: 1 });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.mews-demo.com/api/connector/v1/services/getAll");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      ClientToken: "client-token-value",
      AccessToken: "access-token-value",
      Client: "iRatePilot 1.0.0",
      Limitation: { Count: 1 },
    });
  });

  it("requires HTTPS and all authentication fields", async () => {
    await expect(testMewsSandboxConnection({ ...config, baseUrl: "http://api.test" }))
      .rejects.toThrow("must use HTTPS");
    await expect(testMewsSandboxConnection({ ...config, accessToken: "" }))
      .rejects.toThrow("access token");
  });

  it("returns structured redacted vendor errors", async () => {
    const fetcher = vi.fn<MewsFetch>(async () =>
      new Response(JSON.stringify({ Code: "AccessTokenInvalid", Message: "Access denied" }), { status: 401 }));
    const error = await testMewsSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(MewsConnectionTestError);
    expect(error).toMatchObject({
      status: 401,
      detailCode: "AccessTokenInvalid",
      message: "Access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.accessToken);
    expect(JSON.stringify(error)).not.toContain(config.clientToken);
  });

  it("rejects malformed success responses", async () => {
    const fetcher = vi.fn<MewsFetch>(async () => new Response("{}"));
    await expect(testMewsSandboxConnection(config, fetcher))
      .rejects.toMatchObject({ detailCode: "mews_invalid_services_response" });
  });
});
