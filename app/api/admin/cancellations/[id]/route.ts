import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: cancellation, error } = await admin
      .from("booking_cancellation_requests")
      .select("id,status,booking_id,bookings(id,total,status,stripe_payment_intent_id)")
      .eq("id", id).single();
    if (error || !cancellation) return NextResponse.json({ error: "Cancellation request not found." }, { status: 404 });
    if (cancellation.status !== "pending") return NextResponse.json({ error: "This request was already reviewed." }, { status: 409 });

    if (parsed.data.decision === "reject") {
      const { error: updateError } = await admin.from("booking_cancellation_requests").update({
        status: "rejected",
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", id).eq("status", "pending");
      if (updateError) throw updateError;
      return NextResponse.json({ message: "Cancellation request rejected. The booking remains confirmed." });
    }

    const booking = cancellation.bookings as unknown as {
      id: string;
      total: number | string;
      status: string;
      stripe_payment_intent_id: string | null;
    };
    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: "No Stripe payment is attached to this booking." }, { status: 409 });
    }
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    if (intent.livemode) {
      return NextResponse.json({ error: "Live refunds are disabled during the private pilot." }, { status: 403 });
    }
    if (intent.status !== "succeeded") {
      return NextResponse.json({ error: "The Stripe payment is not eligible for refund." }, { status: 409 });
    }

    const { data: financial } = await admin
      .from("booking_financials")
      .select("id,stripe_transfer_id,stripe_transfer_status")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (financial?.stripe_transfer_id && financial.stripe_transfer_status === "paid") {
      await stripe.transfers.createReversal(
        financial.stripe_transfer_id,
        {},
        { idempotencyKey: `booking-transfer-reversal-${booking.id}` }
      );
      await admin.from("booking_financials").update({
        stripe_transfer_status: "reversed",
        stripe_reversed_at: new Date().toISOString()
      }).eq("id", financial.id);
    }

    const refund = await stripe.refunds.create(
      { payment_intent: intent.id },
      { idempotencyKey: `booking-cancellation-${id}` }
    );
    const refundAmount = refund.amount / 100;
    const { data: refundedBooking, error: finalizeError } = await admin.rpc(
      "finalize_test_booking_refund",
      {
        p_request_id: id,
        p_refund_id: refund.id,
        p_refund_amount: refundAmount
      }
    );
    if (finalizeError) throw finalizeError;
    return NextResponse.json({
      data: refundedBooking,
      message: "Test refund completed, partner transfer reversed, inventory restored, and finance voided."
    });
  } catch (error) {
    console.error("Cancellation and refund failed", error);
    return NextResponse.json({ error: "The cancellation decision could not be completed." }, { status: 503 });
  }
}
