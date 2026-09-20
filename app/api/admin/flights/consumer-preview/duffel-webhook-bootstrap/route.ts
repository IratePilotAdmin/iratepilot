import { z } from "zod";

import { requireRole } from "@/lib/auth/require-role";
import {
  executeFlightConsumerPreviewDuffelWebhookBootstrap,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION,
  FlightConsumerPreviewDuffelWebhookBootstrapError,
} from "@/lib/flights/consumer-preview/duffel-webhook-bootstrap.server";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  confirmation: z.union([
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION),
  ]),
}).strict();

function isExactSameOrigin(request: Request) {
  return request.headers.has("origin") && validateSameOriginMutation(request);
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return privateNoStoreJson({ error: "Not found." }, 404);
  }
  if (!isExactSameOrigin(request)) {
    return privateNoStoreJson({
      error: "Cross-site admin mutations are not accepted.",
    }, 403);
  }
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const idempotencyKey = readPreviewIdempotencyKey(request);
  const body = await readPreviewJson(request, 512);
  const parsed = body.ok ? requestSchema.safeParse(body.value) : null;
  if (idempotencyKey === null || !parsed?.success) {
    return privateNoStoreJson({
      error: "The temporary Duffel test-webhook request is invalid.",
    }, 400);
  }

  try {
    const result = await executeFlightConsumerPreviewDuffelWebhookBootstrap({
      actorId: authentication.user.id,
      confirmation: parsed.data.confirmation,
      idempotencyKey,
    });
    return privateNoStoreJson(
      { data: result },
      result.decision === "created" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) {
      console.warn("[flight-consumer-preview] Duffel TEST bootstrap operation rejected", {
        diagnostic: error.diagnostic,
        kind: error.kind,
      });
    }
    const status = error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({
      error: status === 409
        ? "The Duffel test-webhook account state does not match this one-time operation."
        : "The temporary Duffel test-webhook operation is unavailable.",
    }, status);
  }
}
