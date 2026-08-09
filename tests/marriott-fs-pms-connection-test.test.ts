import { describe, expect, it, vi } from "vitest";
import {
  MarriottFsPmsConnectionTestError,
  testMarriottFsPmsSandboxConnection,
} from "../services/hotel-suppliers/marriott";
import type { MarriottFsPmsFetch } from "../services/hotel-suppliers/marriott";

describe("testMarriottFsPmsSandboxConnection", () => {
  it("uses the Marriott-issued read-only path and bearer credential", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response(JSON.stringify([{ code: "FS-PMS-1" }])));
    await expect(testMarriottFsPmsSandboxConnection({
      baseUrl: "https://integration.fspms.marriott.example/api/",
      apiCredential: "marriott-issued-token",
      validationPath: "properties",
    }, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://integration.fspms.marriott.example/api/properties");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer marriott-issued-token" }),
    }));
  });

  it("supports a Marriott-issued custom credential header", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response(null, { status: 204 }));
    await expect(testMarriottFsPmsSandboxConnection({
      baseUrl: "https://integration.fspms.marriott.example/",
      apiCredential: "marriott-key",
      validationPath: "/status",
      credentialHeader: "x-api-key",
      credentialScheme: "",
    }, fetcher)).resolves.toEqual({ resourceCount: 0 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "marriott-key" }));
  });

  it("rejects cross-origin validation paths", async () => {
    await expect(testMarriottFsPmsSandboxConnection({
      baseUrl: "https://integration.fspms.marriott.example/",
      apiCredential: "marriott-token",
      validationPath: "https://attacker.invalid/status",
    })).rejects.toThrow("configured API origin");
  });

  it("returns redacted authentication errors", async () => {
    const fetcher = vi.fn<MarriottFsPmsFetch>(async () => new Response("{}", { status: 403 }));
    const error = await testMarriottFsPmsSandboxConnection({
      baseUrl: "https://integration.fspms.marriott.example/",
      apiCredential: "secret-marriott-token",
      validationPath: "status",
    }, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(MarriottFsPmsConnectionTestError);
    expect(error).toMatchObject({ status: 403, detailCode: "marriott_fs_pms_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain("secret-marriott-token");
  });
});
