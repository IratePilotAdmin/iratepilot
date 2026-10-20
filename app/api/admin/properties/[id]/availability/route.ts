import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { parseHotelStay, getAvailableRooms } from "@/lib/marketplace-search";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid property ID." }, { status: 400 });
    }
    const query = new URL(request.url).searchParams;
    const parsed = parseHotelStay({
      checkIn: query.get("checkIn") ?? "",
      checkOut: query.get("checkOut") ?? "",
      guests: query.get("guests") ?? "",
    });
    if (!parsed.criteria || parsed.error) {
      return NextResponse.json({ error: parsed.error ?? "Choose stay dates and guests." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: property, error: propertyError } = await admin.from("properties")
      .select("id,name,active,pms_only,partners(status)").eq("id", id).single();
    if (propertyError || !property || property.pms_only) {
      return NextResponse.json({ error: "Property was not found." }, { status: 404 });
    }
    const { data: rooms, error: roomsError } = await admin.from("rooms")
      .select("id,name,active,base_rate,max_guests").eq("property_id", id);
    if (roomsError) throw roomsError;
    const roomIds = (rooms ?? []).map((room) => room.id);
    const { data: inventory, error: inventoryError } = roomIds.length
      ? await admin.from("inventory").select("room_id,stay_date,available_units,rate")
        .in("room_id", roomIds)
        .gte("stay_date", parsed.criteria.checkIn)
        .lt("stay_date", parsed.criteria.checkOut)
      : { data: [], error: null };
    if (inventoryError) throw inventoryError;

    const stayRooms = (rooms ?? []).map((room) => ({
      ...room,
      inventory: (inventory ?? []).filter((day) => day.room_id === room.id),
    }));
    const available = getAvailableRooms(stayRooms, parsed.criteria);
    const partner = Array.isArray(property.partners) ? property.partners[0] : property.partners;
    return NextResponse.json({
      mode: "private-read-only",
      bookingEnabled: false,
      property: { id: property.id, name: property.name, active: property.active, partnerStatus: partner?.status ?? null },
      stay: parsed.criteria,
      rooms: available.map((room) => ({
        id: room.id,
        name: room.name,
        averageNightlyRate: room.averageNightlyRate,
        staySubtotal: room.staySubtotal,
        maxGuests: room.max_guests,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Private availability could not be checked." }, { status: 503 });
  }
}
