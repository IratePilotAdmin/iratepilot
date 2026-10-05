import { pathToFileURL } from "node:url";

// This gate is intentionally pinned to the isolated, disposable PMS rehearsal project.
export const REHEARSAL_SUPABASE_URL = "https://onbdizzwwubfdgkgaphx.supabase.co";
export const REHEARSAL_GIT_BRANCH = "codex/ota-main-integration";

export function evaluatePmsBookingRehearsalPreflight(env) {
  const checks = [
    ["preview_deployment", env.VERCEL_ENV === "preview"],
    ["rehearsal_branch", env.VERCEL_GIT_COMMIT_REF === REHEARSAL_GIT_BRANCH],
    ["isolated_database", env.NEXT_PUBLIC_SUPABASE_URL === REHEARSAL_SUPABASE_URL],
    ["public_database_key", Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ["server_database_key", Boolean(env.SUPABASE_SERVICE_ROLE_KEY)],
    ["pilot_mode", env.PILOT_MODE === "true"],
    ["test_checkout_enabled", env.ENABLE_TEST_CHECKOUT === "true"],
    ["stripe_test_secret", env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true],
    ["stripe_test_publishable", env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true],
    ["stripe_webhook_signing_secret", env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true],
    ["test_webhooks_enabled", env.ENABLE_TEST_STRIPE_WEBHOOKS === "true"],
    ["public_booking_off", env.NEXT_PUBLIC_PUBLIC_BOOKING !== "true"],
    ["live_payments_off", env.ENABLE_LIVE_BOOKING_PAYMENTS !== "true"],
    ["live_payouts_off", env.ENABLE_LIVE_PARTNER_PAYOUTS !== "true"],
    ["live_webhooks_off", env.ENABLE_LIVE_STRIPE_WEBHOOKS !== "true"],
  ].map(([id, passed]) => ({ id, passed }));
  return { ready: checks.every((check) => check.passed), networkRequestsMade: 0, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = evaluatePmsBookingRehearsalPreflight(process.env);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready ? 0 : 1;
}
