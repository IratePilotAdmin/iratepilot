import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("bookings")
      .select("id,confirmation_code,check_in,check_out,guests,total,status,cancellation_reason,created_at,properties(name),rooms(name),profiles(full_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Admin bookings are not configured." }, { status: 503 });
  }
}
