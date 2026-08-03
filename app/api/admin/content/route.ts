import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildContentQuality, type ContentQualityProperty } from "@/lib/admin/content-quality";

const PROPERTY_LIMIT = 500;

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error, count } = await auth.supabase.from("properties")
      .select("id,name,slug,type,star_rating,description,image_url,amenities,city,country,active,partners(business_name,status),rooms(active,inventory(stay_date,available_units))", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(PROPERTY_LIMIT);
    if (error) throw error;
    return NextResponse.json({
      ...buildContentQuality((data || []) as unknown as ContentQualityProperty[]),
      truncated: Number(count || 0) > PROPERTY_LIMIT,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin content quality failed", error);
    return NextResponse.json({ error: "Marketplace content quality could not be loaded." }, { status: 503 });
  }
}
