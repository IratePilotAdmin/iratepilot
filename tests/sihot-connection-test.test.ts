import { describe, expect, it, vi } from "vitest";
import {
  testSihotSandboxConnection,
} from "../services/hotel-suppliers/sihot";
import type { SihotFetch } from "../services/hotel-suppliers/sihot";

const config = {
  baseUrl: "https://partner-api.sihot.com/PDOCS/API/CBS/",
  user: "integration-user",
  password: "integration-password",
  hotel: "1",
  productId: "iratepilot-product",
};

describe("SIHOT sandbox connection test", () => {
  it("authenticates with the documented hotel request without mutations", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      Authentication: { SecurityID: "short-lived-security-id", DurationInSec: "3600" },
    }), { status: 200 })) as unknown as SihotFetch;

    await expect(testSihotSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 1 });

    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe(
      "https://partner-api.sihot.com/PDOCS/API/CBS/S_AUTHENTICATE_HOTEL",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      AuthenticationInfos: {
        user: config.user,
        password: config.password,
        hotel: config.hotel,
        product: config.productId,
      },
    });
  });

  it("accepts the array response used by SIHOT SOAP-to-JSON clients", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      Authentication: [{ SecurityID: "short-lived-security-id" }],
    }))) as unknown as SihotFetch;
    await expect(testSihotSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 1 });
  });

  it("returns a stable authentication error without exposing credentials", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as SihotFetch;
    const error = await testSihotSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toMatchObject({ status: 401, detailCode: "sihot_authentication_failed" });
    expect(JSON.stringify(error)).not.toContain(config.password);
  });

  it("rejects successful responses without a SecurityID", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Authentication: {} }))) as unknown as SihotFetch;
    await expect(testSihotSandboxConnection(config, fetcher)).rejects.toMatchObject({
      detailCode: "sihot_invalid_authentication_response",
    });
  });

  it("rejects insecure base URLs", async () => {
    await expect(testSihotSandboxConnection({
      ...config,
      baseUrl: "http://partner-api.sihot.test/",
    })).rejects.toThrow("SIHOT base URL must use HTTPS");
  });
});
