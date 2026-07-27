import { NextResponse } from "next/server";
import { z } from "zod";
import { memberships } from "@/config/memberships";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

const schema = z.object({ plan: z.enum(["basic", "business"]) });

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Membership test checkout is disabled." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid membership plan." }, { status: 400 });
  const priceId = parsed.data.plan === "basic" ? process.env.STRIPE_BASIC_PRICE_ID : process.env.STRIPE_BUSINESS_PRICE_ID;
  if (!priceId?.startsWith("price_")) return NextResponse.json({ error: "The selected Stripe test price is not configured." }, { status: 503 });
  try {
    const expectedAmount = memberships[parsed.data.plan].annualPrice * 100;
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount !== expectedAmount || price.currency !== "usd" || price.recurring?.interval !== "year") {
      return NextResponse.json({ error: `Stripe must use a $${memberships[parsed.data.plan].annualPrice}/year USD recurring price for this plan.` }, { status: 503 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/account/rewards?membership=success`,
      cancel_url: `${base}/account/rewards?membership=cancelled`,
      metadata: { userId: user.id, plan: parsed.data.plan, mode: "pilot_test" },
      subscription_data: { metadata: { userId: user.id, plan: parsed.data.plan, mode: "pilot_test" } }
    });
    return NextResponse.json({ url: session.url, plan: memberships[parsed.data.plan] });
  } catch {
    return NextResponse.json({ error: "Membership checkout could not be created." }, { status: 503 });
  }
}
