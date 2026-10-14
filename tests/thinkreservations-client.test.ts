import { describe, expect, it, vi } from "vitest";
import {
  loadThinkReservationsConfig,
  testThinkReservationsConnection,
  ThinkReservationsClient,
  ThinkReservationsClientError,
} from "../services/hotel-suppliers/thinkreservations";

const config = {
  baseUrl: "https://api.thinkreservations.com",
  tokenUrl: "https://auth.thinkreservations.com/oauth/token",
  clientId: "iratepilot-client",
  clientSecret: "private-client-secret",
  audience: "https://api.thinkreservations.com/",
};

describe("ThinkReservations platform client", () => {
  it("uses the documented client-credentials exchange and caches the token", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "partner-access-token",
        expires_in: 86_400,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { externalId: "hotel-1", name: "Hotel One", currency: "USD" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { externalId: "hotel-1", name: "Hotel One", currency: "USD" },
      ]), { status: 200 }));

    const client = new ThinkReservationsClient(config, fetcher);
    await expect(client.listHotels()).resolves.toHaveLength(1);
    await expect(client.listHotels()).resolves.toHaveLength(1);

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0] ?? [];
    expect(String(tokenUrl)).toBe(config.tokenUrl);
    expect(tokenInit).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(tokenInit?.body))).toEqual({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
    });
    const [hotelUrl, hotelInit] = fetcher.mock.calls[1] ?? [];
    expect(String(hotelUrl)).toBe("https://api.thinkreservations.com/v1/hotels");
    expect(hotelInit).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer partner-access-token" },
    });
  });

  it("reports the hotel count through the admin connection test", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3_600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { externalId: "hotel-1" }, { externalId: "hotel-2" },
      ])));

    await expect(testThinkReservationsConnection(config, fetcher)).resolves.toEqual({ hotelCount: 2 });
  });

  it("fails closed for insecure endpoints and invalid hotel payloads", async () => {
    expect(() => new ThinkReservationsClient({ ...config, baseUrl: "http://api.example.com" }))
      .toThrow("must use HTTPS");

    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3_600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hotels: [] })));
    await expect(new ThinkReservationsClient(config, fetcher).listHotels())
      .rejects.toMatchObject({ detailCode: "thinkreservations_invalid_hotels_response" });
  });

  it("does not expose credentials when identity rejects the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_client",
      error_description: "Client authentication failed",
    }), { status: 401 }));

    const request = new ThinkReservationsClient(config, fetcher).listHotels();
    await expect(request).rejects.toBeInstanceOf(ThinkReservationsClientError);
    await expect(request).rejects.toMatchObject({
      status: 401,
      detailCode: "invalid_client",
      message: "Client authentication failed",
    });
    await request.catch((error: Error) => {
      expect(error.message).not.toContain(config.clientSecret);
    });
  });

  it("loads only server-side platform credentials", () => {
    expect(loadThinkReservationsConfig({
      PMS_THINKRESERVATIONS_BASE_URL: config.baseUrl,
      PMS_THINKRESERVATIONS_TOKEN_URL: config.tokenUrl,
      PMS_THINKRESERVATIONS_CLIENT_ID: config.clientId,
      PMS_THINKRESERVATIONS_CLIENT_SECRET: config.clientSecret,
      PMS_THINKRESERVATIONS_AUDIENCE: config.audience,
    })).toMatchObject(config);
  });
});
