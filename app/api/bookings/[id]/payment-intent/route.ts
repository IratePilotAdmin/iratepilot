import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request";
import { getApprovedBookingMetadataMode, getApprovedBookingPaymentMode } from "@/lib/stripe/booking-payment-mode";
import { hasCurrentLivePaymentAuthorization } from "@/lib/stripe/live-payment-authorization";
import { isHotelMarketplaceLaunchAuthorized } from "@/lib/hotels/marketplace-launch-authorization";
import { hasCurrentBookableHotelProperty } from "@/lib/hotels/bookable-hotel-property";

const bookingIdSchema = z.string().uuid();
const reusablePaymentIntentStatuses = new Set(["requires_payment_method", "requires_confirmation", "requires_action"]);

function newestPaymentIntent(intents: Awaited<ReturnType<ReturnType<typeof getStripe>["paymentIntents"]["search"]>>["data"]) {
  return [...intents].sort((left, right) => right.created - left.created)[0] ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const paymentMode = getApprovedBookingPaymentMode();
  if (!paymentMode) return NextResponse.json({ error: "Approved-reservation payments are disabled." }, { status: 503 });
  if (paymentMode === "live" && !await isHotelMarketplaceLaunchAuthorized()) {
    return NextResponse.json(
      { error: "Live payments require every production launch gate to pass." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!bookingIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });

  const supabase = await createRequestClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminClient();
  if (paymentMode === "live" && !await hasCurrentLivePaymentAuthorization(admin)) {
    return NextResponse.json(
      { error: "Live payments require a current production payment approval." },
      { status: 503 },
    );
  }
  const { data: booking, error } = await admin.from("bookings")
    .select("id,customer_id,property_id,confirmation_code,status,total,due_at_property,stripe_payment_intent_id,properties(name),rooms(name)")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The reservation could not be loaded." }, { status: 503 });
  if (!booking) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "Only approved reservations can be paid." }, { status: 409 });
  if (booking.stripe_payment_intent_id) return NextResponse.json({ error: "This reservation has already been paid." }, { status: 409 });
  if (paymentMode === "live" && !await hasCurrentBookableHotelProperty(admin, booking.property_id)) {
    return NextResponse.json({ error: "The hotel is no longer authorized to accept live payment." }, { status: 409 });
  }

  const amountDueNow = Number(booking.total) - Number(booking.due_at_property || 0);
  const amountDueNowCents = Math.round(amountDueNow * 100);
  if (!Number.isSafeInteger(amountDueNowCents) || amountDueNowCents < 50) {
    return NextResponse.json({ error: "The reservation total is invalid." }, { status: 409 });
  }

  const property = booking.properties as unknown as { name?: string } | null;
  const room = booking.rooms as unknown as { name?: string } | null;
  const stripe = getStripe();
  const metadataMode = getApprovedBookingMetadataMode(paymentMode);
  const matchingIntents = await stripe.paymentIntents.search({
    query: `metadata['bookingId']:'${booking.id}'`,
    limit: 100,
  });
  const latestIntent = newestPaymentIntent(matchingIntents.data.filter((candidate) => (
    candidate.metadata.mode === metadataMode
    && candidate.currency === "usd"
    && candidate.amount === amountDueNowCents
  )));
  const reusableIntent = latestIntent
    && latestIntent.client_secret
    && reusablePaymentIntentStatuses.has(latestIntent.status)
    ? latestIntent
    : null;

  let safeRetrySource = latestIntent?.status === "canceled" ? latestIntent : null;
  if (latestIntent?.status === "succeeded") {
    const completedIntent = await stripe.paymentIntents.retrieve(latestIntent.id, {
      expand: ["latest_charge"],
    });
    const latestCharge = typeof completedIntent.latest_charge === "object"
      ? completedIntent.latest_charge
      : null;
    const successfulRefundAmount = latestCharge
      ? (await stripe.refunds.list({ charge: latestCharge.id, limit: 100 })).data
        .filter((refund) => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount, 0)
      : 0;
    if (
      latestCharge?.refunded
      && latestCharge.amount_refunded >= completedIntent.amount
      && successfulRefundAmount >= completedIntent.amount
    ) {
      safeRetrySource = completedIntent;
    } else {
      return NextResponse.json(
        { error: "A previous payment succeeded and reservation finalization is still pending. No new payment was created." },
        { status: 409 },
      );
    }
  } else if (latestIntent && !reusableIntent && !safeRetrySource) {
    return NextResponse.json(
      { error: "A previous payment is still processing. No new payment was created." },
      { status: 409 },
    );
  }

  const intent = reusableIntent ?? await stripe.paymentIntents.create({
    amount: amountDueNowCents,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: {
      mode: metadataMode,
      bookingId: booking.id,
      userId: user.id,
      confirmationCode: booking.confirmation_code,
    },
    description: `${paymentMode === "test" ? "Test payment" : "Payment"} for ${booking.confirmation_code}`,
  }, {
    idempotencyKey: safeRetrySource
      ? `approved-booking-${paymentMode}-payment-${booking.id}-after-${safeRetrySource.id}`
      : `approved-booking-${paymentMode}-payment-${booking.id}`,
  });

  if (!intent.client_secret) return NextResponse.json({ error: "Stripe did not return a checkout secret." }, { status: 503 });
  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentMode,
    breakdown: {
      confirmationCode: booking.confirmation_code,
      propertyName: property?.name || "Property",
      roomName: room?.name || "Room",
      total: Number(booking.total),
      dueAtProperty: Number(booking.due_at_property || 0),
      amountDueNow,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
