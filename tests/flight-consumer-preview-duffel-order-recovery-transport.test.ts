import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createInjectedFlightConsumerPreviewDuffelOrderRecoveryTransport,
  FlightConsumerPreviewDuffelOrderRecoveryTransportError,
} from "../lib/flights/consumer-preview/duffel-order-recovery-transport.server";
import { sha256FlightConsumerPreviewReference } from "../lib/flights/consumer-preview/reference-crypto.server";

const providerOrderId = "ord_0000ABd6wggSct7BoraU1o";
const providerOrderRefSha256 = sha256FlightConsumerPreviewReference({
  kind: "duffel_order",
  value: providerOrderId,
});

function response(input: Readonly<{
  id?: string;
  liveMode?: boolean;
  contentType?: string;
  status?: number;
}> = {}) {
  const raw = JSON.stringify({
    data: {
      id: input.id ?? providerOrderId,
      live_mode: input.liveMode ?? false,
      documents: [],
    },
  });
  return new Response(raw, {
    status: input.status ?? 200,
    headers: {
      "content-type": input.contentType ?? "application/json",
      "content-length": String(Buffer.byteLength(raw)),
    },
  });
}

function transport(fetcher: typeof fetch) {
  return createInjectedFlightConsumerPreviewDuffelOrderRecoveryTransport({
    accessToken: "duffel_test_1234567890abcdef",
    fetcher,
  });
}

describe("Consumer Preview Duffel GET-order recovery transport", () => {
  it("performs one bounded test-only authenticated read and returns digests", async () => {
    const fetcher = vi.fn(async () => response());
    const result = await transport(fetcher).retrieve({
      providerOrderId,
      providerOrderRefSha256,
    });
    expect(result).toMatchObject({
      providerOrderRefSha256,
      responseBytes: expect.any(Number),
      responseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      recoveryRequestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `https://api.duffel.com/air/orders/${providerOrderId}`,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer duffel_test_1234567890abcdef",
          "Duffel-Version": "v2",
        }),
      }),
    );
    result.rawBody.fill(0);
  });

  it("rejects identity mismatch, live mode, non-JSON, and non-200 responses", async () => {
    await expect(transport(vi.fn(async () => response())).retrieve({
      providerOrderId,
      providerOrderRefSha256: "f".repeat(64),
    })).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelOrderRecoveryTransportError);
    for (const bad of [
      response({ id: "ord_0000ZZZZZZZZZZZZZZZZZZ" }),
      response({ liveMode: true }),
      response({ contentType: "text/plain" }),
      response({ status: 404 }),
    ]) {
      await expect(transport(vi.fn(async () => bad)).retrieve({
        providerOrderId,
        providerOrderRefSha256,
      })).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelOrderRecoveryTransportError);
    }
  });

  it("rejects a response larger than the one-megabyte evidence boundary", async () => {
    const oversized = JSON.stringify({
      data: { id: providerOrderId, live_mode: false, padding: "x".repeat(1_048_576) },
    });
    await expect(transport(vi.fn(async () => new Response(oversized, {
      status: 200,
      headers: { "content-type": "application/json" },
    }))).retrieve({
      providerOrderId,
      providerOrderRefSha256,
    })).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelOrderRecoveryTransportError);
  });
});
