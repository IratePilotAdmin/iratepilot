import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBookingComSyncInput, queueBookingComInventorySync, type BookingComSyncStore } from "@/services/hotel-channels/booking-com/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const auth = await requireRole(["partner"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const { data: partner, error: partnerError } = await auth.supabase.from("partners")
    .select("id,status").eq("owner_id", auth.user.id).maybeSingle();
  if (partnerError) return NextResponse.json({ error: "Partner access could not be verified." }, { status: 503, headers: NO_STORE });
  if (partner?.status !== "approved") return NextResponse.json({ error: "An approved partner account is required." }, { status: 403, headers: NO_STORE });

  let raw: string;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8_000) return NextResponse.json({ error: "The sync request is too large." }, { status: 413, headers: NO_STORE });
  } catch { return NextResponse.json({ error: "The sync request could not be read." }, { status: 400, headers: NO_STORE }); }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: "Send valid JSON sync details." }, { status: 400, headers: NO_STORE }); }
  const input = parseBookingComSyncInput(value);
  if (!input) return NextResponse.json({ error: "Enter a property, test connection, sync ID, valid date range (up to 90 days), currency, and price basis." }, { status: 400, headers: NO_STORE });

  const { data: property, error: propertyError } = await auth.supabase.from("properties")
    .select("id,active").eq("id", input.propertyId).eq("partner_id", partner.id).maybeSingle();
  if (propertyError) return NextResponse.json({ error: "Property access could not be verified." }, { status: 503, headers: NO_STORE });
  if (!property?.active) return NextResponse.json({ error: "An active property in your account is required." }, { status: 404, headers: NO_STORE });

  const admin = createAdminClient();
  const store: BookingComSyncStore = {
    async loadInventoryPlan() {
      const { data: connection, error: connectionError } = await admin.from("irp_ota_channel_connections")
        .select("connection_id,property_id,provider_property_id,environment")
        .eq("connection_id", input.connectionId).eq("property_id", input.propertyId)
        .eq("provider", "booking_com").eq("environment", "test").maybeSingle();
      if (connectionError || !connection) throw new Error("booking_com_sync_connection_unavailable");
      const [{ data: rooms, error: roomsError }, { data: mappings, error: mappingsError }] = await Promise.all([
        auth.supabase.from("rooms").select("id").eq("property_id", input.propertyId).eq("active", true),
        admin.from("irp_ota_channel_room_mappings")
          .select("provider_room_type_id,provider_rate_plan_id,local_room_id")
          .eq("connection_id", input.connectionId),
      ]);
      if (roomsError || mappingsError || !rooms?.length || !mappings?.length) throw new Error("booking_com_sync_mapping_unavailable");
      const roomIds = rooms.map((room) => room.id);
      const { data: inventory, error: inventoryError } = await auth.supabase.from("inventory")
        .select("room_id,stay_date,available_units,rate")
        .in("room_id", roomIds).gte("stay_date", input.startDate).lte("stay_date", input.endDate)
        .order("stay_date").limit(50_000);
      if (inventoryError || !inventory?.length) throw new Error("booking_com_sync_inventory_unavailable");
      return {
        propertyId: input.propertyId,
        connectionId: input.connectionId,
        channelPropertyId: connection.provider_property_id,
        currency: input.currency,
        priceBasis: input.priceBasis,
        propertyRoomIds: roomIds,
        mappings: mappings.map((mapping) => ({
          providerRoomTypeId: mapping.provider_room_type_id,
          providerRatePlanId: mapping.provider_rate_plan_id,
          localRoomId: mapping.local_room_id,
        })),
        inventory: inventory.map((row) => ({
          roomId: row.room_id,
          date: row.stay_date,
          availableUnits: row.available_units,
          nightlyRate: row.rate,
        })),
      };
    },
    async enqueue(job) {
      const { data, error } = await admin.rpc("irp_ota_enqueue_booking_com_ari", {
        p_connection_id: job.connectionId,
        p_sync_id: job.syncId,
        p_request_index: job.requestIndex,
        p_request_kind: job.kind,
        p_provider_property_id: job.providerPropertyId,
        p_endpoint: job.endpoint,
        p_request_xml: job.requestXml,
        p_request_sha256: job.requestSha256,
      });
      if (error) {
        if (error.code === "42501") throw new Error("booking_com_sync_not_approved");
        throw new Error("booking_com_sync_enqueue_failed");
      }
      return data as { outcome: string; jobId: string };
    },
  };

  try {
    const result = await queueBookingComInventorySync(input, store);
    return NextResponse.json({ ...result, message: "ARI changes are queued for provider-approved test delivery. No live OTA traffic was sent by this request." }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message === "booking_com_sync_not_approved";
    const invalid = message === "booking_com_sync_scope_mismatch" || message === "booking_com_sync_too_many_requests";
    return NextResponse.json({ error: conflict
      ? "This test connection is not approved for ARI synchronization. Ask the OTA administrator to complete approval and certification first."
      : invalid ? "The selected sync scope is invalid. Review its mappings and requested date range."
        : "Rates and availability could not be queued. Confirm saved inventory and mappings, then try again." }, {
      status: conflict ? 409 : invalid ? 400 : 503,
      headers: NO_STORE,
    });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
