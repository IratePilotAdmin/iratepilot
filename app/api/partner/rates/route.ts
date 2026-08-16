import { NextResponse } from "next/server";
import { eachDayOfInterval, parseISO, format } from "date-fns";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerHotelAccess, type PartnerHotelAccessResult } from "@/lib/partner/hotel-access";
import { inventorySchema, roomSchema, roomUpdateSchema } from "@/lib/validation";
import { getInventoryDateRangeError, getUpcomingInventory } from "@/lib/inventory-dates";

const hotelAccessError = (resolved: PartnerHotelAccessResult) => NextResponse.json({
  error: resolved.migrationRequired
    ? "Apply hotel-management migration 055 before using delegated room and inventory access."
    : resolved.selectionRequired
      ? "Select a hotel organization before managing rooms and inventory."
      : "Approved hotel-management access is required.",
  hotelAccess: {
    options: resolved.options,
    selectedPartnerId: null,
    selectionRequired: resolved.selectionRequired,
  },
}, { status: resolved.migrationRequired ? 503 : resolved.selectionRequired ? 409 : 403 });

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    let partnerId: string | null = null;
    let hotelAccess: PartnerHotelAccessResult | null = null;
    if (auth.profile.role !== "admin") {
      const requestedPartnerId = new URL(request.url).searchParams.get("partnerId");
      hotelAccess = await resolvePartnerHotelAccess(auth, requestedPartnerId);
      if (hotelAccess.selectionRequired) return NextResponse.json({
        properties: [],
        rooms: [],
        hotelAccess: {
          options: hotelAccess.options,
          selectedPartnerId: null,
          selectionRequired: true,
        },
      });
      if (!hotelAccess.access) return hotelAccessError(hotelAccess);
      partnerId = hotelAccess.access.partnerId;
    }
    let query = auth.supabase.from("properties").select("id,name,active").order("name");
    if (partnerId) query = query.eq("partner_id", partnerId);
    const { data: properties, error } = await query;
    if (error) throw error;
    const ids = (properties || []).map((property) => property.id);
    const accessPayload = hotelAccess ? {
      options: hotelAccess.options,
      selectedPartnerId: hotelAccess.access?.partnerId ?? null,
      selectionRequired: false,
    } : null;
    if (!ids.length) return NextResponse.json({ properties: [], rooms: [], hotelAccess: accessPayload });
    const roomsResult = await auth.supabase.from("rooms")
      .select("id,property_id,name,max_guests,base_rate,active,inventory(stay_date,available_units,rate)")
      .in("property_id", ids).order("name");
    if (roomsResult.error) throw roomsResult.error;
    return NextResponse.json({
      properties,
      rooms: (roomsResult.data ?? []).map((room) => ({
        ...room,
        inventory: getUpcomingInventory(room.inventory),
      })),
      hotelAccess: accessPayload,
    });
  } catch {
    return NextResponse.json({ error: "Rates and inventory are not configured." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    let partnerId: string | null = null;
    if (auth.profile.role !== "admin") {
      const requestedPartnerId = typeof body.partnerId === "string" ? body.partnerId : null;
      const resolved = await resolvePartnerHotelAccess(auth, requestedPartnerId);
      if (!resolved.access) return hotelAccessError(resolved);
      partnerId = resolved.access.partnerId;
    }
    if (body.action === "create_room") {
      const parsed = roomSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Check the room name, guests, and base rate." }, { status: 400 });
      let propertyQuery = auth.supabase.from("properties").select("id").eq("id", parsed.data.propertyId);
      if (partnerId) propertyQuery = propertyQuery.eq("partner_id", partnerId);
      const { data: property } = await propertyQuery.maybeSingle();
      if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });
      const result = await auth.supabase.from("rooms").insert({
        property_id: parsed.data.propertyId, name: parsed.data.name,
        max_guests: parsed.data.maxGuests, base_rate: parsed.data.baseRate, active: true
      }).select("id,name").single();
      if (result.error) throw result.error;
      return NextResponse.json({ data: result.data, message: "Room type created." }, { status: 201 });
    }
    if (body.action === "update_room") {
      const parsed = roomUpdateSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Check the room name, guests, base rate, and status." }, { status: 400 });
      let roomQuery = auth.supabase.from("rooms")
        .select("id,properties!inner(partner_id)")
        .eq("id", parsed.data.roomId);
      if (partnerId) roomQuery = roomQuery.eq("properties.partner_id", partnerId);
      const { data: room, error: roomError } = await roomQuery.maybeSingle();
      if (roomError) throw roomError;
      if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });
      const result = await auth.supabase.from("rooms").update({
        name: parsed.data.name,
        max_guests: parsed.data.maxGuests,
        base_rate: parsed.data.baseRate,
        active: parsed.data.active,
      }).eq("id", parsed.data.roomId)
        .select("id,name,max_guests,base_rate,active")
        .single();
      if (result.error) throw result.error;
      return NextResponse.json({
        data: result.data,
        message: parsed.data.active ? "Room type updated." : "Room type retired from new bookings.",
      });
    }
    if (body.action === "set_inventory") {
      const parsed = inventorySchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Check the date range, units, and nightly rate." }, { status: 400 });
      let roomQuery = auth.supabase.from("rooms").select("id,properties!inner(partner_id)").eq("id", parsed.data.roomId);
      if (partnerId) roomQuery = roomQuery.eq("properties.partner_id", partnerId);
      const { data: room } = await roomQuery.maybeSingle();
      if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });
      const start = parseISO(parsed.data.startDate);
      const end = parseISO(parsed.data.endDate);
      const dateError = getInventoryDateRangeError(parsed.data.startDate, parsed.data.endDate);
      if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
      const rows = eachDayOfInterval({ start, end }).map((date) => ({
        room_id: parsed.data.roomId, stay_date: format(date, "yyyy-MM-dd"),
        available_units: parsed.data.availableUnits, rate: parsed.data.rate
      }));
      const result = await auth.supabase.from("inventory").upsert(rows, { onConflict: "room_id,stay_date" });
      if (result.error) throw result.error;
      return NextResponse.json({ message: `${rows.length} inventory dates updated.` });
    }
    return NextResponse.json({ error: "Unknown inventory action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Rates and inventory could not be saved." }, { status: 503 });
  }
}
