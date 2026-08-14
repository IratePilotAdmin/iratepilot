export function evaluateCommercialSandboxPreflight(env) {
  const checks = [
    ["pilot_mode", env.PILOT_MODE === "true", "PILOT_MODE must remain true"],
    ["public_booking_off", env.NEXT_PUBLIC_PUBLIC_BOOKING !== "true", "Public booking must remain disabled"],
    ["live_payments_off", env.ENABLE_LIVE_BOOKING_PAYMENTS !== "true", "Live booking payments must remain disabled"],
    ["live_payouts_off", env.ENABLE_LIVE_PARTNER_PAYOUTS !== "true", "Live partner payouts must remain disabled"],
    ["live_webhooks_off", env.ENABLE_LIVE_STRIPE_WEBHOOKS !== "true", "Live Stripe webhooks must remain disabled"],
    ["stripe_test_secret", env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true, "A Stripe test secret is required"],
    ["stripe_test_publishable", env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true, "A Stripe test publishable key is required"],
    ["stripe_webhook_secret", Boolean(env.STRIPE_WEBHOOK_SECRET), "A Stripe test webhook secret is required"],
    ["resend_webhook_secret", Boolean(env.RESEND_WEBHOOK_SECRET), "A Resend webhook signing secret is required"],
    ["database", Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), "Sandbox database configuration is required"],
  ].map(([id, passed, detail]) => ({ id, passed, detail }));
  return {
    ready: checks.every((check) => check.passed),
    networkRequestsMade: 0,
    synxisTraffic: "disabled",
    liveTransactions: "disabled",
    checks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = evaluateCommercialSandboxPreflight(process.env);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready ? 0 : 1;
}
import { pathToFileURL } from "node:url";
