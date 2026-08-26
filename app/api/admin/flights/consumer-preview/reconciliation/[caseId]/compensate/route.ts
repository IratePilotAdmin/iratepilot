import { after } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { queueFlightConsumerPreviewNotification } from "@/lib/email/flight-notification-delivery.server";
import {
  compensateFlightConsumerPreviewAdminReconciliationCase,
  FlightConsumerPreviewAdminReconciliationError,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import {
  privateNoStoreJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = Promise<{ caseId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site admin mutations are not accepted." }, 403);
  }
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const { caseId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) {
    return privateNoStoreJson({ error: "The compensation request is invalid." }, 400);
  }
  try {
    const result = await compensateFlightConsumerPreviewAdminReconciliationCase(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      caseId,
      undefined,
      ({ customerId, orderId, result: reconciliationResult }) => {
        try {
          after(async () => {
            if (reconciliationResult.decision === "manual_review_required") {
              await queueFlightConsumerPreviewNotification({
                customerId,
                orderId,
                event: "order_pending",
              });
              return;
            }
            await queueFlightConsumerPreviewNotification({
              customerId,
              orderId,
              event: "order_failed",
            });
            if (
              reconciliationResult.decision === "refunded"
              || reconciliationResult.decision === "already_refunded"
            ) {
              await queueFlightConsumerPreviewNotification({
                customerId,
                orderId,
                event: "refund_completed",
              });
            }
          });
        } catch {
          // The committed compensation response is independent of email.
        }
      },
    );
    return privateNoStoreJson({ data: result });
  } catch (error) {
    const status = error instanceof FlightConsumerPreviewAdminReconciliationError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({
      error: status === 409
        ? "This case is not eligible for automatic Stripe test compensation."
        : "Stripe test compensation could not be completed safely.",
    }, status);
  }
}
