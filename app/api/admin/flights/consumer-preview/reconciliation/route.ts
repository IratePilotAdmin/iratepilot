import { requireRole } from "@/lib/auth/require-role";
import {
  FlightConsumerPreviewAdminReconciliationError,
  flightConsumerPreviewReconciliationStatusSchema,
  listFlightConsumerPreviewAdminReconciliationCases,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import { privateNoStoreJson } from "@/lib/flights/consumer-preview/http.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const statusValues = url.searchParams.getAll("status");
  const limitValues = url.searchParams.getAll("limit");
  const status = statusValues[0] ?? null;
  const rawLimit = limitValues[0] ?? "50";
  const limit = /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  const parsedStatus = status === null
    ? { success: true as const, data: null }
    : flightConsumerPreviewReconciliationStatusSchema.safeParse(status);
  if (
    keys.some((key) => key !== "status" && key !== "limit")
    || statusValues.length > 1
    || limitValues.length > 1
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 100
    || !parsedStatus.success
  ) {
    return privateNoStoreJson({ error: "The reconciliation query is invalid." }, 400);
  }
  try {
    const cases = await listFlightConsumerPreviewAdminReconciliationCases(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      { limit, status: parsedStatus.data },
    );
    return privateNoStoreJson({ data: cases });
  } catch (error) {
    const statusCode = error instanceof FlightConsumerPreviewAdminReconciliationError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({ error: "The reconciliation queue is unavailable." }, statusCode);
  }
}
