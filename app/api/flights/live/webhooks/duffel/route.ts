import { NextResponse } from "next/server";

import {
  createFlightConsumerProductionDarkDuffelWebhookWorkflow,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_MAX_BYTES,
  FlightConsumerProductionDuffelWebhookError,
} from "@/lib/flights/consumer-production/duffel-webhook.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  const signature = request.headers.get("x-duffel-signature");
  const lengthHeader = request.headers.get("content-length");
  const length = lengthHeader === null ? null : Number(lengthHeader);
  if (
    contentType !== "application/json"
    || signature === null
    || !/^t=(0|[1-9]\d{0,12}),v(?:1|2)=[0-9a-f]{64}$/.test(signature)
    || (length !== null && (!Number.isSafeInteger(length) || length < 2
      || length > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_MAX_BYTES))
  ) {
    return noStoreJson({ error: "Invalid webhook." }, 400);
  }

  let rawBody: Uint8Array | null = null;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
    if (
      rawBody.byteLength < 2
      || rawBody.byteLength > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_MAX_BYTES
    ) {
      return noStoreJson({ error: "Invalid webhook." }, 400);
    }
    const workflow = createFlightConsumerProductionDarkDuffelWebhookWorkflow();
    await workflow.ingest({ rawBody, signature });
    return noStoreJson({ received: true, mode: "durable_quarantine" }, 200);
  } catch (error) {
    const status = error instanceof FlightConsumerProductionDuffelWebhookError
      ? error.status
      : 503;
    console.warn("[flight-consumer-production] Duffel dark webhook rejected", {
      diagnostic: error instanceof FlightConsumerProductionDuffelWebhookError
        ? error.diagnostic
        : "unexpected_error",
      status,
    });
    return noStoreJson({ error: "Webhook could not be processed." }, status);
  } finally {
    rawBody?.fill(0);
  }
}
