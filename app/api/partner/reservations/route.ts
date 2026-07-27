import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner } = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
    if (!partner && auth.profile.role !== "admin") return NextResponse.json({ data: [] });
    let propertyQuery = auth.supabase.from("properties").select("id");
    if (partner) propertyQuery = propertyQuery.eq("partner_id", partner.id);
    const { data: properties, error: propertyError } = await propertyQuery;
    if (propertyError) throw propertyError;
    const ids = (properties || []).map((property) => property.id);
    if (!ids.length) return NextResponse.json({ data: [] });
    const { data, error } = await auth.supabase.from("bookings")
      .select("id,confirmation_code,check_in,check_out,guests,subtotal,fees,total,status,created_at,properties(name),rooms(name),profiles(full_name)")
      .in("property_id", ids).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Partner reservations are not configured." }, { status: 503 });
  }
}
