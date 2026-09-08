import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerEnterprisePlan, partnerPlans } from "../config/partner-plans";
import { publicPartnerEnterprisePlan, publicPartnerPlans } from "../config/public-partner-plans";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const partner = readFileSync(new URL("../app/partner/page.tsx", import.meta.url), "utf8");
const revenueMarketing = readFileSync(new URL("../components/partner/revenue-ai-marketing.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/partner/partner-subscription-center.tsx", import.meta.url), "utf8");

describe("partner pricing consistency", () => {
  it("uses public offers on marketing pages and preserves the Stripe-validated subscription source", () => {
    expect(home).not.toContain('import { partnerPlans, type PartnerPlan } from "@/config/partner-plans"');
    expect(revenueMarketing).toContain('from "@/config/public-partner-plans"');
    expect(partner).toContain("publicPartnerEnterprisePlan, publicPartnerPlans");
    expect(settings).toContain("partnerEnterprisePlan, partnerPlans");
    expect(settings).not.toContain("public-partner-plans");
    expect(home).not.toContain("plan.monthlyPrice");
    expect(revenueMarketing).toContain("plan.monthlyPrice");
    expect(partner).toContain("plan.monthlyPrice");
  });

  it("removes stale public prices and unsupported paid-plan promises", () => {
    expect(home).not.toContain("$299");
    expect(home).not.toContain("$699");
    expect(home).not.toContain("Full AI pricing, competitor monitoring");
    expect(partner).not.toContain("const managementPlans");
  });

  it("defines one featured plan and the manual enterprise price", () => {
    expect(Object.values(partnerPlans).filter((plan) => plan.featured).map((plan) => plan.name)).toEqual(["Professional"]);
    expect(partnerEnterprisePlan.monthlyPriceLabel).toBe("$799+");
    expect(Object.values(publicPartnerPlans).map((plan) => plan.monthlyPrice)).toEqual([79, 399, 599]);
    expect(Object.values(publicPartnerPlans).filter((plan) => plan.featured).map((plan) => plan.name)).toEqual(["Professional"]);
    expect(publicPartnerEnterprisePlan.monthlyPriceLabel).toBe("$999+");
    expect(Object.values(partnerPlans).map((plan) => plan.monthlyPrice)).toEqual([59, 199, 399]);
  });

  it("discloses both public booking fees and their total", () => {
    expect(partner).not.toContain("14%");
    expect(partner.match(/13% distribution commission \+ mandatory 3% iRatePilot Rewards Program fee \(16% total\)/g)).toHaveLength(2);
  });

  it("states the test/live billing boundary on partner-facing pages", () => {
    expect(home).not.toContain("Private-pilot subscriptions use Stripe test mode.");
    expect(revenueMarketing).toContain("Private-pilot subscriptions use Stripe test mode.");
    expect(partner).toContain("live billing and commercial activation still require");
  });
});
