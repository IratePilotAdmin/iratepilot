import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { BookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

export type StripeRefundLifecycleStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled";

export type StripeRefundReconciliation = {
  outcome: "ignored" | "awaiting_confirmation" | "succeeded" | "failed";
  bookingId: string | null;
  bookingFinancialId: string | null;
  cancellationRequestId: string | null;
  customerId: string | null;
  confirmationCode: string | null;
  reason?: string;
  booking?: unknown;
};

type AdminClient = ReturnType<typeof createAdminClient>;

export function getStripeRefundPaymentIntentId(refund: Stripe.Refund) {
  if (typeof refund.payment_intent === "string") return refund.payment_intent;
  return refund.payment_intent?.id || null;
}

export function getStripeRefundLifecycleStatus(refund: Stripe.Refund): StripeRefundLifecycleStatus {
  if (
    refund.status === "pending"
    || refund.status === "requires_action"
    || refund.status === "succeeded"
    || refund.status === "failed"
    || refund.status === "canceled"
  ) {
    return refund.status;
  }
  throw new Error(`Unsupported Stripe refund status: ${refund.status || "missing"}`);
}

export function stripeRefundMatchesMode(livemode: boolean, paymentMode: BookingPaymentMode) {
  return livemode === (paymentMode === "live");
}

export async function reconcileStripeBookingRefund(input: {
  admin: AdminClient;
  refund: Stripe.Refund;
  paymentMode: BookingPaymentMode;
  livemode: boolean;
  eventCreatedAt?: string;
}): Promise<StripeRefundReconciliation> {
  const paymentIntentId = getStripeRefundPaymentIntentId(input.refund);
  if (!paymentIntentId) {
    return {
      outcome: "ignored",
      bookingId: null,
      bookingFinancialId: null,
      cancellationRequestId: null,
      customerId: null,
      confirmationCode: null,
      reason: "Refund has no PaymentIntent reference.",
    };
  }

  const { data: booking, error: bookingError } = await input.admin
    .from("bookings")
    .select("id,status,total,customer_id,confirmation_code,stripe_payment_mode")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) {
    return {
      outcome: "ignored",
      bookingId: null,
      bookingFinancialId: null,
      cancellationRequestId: null,
      customerId: null,
      confirmationCode: null,
      reason: "Refund is not linked to an iRatePilot booking.",
    };
  }

  const { data: financial, error: financialError } = await input.admin
    .from("booking_financials")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (financialError) throw financialError;

  if (booking.stripe_payment_mode !== input.paymentMode || !stripeRefundMatchesMode(input.livemode, input.paymentMode)) {
    throw new Error("Stripe refund mode does not match the booking webhook mode.");
  }

  const { data: cancellation, error: cancellationError } = await input.admin
    .from("booking_cancellation_requests")
    .select("id,status,stripe_refund_id,stripe_refund_status")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (cancellationError) throw cancellationError;
  if (!cancellation) {
    return {
      outcome: "ignored",
      bookingId: booking.id,
      bookingFinancialId: financial?.id || null,
      cancellationRequestId: null,
      customerId: booking.customer_id,
      confirmationCode: booking.confirmation_code,
      reason: "Refund is not linked to a cancellation request.",
    };
  }

  const replacesFailedAttempt = cancellation.status === "processing"
    && (cancellation.stripe_refund_status === "failed" || cancellation.stripe_refund_status === "canceled");
  if (cancellation.stripe_refund_id && cancellation.stripe_refund_id !== input.refund.id && !replacesFailedAttempt) {
    return {
      outcome: "ignored",
      bookingId: booking.id,
      bookingFinancialId: financial?.id || null,
      cancellationRequestId: cancellation.id,
      customerId: booking.customer_id,
      confirmationCode: booking.confirmation_code,
      reason: "Refund does not match the cancellation request's active Stripe refund.",
    };
  }
  if (!cancellation.stripe_refund_id && cancellation.status !== "processing") {
    return {
      outcome: "ignored",
      bookingId: booking.id,
      bookingFinancialId: financial?.id || null,
      cancellationRequestId: cancellation.id,
      customerId: booking.customer_id,
      confirmationCode: booking.confirmation_code,
      reason: "Cancellation request has not been claimed for refund processing.",
    };
  }

  const expectedAmount = Math.round(Number(booking.total) * 100);
  if (!Number.isSafeInteger(expectedAmount) || input.refund.amount !== expectedAmount) {
    throw new Error("Stripe refund amount does not match the booking total.");
  }

  const lifecycleStatus = getStripeRefundLifecycleStatus(input.refund);
  const { error: lifecycleError } = await input.admin.rpc("record_booking_refund_lifecycle", {
    p_request_id: cancellation.id,
    p_refund_id: input.refund.id,
    p_refund_amount: input.refund.amount / 100,
    p_refund_status: lifecycleStatus,
    p_failure_reason: input.refund.failure_reason || null,
    p_event_created_at: input.eventCreatedAt || new Date().toISOString(),
  });
  if (lifecycleError) throw lifecycleError;

  const base = {
    bookingId: booking.id,
    bookingFinancialId: financial?.id || null,
    cancellationRequestId: cancellation.id,
    customerId: booking.customer_id,
    confirmationCode: booking.confirmation_code,
  };

  if (lifecycleStatus === "succeeded") {
    const { data: finalizedBooking, error: finalizeError } = await input.admin.rpc("finalize_booking_refund", {
      p_request_id: cancellation.id,
      p_refund_id: input.refund.id,
      p_refund_amount: input.refund.amount / 100,
    });
    if (finalizeError) throw finalizeError;
    return { outcome: "succeeded", ...base, booking: finalizedBooking };
  }
  if (lifecycleStatus === "failed" || lifecycleStatus === "canceled") {
    return { outcome: "failed", ...base, reason: input.refund.failure_reason || `Stripe refund ${lifecycleStatus}.` };
  }
  return { outcome: "awaiting_confirmation", ...base };
}
