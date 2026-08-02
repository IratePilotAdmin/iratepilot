import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberships } from "../config/memberships";
import {
  getVerifiedMembershipSubscriptionTier,
  isExpectedMembershipStripePrice,
} from "../lib/stripe/membership-subscription-pricing";

const route = readFileSync(
  new URL("../app/api/memberships/checkout/route.ts", import.meta.url),
  "utf8",
);

describe("membership subscription pricing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defines the advertised annual membership prices", () => {
    expect(memberships.basic.annualPrice).toBe(70);
    expect(memberships.business.annualPrice).toBe(120);
  });

  it("authenticates before retrieving the configured Stripe price", () => {
    expect(route.indexOf("supabase.auth.getUser()"))
      .toBeLessThan(route.indexOf("stripe.prices.retrieve(priceId)"));
    expect(route).toContain("isExpectedMembershipStripePrice(price, parsed.data.plan)");
  });

  it("derives the tier from one verified annual Stripe subscription item", () => {
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");
    const price = {
      id: "price_business",
      active: true,
      unit_amount: 12_000,
      currency: "usd",
      recurring: { interval: "year" },
    } as Stripe.Price;
    const subscription = {
      items: { data: [{ quantity: 1, price }] },
    } as Stripe.Subscription;

    expect(isExpectedMembershipStripePrice(price, "business")).toBe(true);
    expect(getVerifiedMembershipSubscriptionTier(subscription)).toBe("business");
  });

  it("rejects mismatched prices, quantities, and multi-item subscriptions", () => {
    vi.stubEnv("STRIPE_BASIC_PRICE_ID", "price_basic");
    const price = {
      id: "price_basic",
      active: true,
      unit_amount: 7_000,
      currency: "usd",
      recurring: { interval: "year" },
    } as Stripe.Price;
    const subscription = (data: Array<{ quantity: number; price: Stripe.Price }>) => ({
      items: { data },
    }) as Stripe.Subscription;

    expect(getVerifiedMembershipSubscriptionTier(subscription([{ quantity: 2, price }]))).toBeNull();
    expect(getVerifiedMembershipSubscriptionTier(subscription([{ quantity: 1, price }, { quantity: 1, price }]))).toBeNull();
    expect(isExpectedMembershipStripePrice({ ...price, active: false } as Stripe.Price, "basic")).toBe(false);
  });
});
