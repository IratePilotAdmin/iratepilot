import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { buildRateRecommendation, type RevenueCsvRow } from "@/lib/revenue";

const schema = z.object({ propertyId: z.string().uuid() });

export async function POST(request: Request) {
  if (process.env.PILOT_MODE !== "true") return NextResponse.json({ error: "Revenue recommendations are disabled." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid property is required." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: property } = await auth.supabase.from("properties").select("id,partner_id,partners(owner_id)").eq("id", parsed.data.propertyId).single();
    const owner = property?.partners?.[0]?.owner_id;
    if (!property || (auth.profile.role !== "admin" && owner !== auth.user.id)) return NextResponse.json({ error: "Property access denied." }, { status: 403 });
    const today = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 89), "yyyy-MM-dd");
    const { data: inputs, error } = await auth.supabase.from("revenue_daily_inputs").select("*").eq("property_id", property.id).gte("stay_date", today).lte("stay_date", end).order("stay_date");
    if (error) throw error;
    if (!inputs?.length) return NextResponse.json({ error: "Upload revenue data for the next 90 days first." }, { status: 409 });
    await auth.supabase.from("revenue_recommendations").update({ status: "superseded" }).eq("property_id", property.id).eq("status", "pending");
    const rows = inputs.map(input => {
      const recommendation = buildRateRecommendation(input as RevenueCsvRow);
      return { property_id: input.property_id, room_id: input.room_id, stay_date: input.stay_date, current_rate: recommendation.currentRate, recommended_rate: recommendation.recommendedRate, occupancy_forecast: recommendation.occupancyForecast, estimated_revenue_impact: recommendation.estimatedRevenueImpact, reason: recommendation.reason };
    });
    const result = await auth.supabase.from("revenue_recommendations").insert(rows).select("id");
    if (result.error) throw result.error;
    await auth.supabase.from("revenue_audit_log").insert({ property_id: property.id, actor_id: auth.user.id, action: "recommendations_generated", details: { count: rows.length, window_days: 90 } });
    return NextResponse.json({ message: `${rows.length} pricing recommendations generated for the 90-day window.` });
  } catch {
    return NextResponse.json({ error: "Revenue recommendations could not be generated." }, { status: 503 });
  }
}
