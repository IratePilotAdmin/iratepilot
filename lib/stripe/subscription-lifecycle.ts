import type Stripe from "stripe";

export type SubscriptionAccessStatus = "inactive" | "active" | "past_due" | "cancelled";

export function getSubscriptionAccessStatus(status: Stripe.Subscription.Status): SubscriptionAccessStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return "inactive";
}

export function getSubscriptionRenewsAt(subscription: Stripe.Subscription) {
  const status = getSubscriptionAccessStatus(subscription.status);
  if (status === "cancelled") return null;

  const periodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  if (!periodEnds.length) return null;
  return new Date(Math.max(...periodEnds) * 1000).toISOString();
}
