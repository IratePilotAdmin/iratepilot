import { describe, expect, it, vi } from "vitest";
import {
  StandardPmsConnectionTestError,
  testStandardPmsConnection,
} from "../services/hotel-suppliers/standard";
import type {
  StandardPmsConnectionTestFetch,
  StandardPmsProviderId,
} from "../services/hotel-suppliers/standard";
import { getPmsProvider } from "../services/hotel-suppliers/providers";

const remainingProviders = [
  "oracle-opera-5",
  "infor-hms",
  "agilysys-pms",
  "planet-protel",
  "guestline",
  "ezee-absolute",
  "clock-pms-plus",
  "hotelogix",
] as const satisfies readonly StandardPmsProviderId[];

function config(providerId: StandardPmsProviderId) {
  return {
    providerId,
    baseUrl: `https://sandbox.${providerId}.example/`,
    apiCredential: "sandbox-secret",
    validationPath: "/api/connection-check",
    propertyCode: "IRP-TEST",
  };
}

describe("remaining PMS connection validation", () => {
  it.each(remainingProviders)("requires a read-only validation path for %s", (providerId) => {
    expect(getPmsProvider(providerId)?.requiredConfiguration).toContain("VALIDATION_PATH");
  });

  it.each(remainingProviders)("validates %s credentials and property scope", async (providerId) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
    })) as unknown as StandardPmsConnectionTestFetch;

    await expect(testStandardPmsConnection(config(providerId), fetcher)).resolves.toEqual({
      providerId,
      reachable: true,
    });

    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe(
      `https://sandbox.${providerId}.example/api/connection-check?propertyCode=IRP-TEST`,
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer sandbox-secret",
      },
    });
  });

  it("supports vendor-specific credential headers without exposing the secret", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: "Credential rejected",
    }), { status: 401 })) as unknown as StandardPmsConnectionTestFetch;

    const promise = testStandardPmsConnection({
      ...config("guestline"),
      credentialHeader: "x-api-key",
      credentialScheme: "",
    }, fetcher);

    await expect(promise).rejects.toMatchObject({
      status: 401,
      detailCode: "guestline_connection_rejected",
    });
    await expect(promise).rejects.not.toThrow("sandbox-secret");
  });

  it("rejects insecure and cross-origin validation endpoints", async () => {
    await expect(testStandardPmsConnection({
      ...config("hotelogix"),
      baseUrl: "http://sandbox.hotelogix.example/",
    })).rejects.toThrow("PMS base URL must use HTTPS");

    await expect(testStandardPmsConnection({
      ...config("hotelogix"),
      validationPath: "https://attacker.example/check",
    })).rejects.toThrow("must remain on the configured origin");
  });

  it("returns stable timeout and network error codes", async () => {
    const abort = vi.fn(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as StandardPmsConnectionTestFetch;
    await expect(testStandardPmsConnection({
      ...config("infor-hms"), timeoutMs: 1,
    }, abort)).rejects.toMatchObject({
      status: 504,
      detailCode: "infor_hms_connection_timeout",
    });

    const network = vi.fn(async () => {
      throw new Error("network includes sandbox-secret");
    }) as StandardPmsConnectionTestFetch;
    await expect(testStandardPmsConnection(config("agilysys-pms"), network))
      .rejects.toEqual(expect.objectContaining({
        status: 502,
        detailCode: "agilysys_pms_connection_unreachable",
      }));
  });

  it("uses an async credential provider and rejects empty values", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as StandardPmsConnectionTestFetch;
    await expect(testStandardPmsConnection({
      ...config("clock-pms-plus"),
      apiCredential: undefined,
      getApiCredential: async () => "rotated-token",
    }, fetcher)).resolves.toMatchObject({ reachable: true });

    await expect(testStandardPmsConnection({
      ...config("clock-pms-plus"),
      apiCredential: undefined,
      getApiCredential: async () => " ",
    }, fetcher)).rejects.toThrow("returned an empty value");
  });

  it("exposes a typed error for callers", () => {
    expect(new StandardPmsConnectionTestError("failed", 502, "provider_unreachable"))
      .toBeInstanceOf(Error);
  });
});
