import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRateBackedDeals, type DealInventoryRow } from "@/lib/deals";

const INVENTORY_LIMIT = 1000;

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + 90);
    const admin = createAdminClient();
    const { data, error, count } = await admin.from("inventory")
      .select("stay_date,available_units,rate,rooms!inner(id,name,base_rate,active,properties!inner(slug,name,city,country,image_url,active,star_rating,partners!inner(status)))", { count: "exact" })
      .gte("stay_date", today)
      .lte("stay_date", horizon.toISOString().slice(0, 10))
      .gt("available_units", 0)
      .eq("rooms.active", true)
      .eq("rooms.properties.active", true)
      .eq("rooms.properties.partners.status", "approved")
      .order("stay_date", { ascending: true })
      .limit(INVENTORY_LIMIT);
    if (error) throw error;
    return NextResponse.json({
      data: buildRateBackedDeals((data || []) as unknown as DealInventoryRow[]).slice(0, 24),
      truncated: Number(count || 0) > INVENTORY_LIMIT,
      windowDays: 90,
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (error) {
    console.error("Marketplace deals failed", error);
    return NextResponse.json({ error: "Live deals could not be loaded." }, { status: 503 });
  }
}
