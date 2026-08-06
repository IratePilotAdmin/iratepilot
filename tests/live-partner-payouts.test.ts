import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stripe = readFileSync(new URL("../lib/stripe.ts", import.meta.url), "utf8");
const statusRoute = readFileSync(new URL("../app/api/partner/connect/route.ts", import.meta.url), "utf8");
const onboardingRoute = readFileSync(new URL("../app/api/partner/connect/onboarding/route.ts", import.meta.url), "utf8");
const dashboardRoute = readFileSync(new URL("../app/api/partner/connect/dashboard/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202608060029_partner_connect_modes.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../supabase/rollbacks/202608060029_partner_connect_modes.rollback.sql", import.meta.url), "utf8");

describe("live partner payout safeguards", () => {
  it("requires an explicit live-payout gate, live key, and disabled pilot mode", () => {
    expect(stripe).toContain('ENABLE_LIVE_PARTNER_PAYOUTS === "true"');
    expect(stripe).toContain('PILOT_MODE === "false"');
    expect(stripe).toContain('stripeMode() === "live"');
  });

  it("keeps every Connect route behind the shared gate and mode check", () => {
    for (const route of [statusRoute, onboardingRoute, dashboardRoute]) {
      expect(route).toContain("isPartnerConnectEnabled");
      expect(route).toContain("stripeMode");
      expect(route).toContain("stripe_connect_mode");
    }
  });

  it("tracks account environment and blocks unsafe rollback after live onboarding", () => {
    expect(migration).toContain("stripe_connect_mode");
    expect(migration).toContain("in ('test', 'live')");
    expect(rollback).toContain("Rollback blocked: live Stripe Connect accounts are recorded.");
  });
});
