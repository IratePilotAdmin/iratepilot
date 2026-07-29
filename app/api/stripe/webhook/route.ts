import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

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
  let financialId: string | null = null;
  let objectId: string | null = null;

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      objectId = session.id;
      if (session.metadata?.mode === "pilot_test" && session.metadata.userId && (session.metadata.plan === "basic" || session.metadata.plan === "business")) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const { error } = await admin.from("profiles").update({
          membership_tier: session.metadata.plan,
          membership_status: "active",
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null
        }).eq("id", session.metadata.userId);
        if (error) throw error;
      }
      if (session.metadata?.mode === "partner_subscription_test" && session.metadata.partnerId && (session.metadata.plan === "starter" || session.metadata.plan === "professional" || session.metadata.plan === "premium")) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const { error } = await admin.from("partners").update({
          software_plan: session.metadata.plan,
          subscription_status: "active",
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null
        }).eq("id", session.metadata.partnerId);
        if (error) throw error;
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      objectId = subscription.id;
      if (subscription.metadata?.mode === "pilot_test" && subscription.metadata.userId) {
        const { error } = await admin.from("profiles").update({
          membership_tier: "none", membership_status: "cancelled",
          stripe_subscription_id: null, membership_renews_at: null
        }).eq("id", subscription.metadata.userId);
        if (error) throw error;
      }
      if (subscription.metadata?.mode === "partner_subscription_test" && subscription.metadata.partnerId) {
        const { error } = await admin.from("partners").update({
          software_plan: "none", subscription_status: "cancelled",
          stripe_subscription_id: null, subscription_renews_at: null
        }).eq("id", subscription.metadata.partnerId);
        if (error) throw error;
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

    await admin.from("stripe_financial_events").upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      object_id: objectId,
      booking_financial_id: financialId,
      processing_status: financialId || !event.type.startsWith("transfer.") ? "processed" : "ignored",
      payload: event.data.object
    }, { onConflict: "stripe_event_id", ignoreDuplicates: true });

    return NextResponse.json({ received: true, eventType: event.type, mode: "pilot_test" });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    await admin.from("stripe_financial_events").upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      object_id: objectId,
      booking_financial_id: financialId,
      processing_status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed",
      payload: event.data.object
    }, { onConflict: "stripe_event_id" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
