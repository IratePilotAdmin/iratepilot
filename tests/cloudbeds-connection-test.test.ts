import { describe, expect, it, vi } from "vitest";
import {
  CloudbedsConnectionTestError,
  testCloudbedsSandboxConnection,
} from "../services/hotel-suppliers/cloudbeds";
import type { CloudbedsConfig, CloudbedsFetch } from "../services/hotel-suppliers/cloudbeds";

const config: CloudbedsConfig = {
  baseUrl: "https://api.cloudbeds.com",
  apiKey: "cbat_test-key-value",
};

describe("Cloudbeds sandbox connection test", () => {
  it("performs the documented read-only hotels request", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () =>
      new Response(JSON.stringify({ data: [{ propertyID: "hotel-1" }] })));
    await expect(testCloudbedsSandboxConnection(config, fetcher))
      .resolves.toEqual({ hotelCount: 1 });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cloudbeds.com/api/v1.3/getHotels?pageNumber=1&pageSize=1",
    );
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer cbat_test-key-value");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("cbat_test-key-value");
    expect(init?.body).toBeUndefined();
  });

  it("requires HTTPS and an API key", async () => {
    await expect(testCloudbedsSandboxConnection({ ...config, baseUrl: "http://api.test" }))
      .rejects.toThrow("must use HTTPS");
    await expect(testCloudbedsSandboxConnection({ ...config, apiKey: "" }))
      .rejects.toThrow("API key");
  });

  it("returns structured redacted vendor errors", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () =>
      new Response(JSON.stringify({ code: "invalid_api_key", message: "Access denied" }), { status: 401 }));
    const error = await testCloudbedsSandboxConnection(config, fetcher).catch((value) => value);
    expect(error).toBeInstanceOf(CloudbedsConnectionTestError);
    expect(error).toMatchObject({
      status: 401,
      detailCode: "invalid_api_key",
      message: "Access denied",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });

  it("rejects malformed success responses", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response("{}"));
    await expect(testCloudbedsSandboxConnection(config, fetcher))
      .rejects.toMatchObject({ detailCode: "cloudbeds_invalid_hotels_response" });
  });
});
