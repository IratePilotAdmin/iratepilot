import { NextResponse } from "next/server";
import { buildCustomerAccountOverview, type AccountBooking, type AccountNotification } from "@/lib/account/overview";
import { requireRole } from "@/lib/auth/require-role";

const BOOKING_LIMIT = 200;
const NOTIFICATION_LIMIT = 100;

export async function GET() {
  try {
    const auth = await requireRole(["customer"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [profile, bookings, notifications] = await Promise.all([
      auth.supabase.from("profiles")
        .select("full_name,membership_tier,membership_status,reward_points")
        .eq("id", auth.user.id)
        .single(),
      auth.supabase.from("bookings")
        .select("id,confirmation_code,check_in,check_out,total,status,created_at,properties(name,city,country)", { count: "exact" })
        .eq("customer_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(BOOKING_LIMIT),
      auth.supabase.from("notifications")
        .select("id,title,body,read_at,created_at", { count: "exact" })
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(NOTIFICATION_LIMIT),
    ]);
    const error = profile.error || bookings.error || notifications.error;
    if (error || !profile.data) throw error || new Error("Customer profile not found");

    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      ...buildCustomerAccountOverview(
        profile.data,
        (bookings.data || []) as unknown as AccountBooking[],
        (notifications.data || []) as AccountNotification[],
        today,
      ),
      truncated: Number(bookings.count || 0) > BOOKING_LIMIT || Number(notifications.count || 0) > NOTIFICATION_LIMIT,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer account overview failed", error);
    return NextResponse.json({ error: "Account overview could not be loaded." }, { status: 503 });
  }
}
