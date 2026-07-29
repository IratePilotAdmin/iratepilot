import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
    const metadata = intent.metadata;
    if (intent.status !== "succeeded" || metadata.mode !== "booking_test" || metadata.userId !== user.id) {
      return NextResponse.json({ error: "The test payment has not been verified." }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("complete_paid_test_booking", {
      p_payment_intent_id: intent.id,
      p_customer_id: user.id,
      p_property_id: metadata.propertyId,
      p_room_id: metadata.roomId,
      p_check_in: metadata.checkIn,
      p_check_out: metadata.checkOut,
      p_guests: Number(metadata.guests),
      p_confirmation_code: metadata.confirmationCode,
      p_amount_total_cents: intent.amount_received
    });
    if (error) throw error;

    const booking = data as { id: string; confirmation_code: string };
    const { data: financial } = await admin
      .from("booking_financials")
      .select("id,partner_net,stripe_transfer_id,partners(stripe_connect_account_id,stripe_connect_payouts_enabled)")
      .eq("booking_id", booking.id)
      .single();

    if (financial && !financial.stripe_transfer_id) {
      const partner = financial.partners as unknown as {
        stripe_connect_account_id: string | null;
        stripe_connect_payouts_enabled: boolean;
      };

      if (partner?.stripe_connect_account_id && partner.stripe_connect_payouts_enabled) {
        try {
          const transfer = await stripe.transfers.create(
            {
              amount: Math.round(Number(financial.partner_net) * 100),
              currency: "usd",
              destination: partner.stripe_connect_account_id,
              transfer_group: `booking_${booking.id}`,
              metadata: {
                booking_id: booking.id,
                confirmation_code: booking.confirmation_code,
                environment: "private_pilot"
              }
            },
            { idempotencyKey: `booking-transfer-${booking.id}` }
          );

          await admin.from("booking_financials").update({
            stripe_transfer_id: transfer.id,
            stripe_transfer_status: "paid",
            stripe_transfer_error: null,
            stripe_transferred_at: new Date().toISOString(),
            status: "paid"
          }).eq("id", financial.id);
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

    return NextResponse.json({
      data,
      message: "Test payment verified and booking confirmed."
    });
  } catch (error) {
    console.error("Paid booking completion failed", error);
    return NextResponse.json({ error: "Payment succeeded, but the booking could not be finalized." }, { status: 503 });
  }
}
