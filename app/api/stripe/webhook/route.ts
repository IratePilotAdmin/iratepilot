import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  completePaidTestBooking,
  isCompletableBookingIntent,
  PaidBookingFinalizationError,
  refundUnfinalizedTestBooking,
} from "@/lib/bookings/complete-paid-test-booking";
import { getSubscriptionAccessStatus, getSubscriptionRenewsAt } from "@/lib/stripe/subscription-lifecycle";
import { isRetryableStripeWebhookClaim } from "@/lib/stripe/webhook-retry";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook configuration missing." }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  if (process.env.PILOT_MODE !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Only pilot test webhooks are enabled." }, { status: 503 });
  }

  const admin = createAdminClient();
  const eventCreatedAt = new Date(event.created * 1000).toISOString();
  let financialId: string | null = null;
  let objectId: string | null = null;
  let bookingRefund: { id: string; status: string | null } | null = null;

  const { data: claimed, error: claimError } = await admin
    .from("stripe_financial_events")
    .upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      processing_status: "processing",
      payload: event.data.object,
      updated_at: new Date().toISOString()
    }, { onConflict: "stripe_event_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("Stripe webhook event claim failed", claimError);
    return NextResponse.json({ error: "Webhook event ledger unavailable." }, { status: 500 });
  }

  if (!claimed) {
    const { data: existing, error: existingError } = await admin
      .from("stripe_financial_events")
      .select("processing_status,attempt_count,updated_at")
      .eq("stripe_event_id", event.id)
      .single();

    if (existingError) {
      console.error("Stripe webhook duplicate lookup failed", existingError);
      return NextResponse.json({ error: "Webhook event lookup failed." }, { status: 500 });
    }

    if (existing.processing_status === "processed" || existing.processing_status === "ignored") {
      return NextResponse.json({ received: true, duplicate: true, eventType: event.type });
    }

    if (!isRetryableStripeWebhookClaim(existing.processing_status, existing.updated_at)) {
      return NextResponse.json({
        error: "Webhook event is already processing.",
        retry: true,
      }, { status: 409 });
    }

    const retryClaimedAt = new Date().toISOString();
    const { data: retryClaim, error: retryError } = await admin
      .from("stripe_financial_events")
      .update({
        processing_status: "processing",
        attempt_count: existing.attempt_count + 1,
        error_message: null,
        updated_at: retryClaimedAt
      })
      .eq("stripe_event_id", event.id)
      .eq("processing_status", existing.processing_status)
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();

    if (retryError) {
      console.error("Stripe webhook retry claim failed", retryError);
      return NextResponse.json({ error: "Webhook retry could not be claimed." }, { status: 500 });
    }
    if (!retryClaim) {
      return NextResponse.json({
        error: "Webhook retry was claimed by another worker.",
        retry: true,
      }, { status: 409 });
    }
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      objectId = session.id;
      if (session.metadata?.mode === "pilot_test" && session.metadata.userId && (session.metadata.plan === "basic" || session.metadata.plan === "business")) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const { error } = await admin.from("profiles").update({
          membership_tier: session.metadata.plan,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null
        }).eq("id", session.metadata.userId)
          .or(`membership_synced_at.is.null,membership_synced_at.lt.${eventCreatedAt}`);
        if (error) throw error;
      }
      if (session.metadata?.mode === "partner_subscription_test" && session.metadata.partnerId && (session.metadata.plan === "starter" || session.metadata.plan === "professional" || session.metadata.plan === "premium")) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const { error } = await admin.from("partners").update({
          software_plan: session.metadata.plan,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null
        }).eq("id", session.metadata.partnerId)
          .or(`subscription_synced_at.is.null,subscription_synced_at.lt.${eventCreatedAt}`);
        if (error) throw error;
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      objectId = subscription.id;
      const accessStatus = getSubscriptionAccessStatus(subscription.status);
      const renewsAt = getSubscriptionRenewsAt(subscription);
      const subscriptionId = event.type === "customer.subscription.deleted" ? null : subscription.id;
      if (subscription.metadata?.mode === "pilot_test" && subscription.metadata.userId && (subscription.metadata.plan === "basic" || subscription.metadata.plan === "business")) {
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        const update = admin.from("profiles").update({
          membership_tier: subscription.metadata.plan,
          membership_status: accessStatus,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          membership_renews_at: renewsAt,
          membership_synced_at: eventCreatedAt
        }).eq("id", subscription.metadata.userId)
          .or(`membership_synced_at.is.null,membership_synced_at.lt.${eventCreatedAt}`);
        const { error } = event.type === "customer.subscription.deleted"
          ? await update.eq("stripe_subscription_id", subscription.id)
          : await update;
        if (error) throw error;
      }
      if (subscription.metadata?.mode === "partner_subscription_test" && subscription.metadata.partnerId && (subscription.metadata.plan === "starter" || subscription.metadata.plan === "professional" || subscription.metadata.plan === "premium")) {
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        const update = admin.from("partners").update({
          software_plan: subscription.metadata.plan,
          subscription_status: accessStatus,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_renews_at: renewsAt,
          subscription_synced_at: eventCreatedAt
        }).eq("id", subscription.metadata.partnerId)
          .or(`subscription_synced_at.is.null,subscription_synced_at.lt.${eventCreatedAt}`);
        const { error } = event.type === "customer.subscription.deleted"
          ? await update.eq("stripe_subscription_id", subscription.id)
          : await update;
        if (error) throw error;
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      objectId = intent.id;
      if (intent.metadata?.mode === "booking_test") {
        if (!isCompletableBookingIntent(intent)) throw new Error("Stripe test booking metadata is incomplete.");
        try {
          const completion = await completePaidTestBooking(intent);
          financialId = completion.financialId;
        } catch (error) {
          if (!(error instanceof PaidBookingFinalizationError)) throw error;
          const refund = await refundUnfinalizedTestBooking(intent.id);
          bookingRefund = { id: refund.id, status: refund.status };
        }
      }
    }

    if (event.type === "transfer.created" || event.type === "transfer.updated" || event.type === "transfer.reversed") {
      const transfer = event.data.object as Stripe.Transfer;
      objectId = transfer.id;
      const status = transfer.reversed || event.type === "transfer.reversed" ? "reversed" : "paid";
      const timestamp = new Date(event.created * 1000).toISOString();
      const { data: financial, error } = await admin
        .from("booking_financials")
        .update({
          stripe_transfer_status: status,
          stripe_transfer_error: null,
          ...(status === "reversed" ? { stripe_reversed_at: timestamp } : { stripe_transferred_at: timestamp })
        })
        .eq("stripe_transfer_id", transfer.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      financialId = financial?.id || null;
    }

    const processingStatus = financialId || !event.type.startsWith("transfer.") ? "processed" : "ignored";
    const { error: completeError } = await admin
      .from("stripe_financial_events")
      .update({
        object_id: objectId,
        booking_financial_id: financialId,
        processing_status: processingStatus,
        error_message: null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("stripe_event_id", event.id);
    if (completeError) throw completeError;

    return NextResponse.json({
      received: true,
      eventType: event.type,
      mode: "pilot_test",
      ...(bookingRefund ? { bookingRefund } : {}),
    });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    const { error: failureWriteError } = await admin
      .from("stripe_financial_events")
      .update({
        object_id: objectId,
        booking_financial_id: financialId,
        processing_status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed",
        processed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("stripe_event_id", event.id);
    if (failureWriteError) console.error("Stripe webhook failure could not be recorded", failureWriteError);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
