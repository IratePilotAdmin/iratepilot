import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("booking_financials")
      .select("id,gross_room_revenue,partner_commission,partner_net,status,created_at,partners(business_name),bookings(confirmation_code)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const summary = (data || []).reduce((total, row) => ({
      gross: total.gross + Number(row.gross_room_revenue),
      commission: total.commission + Number(row.partner_commission),
      partnerNet: total.partnerNet + Number(row.partner_net)
    }), { gross: 0, commission: 0, partnerNet: 0 });
    return NextResponse.json({ data, summary });
  } catch {
    return NextResponse.json({ error: "Admin finance reporting is not configured." }, { status: 503 });
  }
}
