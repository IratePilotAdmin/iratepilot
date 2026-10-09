import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type RetentionStore = { purge(limit: number): Promise<number> };

function createStore(): RetentionStore {
  return {
    async purge(limit) {
      const { data, error } = await createAdminClient().rpc("irp_ota_purge_booking_com_reservation_pii", {
        p_limit: limit,
      });
      if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0 || data > limit) {
        throw new Error("booking_com_reservation_retention_unavailable");
      }
      return data;
    },
  };
}

/** Purges only aged PII for successfully imported messages; review records are retained for operator action. */
export async function runBookingComReservationRetention(
  limit = 50,
  store: RetentionStore = createStore(),
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("booking_com_reservation_retention_limit_invalid");
  }
  const purged = await store.purge(limit);
  return { purged, retentionDays: 30 };
}
