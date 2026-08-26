import { requireRole } from "@/lib/auth/require-role";
import { privateNoStoreJson } from "@/lib/flights/consumer-preview/http.server";
import { flightConsumerPreviewServiceRequestStatusSchema } from "@/lib/flights/consumer-preview/service-request-contract";
import {
  FlightConsumerPreviewServiceRequestError,
  listFlightConsumerPreviewAdminServiceRequests,
  type FlightConsumerPreviewServiceRequestRpcClient,
} from "@/lib/flights/consumer-preview/service-requests.server";

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
  const rawStatus = statusValues[0] ?? null;
  const rawLimit = limitValues[0] ?? "50";
  const limit = /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  const status = rawStatus === null
    ? { success: true as const, data: null }
    : flightConsumerPreviewServiceRequestStatusSchema.safeParse(rawStatus);
  if (
    keys.some((key) => key !== "status" && key !== "limit")
    || statusValues.length > 1
    || limitValues.length > 1
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 100
    || !status.success
  ) {
    return privateNoStoreJson({ error: "The test support queue query is invalid." }, 400);
  }
  try {
    const requests = await listFlightConsumerPreviewAdminServiceRequests(
      authentication.supabase as unknown as FlightConsumerPreviewServiceRequestRpcClient,
      { limit, status: status.data },
    );
    return privateNoStoreJson({ data: requests });
  } catch (error) {
    const responseStatus = error instanceof FlightConsumerPreviewServiceRequestError
      && error.kind === "conflict" ? 409 : 503;
    return privateNoStoreJson({ error: "The test support queue is unavailable." }, responseStatus);
  }
}
