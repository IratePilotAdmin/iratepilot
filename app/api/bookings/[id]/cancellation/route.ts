import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a cancellation reason." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
    }
    const { data: booking, error: bookingError } = await supabase.from("bookings")
      .select("id,status,stripe_payment_intent_id")
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    if (booking.status === "confirmed" && !booking.stripe_payment_intent_id) {
      const { data, error } = await supabase.rpc("cancel_unpaid_confirmed_booking", {
        p_booking_id: id,
        p_reason: parsed.data.reason
      });
      if (error) throw error;
      return NextResponse.json({
        data,
        mode: "unpaid_cancellation",
        bookingStatus: "cancelled",
        message: "Unpaid reservation cancelled. No payment was collected, so no refund is required."
      });
    }

    const { data, error } = await supabase.rpc("request_booking_cancellation", {
      p_booking_id: id,
      p_reason: parsed.data.reason
    });
    if (error) throw error;
    return NextResponse.json({
      data,
      mode: "paid_refund_review",
      message: "Cancellation request submitted for review."
    });
  } catch {
    return NextResponse.json({
      error: "This confirmed stay could not be submitted for cancellation."
    }, { status: 409 });
  }
}
