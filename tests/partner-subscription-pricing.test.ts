import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { partnerPlans } from "../config/partner-plans";
import {
  getVerifiedPartnerSubscriptionPlan,
  isExpectedPartnerStripePrice,
} from "../lib/stripe/partner-subscription-pricing";

const route = readFileSync(
  new URL("../app/api/partner/subscription/checkout/route.ts", import.meta.url),
  "utf8",
);

describe("partner subscription pricing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defines the advertised monthly plan prices", () => {
    expect(partnerPlans.starter.monthlyPrice).toBe(59);
    expect(partnerPlans.professional.monthlyPrice).toBe(199);
    expect(partnerPlans.premium.monthlyPrice).toBe(399);
  });

  it("verifies Stripe price details before creating checkout", () => {
    const retrieve = route.indexOf("stripe.prices.retrieve(priceId)");
    const create = route.indexOf("stripe.checkout.sessions.create");

    expect(retrieve).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(retrieve);
    expect(route).toContain("isExpectedPartnerStripePrice(price, parsed.data.plan)");
  });

  it("checks partner authorization before calling Stripe", () => {
    expect(route.indexOf('requireRole(["partner", "admin"])'))
      .toBeLessThan(route.indexOf("stripe.prices.retrieve(priceId)"));
  });

  it("derives the plan from one verified Stripe subscription item", () => {
    vi.stubEnv("STRIPE_PARTNER_PROFESSIONAL_PRICE_ID", "price_professional");
    const price = {
      id: "price_professional",
      active: true,
      unit_amount: 19_900,
      currency: "usd",
      recurring: { interval: "month" },
    } as Stripe.Price;
    const subscription = {
      items: { data: [{ quantity: 1, price }] },
    } as Stripe.Subscription;

    expect(isExpectedPartnerStripePrice(price, "professional")).toBe(true);
    expect(getVerifiedPartnerSubscriptionPlan(subscription)).toBe("professional");
  });

  it("rejects mismatched prices, quantities, and multi-item subscriptions", () => {
    vi.stubEnv("STRIPE_PARTNER_STARTER_PRICE_ID", "price_starter");
    const price = {
      id: "price_starter",
      active: true,
      unit_amount: 5_900,
      currency: "usd",
      recurring: { interval: "month" },
    } as Stripe.Price;
    const subscription = (data: Array<{ quantity: number; price: Stripe.Price }>) => ({
      items: { data },
    }) as Stripe.Subscription;

    expect(getVerifiedPartnerSubscriptionPlan(subscription([{ quantity: 2, price }]))).toBeNull();
    expect(getVerifiedPartnerSubscriptionPlan(subscription([{ quantity: 1, price }, { quantity: 1, price }]))).toBeNull();
    expect(isExpectedPartnerStripePrice({ ...price, unit_amount: 6_000 } as Stripe.Price, "starter")).toBe(false);
  });
});
