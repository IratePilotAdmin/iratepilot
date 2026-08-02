import type Stripe from "stripe";
import { partnerPlans, type PartnerPlan } from "../../config/partner-plans";

const partnerPlanKeys = ["starter", "professional", "premium"] as const satisfies readonly PartnerPlan[];

export function getPartnerStripePriceId(plan: PartnerPlan) {
  const prices = {
    starter: process.env.STRIPE_PARTNER_STARTER_PRICE_ID,
    professional: process.env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID,
    premium: process.env.STRIPE_PARTNER_PREMIUM_PRICE_ID,
  } satisfies Record<PartnerPlan, string | undefined>;
  return prices[plan];
}

export function isExpectedPartnerStripePrice(price: Stripe.Price, plan: PartnerPlan) {
  return price.active
    && price.id === getPartnerStripePriceId(plan)
    && price.unit_amount === partnerPlans[plan].monthlyPrice * 100
    && price.currency === "usd"
    && price.recurring?.interval === "month";
}

export function getVerifiedPartnerSubscriptionPlan(subscription: Stripe.Subscription): PartnerPlan | null {
  if (subscription.items.data.length !== 1) return null;
  const item = subscription.items.data[0];
  if (item.quantity !== 1) return null;
  return partnerPlanKeys.find((plan) => isExpectedPartnerStripePrice(item.price, plan)) ?? null;
}
