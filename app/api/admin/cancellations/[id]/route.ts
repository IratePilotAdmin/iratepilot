import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { cancellationClaimTimeoutMs, isCancellationClaimStale } from "@/lib/bookings/cancellation-claims";
import { queueBookingNotification } from "@/lib/email/booking-notifications";

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
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid cancellation request ID." }, { status: 400 });
  }
  let claimedRequestId: string | null = null;
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const admin = createAdminClient();
    const { data: cancellation, error } = await admin
      .from("booking_cancellation_requests")
      .select("id,status,reason,updated_at,booking_id,bookings(id,customer_id,confirmation_code,total,status,stripe_payment_intent_id)")
      .eq("id", id).single();
    if (error || !cancellation) return NextResponse.json({ error: "Cancellation request not found." }, { status: 404 });
    if (cancellation.status !== "pending" && !isCancellationClaimStale(cancellation.status, cancellation.updated_at)) {
      const errorMessage = cancellation.status === "processing"
        ? "This refund is already processing."
        : "This request was already reviewed.";
      return NextResponse.json({ error: errorMessage }, { status: 409 });
    }

    if (parsed.data.decision === "reject") {
      if (cancellation.status !== "pending") {
        return NextResponse.json({ error: "A processing refund cannot be rejected." }, { status: 409 });
      }
      const decisionTime = new Date().toISOString();
      const { data: rejected, error: updateError } = await admin.from("booking_cancellation_requests").update({
        status: "rejected",
        reviewed_by: auth.user.id,
        reviewed_at: decisionTime,
        updated_at: decisionTime
      }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!rejected) return NextResponse.json({ error: "This request is already being reviewed." }, { status: 409 });
      return NextResponse.json({ message: "Cancellation request rejected. The booking remains confirmed." });
    }

    const booking = cancellation.bookings as unknown as {
      id: string;
      total: number | string;
      status: string;
      customer_id: string;
      confirmation_code: string;
      stripe_payment_intent_id: string | null;
    };
    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "Only a confirmed booking can be refunded." }, { status: 409 });
    }
    if (!booking.stripe_payment_intent_id) {
      const { data: cancelledBooking, error: cancellationError } = await admin.rpc(
        "cancel_unpaid_confirmed_booking",
        { p_booking_id: booking.id, p_reason: cancellation.reason }
      );
      if (cancellationError) throw cancellationError;
      await queueBookingNotification({ event: "cancelled", bookingId: booking.id, confirmationCode: booking.confirmation_code, customerId: booking.customer_id });
      return NextResponse.json({
        data: cancelledBooking,
        message: "Unpaid reservation cancelled, inventory restored, and no refund was required."
      });
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    if (intent.livemode) {
      return NextResponse.json({ error: "Live refunds are disabled during the private pilot." }, { status: 403 });
    }
    if (intent.status !== "succeeded") {
      return NextResponse.json({ error: "The Stripe payment is not eligible for refund." }, { status: 409 });
    }

    const { data: financial, error: financialError } = await admin
      .from("booking_financials")
      .select("id,status,stripe_transfer_id,stripe_transfer_status")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (financialError) throw financialError;

    let transferStatus = financial?.stripe_transfer_status;
    if (financial && transferStatus === "paid" && !financial.stripe_transfer_id) {
      return NextResponse.json({ error: "The paid partner transfer reference is missing." }, { status: 409 });
    }
    if (financial?.status === "paid" && transferStatus !== "paid" && transferStatus !== "reversed") {
      return NextResponse.json({ error: "The partner transfer must be reversed before refunding this booking." }, { status: 409 });
    }

    const claimTime = new Date().toISOString();
    const staleBefore = new Date(Date.now() - cancellationClaimTimeoutMs).toISOString();
    const { data: claim, error: claimError } = await admin.from("booking_cancellation_requests").update({
      status: "processing",
      reviewed_by: auth.user.id,
      reviewed_at: null,
      updated_at: claimTime,
    }).eq("id", id)
      .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${staleBefore})`)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return NextResponse.json({ error: "This request is already being reviewed." }, { status: 409 });
    claimedRequestId = id;

    if (financial && transferStatus === "paid") {
      await stripe.transfers.createReversal(
        financial.stripe_transfer_id!,
        {},
        { idempotencyKey: `booking-transfer-reversal-${booking.id}` }
      );
      const { error: reversalUpdateError } = await admin.from("booking_financials").update({
        stripe_transfer_status: "reversed",
        stripe_reversed_at: new Date().toISOString()
      }).eq("id", financial.id);
      if (reversalUpdateError) throw reversalUpdateError;
      transferStatus = "reversed";
    }
    if (financial?.status === "paid" && transferStatus !== "reversed") {
      throw new Error("Partner transfer reversal did not complete");
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
    claimedRequestId = null;
    await queueBookingNotification({ event: "refund_completed", bookingId: booking.id, confirmationCode: booking.confirmation_code, customerId: booking.customer_id });
    return NextResponse.json({
      data: refundedBooking,
      message: "Test refund completed, partner transfer reversed, inventory restored, and finance voided."
    });
  } catch (error) {
    if (claimedRequestId) {
      const releaseAdmin = createAdminClient();
      const { error: releaseError } = await releaseAdmin.from("booking_cancellation_requests").update({
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", claimedRequestId).eq("status", "processing");
      if (releaseError) console.error("Cancellation refund claim release failed", releaseError);
    }
    console.error("Cancellation and refund failed", error);
    return NextResponse.json({ error: "The cancellation decision could not be completed." }, { status: 503 });
  }
}
