import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
      return NextResponse.json({ error: "Transfer retry is restricted to Stripe test mode." }, { status: 403 });
    }

    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: financial, error } = await admin
      .from("booking_financials")
      .select("id,booking_id,partner_net,stripe_transfer_id,stripe_transfer_status,bookings(confirmation_code,stripe_payment_intent_id,status),partners(stripe_connect_account_id,stripe_connect_payouts_enabled)")
      .eq("id", id)
      .single();
    if (error || !financial) return NextResponse.json({ error: "Finance record not found." }, { status: 404 });
    if (financial.stripe_transfer_id || !["failed", "not_started"].includes(financial.stripe_transfer_status)) {
      return NextResponse.json({ error: "This transfer cannot be retried." }, { status: 409 });
    }

    const booking = financial.bookings as unknown as {
      confirmation_code: string;
      stripe_payment_intent_id: string | null;
      status: string;
    };
    const partner = financial.partners as unknown as {
      stripe_connect_account_id: string | null;
      stripe_connect_payouts_enabled: boolean;
    };
    if (booking.status !== "confirmed" || !booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: "Only a paid, confirmed booking can fund a transfer." }, { status: 409 });
    }
    if (!partner?.stripe_connect_account_id || !partner.stripe_connect_payouts_enabled) {
      return NextResponse.json({ error: "The partner payout account is not ready." }, { status: 409 });
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    const sourceTransaction = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (intent.status !== "succeeded" || !sourceTransaction) {
      return NextResponse.json({ error: "The Stripe charge is not available for transfer." }, { status: 409 });
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(financial.partner_net) * 100),
      currency: "usd",
      destination: partner.stripe_connect_account_id,
      source_transaction: sourceTransaction,
      transfer_group: `booking_${financial.booking_id}`,
      metadata: {
        booking_id: financial.booking_id,
        booking_financial_id: financial.id,
        confirmation_code: booking.confirmation_code,
        environment: "private_pilot"
      }
    }, { idempotencyKey: `booking-transfer-${financial.booking_id}` });

    const { error: updateError } = await admin.from("booking_financials").update({
      stripe_transfer_id: transfer.id,
      stripe_transfer_status: "paid",
      stripe_transfer_error: null,
      stripe_transferred_at: new Date().toISOString(),
      status: "paid"
    }).eq("id", financial.id);
    if (updateError) throw updateError;

    return NextResponse.json({ message: "Partner transfer completed.", transferId: transfer.id });
  } catch (error) {
    console.error("Transfer retry failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transfer retry failed." }, { status: 503 });
  }
}
