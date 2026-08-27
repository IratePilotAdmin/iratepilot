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
    verifyPing: vi.fn(),
    after: vi.fn(),
    rawBodies: [] as Uint8Array[],
  };
});

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: state.after };
});
vi.mock("@/lib/email/flight-notification-delivery.server", () => ({
  queueFlightConsumerPreviewNotification: vi.fn(),
}));
vi.mock("@/lib/flights/consumer-preview/duffel-webhook.server", () => ({
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES: 262_144,
  FlightConsumerPreviewDuffelWebhookError: state.MockWebhookError,
  createFlightConsumerPreviewDuffelWebhookWorkflow: state.factory,
  verifyFlightConsumerPreviewDuffelPing: state.verifyPing,
}));

import { POST, maxDuration, runtime } from "../app/api/flights/preview/webhooks/duffel/route";

const rawBody = "{\"signed\":\"raw-duffel-body\"}";
const signature = "duffel-signature-test-00000001";

function request(headers: Record<string, string> = {}) {
  return new Request("https://preview.example.test/api/flights/preview/webhooks/duffel", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-duffel-signature": signature,
      ...headers,
    },
  });
}

function result(
  decision:
    | "processed"
    | "replayed"
    | "processing"
    | "deferred"
    | "blocked"
    | "verified_ping",
) {
  return {
    decision,
    eventType: "order.creation_failed",
    linkedOrderId: "11111111-1111-4111-8111-111111111111",
    reconciliationRequired: true,
    directMutationAuthorized: false,
  };
}

describe("Flight Consumer Preview Duffel webhook Route Handler", () => {
  beforeEach(() => {
    state.ingest.mockReset();
    state.factory.mockReset();
    state.verifyPing.mockReset();
    state.after.mockReset();
    state.rawBodies.length = 0;
    state.ingest.mockImplementation(async ({ rawBody }: { rawBody: Uint8Array }) => {
      state.rawBodies.push(Uint8Array.from(rawBody));
      return result("processed");
    });
    state.factory.mockResolvedValue({ ingest: state.ingest });
    state.verifyPing.mockReturnValue(null);
  });

  it("runs in Node and forwards the exact body bytes and signature", async () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const call = state.ingest.mock.calls[0]![0] as { rawBody: Uint8Array; signature: string };
    expect(new TextDecoder().decode(state.rawBodies[0])).toBe(rawBody);
    expect(call.signature).toBe(signature);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it("acknowledges a verified ping before loading runtime or database authority", async () => {
    state.verifyPing.mockReturnValueOnce({
      ...result("verified_ping"),
      eventType: "ping.triggered",
      linkedOrderId: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(state.verifyPing).toHaveBeenCalledTimes(1);
    const call = state.verifyPing.mock.calls[0]![0] as {
      rawBody: Uint8Array;
      signature: string;
    };
    expect(call.rawBody).toBeInstanceOf(Uint8Array);
    expect(call.rawBody.byteLength).toBe(new TextEncoder().encode(rawBody).byteLength);
    expect(call.signature).toBe(signature);
    expect(state.factory).not.toHaveBeenCalled();
    expect(state.ingest).not.toHaveBeenCalled();
  });

  it("keeps a verified non-ping event behind the locked runtime authority", async () => {
    state.verifyPing.mockReturnValueOnce(null);
    state.factory.mockRejectedValueOnce(new state.MockWebhookError(
      503,
      "workflow_unavailable",
    ));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Webhook could not be processed." });
    expect(state.verifyPing).toHaveBeenCalledTimes(1);
    expect(state.factory).toHaveBeenCalledTimes(1);
    expect(state.ingest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-preview] Duffel webhook workflow rejected",
      { diagnostic: "workflow_unavailable", status: 503 },
    );
    warn.mockRestore();
  });

  it("returns retryable 503 for a nonterminal processing lease and 200 for terminal outcomes", async () => {
    state.ingest.mockResolvedValueOnce(result("processing"));
    const processing = await POST(request());
    expect(processing.status).toBe(503);
    await expect(processing.json()).resolves.toEqual({ error: "Webhook could not be processed." });

    for (const decision of [
      "processed",
      "replayed",
      "deferred",
      "blocked",
      "verified_ping",
    ] as const) {
      state.ingest.mockResolvedValueOnce(result(decision));
      const terminal = await POST(request());
      expect(terminal.status).toBe(200);
      await expect(terminal.json()).resolves.toEqual({ received: true });
    }
  });

  it("preserves safe 400/503 failures without exposing internal details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.factory.mockRejectedValueOnce(new state.MockWebhookError(
      400,
      "signature_malformed_signature",
    ));
    const rejected = await POST(request());
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ error: "Webhook could not be processed." });
    expect(warn).toHaveBeenNthCalledWith(
      1,
      "[flight-consumer-preview] Duffel webhook workflow rejected",
      { diagnostic: "signature_malformed_signature", status: 400 },
    );

    state.factory.mockRejectedValueOnce(new Error("provider secret"));
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: "Webhook could not be processed." });
    expect(warn).toHaveBeenNthCalledWith(
      2,
      "[flight-consumer-preview] Duffel webhook workflow rejected",
      { diagnostic: "unexpected_error", status: 503 },
    );
    warn.mockRestore();
  });
});
