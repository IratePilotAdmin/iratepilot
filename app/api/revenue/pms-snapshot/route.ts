import { addDays, format } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerHotelAccess } from "@/lib/partner/hotel-access";
import { loadCompleteSnapshotRows } from "@/lib/pms-snapshot-pagination";

const querySchema = z.object({
  propertyId: z.string().uuid(),
  partnerId: z.string().uuid().optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Select a valid property." }, { status: 400 });

  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let partnerId: string | null = null;
    if (auth.profile.role !== "admin") {
      const resolved = await resolvePartnerHotelAccess(auth, parsed.data.partnerId);
      if (resolved.selectionRequired) return NextResponse.json({ error: "Select a hotel organization first." }, { status: 409 });
      if (!resolved.access) return NextResponse.json({ error: "Approved hotel access is required." }, { status: 403 });
      partnerId = resolved.access.partnerId;
    }

    let propertyQuery = auth.supabase.from("properties").select("id,name,partner_id").eq("id", parsed.data.propertyId);
    if (partnerId) propertyQuery = propertyQuery.eq("partner_id", partnerId);
    const { data: property, error: propertyError } = await propertyQuery.maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return NextResponse.json({ error: "Property not found or access denied." }, { status: 404 });

    const { data: rooms, error: roomsError, count: roomCount } = await auth.supabase.from("rooms")
      .select("id,name,base_rate,active", { count: "exact" })
      .eq("property_id", property.id).eq("active", true).order("name").limit(101);
    if (roomsError) throw roomsError;
    if (roomCount !== null && roomCount > 100) return NextResponse.json({ error: "This pilot supports up to 100 active room types per property." }, { status: 422 });
    if (roomCount === null || (rooms?.length ?? 0) !== roomCount) throw new Error("PMS room list is incomplete.");
    const roomIds = (rooms ?? []).map((room) => room.id);
    const from = format(new Date(), "yyyy-MM-dd");
    const through = format(addDays(new Date(), 89), "yyyy-MM-dd");
    if (!roomIds.length) return NextResponse.json({
      property: { id: property.id, name: property.name }, from, through, rooms: [], inventory: [],
      source: "iratepilot_pms", readOnly: true, schemaVersion: 1, generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });

    const inventory = await loadCompleteSnapshotRows(async (offset) => {
      const { data, error, count } = await auth.supabase.from("inventory")
        .select("room_id,stay_date,available_units,rate", { count: offset === 0 ? "exact" : undefined })
        .in("room_id", roomIds).gte("stay_date", from).lte("stay_date", through)
        .order("stay_date").order("room_id").range(offset, offset + 999);
      if (error) throw error;
      return { rows: data ?? [], count };
    }, 9_000);

    return NextResponse.json({
      property: { id: property.id, name: property.name }, from, through,
      rooms: rooms ?? [], inventory, source: "iratepilot_pms", readOnly: true,
      schemaVersion: 1, generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "PMS inventory could not be loaded." }, { status: 503 });
  }
}
