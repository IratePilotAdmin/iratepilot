export const OTA_PRODUCTION_SUPABASE_PROJECT_REF = "allliumarkejinplrggl";

function canonicalProjectRef(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
      || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.hostname.endsWith(".supabase.co")) return null;
    return parsed.hostname.slice(0, -".supabase.co".length);
  } catch {
    return null;
  }
}

export function evaluateCommercialSandboxPreflight(env) {
  const sandboxRef = env.SANDBOX_SUPABASE_PROJECT_REF?.trim();
  const urlRef = canonicalProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const blockedRefs = new Set([OTA_PRODUCTION_SUPABASE_PROJECT_REF, env.PRODUCTION_SUPABASE_PROJECT_REF?.trim()].filter(Boolean));
  const sandboxDatabaseMatches = Boolean(sandboxRef && urlRef && urlRef === sandboxRef
    && !blockedRefs.has(sandboxRef) && !blockedRefs.has(urlRef));
  const checks = [
    ["pilot_mode", env.PILOT_MODE === "true", "PILOT_MODE must remain true"],
    ["public_booking_off", env.NEXT_PUBLIC_PUBLIC_BOOKING !== "true", "Public booking must remain disabled"],
    ["live_payments_off", env.ENABLE_LIVE_BOOKING_PAYMENTS !== "true", "Live booking payments must remain disabled"],
    ["live_payouts_off", env.ENABLE_LIVE_PARTNER_PAYOUTS !== "true", "Live partner payouts must remain disabled"],
    ["live_webhooks_off", env.ENABLE_LIVE_STRIPE_WEBHOOKS !== "true", "Live Stripe webhooks must remain disabled"],
    ["stripe_test_secret", env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true, "STRIPE_SECRET_KEY must be a Stripe test key (sk_test_…)"],
    ["stripe_test_publishable", env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a Stripe test key (pk_test_…)"],
    ["stripe_webhook_secret", env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true, "STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret"],
    ["resend_webhook_secret", Boolean(env.RESEND_WEBHOOK_SECRET), "RESEND_WEBHOOK_SECRET must contain the Resend webhook signing secret"],
    ["sandbox_database", Boolean(env.SANDBOX_SUPABASE_SERVICE_ROLE_KEY
      && env.SANDBOX_SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_SERVICE_ROLE_KEY
      && sandboxDatabaseMatches), "Set SANDBOX_SUPABASE_PROJECT_REF, SANDBOX_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the same non-production Supabase project; the sandbox key must exactly match the configured app key"],
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
