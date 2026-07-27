import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner } = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
    let propertyQuery = auth.supabase.from("properties").select("id,name").order("name");
    if (auth.profile.role !== "admin") {
      if (!partner) return NextResponse.json({ properties: [], recommendations: [], audit: [], reports: [], inputs: [] });
      propertyQuery = propertyQuery.eq("partner_id", partner.id);
    }
    const { data: properties, error } = await propertyQuery;
    if (error) throw error;
    const ids = (properties || []).map(item => item.id);
    if (!ids.length) return NextResponse.json({ properties: [], recommendations: [], audit: [], reports: [], inputs: [] });
    const [recommendations, audit, reports, inputs] = await Promise.all([
      auth.supabase.from("revenue_recommendations").select("id,property_id,room_id,stay_date,current_rate,recommended_rate,occupancy_forecast,estimated_revenue_impact,reason,status,created_at,rooms(name)").in("property_id", ids).order("stay_date").limit(500),
      auth.supabase.from("revenue_audit_log").select("id,property_id,action,details,created_at").in("property_id", ids).order("created_at", { ascending: false }).limit(100),
      auth.supabase.from("revenue_daily_reports").select("*").in("property_id", ids).order("report_date", { ascending: false }).limit(30),
      auth.supabase.from("revenue_daily_inputs").select("property_id,stay_date,rooms_available,rooms_sold,current_rate").in("property_id", ids).order("stay_date").limit(500)
    ]);
    if (recommendations.error || audit.error || reports.error || inputs.error) throw recommendations.error || audit.error || reports.error || inputs.error;
    return NextResponse.json({ properties, recommendations: recommendations.data, audit: audit.data, reports: reports.data, inputs: inputs.data });
  } catch {
    return NextResponse.json({ error: "Revenue AI data is not configured." }, { status: 503 });
  }
}
