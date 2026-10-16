import { describe, expect, it, vi } from "vitest";
import {
  createApaleoWebhookSubscription,
  deleteApaleoWebhookSubscription,
} from "../services/hotel-suppliers/apaleo";
import type { ApaleoFetch } from "../services/hotel-suppliers/apaleo";

describe("Apaleo webhook client", () => {
  it("creates a subscription limited to the selected property", async () => {
    const fetcher = vi.fn<ApaleoFetch>().mockResolvedValue(new Response(
      JSON.stringify({ id: "subscription-1" }),
      { status: 201, headers: { "content-type": "application/json" } },
    ));

    await expect(createApaleoWebhookSubscription({
      accessToken: "access-token",
      endpointUrl: "https://www.iratepilot.com/api/webhooks/apaleo/connection?token=secret",
      propertyCode: "MUC",
    }, fetcher)).resolves.toEqual({ id: "subscription-1" });

    const [endpoint, init] = fetcher.mock.calls[0];
    expect(String(endpoint)).toBe("https://webhook.apaleo.com/v1/subscriptions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer access-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      endpointUrl: "https://www.iratepilot.com/api/webhooks/apaleo/connection?token=secret",
      events: ["reservation/*"],
      propertyIds: ["MUC"],
    });
  });

  it("rejects an invalid create response", async () => {
    const fetcher = vi.fn<ApaleoFetch>().mockResolvedValue(new Response("{}", { status: 201 }));

    await expect(createApaleoWebhookSubscription({
      accessToken: "access-token",
      endpointUrl: "https://www.iratepilot.com/api/webhooks/apaleo/connection?token=secret",
      propertyCode: "MUC",
    }, fetcher)).rejects.toMatchObject({
      detailCode: "apaleo_webhook_invalid_subscription",
    });
  });

  it("accepts missing subscriptions as an idempotent delete", async () => {
    const fetcher = vi.fn<ApaleoFetch>().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(deleteApaleoWebhookSubscription({
      accessToken: "access-token",
      subscriptionId: "subscription-1",
    }, fetcher)).resolves.toBeUndefined();
  });

  it("does not send credentials to a caller-controlled origin", async () => {
    const fetcher = vi.fn<ApaleoFetch>();

    await expect(createApaleoWebhookSubscription({
      accessToken: "access-token",
      endpointUrl: "http://attacker.test/hook",
      propertyCode: "MUC",
    }, fetcher)).rejects.toThrow("must use HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
