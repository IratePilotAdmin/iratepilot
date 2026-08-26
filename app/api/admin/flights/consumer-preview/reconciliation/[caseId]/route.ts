import { requireRole } from "@/lib/auth/require-role";
import {
  getFlightConsumerPreviewAdminReconciliationCase,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import { privateNoStoreJson } from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const { caseId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) {
    return privateNoStoreJson({ error: "The reconciliation case is invalid." }, 400);
  }
  try {
    const detail = await getFlightConsumerPreviewAdminReconciliationCase(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      caseId,
    );
    if (!detail) return privateNoStoreJson({ error: "The reconciliation case was not found." }, 404);
    return privateNoStoreJson({ data: detail });
  } catch {
    return privateNoStoreJson({ error: "The reconciliation case is unavailable." }, 503);
  }
}
