import { z } from "zod";

import { requireRole } from "@/lib/auth/require-role";
import {
  activateFlightConsumerPreview,
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
  FlightConsumerPreviewActivationControlError,
  type FlightConsumerPreviewActivationControlClient,
} from "@/lib/flights/consumer-preview/activation-control.server";
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
  confirmation: z.literal(FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION),
}).strict();

function isExactSameOrigin(request: Request) {
  return request.headers.has("origin") && validateSameOriginMutation(request);
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return privateNoStoreJson({ error: "Not found." }, 404);
  }
  if (!isExactSameOrigin(request)) {
    return privateNoStoreJson({ error: "Cross-site admin mutations are not accepted." }, 403);
  }
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const idempotencyKey = readPreviewIdempotencyKey(request);
  const body = await readPreviewJson(request, 512);
  const parsed = body.ok ? requestSchema.safeParse(body.value) : null;
  if (idempotencyKey === null || !parsed?.success) {
    return privateNoStoreJson({ error: "The Consumer Preview activation request is invalid." }, 400);
  }

  try {
    const result = await activateFlightConsumerPreview(
      authentication.supabase as unknown as FlightConsumerPreviewActivationControlClient,
      {
        actorId: authentication.user.id,
        confirmation: parsed.data.confirmation,
        idempotencyKey,
      },
    );
    return privateNoStoreJson({ data: result });
  } catch (error) {
    const status = error instanceof FlightConsumerPreviewActivationControlError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({
      error: status === 409
        ? "Consumer Preview activation did not pass the exact locked-state check."
        : "Consumer Preview activation is unavailable.",
    }, status);
  }
}
