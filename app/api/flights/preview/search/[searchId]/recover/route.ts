import { requireUser } from "@/lib/auth/require-user";
import {
  privateNoStoreJson,
  validateSameOriginMutation,
} from "@/lib/flights/consumer-preview/http.server";
import { recoverFlightConsumerPreviewSearch } from "@/lib/flights/consumer-preview/search-workflow.server";
import { flightConsumerPreviewSearchRequestSchema } from "@/lib/flights/consumer-preview/schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = Promise<{ searchId: string }>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownedSearchSchema = z.object({
  status: z.enum(["created", "searching", "complete", "failed", "expired"]),
  origin_iata: z.string().regex(/^[A-Z]{3}$/),
  destination_iata: z.string().regex(/^[A-Z]{3}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  adult_count: z.number().int().min(1).max(4),
  child_count: z.literal(0),
  infant_in_seat_count: z.literal(0),
  infant_on_lap_count: z.literal(0),
  expires_at: z.string().datetime({ offset: true }),
}).strict();

export async function POST(request: Request, { params }: { params: Params }) {
  if (!validateSameOriginMutation(request)) {
    return privateNoStoreJson({ error: "Cross-site flight mutations are not accepted." }, 403);
  }
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  const { searchId } = await params;
  if (!uuidPattern.test(searchId)) {
    return privateNoStoreJson({ error: "The durable test search is unavailable." }, 404);
  }

  try {
    const owned = await authentication.supabase
      .from("flight_searches")
      .select("status,origin_iata,destination_iata,departure_date,return_date,cabin,adult_count,child_count,infant_in_seat_count,infant_on_lap_count,expires_at")
      .eq("id", searchId)
      .eq("customer_id", authentication.user.id)
      .eq("execution_mode", "test")
      .maybeSingle();
    if (owned.error) throw new Error();
    if (!owned.data) {
      return privateNoStoreJson({ error: "The durable test search is unavailable." }, 404);
    }
    const durable = ownedSearchSchema.safeParse(owned.data);
    if (!durable.success) throw new Error();
    const search = flightConsumerPreviewSearchRequestSchema.safeParse({
      origin: durable.data.origin_iata,
      destination: durable.data.destination_iata,
      departureDate: durable.data.departure_date,
      returnDate: durable.data.return_date,
      cabin: durable.data.cabin,
      passengers: {
        adults: durable.data.adult_count,
        children: durable.data.child_count,
        infantsInSeat: durable.data.infant_in_seat_count,
        infantsOnLap: durable.data.infant_on_lap_count,
      },
    });
    if (!search.success) throw new Error();
    const result = await recoverFlightConsumerPreviewSearch({
      customerId: authentication.user.id,
      searchId,
      search: search.data,
      observedStatus: durable.data.status,
      observedExpiresAt: durable.data.expires_at,
    });
    const nextAction = result.status === "complete"
      ? "results" as const
      : result.status === "searching"
        ? "poll" as const
        : "new_search" as const;
    const response = privateNoStoreJson({
      data: { searchId: result.searchId, status: result.status, nextAction },
    }, nextAction === "poll" ? 202 : 200);
    if (nextAction === "poll") response.headers.set("Retry-After", "4");
    return response;
  } catch {
    return privateNoStoreJson({ error: "The durable test search is temporarily unavailable." }, 503);
  }
}
