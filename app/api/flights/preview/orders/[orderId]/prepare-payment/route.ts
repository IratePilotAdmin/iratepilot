import { requireUser } from "@/lib/auth/require-user";
import {
  privateNoStoreJson,
  readPreviewIdempotencyKey,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import { prepareFlightConsumerPreviewPayment } from "@/lib/flights/consumer-preview/payment-workflow.server";
import { flightConsumerPreviewPreparePaymentRequestSchema } from "@/lib/flights/consumer-preview/request-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = Promise<{ orderId: string }>;

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
  const parsed = flightConsumerPreviewPreparePaymentRequestSchema.safeParse(parsedBody.value);
  const { orderId } = await params;
  if (!parsed.success || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return privateNoStoreJson({ error: "The test payment request is invalid." }, 400);
  }
  try {
    const result = await prepareFlightConsumerPreviewPayment({
      customerId: authentication.user.id,
      orderId,
      idempotencyKey,
      travelerDisclosures: parsed.data.travelers,
    });
    return privateNoStoreJson({
      data: {
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
      },
    });
  } catch {
    return privateNoStoreJson({ error: "Stripe test payment could not be prepared." }, 409);
  }
}
