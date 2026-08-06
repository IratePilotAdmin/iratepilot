import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stripe = readFileSync(new URL("../lib/stripe.ts", import.meta.url), "utf8");
const statusRoute = readFileSync(new URL("../app/api/partner/connect/route.ts", import.meta.url), "utf8");
const onboardingRoute = readFileSync(new URL("../app/api/partner/connect/onboarding/route.ts", import.meta.url), "utf8");
const dashboardRoute = readFileSync(new URL("../app/api/partner/connect/dashboard/route.ts", import.meta.url), "utf8");
const approvedPayment = readFileSync(new URL("../lib/bookings/complete-approved-booking-test-payment.ts", import.meta.url), "utf8");
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

  it("never lets test mode replace an existing live Connect account", () => {
    expect(onboardingRoute).toContain('partner.stripe_connect_mode === "live" && mode === "test"');
    expect(onboardingRoute).toContain("Test-mode onboarding cannot replace it.");
    expect(onboardingRoute.indexOf('partner.stripe_connect_mode === "live" && mode === "test"'))
      .toBeLessThan(onboardingRoute.indexOf("stripe.accounts.create"));
  });

  it("creates live transfers only behind the live gate and for live payout-ready accounts", () => {
    expect(approvedPayment).toContain("isLivePartnerPayoutsEnabled()");
    expect(approvedPayment).toContain('partner.stripe_connect_mode !== "live"');
    expect(approvedPayment).toContain("partner.stripe_connect_payouts_enabled");
    expect(approvedPayment).toContain("getStripe().transfers.create");
    expect(approvedPayment).toContain('idempotencyKey: `booking-transfer-${booking.id}`');
    expect(approvedPayment).toContain('if (paymentMode === "live") await createLivePartnerTransfer');
  });

  it("records transfer failures without reversing a completed customer booking", () => {
    expect(approvedPayment).toContain('console.error("Stripe live partner transfer failed"');
    expect(approvedPayment).toContain('stripe_transfer_status: "failed"');
    expect(approvedPayment.indexOf("await createLivePartnerTransfer(booking, intent)"))
      .toBeGreaterThan(approvedPayment.indexOf("booking = data as Booking"));
  });

  it("tracks account environment and blocks unsafe rollback after live onboarding", () => {
    expect(migration).toContain("stripe_connect_mode");
    expect(migration).toContain("in ('test', 'live')");
    expect(rollback).toContain("Rollback blocked: live Stripe Connect accounts are recorded.");
  });
});
