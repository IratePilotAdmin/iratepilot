import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import {
  ApprovedBookingPaymentFinalizationError,
  completeApprovedBookingTestPayment,
  isApprovedBookingTestIntent,
} from "@/lib/bookings/complete-approved-booking-test-payment";
import { refundUnfinalizedTestBooking } from "@/lib/bookings/complete-paid-test-booking";
import { createClient } from "@/lib/supabase/server";
import { queueBookingNotification } from "@/lib/email/booking-notifications";

const requestSchema = z.object({ paymentIntentId: z.string().startsWith("pi_") });
const bookingIdSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Approved-reservation test payments are disabled." }, { status: 503 });
  }
  const { id } = await params;
  if (!bookingIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid payment reference is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let paidIntentId: string | null = null;
  try {
    const intent = await getStripe().paymentIntents.retrieve(parsed.data.paymentIntentId);
    if (!isApprovedBookingTestIntent(intent, user.id) || intent.metadata.bookingId !== id) {
      return NextResponse.json({ error: "The test payment has not been verified for this reservation." }, { status: 409 });
    }
    paidIntentId = intent.id;
    const booking = await completeApprovedBookingTestPayment(intent);
    await queueBookingNotification({ event: "payment_confirmed", bookingId: booking.id, confirmationCode: booking.confirmation_code, customerId: user.id, recipientEmail: user.email });
    return NextResponse.json({ data: booking, message: "Test payment verified for the approved reservation." });
  } catch (error) {
    console.error("Approved reservation payment completion failed", error);
    if (paidIntentId && error instanceof ApprovedBookingPaymentFinalizationError) {
      try {
        const refund = await refundUnfinalizedTestBooking(paidIntentId);
        return NextResponse.json({
          error: "The approved reservation could not record the test payment. It was automatically refunded.",
          refund: { id: refund.id, status: refund.status },
        }, { status: 409 });
      } catch (refundError) {
        console.error("Approved reservation automatic refund failed", refundError);
      }
    }
    return NextResponse.json({ error: "Payment succeeded, but the approved reservation could not be updated." }, { status: 503 });
  }
}
