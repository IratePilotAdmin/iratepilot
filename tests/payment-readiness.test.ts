import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPaymentReadiness } from "../lib/admin/payment-readiness";
import { hasCurrentLivePaymentAuthorization } from "../lib/stripe/live-payment-authorization";

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
  STRIPE_LIVE_ACCOUNT_ID: "acct_liveexample123",
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
    expect(readiness.productionConfiguration.launchReady).toBe(false);
    expect(readiness.testMode.ready).toBe(false);
    expect(readiness.activePaymentMode).toBe("live");
    expect(readiness.activeWebhookMode).toBe("live");
  });

  it("recognizes staged live credentials without disrupting the active test runtime", () => {
    const readiness = buildPaymentReadiness({
      ...testEnvironment,
      STRIPE_LIVE_SECRET_KEY: "sk_live_staged_do_not_serialize_this_value",
      STRIPE_LIVE_PUBLISHABLE_KEY: "pk_live_staged_example",
      STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_staged_do_not_serialize_this_value",
      STRIPE_LIVE_ACCOUNT_ID: "acct_liveexample123",
    });

    expect(readiness.testMode.ready).toBe(true);
    expect(readiness.activePaymentMode).toBe("test");
    expect(readiness.activeWebhookMode).toBe("test");
    expect(readiness.productionConfiguration.checks.find((item) => item.id === "live_key_pair")?.passed).toBe(true);
    expect(readiness.productionConfiguration.checks.find((item) => item.id === "webhook_secret")?.passed).toBe(true);
    expect(readiness.productionConfiguration.ready).toBe(false);
  });

  it("requires a current, unrevoked approval receipt in addition to live configuration", () => {
    const authorization = {
      id: "approval-1",
      approvalReference: "PAYMENT-APPROVAL-2026-001",
      stripeAccountReference: "acct_example",
      approvedAt: "2026-09-17T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      revokedAt: null,
    };
    const matchingAuthorization = {
      ...authorization,
      stripeAccountReference: productionEnvironment.STRIPE_LIVE_ACCOUNT_ID,
    };
    const readiness = buildPaymentReadiness(productionEnvironment, matchingAuthorization, new Date("2026-09-18T12:00:00.000Z"));
    expect(readiness.productionConfiguration.launchAuthorized).toBe(true);
    expect(readiness.productionConfiguration.launchReady).toBe(true);

    const expired = buildPaymentReadiness(productionEnvironment, matchingAuthorization, new Date("2026-09-20T12:00:00.000Z"));
    expect(expired.productionConfiguration.launchAuthorized).toBe(false);
    expect(expired.productionConfiguration.launchReady).toBe(false);
  });

  it("rejects approval evidence recorded for a different Stripe account", () => {
    const authorization = {
      id: "approval-1",
      approvalReference: "PAYMENT-APPROVAL-2026-001",
      stripeAccountReference: "acct_otheraccount123",
      approvedAt: "2026-09-17T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      revokedAt: null,
    };
    const readiness = buildPaymentReadiness(productionEnvironment, authorization, new Date("2026-09-18T12:00:00.000Z"));
    expect(readiness.productionConfiguration.ready).toBe(true);
    expect(readiness.productionConfiguration.launchAuthorized).toBe(false);
    expect(readiness.productionConfiguration.authorizationDetail).toContain("different Stripe account");
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
    const environment = {
      ...testEnvironment,
      STRIPE_LIVE_SECRET_KEY: "sk_live_staged_do_not_serialize_this_value",
      STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_staged_do_not_serialize_this_value",
    };
    const serialized = JSON.stringify(buildPaymentReadiness(environment));
    expect(serialized).not.toContain(testEnvironment.STRIPE_SECRET_KEY);
    expect(serialized).not.toContain(testEnvironment.STRIPE_WEBHOOK_SECRET);
    expect(serialized).not.toContain(environment.STRIPE_LIVE_SECRET_KEY);
    expect(serialized).not.toContain(environment.STRIPE_LIVE_WEBHOOK_SECRET);
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
    expect(dashboard).toContain("data.productionConfiguration.authorization ?");
    expect(dashboard).not.toContain("data.productionConfiguration.launchAuthorized ?");
    expect(settings).toContain("<PaymentReadiness />");
  });

  it("records only audited approval evidence and never toggles payment runtime flags", () => {
    const route = read("app/api/admin/payment-readiness/route.ts");
    const dashboard = read("components/dashboard/payment-readiness.tsx");
    const migration = read("supabase/migrations/202609180159_hotel_payment_launch_authorization.sql");

    expect(route).toContain('action: z.literal("record")');
    expect(route).toContain('action: z.literal("revoke")');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf('rpc("record_hotel_payment_launch_authorization"'));
    expect(migration).toContain("Hotel payment launch evidence is append-only");
    expect(migration).toContain("A current production payment approval already exists");
    expect(migration).toContain("profiles.role = 'admin'");
    expect(migration).not.toContain("ENABLE_LIVE_BOOKING_PAYMENTS");
    expect(migration).not.toContain("ENABLE_LIVE_PARTNER_PAYOUTS");
    expect(dashboard).toContain("const formElement = event.currentTarget;");
    expect(dashboard).toContain("formElement.reset();");
    expect(dashboard).not.toContain("event.currentTarget.reset();");
  });

  it("fails live PaymentIntent authorization closed unless the database confirms a current receipt", async () => {
    const calls: unknown[] = [];
    const authorized = { rpc: async (...args: unknown[]) => { calls.push(args); return { data: true, error: null }; } };
    const revoked = { rpc: async () => ({ data: false, error: null }) };
    const unavailable = { rpc: async () => ({ data: null, error: new Error("unavailable") }) };

    await expect(hasCurrentLivePaymentAuthorization(authorized, "acct_liveexample123")).resolves.toBe(true);
    expect(calls).toEqual([["has_current_hotel_payment_launch_authorization", {
      p_stripe_account_reference: "acct_liveexample123",
    }]]);
    await expect(hasCurrentLivePaymentAuthorization(revoked, "acct_liveexample123")).resolves.toBe(false);
    await expect(hasCurrentLivePaymentAuthorization(unavailable, "acct_liveexample123")).resolves.toBe(false);
    await expect(hasCurrentLivePaymentAuthorization(authorized, "acct_short")).resolves.toBe(false);

    const paymentIntentRoute = read("app/api/bookings/[id]/payment-intent/route.ts");
    const runtimeMigration = read("supabase/migrations/202609200160_live_payment_authorization_runtime_gate.sql");
    expect(paymentIntentRoute).toContain('paymentMode === "live"');
    expect(paymentIntentRoute.indexOf("hasCurrentLivePaymentAuthorization"))
      .toBeLessThan(paymentIntentRoute.indexOf("paymentIntents.create"));
    expect(runtimeMigration).toContain("grant execute on function public.has_current_hotel_payment_launch_authorization()\n  to service_role");
    expect(runtimeMigration).toContain("approval.expires_at > now()");
    expect(runtimeMigration).toContain("hotel_payment_launch_authorization_revocations");
  });

  it("binds the database runtime gate to the configured Stripe account", () => {
    const accountBindingMigration = read("supabase/migrations/202610050163_bind_hotel_payment_authorization_account.sql");
    const runtimeGate = read("lib/stripe/live-payment-authorization.ts");

    expect(accountBindingMigration).toContain("p_stripe_account_reference text");
    expect(accountBindingMigration).toContain("approval.stripe_account_reference = p_stripe_account_reference");
    expect(accountBindingMigration).toContain("revoke all on function public.has_current_hotel_payment_launch_authorization()");
    expect(accountBindingMigration).toContain("grant execute on function public.has_current_hotel_payment_launch_authorization(text)\n  to service_role");
    expect(runtimeGate).toContain("p_stripe_account_reference: normalizedReference");
    expect(runtimeGate).toContain("STRIPE_LIVE_ACCOUNT_ID");
  });
});
