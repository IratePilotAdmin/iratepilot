import { requireUser } from "@/lib/auth/require-user";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import { executeFlightConsumerPreviewOfferAcceptance } from "@/lib/flights/consumer-preview/offer-workflow.server";
import { flightConsumerPreviewAcceptOfferRequestSchema } from "@/lib/flights/consumer-preview/request-schemas";
import type { FlightConsumerPreviewAuthenticatedRpcClient } from "@/lib/flights/consumer-preview/search-workflow.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = Promise<{ offerId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site flight mutations are not accepted." }, 403);
  }
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const idempotencyKey = readPreviewIdempotencyKey(request);
  if (!idempotencyKey) return privateNoStoreJson({ error: "A UUID Idempotency-Key is required." }, 400);
  const parsedBody = await readPreviewJson(request);
  if (!parsedBody.ok) return privateNoStoreJson({ error: parsedBody.error }, 400);
  const parsed = flightConsumerPreviewAcceptOfferRequestSchema.safeParse(parsedBody.value);
  const { offerId } = await params;
  if (!parsed.success || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(offerId)) {
    return privateNoStoreJson({ error: "The test offer request is invalid." }, 400);
  }
  try {
    const result = await executeFlightConsumerPreviewOfferAcceptance({
      customerId: authentication.user.id,
      searchId: parsed.data.searchId,
      offerId,
      idempotencyKey,
      confirmedRepriceReceiptId: parsed.data.confirmedRepriceReceiptId,
      confirmChangedPrice: parsed.data.confirmChangedPrice,
      authenticatedRpc: authentication.supabase as unknown as FlightConsumerPreviewAuthenticatedRpcClient,
    });
    if ("acceptanceRequired" in result) {
      return privateNoStoreJson({ data: result }, 409);
    }
    return privateNoStoreJson({ data: { orderId: result.orderId, status: result.status } });
  } catch {
    return privateNoStoreJson({ error: "This Duffel test offer could not be accepted." }, 409);
  }
}
