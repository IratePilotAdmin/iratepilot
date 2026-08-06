import type Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";
import { getStripe, isLivePartnerPayoutsEnabled } from "../stripe";
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

async function createLivePartnerTransfer(booking: Booking, intent: Stripe.PaymentIntent) {
  if (!isLivePartnerPayoutsEnabled()) return;

  const admin = createAdminClient();
  let transferCreated = false;
  try {
    const { data: financial, error: financialError } = await admin
      .from("booking_financials")
      .select("id,partner_net,stripe_transfer_id,partners(stripe_connect_account_id,stripe_connect_mode,stripe_connect_payouts_enabled)")
      .eq("booking_id", booking.id)
      .single();
    if (financialError) throw financialError;
    if (!financial || financial.stripe_transfer_id) return;

    const partner = financial.partners as unknown as {
      stripe_connect_account_id: string | null;
      stripe_connect_mode: string | null;
      stripe_connect_payouts_enabled: boolean;
    };
    if (!partner?.stripe_connect_account_id || partner.stripe_connect_mode !== "live" || !partner.stripe_connect_payouts_enabled) return;

    const { data: claim, error: claimError } = await admin.from("booking_financials").update({
      stripe_transfer_status: "pending",
      stripe_transfer_error: null,
      stripe_transferred_at: new Date().toISOString(),
    }).eq("id", financial.id)
      .eq("status", "eligible")
      .is("stripe_transfer_id", null)
      .in("stripe_transfer_status", ["not_started", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return;

    const sourceTransaction = typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : intent.latest_charge?.id;
    if (!sourceTransaction) throw new Error("The successful Stripe payment does not have a charge available for transfer.");

    const amount = Math.round(Number(financial.partner_net) * 100);
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("The partner transfer amount is invalid.");

    const transfer = await getStripe().transfers.create({
      amount,
      currency: "usd",
      destination: partner.stripe_connect_account_id,
      source_transaction: sourceTransaction,
      transfer_group: `booking_${booking.id}`,
      metadata: {
        booking_id: booking.id,
        confirmation_code: booking.confirmation_code,
        environment: "production",
      },
    }, { idempotencyKey: `booking-transfer-${booking.id}` });

    transferCreated = true;
    const { error: updateError } = await admin.from("booking_financials").update({
      stripe_transfer_id: transfer.id,
      stripe_transfer_status: "paid",
      stripe_transfer_error: null,
      stripe_transferred_at: new Date().toISOString(),
      status: "paid",
    }).eq("id", financial.id).eq("stripe_transfer_status", "pending");
    if (updateError) throw updateError;
  } catch (transferError) {
    console.error("Stripe live partner transfer failed", transferError);
    const message = transferError instanceof Error ? transferError.message.slice(0, 500) : "Stripe transfer failed";
    await admin.from("booking_financials").update({
      stripe_transfer_status: transferCreated ? "pending" : "failed",
      stripe_transfer_error: transferCreated ? `Stripe transfer created; persistence reconciliation required: ${message}` : message,
    }).eq("booking_id", booking.id).eq("stripe_transfer_status", "pending").is("stripe_transfer_id", null);
  }
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

  let booking: Booking;
  if (error) {
    const { data: existing, error: existingError } = await admin.from("bookings")
      .select("id,confirmation_code,stripe_payment_intent_id,stripe_payment_mode")
      .eq("id", intent.metadata.bookingId)
      .eq("customer_id", intent.metadata.userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.stripe_payment_intent_id !== intent.id || existing.stripe_payment_mode !== paymentMode) {
      throw new ApprovedBookingPaymentFinalizationError(error.message);
    }
    booking = existing as Booking;
  } else {
    if (!data) throw new ApprovedBookingPaymentFinalizationError("The paid reservation was not returned.");
    booking = data as Booking;
  }

  if (paymentMode === "live") await createLivePartnerTransfer(booking, intent);
  return booking;
}

export function completeApprovedBookingTestPayment(intent: Stripe.PaymentIntent) {
  if (!isApprovedBookingTestIntent(intent)) throw new Error("The approved-booking test payment metadata is incomplete.");
  return completeApprovedBookingPayment(intent);
}
