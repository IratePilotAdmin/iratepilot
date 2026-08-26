import { z } from "zod";

import { requireRole } from "@/lib/auth/require-role";
import {
  FlightConsumerPreviewAdminReconciliationError,
  resolveFlightConsumerPreviewAdminReconciliationCase,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import {
  privateNoStoreJson,
  readPreviewJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;

const resolutionRequestSchema = z.object({
  expectedUpdatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  resolutionCode: z.enum([
    "local_state_corrected",
    "provider_state_confirmed",
    "payment_reversed",
    "ticket_reissued",
    "duplicate_suppressed",
    "manual_followup_required",
  ]),
  resolutionEvidenceSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site admin mutations are not accepted." }, 403);
  }
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const body = await readPreviewJson(request, 4_096);
  const { caseId } = await params;
  const parsedBody = body.ok ? resolutionRequestSchema.safeParse(body.value) : null;
  if (
    !parsedBody?.success
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)
  ) {
    return privateNoStoreJson({ error: "The reconciliation resolution request is invalid." }, 400);
  }
  try {
    const result = await resolveFlightConsumerPreviewAdminReconciliationCase(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      {
        caseId,
        ...parsedBody.data,
      },
    );
    return privateNoStoreJson({ data: result });
  } catch (error) {
    const status = error instanceof FlightConsumerPreviewAdminReconciliationError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({
      error: status === 409
        ? "The reconciliation case changed or the resolution evidence is invalid."
        : "The reconciliation case could not be resolved safely.",
    }, status);
  }
}
