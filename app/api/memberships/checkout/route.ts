import { NextResponse } from "next/server";
import { z } from "zod";
import { memberships } from "@/config/memberships";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getStripeIdempotencyContext } from "@/lib/stripe-idempotency";
import { getMembershipStripePriceId, isExpectedMembershipStripePrice } from "@/lib/stripe/membership-subscription-pricing";

const schema = z.object({ plan: z.enum(["basic", "business"]) });

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Membership test checkout is disabled." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid membership plan." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("membership_status,stripe_customer_id,stripe_subscription_id")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    if (profile.membership_status === "active" && profile.stripe_subscription_id) {
      return NextResponse.json({ error: "Manage your active membership through the test billing portal." }, { status: 409 });
    }
    const priceId = getMembershipStripePriceId(parsed.data.plan);
    if (!priceId?.startsWith("price_")) return NextResponse.json({ error: "The selected Stripe test price is not configured." }, { status: 503 });
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (!isExpectedMembershipStripePrice(price, parsed.data.plan)) {
      return NextResponse.json({ error: `Stripe must use an active $${memberships[parsed.data.plan].annualPrice}/year USD recurring price for this plan.` }, { status: 503 });
    }
    const idempotency = getStripeIdempotencyContext(request, "membership", user.id);
    if (!idempotency) return NextResponse.json({ error: "A valid checkout attempt ID is required." }, { status: 400 });
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(profile.stripe_customer_id?.startsWith("cus_")
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/account/rewards?membership=success`,
      cancel_url: `${base}/account/rewards?membership=cancelled`,
      metadata: { userId: user.id, plan: parsed.data.plan, mode: "pilot_test" },
      subscription_data: { metadata: { userId: user.id, plan: parsed.data.plan, mode: "pilot_test" } }
    }, { idempotencyKey: idempotency.idempotencyKey });
    return NextResponse.json({ url: session.url, plan: memberships[parsed.data.plan] });
  } catch {
    return NextResponse.json({ error: "Membership checkout could not be created." }, { status: 503 });
  }
}
