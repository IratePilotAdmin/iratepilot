import { requireUser } from "@/lib/auth/require-user";
import { recoverFlightConsumerPreviewCompletion } from "@/lib/flights/consumer-preview/completion-recovery.server";
import { FlightConsumerPreviewCompletionProcessingError } from "@/lib/flights/consumer-preview/completion-lease-contract";
import {
  privateNoStoreJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = Promise<{ orderId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site flight mutations are not accepted." }, 403);
  }
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return privateNoStoreJson({ error: "The test booking recovery request is invalid." }, 400);
  }
  try {
    const result = await recoverFlightConsumerPreviewCompletion({
      customerId: authentication.user.id,
      orderId,
    });
    return privateNoStoreJson({ data: result });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewCompletionProcessingError) {
      return privateNoStoreJson({ data: { decision: "processing" } }, 202);
    }
    return privateNoStoreJson({
      error: "The test booking was not safely resumed. Its durable status must be reviewed before any retry.",
    }, 409);
  }
}
