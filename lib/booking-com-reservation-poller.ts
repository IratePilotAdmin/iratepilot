import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingComMachineAccountToken } from "@/services/hotel-channels/booking-com/machine-account";
import { stageBookingComReservation } from "@/services/hotel-channels/booking-com/inbox";
import { parseBookingComReservationBatch } from "@/services/hotel-channels/booking-com/reservation-parser";
import {
  buildBookingComReservationPoll,
  callBookingComReservationTestApi,
  type BookingComReservationKind,
} from "@/services/hotel-channels/booking-com/reservations";

type PollConnection = {
  connection_id: string;
  property_id: string;
  provider_property_id: string;
  machine_account_id: string;
};

type PollStore = {
  listApprovedTestConnections(): Promise<PollConnection[]>;
  stage(connection: PollConnection, eventKind: "new" | "modified_or_cancelled", reservation: ReturnType<typeof parseBookingComReservationBatch>[number]): Promise<"received" | "duplicate">;
};

type PollDependencies = {
  store?: PollStore;
  fetcher?: typeof fetch;
  getToken?: (accountId: string, fetcher: typeof fetch) => Promise<string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

function createStore(): PollStore {
  return {
    async listApprovedTestConnections() {
      const { data, error } = await createAdminClient().from("irp_ota_channel_connections")
        .select("connection_id,property_id,provider_property_id,machine_account_id")
        .eq("provider", "booking_com").eq("environment", "test")
        .eq("enabled", true).eq("partner_approved", true).eq("pii_compliance_approved", true)
        .not("machine_account_id", "is", null).order("created_at", { ascending: true }).limit(50);
      if (error || !Array.isArray(data)) throw new Error("booking_com_reservation_connection_list_failed");
      return data as PollConnection[];
    },
    async stage(connection, eventKind, reservation) {
      const result = await stageBookingComReservation(async (name, args) => await createAdminClient().rpc(name, args), {
        connectionId: connection.connection_id,
        propertyId: connection.property_id,
        providerPropertyId: connection.provider_property_id,
        eventKind,
        reservation,
      });
      return result.outcome;
    },
  };
}

function validateConnection(value: PollConnection): boolean {
  return !!value && ID.test(value.connection_id) && UUID.test(value.property_id)
    && ID.test(value.provider_property_id) && UUID.test(value.machine_account_id);
}

/**
 * Retrieves Booking.com test reservations and stages encrypted copies. It never
 * acknowledges a provider message: acknowledgement must wait until the PMS
 * transaction has durably created or updated the corresponding reservation.
 */
export async function runBookingComReservationPoller(dependencies: PollDependencies = {}) {
  const store = dependencies.store ?? createStore();
  const fetcher = dependencies.fetcher ?? fetch;
  const getToken = dependencies.getToken ?? ((id, transport) => getBookingComMachineAccountToken(id, { fetcher: transport }));
  const connections = await store.listApprovedTestConnections();
  if (connections.length > 50) throw new Error("booking_com_reservation_connection_limit_exceeded");

  let polled = 0;
  let received = 0;
  let duplicates = 0;
  let mismatched = 0;
  let retryable = 0;
  let review = 0;

  for (const connection of connections) {
    if (!validateConnection(connection)) { review += 1; continue; }
    let token: string;
    try { token = await getToken(connection.machine_account_id, fetcher); }
    catch { retryable += 2; continue; }

    for (const kind of ["new", "modified_or_cancelled"] as const satisfies readonly BookingComReservationKind[]) {
      polled += 1;
      const result = await callBookingComReservationTestApi(buildBookingComReservationPoll(connection.provider_property_id, kind), {
        mode: "test",
        propertyId: connection.provider_property_id,
        machineAccountPropertyScope: connection.provider_property_id,
        partnerApproved: true,
        reservationConnectionApproved: true,
        endpointEnabled: true,
        certificationComplete: true,
        piiComplianceApproved: true,
        testProperty: true,
      }, { bearerToken: token, fetcher });
      if (result.outcome === "retryable" || result.outcome === "unknown") { retryable += 1; continue; }
      if (result.outcome !== "received") { review += 1; continue; }

      let reservations: ReturnType<typeof parseBookingComReservationBatch>;
      try { reservations = parseBookingComReservationBatch(result.body); }
      catch { review += 1; continue; }

      for (const reservation of reservations) {
        if (reservation.providerPropertyId !== connection.provider_property_id) { mismatched += 1; continue; }
        try {
          const outcome = await store.stage(connection, kind === "new" ? "new" : "modified_or_cancelled", reservation);
          if (outcome === "received") received += 1;
          else duplicates += 1;
        } catch { review += 1; }
      }
    }
  }
  return { connections: connections.length, polled, received, duplicates, mismatched, retryable, review, acknowledgementsSent: 0 };
}
