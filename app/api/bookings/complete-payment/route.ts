import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import {
  completePaidTestBooking,
  getBookingFinalizationRefundKey,
  isCompletableBookingIntent,
  PaidBookingFinalizationError,
} from "@/lib/bookings/complete-paid-test-booking";

const requestSchema = z.object({
  paymentIntentId: z.string().startsWith("pi_")
});

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Test booking completion is disabled." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid payment reference is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let paidIntentId: string | null = null;
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
    if (!isCompletableBookingIntent(intent, user.id)) {
      return NextResponse.json({ error: "The test payment has not been verified." }, { status: 409 });
    }
    paidIntentId = intent.id;
    const { booking } = await completePaidTestBooking(intent);

    return NextResponse.json({
      data: booking,
      message: "Test payment verified and booking confirmed."
    });
  } catch (error) {
    console.error("Paid booking completion failed", error);
    if (paidIntentId && error instanceof PaidBookingFinalizationError) {
      try {
        const refund = await getStripe().refunds.create(
          { payment_intent: paidIntentId },
          { idempotencyKey: getBookingFinalizationRefundKey(paidIntentId) },
        );
        return NextResponse.json({
          error: "The room became unavailable before confirmation. Your test payment was automatically refunded.",
          refund: { id: refund.id, status: refund.status },
        }, { status: 409 });
      } catch (refundError) {
        console.error("Automatic booking refund failed", refundError);
        return NextResponse.json({
          error: "The booking could not be finalized and the automatic refund could not be confirmed. Contact support with your payment reference.",
        }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "Payment succeeded, but the booking could not be finalized." }, { status: 503 });
  }
}
