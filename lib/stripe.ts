import Stripe from "stripe";

export function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is missing.");
  return new Stripe(secret);
}

export function isStripeTestMode() {
  return process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true;
}
