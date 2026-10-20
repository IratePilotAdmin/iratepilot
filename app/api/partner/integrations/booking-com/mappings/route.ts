import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_CODE = /^[A-Za-z0-9_-]{1,80}$/;

async function access() {
  const auth = await requireRole(["partner"]);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE }) };
  const { data: partner, error: partnerError } = await auth.supabase.from("partners")
    .select("id,status").eq("owner_id", auth.user.id).maybeSingle();
  if (partnerError) return { response: NextResponse.json({ error: "Partner access could not be verified." }, { status: 503, headers: NO_STORE }) };
  if (partner?.status !== "approved") return { response: NextResponse.json({ error: "An approved partner account is required." }, { status: 403, headers: NO_STORE }) };
  return { auth, partner };
}

export async function GET() {
  try {
    const context = await access();
    if ("response" in context && context.response) return context.response;
    const { auth, partner } = context;
    const { data: properties, error: propertiesError } = await auth.supabase.from("properties")
      .select("id,name,active").eq("partner_id", partner.id);
    if (propertiesError) throw new Error("property_lookup_failed");
    const propertyIds = (properties ?? []).map((property) => property.id);
    if (!propertyIds.length) return NextResponse.json({ properties: [], rooms: [], connections: [], mappings: [] }, { headers: NO_STORE });

    const [roomsResult, connectionsResult] = await Promise.all([
      auth.supabase.from("rooms").select("id,property_id,name,max_guests,base_rate,active").in("property_id", propertyIds).order("name"),
      createAdminClient().from("irp_ota_channel_connections")
        .select("connection_id,property_id,provider_property_id,environment,enabled,partner_approved")
        .eq("provider", "booking_com").in("property_id", propertyIds),
    ]);
    if (roomsResult.error || connectionsResult.error) throw new Error("mapping_lookup_failed");
    const connectionIds = (connectionsResult.data ?? []).map((connection) => connection.connection_id);
    const mappingsResult = connectionIds.length
      ? await createAdminClient().from("irp_ota_channel_room_mappings")
        .select("connection_id,provider_room_type_id,provider_rate_plan_id,local_room_id")
        .in("connection_id", connectionIds)
      : { data: [], error: null };
    if (mappingsResult.error) throw new Error("mapping_lookup_failed");
    return NextResponse.json({
      properties: properties ?? [], rooms: roomsResult.data ?? [],
      connections: connectionsResult.data ?? [], mappings: mappingsResult.data ?? [],
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Booking.com room mappings could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const context = await access();
  if ("response" in context && context.response) return context.response;
  const { auth, partner } = context;
  let value: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000) {
      return NextResponse.json({ error: "The mapping request is too large." }, { status: 413, headers: NO_STORE });
    }
    value = JSON.parse(raw);
  }
  catch { return NextResponse.json({ error: "Send a valid JSON mapping." }, { status: 400, headers: NO_STORE }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json({ error: "Enter valid mapping details." }, { status: 400, headers: NO_STORE });
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["propertyId", "connectionId", "providerRoomTypeId", "providerRatePlanId", "localRoomId"].includes(key))
    || typeof body.propertyId !== "string" || !UUID.test(body.propertyId)
    || typeof body.connectionId !== "string" || !/^booking-[a-f0-9]{32}$/.test(body.connectionId)
    || typeof body.providerRoomTypeId !== "string" || !PROVIDER_CODE.test(body.providerRoomTypeId)
    || typeof body.providerRatePlanId !== "string" || !PROVIDER_CODE.test(body.providerRatePlanId)
    || typeof body.localRoomId !== "string" || !UUID.test(body.localRoomId)) {
    return NextResponse.json({ error: "Enter valid property, connection, room type, rate plan, and local room values." }, { status: 400, headers: NO_STORE });
  }

  const { data: property, error: propertyError } = await auth.supabase.from("properties")
    .select("id,active").eq("id", body.propertyId).eq("partner_id", partner.id).maybeSingle();
  if (propertyError) return NextResponse.json({ error: "Property access could not be verified." }, { status: 503, headers: NO_STORE });
  if (!property?.active) return NextResponse.json({ error: "An active property in your account is required." }, { status: 404, headers: NO_STORE });

  const room = await auth.supabase.from("rooms").select("id")
    .eq("id", body.localRoomId).eq("property_id", body.propertyId).eq("active", true).maybeSingle();
  if (room.error) return NextResponse.json({ error: "Room access could not be verified." }, { status: 503, headers: NO_STORE });
  if (!room.data) return NextResponse.json({ error: "Choose an active room in this property." }, { status: 404, headers: NO_STORE });

  const admin = createAdminClient();
  const connection = await admin.from("irp_ota_channel_connections").select("connection_id")
    .eq("connection_id", body.connectionId).eq("property_id", body.propertyId)
    .eq("provider", "booking_com").eq("environment", "test").maybeSingle();
  if (connection.error) return NextResponse.json({ error: "Booking.com connection could not be verified." }, { status: 503, headers: NO_STORE });
  if (!connection.data) return NextResponse.json({ error: "Booking.com test connection not found for this property." }, { status: 404, headers: NO_STORE });

  const saved = await admin.from("irp_ota_channel_room_mappings").upsert({
    connection_id: body.connectionId,
    provider_room_type_id: body.providerRoomTypeId,
    provider_rate_plan_id: body.providerRatePlanId,
    local_room_id: body.localRoomId,
  }, { onConflict: "connection_id,provider_room_type_id,provider_rate_plan_id" })
    .select("connection_id,provider_room_type_id,provider_rate_plan_id,local_room_id").single();
  if (saved.error?.code === "42P01") return NextResponse.json({ error: "The Booking.com database migration must be installed first." }, { status: 503, headers: NO_STORE });
  if (saved.error) return NextResponse.json({ error: "The room mapping could not be saved." }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ mapping: saved.data, message: "Test mapping saved. OTA synchronization remains disabled." }, { headers: NO_STORE });
}
