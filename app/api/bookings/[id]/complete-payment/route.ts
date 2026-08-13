import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import {
  ApprovedBookingPaymentFinalizationError,
  completeApprovedBookingPayment,
  isApprovedBookingPaymentIntent,
} from "@/lib/bookings/complete-approved-booking-test-payment";
import { refundUnfinalizedBookingPayment } from "@/lib/bookings/complete-paid-test-booking";
import { createClient } from "@/lib/supabase/server";
import { queueBookingNotification } from "@/lib/email/booking-notifications";
import { getApprovedBookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

const requestSchema = z.object({ paymentIntentId: z.string().startsWith("pi_") });
const bookingIdSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const paymentMode = getApprovedBookingPaymentMode();
  if (!paymentMode) return NextResponse.json({ error: "Approved-reservation payments are disabled." }, { status: 503 });
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
    if (!isApprovedBookingPaymentIntent(intent, user.id, paymentMode) || intent.metadata.bookingId !== id) {
      return NextResponse.json({ error: "The payment has not been verified for this reservation." }, { status: 409 });
    }
    paidIntentId = intent.id;
    const booking = await completeApprovedBookingPayment(intent);
    await queueBookingNotification({ event: "payment_confirmed", bookingId: booking.id, confirmationCode: booking.confirmation_code, customerId: user.id, recipientEmail: user.email, paymentMode });
    return NextResponse.json({ data: booking, message: `${paymentMode === "test" ? "Test p" : "P"}ayment verified for the approved reservation.` });
  } catch (error) {
    console.error("Approved reservation payment completion failed", error);
    if (paidIntentId && error instanceof ApprovedBookingPaymentFinalizationError) {
      try {
        const refund = await refundUnfinalizedBookingPayment(paidIntentId);
        return NextResponse.json({
          error: "The approved reservation could not record the payment. It was automatically refunded.",
          refund: { id: refund.id, status: refund.status },
        }, { status: 409 });
      } catch (refundError) {
        console.error("Approved reservation automatic refund failed", refundError);
      }
    }
    return NextResponse.json({ error: "Payment succeeded, but the approved reservation could not be updated." }, { status: 503 });
  }
}
