import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isLivePartnerPayoutsEnabled, isStripeTestMode, stripeMode } from "@/lib/stripe";

function isAmbiguousStripeTransferError(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type;
  return type === "StripeConnectionError" || type === "StripeAPIError";
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let claimedFinancialId: string | null = null;
  let transferAttempted = false;
  let transferConfirmed = false;
  let wasIndeterminate = false;
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isStripeTestMode() && !isLivePartnerPayoutsEnabled()) {
      return NextResponse.json({ error: "Transfer retry is not enabled for this Stripe environment." }, { status: 403 });
    }

    const mode = stripeMode();
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: financial, error } = await admin
      .from("booking_financials")
      .select("id,booking_id,partner_net,stripe_transfer_id,stripe_transfer_status,bookings(confirmation_code,stripe_payment_intent_id,stripe_payment_mode,status),partners(stripe_connect_account_id,stripe_connect_mode,stripe_connect_payouts_enabled)")
      .eq("id", id)
      .single();
    if (error || !financial) return NextResponse.json({ error: "Finance record not found." }, { status: 404 });
    if (financial.stripe_transfer_id || !["failed", "not_started", "pending"].includes(financial.stripe_transfer_status)) {
      return NextResponse.json({ error: "This transfer cannot be retried." }, { status: 409 });
    }

    wasIndeterminate = financial.stripe_transfer_status === "pending";

    const booking = financial.bookings as unknown as {
      confirmation_code: string;
      stripe_payment_intent_id: string | null;
      stripe_payment_mode: string | null;
      status: string;
    };
    const partner = financial.partners as unknown as {
      stripe_connect_account_id: string | null;
      stripe_connect_mode: string | null;
      stripe_connect_payouts_enabled: boolean;
    };
    const bookingPaymentMode = booking.stripe_payment_mode ?? (isStripeTestMode() ? "test" : null);
    if (booking.status !== "confirmed" || !booking.stripe_payment_intent_id || bookingPaymentMode !== mode) {
      return NextResponse.json({ error: "Only a paid, confirmed booking in the active Stripe environment can fund a transfer." }, { status: 409 });
    }
    if (!partner?.stripe_connect_account_id || partner.stripe_connect_mode !== mode || !partner.stripe_connect_payouts_enabled) {
      return NextResponse.json({ error: "The partner payout account is not ready." }, { status: 409 });
    }

    if (financial.stripe_transfer_status !== "pending") {
      const { data: claim, error: claimError } = await admin.from("booking_financials").update({
        stripe_transfer_status: "pending",
        stripe_transfer_error: null,
        stripe_transferred_at: new Date().toISOString(),
      }).eq("id", financial.id)
        .eq("status", "eligible")
        .is("stripe_transfer_id", null)
        .in("stripe_transfer_status", ["failed", "not_started"])
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claim) return NextResponse.json({ error: "This transfer is already being processed or is no longer eligible." }, { status: 409 });
    }
    claimedFinancialId = financial.id;

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    const sourceTransaction = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (intent.status !== "succeeded" || !sourceTransaction) {
      throw new Error("The Stripe charge is not available for transfer.");
    }

    const amount = Math.round(Number(financial.partner_net) * 100);
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("The partner transfer amount is invalid.");
    const transferGroup = `booking_${financial.booking_id}`;
    const existingTransfers = await stripe.transfers.list({ transfer_group: transferGroup, limit: 100 });
    let transfer: Stripe.Transfer | undefined = existingTransfers.data.find((candidate) => {
      const destination = typeof candidate.destination === "string" ? candidate.destination : candidate.destination?.id;
      return candidate.metadata.booking_id === financial.booking_id
        && destination === partner.stripe_connect_account_id
        && candidate.amount === amount
        && candidate.currency === "usd"
        && !candidate.reversed;
    });
    if (!transfer) {
      transferAttempted = true;
      transfer = await stripe.transfers.create({
        amount,
        currency: "usd",
        destination: partner.stripe_connect_account_id,
        source_transaction: sourceTransaction,
        transfer_group: transferGroup,
        metadata: {
          booking_id: financial.booking_id,
          booking_financial_id: financial.id,
          confirmation_code: booking.confirmation_code,
          environment: mode === "live" ? "production" : "private_pilot"
        }
      }, { idempotencyKey: `booking-transfer-${financial.booking_id}` });
    }
    transferConfirmed = true;

    const { error: updateError } = await admin.from("booking_financials").update({
      stripe_transfer_id: transfer.id,
      stripe_transfer_status: "paid",
      stripe_transfer_error: null,
      stripe_transferred_at: new Date().toISOString(),
      status: "paid"
    }).eq("id", financial.id).eq("stripe_transfer_status", "pending");
    if (updateError) throw updateError;
    claimedFinancialId = null;

    return NextResponse.json({ message: "Partner transfer completed.", transferId: transfer.id });
  } catch (error) {
    if (claimedFinancialId) {
      const admin = createAdminClient();
      const keepPending = wasIndeterminate || transferConfirmed || (transferAttempted && isAmbiguousStripeTransferError(error));
      await admin.from("booking_financials").update({
        stripe_transfer_status: keepPending ? "pending" : "failed",
        stripe_transfer_error: keepPending
          ? "Stripe transfer may exist; persistence reconciliation required."
          : error instanceof Error ? error.message.slice(0, 500) : "Transfer retry failed",
      }).eq("id", claimedFinancialId).eq("stripe_transfer_status", "pending").is("stripe_transfer_id", null);
    }
    console.error("Transfer retry failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transfer retry failed." }, { status: 503 });
  }
}
