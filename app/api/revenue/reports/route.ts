import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const schema = z.object({ propertyId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid property is required." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: property } = await auth.supabase.from("properties").select("id,name,partners(owner_id)").eq("id", parsed.data.propertyId).single();
    const owner = property?.partners?.[0]?.owner_id;
    if (!property || (auth.profile.role !== "admin" && owner !== auth.user.id)) return NextResponse.json({ error: "Property access denied." }, { status: 403 });
    const today = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 89), "yyyy-MM-dd");
    const [{ data: inputs }, { count: pending }] = await Promise.all([
      auth.supabase.from("revenue_daily_inputs").select("rooms_available,rooms_sold,current_rate").eq("property_id", property.id).gte("stay_date", today).lte("stay_date", end),
      auth.supabase.from("revenue_recommendations").select("id", { count: "exact", head: true }).eq("property_id", property.id).eq("status", "pending")
    ]);
    if (!inputs?.length) return NextResponse.json({ error: "Upload 90-day data before creating a report." }, { status: 409 });
    const rooms = inputs.reduce((sum, row) => sum + row.rooms_available, 0);
    const sold = inputs.reduce((sum, row) => sum + row.rooms_sold, 0);
    const averageOccupancy = rooms ? Math.round(sold / rooms * 10000) / 100 : 0;
    const averageRate = Math.round(inputs.reduce((sum, row) => sum + Number(row.current_rate), 0) / inputs.length * 100) / 100;
    const forecastRevenue = Math.round(inputs.reduce((sum, row) => sum + row.rooms_sold * Number(row.current_rate), 0) * 100) / 100;
    const summary = `${property.name}: ${averageOccupancy}% average occupancy and $${averageRate.toFixed(2)} ADR across the loaded 90-day window. ${pending || 0} pricing actions require manager review.`;
    const result = await auth.supabase.from("revenue_daily_reports").upsert({ property_id: property.id, report_date: today, forecast_window_days: 90, average_occupancy: averageOccupancy, average_daily_rate: averageRate, forecast_revenue: forecastRevenue, pending_actions: pending || 0, summary, created_by: auth.user.id }, { onConflict: "property_id,report_date" });
    if (result.error) throw result.error;
    await auth.supabase.from("revenue_audit_log").insert({ property_id: property.id, actor_id: auth.user.id, action: "daily_report_generated", details: { report_date: today, pending_actions: pending || 0 } });
    return NextResponse.json({ message: "Today’s 90-day revenue report is ready.", summary });
  } catch {
    return NextResponse.json({ error: "Daily report could not be generated." }, { status: 503 });
  }
}
