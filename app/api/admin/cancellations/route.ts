import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase
      .from("booking_cancellation_requests")
      .select("id,reason,status,refund_amount,stripe_refund_id,created_at,bookings(id,confirmation_code,check_in,check_out,total,status,properties(name),rooms(name),profiles(full_name))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Cancellation review is not configured." }, { status: 503 });
  }
}
