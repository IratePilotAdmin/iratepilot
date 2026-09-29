import { after, NextResponse } from "next/server";

import {
  createFlightConsumerPreviewDuffelWebhookWorkflow,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES,
  FlightConsumerPreviewDuffelWebhookError,
  verifyFlightConsumerPreviewDuffelPing,
} from "@/lib/flights/consumer-preview/duffel-webhook.server";
import { queueFlightConsumerPreviewNotification } from "@/lib/email/flight-notification-delivery.server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const signature = request.headers.get("x-duffel-signature");
  const lengthHeader = request.headers.get("content-length");
  const length = lengthHeader === null ? null : Number(lengthHeader);
  if (
    contentType !== "application/json"
    || signature === null
    || (length !== null && (!Number.isSafeInteger(length) || length < 2
      || length > FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES))
  ) {
    console.warn("[flight-consumer-preview] Duffel webhook request guard rejected", {
      contentTypeAccepted: contentType === "application/json",
      contentLengthAccepted: length === null
        || (Number.isSafeInteger(length) && length >= 2
          && length <= FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES),
      signaturePresent: signature !== null,
    });
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
  let rawBody: Uint8Array | null = null;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength < 2 || rawBody.byteLength > FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES) {
      return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    }
    const ping = verifyFlightConsumerPreviewDuffelPing({ rawBody, signature });
    if (ping !== null) {
      return NextResponse.json({ received: true }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const workflow = await createFlightConsumerPreviewDuffelWebhookWorkflow({
      onOrderTicketed: ({ customerId, orderId }) => {
        after(async () => {
          await queueFlightConsumerPreviewNotification({
            customerId,
            orderId,
            event: "ticketed",
          });
        });
      },
    });
    const result = await workflow.ingest({ rawBody, signature });
    if (result.decision === "processing") {
      return NextResponse.json({ error: "Webhook could not be processed." }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ received: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof FlightConsumerPreviewDuffelWebhookError
      ? error.status
      : 503;
    console.warn("[flight-consumer-preview] Duffel webhook workflow rejected", {
      diagnostic: error instanceof FlightConsumerPreviewDuffelWebhookError
        ? error.diagnostic
        : "unexpected_error",
      status,
    });
    return NextResponse.json({ error: "Webhook could not be processed." }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } finally {
    rawBody?.fill(0);
  }
}
