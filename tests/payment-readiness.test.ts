import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPaymentReadiness } from "../lib/admin/payment-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const testEnvironment = {
  PILOT_MODE: "true",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  ENABLE_TEST_CHECKOUT: "true",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  ENABLE_LIVE_PARTNER_PAYOUTS: "false",
  STRIPE_SECRET_KEY: "sk_test_do_not_serialize_this_value",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_do_not_serialize_this_value",
};

const productionEnvironment = {
  PILOT_MODE: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "true",
  NEXT_PUBLIC_ENABLE_TEST_CHECKOUT: "false",
  ENABLE_TEST_CHECKOUT: "false",
  ENABLE_LIVE_BOOKING_PAYMENTS: "true",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "true",
  ENABLE_LIVE_PARTNER_PAYOUTS: "true",
  STRIPE_SECRET_KEY: "sk_live_do_not_serialize_this_value",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_do_not_serialize_this_value",
};

describe("payment readiness audit", () => {
  it("recognizes a fail-closed Stripe test environment", () => {
    const readiness = buildPaymentReadiness(testEnvironment);
    expect(readiness.testMode.ready).toBe(true);
    expect(readiness.productionConfiguration.ready).toBe(false);
    expect(readiness.activePaymentMode).toBe("test");
    expect(readiness.activeWebhookMode).toBe("test");
  });

  it("distinguishes configuration readiness from production authorization", () => {
    const readiness = buildPaymentReadiness(productionEnvironment);
    expect(readiness.productionConfiguration.ready).toBe(true);
    expect(readiness.productionConfiguration.launchAuthorized).toBe(false);
    expect(readiness.testMode.ready).toBe(false);
    expect(readiness.activePaymentMode).toBe("live");
    expect(readiness.activeWebhookMode).toBe("live");
  });

  it("fails both modes closed for conflicting payment flags", () => {
    const readiness = buildPaymentReadiness({
      ...testEnvironment,
      ENABLE_LIVE_BOOKING_PAYMENTS: "true",
    });
    expect(readiness.testMode.ready).toBe(false);
    expect(readiness.productionConfiguration.ready).toBe(false);
    expect(readiness.activePaymentMode).toBeNull();
  });

  it("never returns Stripe secret values", () => {
    const serialized = JSON.stringify(buildPaymentReadiness(testEnvironment));
    expect(serialized).not.toContain(testEnvironment.STRIPE_SECRET_KEY);
    expect(serialized).not.toContain(testEnvironment.STRIPE_WEBHOOK_SECRET);
  });

  it("keeps the readiness endpoint admin-only and exposes a read-only dashboard", () => {
    const route = read("app/api/admin/payment-readiness/route.ts");
    const dashboard = read("components/dashboard/payment-readiness.tsx");
    const settings = read("components/dashboard/admin-settings.tsx");

    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("buildPaymentReadiness(process.env)"));
    expect(route).toContain('"Cache-Control": "no-store, private"');
    expect(dashboard).toContain('fetch("/api/admin/payment-readiness"');
    expect(dashboard).toContain("never creates a PaymentIntent");
    expect(dashboard).toContain("launch remains unauthorized");
    expect(settings).toContain("<PaymentReadiness />");
  });
});
