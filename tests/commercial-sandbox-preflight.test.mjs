import { describe, expect, it } from "vitest";
import { evaluateCommercialSandboxPreflight, OTA_PRODUCTION_SUPABASE_PROJECT_REF } from "../scripts/commercial-sandbox-preflight.mjs";

const safeSandbox = {
  PILOT_MODE: "true",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_PARTNER_PAYOUTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  RESEND_WEBHOOK_SECRET: "whsec_resend_placeholder",
  NEXT_PUBLIC_SUPABASE_URL: "https://sandbox-project-ref.supabase.co",
  SANDBOX_SUPABASE_PROJECT_REF: "sandbox-project-ref",
  SANDBOX_SUPABASE_SERVICE_ROLE_KEY: "sandbox-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "sandbox-placeholder",
};

describe("commercial sandbox preflight Supabase target safety", () => {
  it("accepts only an explicit project ref matching a canonical HTTPS Supabase host", () => {
    const result = evaluateCommercialSandboxPreflight(safeSandbox);
    expect(result).toMatchObject({ ready: true, networkRequestsMade: 0, synxisTraffic: "disabled", liveTransactions: "disabled" });
  });

  it("rejects missing and mismatched sandbox project references", () => {
    for (const env of [
      { ...safeSandbox, SANDBOX_SUPABASE_PROJECT_REF: undefined },
      { ...safeSandbox, SANDBOX_SUPABASE_PROJECT_REF: "another-project-ref" },
      { ...safeSandbox, NEXT_PUBLIC_SUPABASE_URL: "https://sandbox-project-ref.supabase.co.evil.example" },
      { ...safeSandbox, NEXT_PUBLIC_SUPABASE_URL: "http://sandbox-project-ref.supabase.co" },
    ]) {
      const result = evaluateCommercialSandboxPreflight(env);
      expect(result.ready).toBe(false);
      expect(result.checks.find((check) => check.id === "sandbox_database")?.passed).toBe(false);
    }
  });

  it("rejects the OTA production project even when its URL and configured sandbox ref match", () => {
    const result = evaluateCommercialSandboxPreflight({
      ...safeSandbox,
      NEXT_PUBLIC_SUPABASE_URL: `https://${OTA_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SANDBOX_SUPABASE_PROJECT_REF: OTA_PRODUCTION_SUPABASE_PROJECT_REF,
    });
    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.id === "sandbox_database")?.passed).toBe(false);
  });

  it("rejects an additional explicitly configured production project", () => {
    const result = evaluateCommercialSandboxPreflight({
      ...safeSandbox,
      PRODUCTION_SUPABASE_PROJECT_REF: "sandbox-project-ref",
    });
    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.id === "sandbox_database")?.passed).toBe(false);
  });

  it("requires an explicitly sandbox-scoped service key to match the runtime app key", () => {
    for (const env of [
      { ...safeSandbox, SANDBOX_SUPABASE_SERVICE_ROLE_KEY: undefined },
      { ...safeSandbox, SANDBOX_SUPABASE_SERVICE_ROLE_KEY: "production-key" },
      { ...safeSandbox, SUPABASE_SERVICE_ROLE_KEY: "production-key" },
    ]) {
      const result = evaluateCommercialSandboxPreflight(env);
      expect(result.ready).toBe(false);
      expect(result.checks.find((check) => check.id === "sandbox_database")?.passed).toBe(false);
    }
  });

  it("rejects non-Stripe or live webhook credentials in the sandbox gates", () => {
    for (const env of [
      { ...safeSandbox, STRIPE_WEBHOOK_SECRET: "sk_live_placeholder" },
      { ...safeSandbox, STRIPE_SECRET_KEY: "sk_live_placeholder" },
      { ...safeSandbox, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder" },
    ]) {
      const result = evaluateCommercialSandboxPreflight(env);
      expect(result.ready).toBe(false);
    }
  });
});
