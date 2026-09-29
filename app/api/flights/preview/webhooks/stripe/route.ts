import {
  FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES,
  FlightConsumerPreviewStripeWebhookError,
  createFlightConsumerPreviewStripeWebhookWorkflow,
} from "@/lib/flights/consumer-preview/stripe-webhook.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
});

function rejected(status: 400 | 503) {
  return Response.json({
    received: false,
    error: status === 400 ? "Webhook rejected." : "Webhook unavailable.",
  }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && (!/^\d{1,10}$/.test(declaredLength)
      || Number(declaredLength) > FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES)
  ) return rejected(400);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return rejected(400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES) {
    return rejected(400);
  }
  const signature = request.headers.get("stripe-signature") ?? "";
  try {
    const workflow = await createFlightConsumerPreviewStripeWebhookWorkflow();
    const result = await workflow.ingest({ rawBody, signature });
    if (result.decision === "processing") return rejected(503);
    return Response.json({
      received: true,
      decision: result.decision,
      eventType: result.eventType,
      providerDispatchAuthorized: result.providerDispatchAuthorized,
    }, { status: 200, headers: responseHeaders });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewStripeWebhookError) {
      return rejected(error.httpStatus);
    }
    return rejected(503);
  }
}
