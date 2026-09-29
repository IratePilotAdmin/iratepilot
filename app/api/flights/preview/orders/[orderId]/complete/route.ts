import { after } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { queueFlightConsumerPreviewNotification } from "@/lib/email/flight-notification-delivery.server";
import { completeFlightConsumerPreviewOrder } from "@/lib/flights/consumer-preview/complete-order-workflow.server";
import { FlightConsumerPreviewCompletionProcessingError } from "@/lib/flights/consumer-preview/completion-lease-contract";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import { flightConsumerPreviewCompleteOrderRequestSchema } from "@/lib/flights/consumer-preview/request-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = Promise<{ orderId: string }>;

function scheduleFlightNotification(input: Readonly<{
  customerId: string;
  orderId: string;
  event: "ticketed" | "order_pending" | "order_failed";
}>) {
  try {
    after(() => queueFlightConsumerPreviewNotification(input));
  } catch {
    // Notification scheduling must never change the committed booking result.
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site flight mutations are not accepted." }, 403);
  }
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const idempotencyKey = readPreviewIdempotencyKey(request);
  if (!idempotencyKey) {
    return privateNoStoreJson({ error: "A UUID Idempotency-Key is required." }, 400);
  }
  const parsedBody = await readPreviewJson(request);
  if (!parsedBody.ok) return privateNoStoreJson({ error: parsedBody.error }, 400);
  const parsed = flightConsumerPreviewCompleteOrderRequestSchema.safeParse(parsedBody.value);
  const { orderId } = await params;
  if (!parsed.success || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return privateNoStoreJson({ error: "The test booking completion request is invalid." }, 400);
  }
  try {
    const result = await completeFlightConsumerPreviewOrder({
      customerId: authentication.user.id,
      orderId,
      idempotencyKey,
      paymentIntentId: parsed.data.paymentIntentId,
    });
    scheduleFlightNotification({
      customerId: authentication.user.id,
      orderId,
      event: "ticketed",
    });
    return privateNoStoreJson({ data: result });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewCompletionProcessingError) {
      scheduleFlightNotification({
        customerId: authentication.user.id,
        orderId,
        event: "order_pending",
      });
      return privateNoStoreJson({
        error: "The test booking completion is already processing.",
      }, 409);
    }
    scheduleFlightNotification({
      customerId: authentication.user.id,
      orderId,
      event: "order_pending",
    });
    scheduleFlightNotification({
      customerId: authentication.user.id,
      orderId,
      event: "order_failed",
    });
    return privateNoStoreJson({
      error: "The test booking was not safely finalized. Its durable status must be reviewed before any retry.",
    }, 409);
  }
}
