import type Stripe from "stripe";
import { getStripe } from "../stripe";
import { createAdminClient } from "../supabase/admin";

type Booking = { id: string; confirmation_code: string };

export function isCompletableBookingIntent(intent: Stripe.PaymentIntent, expectedUserId?: string) {
  const metadata = intent.metadata;
  const guests = Number(metadata.guests);
  return intent.status === "succeeded"
    && metadata.mode === "booking_test"
    && (!expectedUserId || metadata.userId === expectedUserId)
    && Boolean(metadata.userId && metadata.propertyId && metadata.roomId)
    && Boolean(metadata.checkIn && metadata.checkOut && metadata.confirmationCode)
    && Number.isInteger(guests)
    && guests > 0
    && intent.amount_received > 0;
}

export async function completePaidTestBooking(intent: Stripe.PaymentIntent) {
  if (!isCompletableBookingIntent(intent)) throw new Error("The Stripe test booking metadata is incomplete.");

  const metadata = intent.metadata;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_paid_test_booking", {
    p_payment_intent_id: intent.id,
    p_customer_id: metadata.userId,
    p_property_id: metadata.propertyId,
    p_room_id: metadata.roomId,
    p_check_in: metadata.checkIn,
    p_check_out: metadata.checkOut,
    p_guests: Number(metadata.guests),
    p_confirmation_code: metadata.confirmationCode,
    p_amount_total_cents: intent.amount_received
  });
  let booking = data as Booking | null;
  if (error?.code === "23505") {
    const { data: existingBooking, error: existingError } = await admin
      .from("bookings")
      .select("id,confirmation_code")
      .eq("stripe_payment_intent_id", intent.id)
      .maybeSingle();
    if (existingError || !existingBooking) throw error;
    booking = existingBooking;
  } else if (error) {
    throw error;
  }
  if (!booking) throw new Error("The paid booking was not returned.");

  const { data: financial, error: financialError } = await admin
    .from("booking_financials")
    .select("id,partner_net,stripe_transfer_id,partners(stripe_connect_account_id,stripe_connect_payouts_enabled)")
    .eq("booking_id", booking.id)
    .single();
  if (financialError) throw financialError;

  if (financial && !financial.stripe_transfer_id) {
    const partner = financial.partners as unknown as {
      stripe_connect_account_id: string | null;
      stripe_connect_payouts_enabled: boolean;
    };

    if (partner?.stripe_connect_account_id && partner.stripe_connect_payouts_enabled) {
      try {
        const sourceTransaction = typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : intent.latest_charge?.id;
        if (!sourceTransaction) throw new Error("The successful Stripe payment does not have a charge available for transfer.");

        const transfer = await getStripe().transfers.create({
          amount: Math.round(Number(financial.partner_net) * 100),
          currency: "usd",
          destination: partner.stripe_connect_account_id,
          source_transaction: sourceTransaction,
          transfer_group: `booking_${booking.id}`,
          metadata: {
            booking_id: booking.id,
            confirmation_code: booking.confirmation_code,
            environment: "private_pilot"
          }
        }, { idempotencyKey: `booking-transfer-${booking.id}` });

        const { error: updateError } = await admin.from("booking_financials").update({
          stripe_transfer_id: transfer.id,
          stripe_transfer_status: "paid",
          stripe_transfer_error: null,
          stripe_transferred_at: new Date().toISOString(),
          status: "paid"
        }).eq("id", financial.id);
        if (updateError) throw updateError;
      } catch (transferError) {
        console.error("Stripe test transfer failed", transferError);
        await admin.from("booking_financials").update({
          stripe_transfer_status: "failed",
          stripe_transfer_error: transferError instanceof Error
            ? transferError.message.slice(0, 500)
            : "Stripe transfer failed"
        }).eq("id", financial.id);
      }
    }
  }

  return { booking, financialId: financial?.id || null };
}
