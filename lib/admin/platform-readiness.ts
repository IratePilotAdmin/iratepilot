export type ReadinessStatus = "ready" | "attention" | "off";
export type ReadinessItem = {
  id: string;
  category: "core" | "communications" | "payments" | "features";
  label: string;
  status: ReadinessStatus;
  required: boolean;
  detail: string;
};

const present = (value: string | undefined) => Boolean(value?.trim());

export function buildPlatformReadiness(
  env: Record<string, string | undefined>,
  databaseReachable: boolean,
) {
  const appUrlReady = Boolean(env.NEXT_PUBLIC_APP_URL?.startsWith("https://"));
  const supabaseClientReady = present(env.NEXT_PUBLIC_SUPABASE_URL)
    && present(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleReady = present(env.SUPABASE_SERVICE_ROLE_KEY);
  const emailReady = present(env.RESEND_API_KEY) && present(env.RESEND_FROM_EMAIL || env.EMAIL_FROM);
  const stripeKeysReady = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
  const testCheckoutEnabled = env.ENABLE_TEST_CHECKOUT === "true";
  const publicBookingEnabled = env.NEXT_PUBLIC_PUBLIC_BOOKING === "true";

  const items: ReadinessItem[] = [
    { id: "app_url", category: "core", label: "Canonical application URL", status: appUrlReady ? "ready" : "attention", required: true, detail: appUrlReady ? "HTTPS application URL configured" : "A production HTTPS URL is required" },
    { id: "supabase_client", category: "core", label: "Authentication client", status: supabaseClientReady ? "ready" : "attention", required: true, detail: supabaseClientReady ? "Supabase public client configured" : "Supabase URL or public key missing" },
    { id: "supabase_admin", category: "core", label: "Administrative database access", status: serviceRoleReady ? "ready" : "attention", required: true, detail: serviceRoleReady ? "Server-only administrative credential configured" : "Service-role credential missing" },
    { id: "database", category: "core", label: "Database connectivity", status: databaseReachable ? "ready" : "attention", required: true, detail: databaseReachable ? "Administrative database query succeeded" : "Administrative database query unavailable" },
    { id: "pilot_mode", category: "core", label: "Private booking pilot", status: env.PILOT_MODE === "true" ? "ready" : "attention", required: true, detail: env.PILOT_MODE === "true" ? "Private booking requests enabled" : "Private booking requests disabled" },
    { id: "email", category: "communications", label: "Transactional email", status: emailReady ? "ready" : "attention", required: true, detail: emailReady ? "Email provider and sender configured" : "Email provider or sender missing" },
    { id: "email_worker", category: "communications", label: "Email worker authorization", status: present(env.CRON_SECRET) ? "ready" : "attention", required: true, detail: present(env.CRON_SECRET) ? "Scheduled worker secret configured" : "Scheduled worker secret missing" },
    { id: "stripe_test", category: "payments", label: "Stripe test credentials", status: stripeKeysReady ? "ready" : "attention", required: false, detail: stripeKeysReady ? "Test-mode server and browser keys configured" : "Complete test-mode key pair not configured" },
    { id: "stripe_webhook", category: "payments", label: "Stripe webhook verification", status: present(env.STRIPE_WEBHOOK_SECRET) ? "ready" : "attention", required: false, detail: present(env.STRIPE_WEBHOOK_SECRET) ? "Webhook signing secret configured" : "Webhook signing secret missing" },
    { id: "membership_prices", category: "payments", label: "Membership pricing", status: present(env.STRIPE_BASIC_PRICE_ID) && present(env.STRIPE_BUSINESS_PRICE_ID) ? "ready" : "attention", required: false, detail: present(env.STRIPE_BASIC_PRICE_ID) && present(env.STRIPE_BUSINESS_PRICE_ID) ? "Basic and Business annual prices configured" : "One or more membership prices missing" },
    { id: "partner_prices", category: "payments", label: "Partner subscription pricing", status: present(env.STRIPE_PARTNER_STARTER_PRICE_ID) && present(env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID) && present(env.STRIPE_PARTNER_PREMIUM_PRICE_ID) ? "ready" : "attention", required: false, detail: present(env.STRIPE_PARTNER_STARTER_PRICE_ID) && present(env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID) && present(env.STRIPE_PARTNER_PREMIUM_PRICE_ID) ? "Starter, Professional, and Premium prices configured" : "One or more partner prices missing" },
    { id: "test_checkout", category: "features", label: "Test checkout", status: testCheckoutEnabled ? stripeKeysReady ? "ready" : "attention" : "off", required: false, detail: testCheckoutEnabled ? stripeKeysReady ? "Enabled with Stripe test credentials" : "Enabled but test credentials are incomplete" : "Disabled" },
    { id: "public_booking", category: "features", label: "Public booking flag", status: publicBookingEnabled ? "ready" : "off", required: false, detail: publicBookingEnabled ? "Enabled" : "Disabled for the private pilot" },
    { id: "openai", category: "features", label: "OpenAI provider", status: present(env.OPENAI_API_KEY) ? "ready" : "off", required: false, detail: present(env.OPENAI_API_KEY) ? "Provider credential configured" : "Live AI provider disabled" },
  ];
  const summary = items.reduce((totals, item) => ({ ...totals, [item.status]: totals[item.status] + 1 }), { ready: 0, attention: 0, off: 0 });

  return {
    items,
    summary,
    requiredReady: items.filter((item) => item.required).every((item) => item.status === "ready"),
  };
}
