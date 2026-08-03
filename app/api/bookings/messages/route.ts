import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

const BOOKING_LIMIT = 200;
const MESSAGE_LIMIT = 1000;

export async function GET() {
  try {
    const auth = await requireRole(["customer"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: bookings, error: bookingError, count: bookingCount } = await auth.supabase.from("bookings")
      .select("id,confirmation_code,status,check_in,check_out,created_at,properties(name)", { count: "exact" })
      .eq("customer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(BOOKING_LIMIT);
    if (bookingError) throw bookingError;
    const bookingIds = (bookings || []).map((booking) => booking.id);
    const { data: messages, error: messageError, count: messageCount } = bookingIds.length
      ? await auth.supabase.from("booking_messages").select("booking_id,body,created_at", { count: "exact" }).in("booking_id", bookingIds).order("created_at", { ascending: false }).limit(MESSAGE_LIMIT)
      : { data: [], error: null, count: 0 };
    if (messageError) throw messageError;
    const latest = new Map<string, { body: string; created_at: string }>();
    for (const message of messages || []) if (!latest.has(message.booking_id)) latest.set(message.booking_id, message);
    return NextResponse.json({
      data: (bookings || []).map((booking) => ({ ...booking, latestMessage: latest.get(booking.id) || null })),
      truncated: Number(bookingCount || 0) > BOOKING_LIMIT || Number(messageCount || 0) > MESSAGE_LIMIT,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer booking message inbox failed", error);
    return NextResponse.json({ error: "Booking conversations could not be loaded." }, { status: 503 });
  }
}
