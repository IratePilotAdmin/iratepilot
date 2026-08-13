import { describe, expect, it, vi } from "vitest";
import {
  MaestroConnectionTestError,
  testMaestroSandboxConnection,
} from "../services/hotel-suppliers/maestro";
import type { MaestroFetch } from "../services/hotel-suppliers/maestro";

describe("testMaestroSandboxConnection", () => {
  it("uses the partner-issued read-only path and bearer token", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response(JSON.stringify([{ id: "MST-1" }])));
    await expect(testMaestroSandboxConnection({
      baseUrl: "https://partner-api.maestropms.example/v1/",
      accessToken: "maestro-token",
      validationPath: "properties",
    }, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://partner-api.maestropms.example/v1/properties");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer maestro-token" }),
    }));
  });

  it("supports a vendor-issued custom authentication header", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response(null, { status: 204 }));
    await expect(testMaestroSandboxConnection({
      baseUrl: "https://partner-api.maestropms.example/",
      accessToken: "maestro-key",
      validationPath: "/status",
      authorizationHeader: "x-api-key",
      authorizationScheme: "",
    }, fetcher)).resolves.toEqual({ resourceCount: 0 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "maestro-key" }));
  });

  it("rejects cross-origin validation paths", async () => {
    await expect(testMaestroSandboxConnection({
      baseUrl: "https://partner-api.maestropms.example/",
      accessToken: "maestro-token",
      validationPath: "https://attacker.invalid/status",
    })).rejects.toThrow("configured API origin");
  });

  it("returns structured authentication errors without exposing the token", async () => {
    const fetcher = vi.fn<MaestroFetch>(async () => new Response("{}", { status: 403 }));
    const error = await testMaestroSandboxConnection({
      baseUrl: "https://partner-api.maestropms.example/",
      accessToken: "secret-maestro-token",
      validationPath: "status",
    }, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(MaestroConnectionTestError);
    expect(error).toMatchObject({ status: 403, detailCode: "maestro_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain("secret-maestro-token");
  });
});
