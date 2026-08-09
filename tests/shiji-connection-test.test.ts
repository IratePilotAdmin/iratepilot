import { describe, expect, it, vi } from "vitest";
import {
  ShijiConnectionTestError,
  testShijiSandboxConnection,
} from "../services/hotel-suppliers/shiji";
import type { ShijiFetch } from "../services/hotel-suppliers/shiji";

describe("testShijiSandboxConnection", () => {
  it("uses a partner-issued read-only path with bearer authentication", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response(JSON.stringify([{ id: "S-1" }])));
    await expect(testShijiSandboxConnection({
      baseUrl: "https://api.shiji.example/v1/",
      accessToken: "shiji-token",
      validationPath: "hotels",
    }, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://api.shiji.example/v1/hotels");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer shiji-token" }),
    }));
  });

  it("supports Shiji-issued Basic authentication", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response(null, { status: 204 }));
    await expect(testShijiSandboxConnection({
      baseUrl: "https://api.shiji.example/",
      accessToken: "encoded-credentials",
      validationPath: "/status",
      authorizationScheme: "Basic",
    }, fetcher)).resolves.toEqual({ resourceCount: 0 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Basic encoded-credentials",
    }));
  });

  it("rejects cross-origin validation paths", async () => {
    await expect(testShijiSandboxConnection({
      baseUrl: "https://api.shiji.example/",
      accessToken: "shiji-token",
      validationPath: "https://attacker.invalid/status",
    })).rejects.toThrow("configured API origin");
  });

  it("returns redacted structured authentication errors", async () => {
    const fetcher = vi.fn<ShijiFetch>(async () => new Response("{}", { status: 401 }));
    const error = await testShijiSandboxConnection({
      baseUrl: "https://api.shiji.example/",
      accessToken: "secret-shiji-token",
      validationPath: "status",
    }, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(ShijiConnectionTestError);
    expect(error).toMatchObject({ status: 401, detailCode: "shiji_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain("secret-shiji-token");
  });
});
