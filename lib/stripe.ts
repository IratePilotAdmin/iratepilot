import Stripe from "stripe";

export function getStripe(explicitSecret?: string) {
  const secret = explicitSecret ?? process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error(
    explicitSecret === undefined
      ? "STRIPE_SECRET_KEY is missing."
      : "A Stripe secret key is missing.",
  );
  return new Stripe(secret);
}

export function stripeMode() {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) return "live" as const;
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return "test" as const;
  return null;
}

export function isStripeTestMode() {
  return stripeMode() === "test";
}

export function isLivePartnerPayoutsEnabled() {
  return process.env.ENABLE_LIVE_PARTNER_PAYOUTS === "true"
    && process.env.PILOT_MODE === "false"
    && stripeMode() === "live";
}

export function isPartnerConnectEnabled() {
  return isStripeTestMode() || isLivePartnerPayoutsEnabled();
}
