import { NextResponse } from "next/server";
import { buildCustomerPaymentHistory, type CustomerBookingPayment } from "@/lib/account/payment-history";
import { requireRole } from "@/lib/auth/require-role";

const PAYMENT_HISTORY_LIMIT = 200;

export async function GET() {
  try {
    const auth = await requireRole(["customer"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error, count } = await auth.supabase.from("bookings")
      .select("id,confirmation_code,check_in,check_out,subtotal,taxes,fees,total,status,created_at,stripe_payment_intent_id,properties(name),rooms(name),booking_cancellation_requests(status,refund_amount)", { count: "exact" })
      .eq("customer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(PAYMENT_HISTORY_LIMIT);
    if (error) throw error;

    return NextResponse.json({
      ...buildCustomerPaymentHistory((data || []) as CustomerBookingPayment[]),
      truncated: Number(count || 0) > PAYMENT_HISTORY_LIMIT,
      mode: "test",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer payment history failed", error);
    return NextResponse.json({ error: "Payment history could not be loaded." }, { status: 503 });
  }
}
