import type Stripe from "stripe";
import { memberships, type MembershipTier } from "../../config/memberships";

const membershipTiers = ["basic", "business"] as const satisfies readonly MembershipTier[];

export function getMembershipStripePriceId(tier: MembershipTier) {
  const prices = {
    basic: process.env.STRIPE_BASIC_PRICE_ID,
    business: process.env.STRIPE_BUSINESS_PRICE_ID,
  } satisfies Record<MembershipTier, string | undefined>;
  return prices[tier];
}

export function isExpectedMembershipStripePrice(price: Stripe.Price, tier: MembershipTier) {
  return price.active
    && price.id === getMembershipStripePriceId(tier)
    && price.unit_amount === memberships[tier].annualPrice * 100
    && price.currency === "usd"
    && price.recurring?.interval === "year";
}

export function getVerifiedMembershipSubscriptionTier(subscription: Stripe.Subscription): MembershipTier | null {
  if (subscription.items.data.length !== 1) return null;
  const item = subscription.items.data[0];
  if (item.quantity !== 1) return null;
  return membershipTiers.find((tier) => isExpectedMembershipStripePrice(item.price, tier)) ?? null;
}
