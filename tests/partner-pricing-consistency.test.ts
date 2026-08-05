import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerEnterprisePlan, partnerPlans } from "../config/partner-plans";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const partner = readFileSync(new URL("../app/partner/page.tsx", import.meta.url), "utf8");
const revenueMarketing = readFileSync(new URL("../components/partner/revenue-ai-marketing.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/partner/partner-subscription-center.tsx", import.meta.url), "utf8");

describe("partner pricing consistency", () => {
  it("keeps public and authenticated plan cards on the Stripe-validated source", () => {
    expect(home).not.toContain('import { partnerPlans, type PartnerPlan } from "@/config/partner-plans"');
    expect(revenueMarketing).toContain('import { partnerPlans, type PartnerPlan } from "@/config/partner-plans"');
    expect(partner).toContain("partnerEnterprisePlan, partnerPlans");
    expect(settings).toContain("partnerEnterprisePlan, partnerPlans");
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
  });

  it("states the test/live billing boundary on partner-facing pages", () => {
    expect(home).not.toContain("Private-pilot subscriptions use Stripe test mode.");
    expect(revenueMarketing).toContain("Private-pilot subscriptions use Stripe test mode.");
    expect(partner).toContain("live billing and commercial activation still require");
  });
});
