import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  class MockWebhookError extends Error {
    readonly status: 400 | 503;
    readonly diagnostic: string;

    constructor(status: 400 | 503, diagnostic = "workflow_unavailable") {
      super("safe webhook error");
      this.status = status;
      this.diagnostic = diagnostic;
    }
  }
  return {
    MockWebhookError,
    ingest: vi.fn(),
    factory: vi.fn(),
    rawBodies: [] as Uint8Array[],
  };
});

vi.mock("@/lib/flights/consumer-production/duffel-webhook.server", () => ({
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_MAX_BYTES: 1_048_576,
  FlightConsumerProductionDuffelWebhookError: state.MockWebhookError,
  createFlightConsumerProductionDarkDuffelWebhookWorkflow: state.factory,
}));

import {
  POST,
  dynamic,
  maxDuration,
  runtime,
} from "../app/api/flights/live/webhooks/duffel/route";

const rawBody = "{\"signed\":\"raw-duffel-live-body\"}";
const signature = "t=1787747200,v1=" + "a".repeat(64);

function request(headers: Record<string, string> = {}) {
  return new Request("https://www.iratepilot.com/api/flights/live/webhooks/duffel", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-duffel-signature": signature,
      ...headers,
    },
  });
}

describe("Flight Consumer Production Duffel dark webhook Route Handler", () => {
  beforeEach(() => {
    state.ingest.mockReset();
    state.factory.mockReset();
    state.rawBodies.length = 0;
    state.ingest.mockImplementation(async ({ rawBody }: { rawBody: Uint8Array }) => {
      state.rawBodies.push(Uint8Array.from(rawBody));
      return { decision: "verified_ping" };
    });
    state.factory.mockReturnValue({ ingest: state.ingest });
  });

  it("runs dynamically in Node and forwards exact signed bytes", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(30);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new TextDecoder().decode(state.rawBodies[0])).toBe(rawBody);
    expect(state.ingest).toHaveBeenCalledWith(expect.objectContaining({ signature }));
    await expect(response.json()).resolves.toEqual({
      received: true,
      mode: "durable_quarantine",
    });
  });

  it("returns safe retryable failures when durable quarantine is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.ingest.mockRejectedValueOnce(new state.MockWebhookError(
      503,
      "durable_inbox_unavailable",
    ));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook could not be processed.",
    });
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-production] Duffel dark webhook rejected",
      { diagnostic: "durable_inbox_unavailable", status: 503 },
    );
    warn.mockRestore();
  });

  it("rejects missing signatures and oversized declarations before workflow creation", async () => {
    const missing = await POST(request({ "x-duffel-signature": "" }));
    expect(missing.status).toBe(400);

    const oversized = await POST(request({ "content-length": "1048577" }));
    expect(oversized.status).toBe(400);
    expect(state.factory).not.toHaveBeenCalled();
  });
});
