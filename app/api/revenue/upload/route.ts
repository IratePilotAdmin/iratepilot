import { NextResponse } from "next/server";
import { addDays, format, parseISO } from "date-fns";
import { requireRole } from "@/lib/auth/require-role";
import { parseRevenueCsv } from "@/lib/revenue";
import { isApprovedRevenueOwner } from "@/lib/revenue-access";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const form = (await request.formData()) as unknown as {
      get(name: string): unknown;
    };
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > 2_000_000) return NextResponse.json({ error: "Choose a CSV file no larger than 2 MB." }, { status: 400 });
    const validateOnly = form.get("validateOnly") === "true";
    const rows = parseRevenueCsv(await file.text());
    const propertyIds = [...new Set(rows.map(row => row.property_id))];
    const roomIds = [...new Set(rows.map(row => row.room_id))];
    const { data: properties, error: propertyError } = await auth.supabase.from("properties").select("id,partner_id,partners(owner_id,status)").in("id", propertyIds);
    if (propertyError) throw propertyError;
    const authorized = (properties || []).every(property => {
      return auth.profile.role === "admin" || isApprovedRevenueOwner(property.partners, auth.user.id);
    });
    if (!authorized || properties?.length !== propertyIds.length) return NextResponse.json({ error: "CSV contains a property you cannot manage." }, { status: 403 });
    const { data: rooms, error: roomError } = await auth.supabase.from("rooms").select("id,property_id").in("id", roomIds);
    if (roomError) throw roomError;
    if (rooms?.length !== roomIds.length || rows.some(row => !rooms.some(room => room.id === row.room_id && room.property_id === row.property_id))) return NextResponse.json({ error: "Every room must belong to its listed property." }, { status: 400 });
    const today = format(new Date(), "yyyy-MM-dd");
    const maxDate = addDays(new Date(), 365);
    if (rows.some(row => row.stay_date < today || parseISO(row.stay_date) > maxDate)) return NextResponse.json({ error: "CSV dates must be today through the next 365 days." }, { status: 400 });
    const validation = {
      schemaVersion: 1,
      source: "CSV import",
      reconciliation: "Not reconciled with a PMS",
      rowCount: rows.length,
      propertyCount: propertyIds.length,
      roomTypeCount: roomIds.length,
      firstStayDate: rows.reduce((min, row) => row.stay_date < min ? row.stay_date : min, rows[0].stay_date),
      lastStayDate: rows.reduce((max, row) => row.stay_date > max ? row.stay_date : max, rows[0].stay_date),
    };
    if (validateOnly) return NextResponse.json({ message: "CSV validated. No data was imported.", validation });
    const payload = rows.map(row => ({ ...row, imported_by: auth.user.id, imported_at: new Date().toISOString(), source: "csv" }));
    const result = await auth.supabase.from("revenue_daily_inputs").upsert(payload, { onConflict: "room_id,stay_date" });
    if (result.error) throw result.error;
    await auth.supabase.from("revenue_audit_log").insert(propertyIds.map(property_id => ({ property_id, actor_id: auth.user.id, action: "csv_imported", details: { filename: file.name, rows: rows.filter(row => row.property_id === property_id).length } })));
    return NextResponse.json({ message: `${rows.length} revenue rows imported successfully.`, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revenue CSV could not be imported.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
