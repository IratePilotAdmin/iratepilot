import { describe, expect, it, vi } from "vitest";
import { HotelKeyConnectionTestError, testHotelKeySandboxConnection } from "../services/hotel-suppliers/hotelkey";
import type { HotelKeyFetch } from "../services/hotel-suppliers/hotelkey";

describe("testHotelKeySandboxConnection", () => {
  it("uses the HotelKey-issued read-only path and bearer credential", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response(JSON.stringify([{ code: "HK-1" }])));
    await expect(testHotelKeySandboxConnection({
      baseUrl: "https://integration.hotelkey.example/api/",
      apiCredential: "hotelkey-issued-token",
      validationPath: "properties",
    }, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://integration.hotelkey.example/api/properties");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer hotelkey-issued-token" }),
    }));
  });

  it("supports a HotelKey-issued custom credential header", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response(null, { status: 204 }));
    await expect(testHotelKeySandboxConnection({
      baseUrl: "https://integration.hotelkey.example/",
      apiCredential: "hotelkey-key",
      validationPath: "/status",
      credentialHeader: "x-api-key",
      credentialScheme: "",
    }, fetcher)).resolves.toEqual({ resourceCount: 0 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "hotelkey-key" }));
  });

  it("rejects cross-origin validation paths", async () => {
    await expect(testHotelKeySandboxConnection({
      baseUrl: "https://integration.hotelkey.example/",
      apiCredential: "hotelkey-token",
      validationPath: "https://attacker.invalid/status",
    })).rejects.toThrow("configured API origin");
  });

  it("returns redacted authentication errors", async () => {
    const fetcher = vi.fn<HotelKeyFetch>(async () => new Response("{}", { status: 403 }));
    const error = await testHotelKeySandboxConnection({
      baseUrl: "https://integration.hotelkey.example/",
      apiCredential: "secret-hotelkey-token",
      validationPath: "status",
    }, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(HotelKeyConnectionTestError);
    expect(error).toMatchObject({ status: 403, detailCode: "hotelkey_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain("secret-hotelkey-token");
  });
});
