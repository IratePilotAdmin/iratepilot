import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerPlans } from "../config/partner-plans";

const route = readFileSync(
  new URL("../app/api/partner/subscription/checkout/route.ts", import.meta.url),
  "utf8",
);

describe("partner subscription pricing", () => {
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
    expect(route).toContain("partnerPlans[parsed.data.plan].monthlyPrice * 100");
    expect(route).toContain("!price.active");
    expect(route).toContain('price.currency !== "usd"');
    expect(route).toContain('price.recurring?.interval !== "month"');
  });

  it("checks partner authorization before calling Stripe", () => {
    expect(route.indexOf('requireRole(["partner", "admin"])'))
      .toBeLessThan(route.indexOf("stripe.prices.retrieve(priceId)"));
  });
});
