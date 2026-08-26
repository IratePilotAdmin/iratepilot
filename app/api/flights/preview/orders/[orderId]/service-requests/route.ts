import { requireUser } from "@/lib/auth/require-user";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import { flightConsumerPreviewServiceRequestInputSchema } from "@/lib/flights/consumer-preview/service-request-contract";
import {
  createFlightConsumerPreviewServiceRequest,
  FlightConsumerPreviewServiceRequestError,
  listFlightConsumerPreviewServiceRequests,
  type FlightConsumerPreviewServiceRequestRpcClient,
} from "@/lib/flights/consumer-preview/service-requests.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = Promise<{ orderId: string }>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Params }) {
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const { orderId } = await params;
  if (!uuidPattern.test(orderId) || new URL(request.url).search.length > 0) {
    return privateNoStoreJson({ error: "The test support request query is invalid." }, 400);
  }
  try {
    const requests = await listFlightConsumerPreviewServiceRequests(
      authentication.supabase as unknown as FlightConsumerPreviewServiceRequestRpcClient,
      { orderId },
    );
    return privateNoStoreJson({ data: requests });
  } catch {
    return privateNoStoreJson({ error: "The test support request ledger is unavailable." }, 503);
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
  const [{ orderId }, body] = await Promise.all([params, readPreviewJson(request, 2_048)]);
  const idempotencyKey = readPreviewIdempotencyKey(request);
  const parsed = body.ok ? flightConsumerPreviewServiceRequestInputSchema.safeParse(body.value) : null;
  if (!uuidPattern.test(orderId) || idempotencyKey === null || !parsed?.success) {
    return privateNoStoreJson({ error: "The test support request is invalid." }, 400);
  }
  try {
    const result = await createFlightConsumerPreviewServiceRequest(
      authentication.supabase as unknown as FlightConsumerPreviewServiceRequestRpcClient,
      { orderId, idempotencyKey, ...parsed.data },
    );
    return privateNoStoreJson({ data: result }, result.decision === "created" ? 201 : 200);
  } catch (error) {
    const status = error instanceof FlightConsumerPreviewServiceRequestError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({
      error: status === 409
        ? "The test support request conflicts with the durable order or an earlier request."
        : "The test support request could not be recorded safely.",
    }, status);
  }
}
