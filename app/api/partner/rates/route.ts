import { NextResponse } from "next/server";
import { eachDayOfInterval, parseISO, format } from "date-fns";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerHotelAccess, type PartnerHotelAccessResult } from "@/lib/partner/hotel-access";
import { inventoryAvailabilitySchema, inventorySchema, roomSchema, roomUpdateSchema } from "@/lib/validation";
import { getInventoryDateRangeError, getUpcomingInventory } from "@/lib/inventory-dates";
import { isPmsOnlyRoom } from "@/lib/pms-only-room";

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
      .select("id,property_id,name,max_guests,base_rate,active,direct_rate_plan_code,direct_rate_plan_name,direct_currency_code,direct_cancellation_policy,direct_cancellation_policy_version,inventory(stay_date,available_units,rate,direct_tax_amount,direct_mandatory_fee_amount)")
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
        max_guests: parsed.data.maxGuests, base_rate: parsed.data.baseRate, active: true,
        direct_rate_plan_code: parsed.data.ratePlanCode,
        direct_rate_plan_name: parsed.data.ratePlanName,
        direct_currency_code: "USD",
        direct_cancellation_policy: parsed.data.cancellationPolicy,
        direct_cancellation_policy_version: parsed.data.cancellationPolicyVersion,
      }).select("id,name").single();
      if (result.error) throw result.error;
      return NextResponse.json({ data: result.data, message: "Room type created." }, { status: 201 });
    }
    if (body.action === "update_room") {
      const parsed = roomUpdateSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Check the room name, guests, base rate, and status." }, { status: 400 });
      let roomQuery = auth.supabase.from("rooms")
        .select("id,base_rate,properties!inner(partner_id,pms_only)")
        .eq("id", parsed.data.roomId);
      if (partnerId) roomQuery = roomQuery.eq("properties.partner_id", partnerId);
      const { data: room, error: roomError } = await roomQuery.maybeSingle();
      if (roomError) throw roomError;
      if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });
      if (isPmsOnlyRoom(room.properties) && Number(room.base_rate) !== parsed.data.baseRate) {
        return NextResponse.json({ error: "PMS-only room rates are read-only in the rate editor." }, { status: 409 });
      }
      const result = await auth.supabase.from("rooms").update({
        name: parsed.data.name,
        max_guests: parsed.data.maxGuests,
        base_rate: parsed.data.baseRate,
        active: parsed.data.active,
        direct_rate_plan_code: parsed.data.ratePlanCode,
        direct_rate_plan_name: parsed.data.ratePlanName,
        direct_currency_code: "USD",
        direct_cancellation_policy: parsed.data.cancellationPolicy,
        direct_cancellation_policy_version: parsed.data.cancellationPolicyVersion,
      }).eq("id", parsed.data.roomId)
        .select("id,name,max_guests,base_rate,active,direct_rate_plan_code,direct_rate_plan_name,direct_currency_code,direct_cancellation_policy,direct_cancellation_policy_version")
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
      let roomQuery = auth.supabase.from("rooms").select("id,properties!inner(partner_id,pms_only)").eq("id", parsed.data.roomId);
      if (partnerId) roomQuery = roomQuery.eq("properties.partner_id", partnerId);
      const { data: room } = await roomQuery.maybeSingle();
      if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });
      if (isPmsOnlyRoom(room.properties)) {
        return NextResponse.json({ error: "PMS-only inventory is read-only in the rate editor." }, { status: 409 });
      }
      const start = parseISO(parsed.data.startDate);
      const end = parseISO(parsed.data.endDate);
      const dateError = getInventoryDateRangeError(parsed.data.startDate, parsed.data.endDate);
      if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
      const rows = eachDayOfInterval({ start, end }).map((date) => ({
        room_id: parsed.data.roomId, stay_date: format(date, "yyyy-MM-dd"),
        available_units: parsed.data.availableUnits, rate: parsed.data.rate,
        direct_tax_amount: parsed.data.taxAmount,
        direct_mandatory_fee_amount: parsed.data.mandatoryFeeAmount,
      }));
      const result = await auth.supabase.from("inventory").upsert(rows, { onConflict: "room_id,stay_date" });
      if (result.error) throw result.error;
      return NextResponse.json({ message: `${rows.length} inventory dates updated.` });
    }
    if (body.action === "set_availability") {
      const parsed = inventoryAvailabilitySchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Check the room, date range, and available units." }, { status: 400 });
      let roomQuery = auth.supabase.from("rooms").select("id,properties!inner(partner_id,pms_only)").eq("id", parsed.data.roomId);
      if (partnerId) roomQuery = roomQuery.eq("properties.partner_id", partnerId);
      const { data: room, error: roomError } = await roomQuery.maybeSingle();
      if (roomError) throw roomError;
      if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });
      if (isPmsOnlyRoom(room.properties)) {
        return NextResponse.json({ error: "PMS-only inventory is read-only in the rate editor." }, { status: 409 });
      }
      const { startDate, endDate, availableUnits, roomId } = parsed.data;
      const dateError = getInventoryDateRangeError(startDate, endDate);
      if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
      const expectedDates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
        .map((date) => format(date, "yyyy-MM-dd"));
      const { data: existing, error: existingError } = await auth.supabase.from("inventory")
        .select("stay_date").eq("room_id", roomId).gte("stay_date", startDate).lte("stay_date", endDate);
      if (existingError) throw existingError;
      const savedDates = new Set((existing ?? []).map((row) => row.stay_date));
      if (savedDates.size !== expectedDates.length || expectedDates.some((date) => !savedDates.has(date))) {
        return NextResponse.json({ error: "One or more dates have no saved inventory. Ask an OTA administrator to review new dates before publishing them." }, { status: 409 });
      }
      const { data: updated, error: updateError } = await auth.supabase.from("inventory")
        .update({ available_units: availableUnits })
        .eq("room_id", roomId).gte("stay_date", startDate).lte("stay_date", endDate)
        .select("stay_date");
      if (updateError) throw updateError;
      const updatedDates = new Set((updated ?? []).map((row) => row.stay_date));
      if (updatedDates.size !== expectedDates.length || expectedDates.some((date) => !updatedDates.has(date))) {
        return NextResponse.json({ error: "Availability needs review. Refresh the dates before taking another action." }, { status: 503 });
      }
      return NextResponse.json({ message: `${expectedDates.length} existing inventory dates updated; rates, taxes, and fees were unchanged.` });
    }
    return NextResponse.json({ error: "Unknown inventory action." }, { status: 400 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P0001"
      && "message" in error && error.message === "Active direct hotel offer inventory is immutable until release or expiry") {
      return NextResponse.json({
        error: "An active direct booking request holds inventory on one of these dates. Release or expire the request before changing availability.",
      }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P0001"
      && "message" in error && error.message === "Unpublish the property before changing commercial inventory terms") {
      return NextResponse.json({
        error: "This published hotel's commercial terms are locked. Ask an OTA administrator to pause the listing in Admin → Properties, review and save the new inventory dates, then publish it again.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Rates and inventory could not be saved." }, { status: 503 });
  }
}
