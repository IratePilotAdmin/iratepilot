import { describe, expect, it, vi } from "vitest";
import {
  HiltonPepConnectionTestError,
  testHiltonPepSandboxConnection,
} from "../services/hotel-suppliers/hilton";
import type { HiltonPepFetch } from "../services/hotel-suppliers/hilton";

describe("testHiltonPepSandboxConnection", () => {
  it("uses the Hilton-issued read-only path and bearer credential", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response(JSON.stringify([{ code: "HIL-1" }])));
    await expect(testHiltonPepSandboxConnection({
      baseUrl: "https://integration.pep.hilton.example/api/",
      apiCredential: "hilton-issued-token",
      validationPath: "properties",
    }, fetcher)).resolves.toEqual({ resourceCount: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://integration.pep.hilton.example/api/properties");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer hilton-issued-token" }),
    }));
  });

  it("supports a Hilton-issued custom credential header", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response(null, { status: 204 }));
    await expect(testHiltonPepSandboxConnection({
      baseUrl: "https://integration.pep.hilton.example/",
      apiCredential: "hilton-key",
      validationPath: "/status",
      credentialHeader: "x-api-key",
      credentialScheme: "",
    }, fetcher)).resolves.toEqual({ resourceCount: 0 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ "x-api-key": "hilton-key" }));
  });

  it("rejects cross-origin validation paths", async () => {
    await expect(testHiltonPepSandboxConnection({
      baseUrl: "https://integration.pep.hilton.example/",
      apiCredential: "hilton-token",
      validationPath: "https://attacker.invalid/status",
    })).rejects.toThrow("configured API origin");
  });

  it("returns redacted authentication errors", async () => {
    const fetcher = vi.fn<HiltonPepFetch>(async () => new Response("{}", { status: 403 }));
    const error = await testHiltonPepSandboxConnection({
      baseUrl: "https://integration.pep.hilton.example/",
      apiCredential: "secret-hilton-token",
      validationPath: "status",
    }, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(HiltonPepConnectionTestError);
    expect(error).toMatchObject({ status: 403, detailCode: "hilton_pep_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain("secret-hilton-token");
  });
});
