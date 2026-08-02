import { NextResponse } from "next/server";
import { z } from "zod";
import { partnerPlans } from "@/config/partner-plans";
import { requireRole } from "@/lib/auth/require-role";
import { getStripe } from "@/lib/stripe";
import { getStripeIdempotencyContext } from "@/lib/stripe-idempotency";

const schema = z.object({ plan: z.enum(["starter", "professional", "premium"]) });

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Partner subscription test checkout is disabled." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid partner plan." }, { status: 400 });
  const prices = { starter: process.env.STRIPE_PARTNER_STARTER_PRICE_ID, professional: process.env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID, premium: process.env.STRIPE_PARTNER_PREMIUM_PRICE_ID };
  const priceId = prices[parsed.data.plan];
  if (!priceId?.startsWith("price_")) return NextResponse.json({ error: "The selected Stripe test price is not configured." }, { status: 503 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner, error: partnerError } = await auth.supabase.from("partners").select("id,status").eq("owner_id", auth.user.id).maybeSingle();
    if (partnerError) throw partnerError;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to start a subscription." }, { status: 403 });
    }
    if (!partner) return NextResponse.json({ error: "Create a partner property record first." }, { status: 409 });
    const idempotency = getStripeIdempotencyContext(request, "partner-subscription", auth.user.id);
    if (!idempotency) return NextResponse.json({ error: "A valid checkout attempt ID is required." }, { status: 400 });
    const stripe = getStripe();
    const expectedAmount = partnerPlans[parsed.data.plan].monthlyPrice * 100;
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.unit_amount !== expectedAmount ||
      price.currency !== "usd" ||
      price.recurring?.interval !== "month"
    ) {
      return NextResponse.json({
        error: `Stripe must use an active $${partnerPlans[parsed.data.plan].monthlyPrice}/month USD recurring price for this plan.`
      }, { status: 503 });
    }
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: auth.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/partner/settings?subscription=success`,
      cancel_url: `${base}/partner/settings?subscription=cancelled`,
      metadata: { userId: auth.user.id, partnerId: partner.id, plan: parsed.data.plan, mode: "partner_subscription_test" },
      subscription_data: { metadata: { userId: auth.user.id, partnerId: partner.id, plan: parsed.data.plan, mode: "partner_subscription_test" } }
    }, { idempotencyKey: idempotency.idempotencyKey });
    return NextResponse.json({ url: session.url, plan: partnerPlans[parsed.data.plan] });
  } catch {
    return NextResponse.json({ error: "Partner checkout could not be created." }, { status: 503 });
  }
}
