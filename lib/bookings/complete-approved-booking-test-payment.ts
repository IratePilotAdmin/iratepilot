import type Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";
import { getApprovedBookingMetadataMode, type BookingPaymentMode } from "../stripe/booking-payment-mode";

type Booking = { id: string; confirmation_code: string; stripe_payment_intent_id?: string | null; stripe_payment_mode?: string | null };

export class ApprovedBookingPaymentFinalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovedBookingPaymentFinalizationError";
  }
}

export function isApprovedBookingPaymentIntent(
  intent: Stripe.PaymentIntent,
  expectedUserId?: string,
  expectedMode?: BookingPaymentMode,
) {
  const acceptedModes = expectedMode
    ? [getApprovedBookingMetadataMode(expectedMode)]
    : [getApprovedBookingMetadataMode("test"), getApprovedBookingMetadataMode("live")];
  return intent.status === "succeeded"
    && acceptedModes.includes(intent.metadata.mode)
    && (!expectedUserId || intent.metadata.userId === expectedUserId)
    && Boolean(intent.metadata.bookingId && intent.metadata.userId && intent.metadata.confirmationCode)
    && intent.amount_received > 0;
}

export function isApprovedBookingTestIntent(intent: Stripe.PaymentIntent, expectedUserId?: string) {
  return isApprovedBookingPaymentIntent(intent, expectedUserId, "test");
}

export function getApprovedBookingIntentPaymentMode(intent: Stripe.PaymentIntent): BookingPaymentMode | null {
  if (intent.metadata.mode === getApprovedBookingMetadataMode("test")) return "test";
  if (intent.metadata.mode === getApprovedBookingMetadataMode("live")) return "live";
  return null;
}

export async function completeApprovedBookingPayment(intent: Stripe.PaymentIntent) {
  const paymentMode = getApprovedBookingIntentPaymentMode(intent);
  if (!paymentMode || !isApprovedBookingPaymentIntent(intent, undefined, paymentMode)) {
    throw new Error("The approved-booking payment metadata is incomplete.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_approved_booking_payment", {
    p_booking_id: intent.metadata.bookingId,
    p_customer_id: intent.metadata.userId,
    p_payment_intent_id: intent.id,
    p_amount_total_cents: intent.amount_received,
    p_payment_mode: paymentMode,
  });

  if (error) {
    const { data: existing, error: existingError } = await admin.from("bookings")
      .select("id,confirmation_code,stripe_payment_intent_id,stripe_payment_mode")
      .eq("id", intent.metadata.bookingId)
      .eq("customer_id", intent.metadata.userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.stripe_payment_intent_id === intent.id && existing.stripe_payment_mode === paymentMode) return existing as Booking;
    throw new ApprovedBookingPaymentFinalizationError(error.message);
  }
  if (!data) throw new ApprovedBookingPaymentFinalizationError("The paid reservation was not returned.");
  return data as Booking;
}

export function completeApprovedBookingTestPayment(intent: Stripe.PaymentIntent) {
  if (!isApprovedBookingTestIntent(intent)) throw new Error("The approved-booking test payment metadata is incomplete.");
  return completeApprovedBookingPayment(intent);
}
