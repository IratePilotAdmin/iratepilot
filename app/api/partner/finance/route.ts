import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner } = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
    if (!partner) return NextResponse.json({ financials: [], payouts: [] });
    const [financials, payouts] = await Promise.all([
      auth.supabase.from("booking_financials").select("id,gross_room_revenue,partner_commission,partner_net,status,created_at,bookings(confirmation_code,check_in,check_out)").eq("partner_id", partner.id).order("created_at", { ascending: false }),
      auth.supabase.from("partner_payouts").select("id,period_start,period_end,amount,status,created_at").eq("partner_id", partner.id).order("created_at", { ascending: false })
    ]);
    if (financials.error || payouts.error) throw financials.error || payouts.error;
    return NextResponse.json({ financials: financials.data, payouts: payouts.data });
  } catch {
    return NextResponse.json({ error: "Partner finance records are not configured." }, { status: 503 });
  }
}
