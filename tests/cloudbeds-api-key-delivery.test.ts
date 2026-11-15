import { describe, expect, it, vi } from "vitest";
import {
  CloudbedsApiKeyDeliveryError,
  exchangeCloudbedsAuthorizationCode,
  getCloudbedsAuthorizedPropertyIds,
} from "../services/hotel-suppliers/cloudbeds";
import type { CloudbedsFetch } from "../services/hotel-suppliers/cloudbeds";

const config = {
  clientId: "client-id",
  clientSecret: "super-secret",
  redirectUri: "https://www.iratepilot.com/api/integrations/cloudbeds/callback",
};

describe("Cloudbeds automatic API-key delivery", () => {
  it("exchanges the one-time code using the documented grant", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () =>
      new Response(JSON.stringify({ access_token: "cbat_delivered-key" })));

    await expect(exchangeCloudbedsAuthorizationCode(config, "one-time-code", fetcher))
      .resolves.toBe("cbat_delivered-key");

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://hotels.cloudbeds.com/api/v1.3/access_token");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type"))
      .toBe("application/x-www-form-urlencoded");
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:api-key");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("super-secret");
    expect(body.get("code")).toBe("one-time-code");
  });

  it("rejects malformed success responses without exposing secrets", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () =>
      new Response(JSON.stringify({ access_token: "wrong-prefix-super-secret" })));
    const error = await exchangeCloudbedsAuthorizationCode(config, "code", fetcher)
      .catch((value) => value);
    expect(error).toBeInstanceOf(CloudbedsApiKeyDeliveryError);
    expect(error).toMatchObject({ detailCode: "cloudbeds_invalid_api_key_response" });
    expect(JSON.stringify(error)).not.toContain(config.clientSecret);
  });

  it("reads and deduplicates authorized property IDs", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response(JSON.stringify({ data: [
      { propertyID: "hotel-1" },
      { propertyId: 200 },
      { propertyID: "hotel-1" },
    ] })));
    await expect(getCloudbedsAuthorizedPropertyIds({ apiKey: "cbat_key" }, fetcher))
      .resolves.toEqual(["hotel-1", "200"]);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cloudbeds.com/api/v1.3/getHotels?pageNumber=1&pageSize=100",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer cbat_key");
  });

  it("reads every authorized hotel page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ propertyID: `hotel-${index}` }));
    const fetcher = vi.fn<CloudbedsFetch>(async (url) => {
      const page = new URL(String(url)).searchParams.get("pageNumber");
      return new Response(JSON.stringify({ data: page === "1" ? firstPage : [{ propertyID: "hotel-100" }] }));
    });
    const propertyIds = await getCloudbedsAuthorizedPropertyIds({ apiKey: "cbat_key" }, fetcher);
    expect(propertyIds).toHaveLength(101);
    expect(propertyIds.at(-1)).toBe("hotel-100");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("requires HTTPS for all callback endpoints", async () => {
    await expect(exchangeCloudbedsAuthorizationCode({
      ...config,
      tokenUrl: "http://hotels.cloudbeds.test/token",
    }, "code")).rejects.toThrow("must use HTTPS");
    await expect(getCloudbedsAuthorizedPropertyIds({
      apiKey: "cbat_key",
      apiBaseUrl: "http://api.cloudbeds.test",
    })).rejects.toThrow("must use HTTPS");
  });
});
