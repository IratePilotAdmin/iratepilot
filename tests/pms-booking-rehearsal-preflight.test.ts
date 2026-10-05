import { describe, expect, it } from "vitest";
import {
  evaluatePmsBookingRehearsalPreflight,
  REHEARSAL_SUPABASE_URL,
// @ts-expect-error -- The preflight is an executable .mjs module without a declaration file.
} from "../scripts/pms-booking-rehearsal-preflight.mjs";

const rehearsalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: REHEARSAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sandbox-public-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "sandbox-server-placeholder",
  PILOT_MODE: "true",
  ENABLE_TEST_CHECKOUT: "true",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_PARTNER_PAYOUTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
};

describe("PMS booking rehearsal preflight", () => {
  it("accepts only an isolated test configuration without making network requests", () => {
    expect(evaluatePmsBookingRehearsalPreflight(rehearsalEnv)).toMatchObject({ ready: true, networkRequestsMade: 0 });
  });

  it.each([
    ["wrong database", { NEXT_PUBLIC_SUPABASE_URL: "https://eiqmdldjnedqgbtoozqa.supabase.co" }, "isolated_database"],
    ["missing server key", { SUPABASE_SERVICE_ROLE_KEY: "" }, "server_database_key"],
    ["missing public key", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }, "public_database_key"],
    ["live Stripe key", { STRIPE_SECRET_KEY: "sk_live_placeholder" }, "stripe_test_secret"],
    ["live publishable key", { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder" }, "stripe_test_publishable"],
    ["checkout disabled", { ENABLE_TEST_CHECKOUT: "false" }, "test_checkout_enabled"],
    ["public booking on", { NEXT_PUBLIC_PUBLIC_BOOKING: "true" }, "public_booking_off"],
    ["live payments on", { ENABLE_LIVE_BOOKING_PAYMENTS: "true" }, "live_payments_off"],
  ])("rejects %s", (_name, override, failedCheck) => {
    const result = evaluatePmsBookingRehearsalPreflight({ ...rehearsalEnv, ...override });
    expect(result.ready).toBe(false);
    expect(result.checks.find((check: { id: string }) => check.id === failedCheck)?.passed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("placeholder");
  });
});
