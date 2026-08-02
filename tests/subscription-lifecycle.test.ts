import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getSubscriptionAccessStatus, getSubscriptionRenewsAt } from "../lib/stripe/subscription-lifecycle";

function subscription(status: Stripe.Subscription.Status, periodEnd = 1_800_000_000) {
  return {
    status,
    items: { data: [{ current_period_end: periodEnd }] },
  } as Stripe.Subscription;
}

describe("Stripe subscription lifecycle", () => {
  it("maps Stripe states to benefit access states", () => {
    expect(getSubscriptionAccessStatus("active")).toBe("active");
    expect(getSubscriptionAccessStatus("trialing")).toBe("active");
    expect(getSubscriptionAccessStatus("past_due")).toBe("past_due");
    expect(getSubscriptionAccessStatus("unpaid")).toBe("past_due");
    expect(getSubscriptionAccessStatus("canceled")).toBe("cancelled");
    expect(getSubscriptionAccessStatus("incomplete_expired")).toBe("cancelled");
    expect(getSubscriptionAccessStatus("incomplete")).toBe("inactive");
    expect(getSubscriptionAccessStatus("paused")).toBe("inactive");
  });

  it("uses subscription-item periods for renewal dates", () => {
    expect(getSubscriptionRenewsAt(subscription("active"))).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(getSubscriptionRenewsAt(subscription("canceled"))).toBeNull();
  });
});
