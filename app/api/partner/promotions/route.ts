import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildRateBackedDeals, type DealInventoryRow } from "@/lib/deals";

const INVENTORY_LIMIT = 1000;

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner, error: partnerError } = await auth.supabase.from("partners").select("id,status").eq("owner_id", auth.user.id).maybeSingle();
    if (partnerError) throw partnerError;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to view rate promotions." }, { status: 403 });
    }
    if (!partner) return NextResponse.json({ data: [], truncated: false });
    const today = new Date().toISOString().slice(0, 10);
    const { data, error, count } = await auth.supabase.from("inventory")
      .select("stay_date,available_units,rate,rooms!inner(id,name,base_rate,active,properties!inner(slug,name,city,country,image_url,active,star_rating,partner_id))", { count: "exact" })
      .gte("stay_date", today)
      .gt("available_units", 0)
      .eq("rooms.properties.partner_id", partner.id)
      .order("stay_date", { ascending: true })
      .limit(INVENTORY_LIMIT);
    if (error) throw error;
    return NextResponse.json({
      data: buildRateBackedDeals((data || []) as unknown as DealInventoryRow[]),
      truncated: Number(count || 0) > INVENTORY_LIMIT,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner rate promotions failed", error);
    return NextResponse.json({ error: "Rate promotions could not be loaded." }, { status: 503 });
  }
}
