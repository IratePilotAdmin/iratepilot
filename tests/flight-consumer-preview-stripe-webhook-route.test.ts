import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  class MockWebhookError extends Error {
    readonly httpStatus: 400 | 503;

    constructor(httpStatus: 400 | 503) {
      super("safe webhook error");
      this.httpStatus = httpStatus;
    }
  }
  return {
    MockWebhookError,
    ingest: vi.fn(),
    factory: vi.fn(),
  };
});

vi.mock("@/lib/flights/consumer-preview/stripe-webhook.server", () => ({
  FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES: 262_144,
  FlightConsumerPreviewStripeWebhookError: state.MockWebhookError,
  createFlightConsumerPreviewStripeWebhookWorkflow: state.factory,
}));

import { POST, dynamic, runtime } from "../app/api/flights/preview/webhooks/stripe/route";

const rawBody = "{\"signed\":\"raw-body\"}";
const signature = "t=1787659200,v1=test_signature_00000001";

function request(headers: Record<string, string> = {}) {
  return new Request("https://preview.example.test/api/flights/preview/webhooks/stripe", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
      ...headers,
    },
  });
}

describe("Flight Consumer Preview Stripe webhook Route Handler", () => {
  beforeEach(() => {
    state.ingest.mockReset();
    state.factory.mockReset();
    state.ingest.mockResolvedValue({
      decision: "processed",
      eventType: "payment_intent.succeeded",
      providerDispatchAuthorized: false,
    });
    state.factory.mockResolvedValue({ ingest: state.ingest });
  });

  it("runs in Node dynamically and forwards the untouched raw body and signature", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    const response = await POST(request());
    expect(state.ingest).toHaveBeenCalledWith({ rawBody, signature });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      received: true,
      decision: "processed",
      eventType: "payment_intent.succeeded",
      providerDispatchAuthorized: false,
    });
  });

  it("returns only a generic 400 response for rejected signatures", async () => {
    state.ingest.mockRejectedValue(new state.MockWebhookError(400));
    const response = await POST(request());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ received: false, error: "Webhook rejected." });
  });

  it("returns a generic 503 response for closed runtime authority or unknown failures", async () => {
    state.factory.mockRejectedValueOnce(new state.MockWebhookError(503));
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ received: false, error: "Webhook unavailable." });

    state.factory.mockRejectedValueOnce(new Error("secret provider failure"));
    const unknown = await POST(request());
    expect(unknown.status).toBe(503);
    await expect(unknown.json()).resolves.toEqual({ received: false, error: "Webhook unavailable." });
  });

  it("returns retryable 503 for a nonterminal processing lease and 200 for terminal outcomes", async () => {
    state.ingest.mockResolvedValueOnce({
      decision: "processing",
      eventType: "payment_intent.payment_failed",
      providerDispatchAuthorized: false,
    });
    const processing = await POST(request());
    expect(processing.status).toBe(503);
    await expect(processing.json()).resolves.toEqual({ received: false, error: "Webhook unavailable." });

    for (const decision of ["processed", "replayed", "blocked"] as const) {
      state.ingest.mockResolvedValueOnce({
        decision,
        eventType: "payment_intent.payment_failed",
        providerDispatchAuthorized: false,
      });
      const terminal = await POST(request());
      expect(terminal.status).toBe(200);
      await expect(terminal.json()).resolves.toMatchObject({ received: true, decision });
    }
  });

  it("rejects oversized or malformed content-length before constructing the workflow", async () => {
    for (const contentLength of ["262145", "not-a-number", "99999999999"]) {
      const response = await POST(request({ "content-length": contentLength }));
      expect(response.status).toBe(400);
    }
    expect(state.factory).toHaveBeenCalledTimes(0);
    expect(state.ingest).toHaveBeenCalledTimes(0);
  });
});
