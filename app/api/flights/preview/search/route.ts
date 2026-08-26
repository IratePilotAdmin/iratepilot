import { requireUser } from "@/lib/auth/require-user";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import {
  flightConsumerPreviewSearchUiRequestSchema,
  validateFlightConsumerPreviewTravelWindow,
} from "@/lib/flights/consumer-preview/request-schemas";
import {
  executeFlightConsumerPreviewSearch,
  type FlightConsumerPreviewAuthenticatedRpcClient,
} from "@/lib/flights/consumer-preview/search-workflow.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
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
  const parsed = flightConsumerPreviewSearchUiRequestSchema.safeParse(parsedBody.value);
  if (
    !parsed.success
    || !validateFlightConsumerPreviewTravelWindow(parsed.data.departureDate, parsed.data.returnDate)
  ) return privateNoStoreJson({ error: "Enter a supported test itinerary within the next 330 days." }, 400);

  try {
    const result = await executeFlightConsumerPreviewSearch({
      customerId: authentication.user.id,
      idempotencyKey,
      search: parsed.data,
      authenticatedRpc: authentication.supabase as unknown as FlightConsumerPreviewAuthenticatedRpcClient,
    });
    const nextAction = result.status === "complete"
      ? "results" as const
      : result.status === "created" || result.status === "searching"
        ? "poll" as const
        : "new_search" as const;
    const response = privateNoStoreJson({
      data: { searchId: result.searchId, status: result.status, nextAction },
    }, nextAction === "poll" ? 202 : 200);
    if (nextAction === "poll") response.headers.set("Retry-After", "4");
    return response;
  } catch {
    return privateNoStoreJson({ error: "The Duffel test search could not be completed." }, 503);
  }
}
