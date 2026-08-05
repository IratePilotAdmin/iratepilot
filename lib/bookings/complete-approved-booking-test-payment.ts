import type Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";

type Booking = { id: string; confirmation_code: string; stripe_payment_intent_id?: string | null };

export class ApprovedBookingPaymentFinalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovedBookingPaymentFinalizationError";
  }
}

export function isApprovedBookingTestIntent(intent: Stripe.PaymentIntent, expectedUserId?: string) {
  return intent.status === "succeeded"
    && intent.metadata.mode === "approved_booking_test"
    && (!expectedUserId || intent.metadata.userId === expectedUserId)
    && Boolean(intent.metadata.bookingId && intent.metadata.userId && intent.metadata.confirmationCode)
    && intent.amount_received > 0;
}

export async function completeApprovedBookingTestPayment(intent: Stripe.PaymentIntent) {
  if (!isApprovedBookingTestIntent(intent)) throw new Error("The approved-booking payment metadata is incomplete.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_approved_booking_test_payment", {
    p_booking_id: intent.metadata.bookingId,
    p_customer_id: intent.metadata.userId,
    p_payment_intent_id: intent.id,
    p_amount_total_cents: intent.amount_received,
  });

  if (error) {
    const { data: existing, error: existingError } = await admin.from("bookings")
      .select("id,confirmation_code,stripe_payment_intent_id")
      .eq("id", intent.metadata.bookingId)
      .eq("customer_id", intent.metadata.userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.stripe_payment_intent_id === intent.id) return existing as Booking;
    throw new ApprovedBookingPaymentFinalizationError(error.message);
  }
  if (!data) throw new ApprovedBookingPaymentFinalizationError("The paid reservation was not returned.");
  return data as Booking;
}
