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
  const stripeTestKeysReady = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
  const stripeLiveKeysReady = env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_") === true;
  const testCheckoutEnabled = env.ENABLE_TEST_CHECKOUT === "true";
  const publicBookingEnabled = env.NEXT_PUBLIC_PUBLIC_BOOKING === "true";
  const liveBookingEnabled = env.ENABLE_LIVE_BOOKING_PAYMENTS === "true";
  const liveWebhooksEnabled = env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true";
  const pilotMode = env.PILOT_MODE === "true";
  const commercialModeReady = env.PILOT_MODE === "false" && publicBookingEnabled && liveBookingEnabled && liveWebhooksEnabled && stripeLiveKeysReady;

  const items: ReadinessItem[] = [
    { id: "app_url", category: "core", label: "Canonical application URL", status: appUrlReady ? "ready" : "attention", required: true, detail: appUrlReady ? "HTTPS application URL configured" : "A production HTTPS URL is required" },
    { id: "supabase_client", category: "core", label: "Authentication client", status: supabaseClientReady ? "ready" : "attention", required: true, detail: supabaseClientReady ? "Supabase public client configured" : "Supabase URL or public key missing" },
    { id: "supabase_admin", category: "core", label: "Administrative database access", status: serviceRoleReady ? "ready" : "attention", required: true, detail: serviceRoleReady ? "Server-only administrative credential configured" : "Service-role credential missing" },
    { id: "database", category: "core", label: "Database connectivity", status: databaseReachable ? "ready" : "attention", required: true, detail: databaseReachable ? "Administrative database query succeeded" : "Administrative database query unavailable" },
    { id: "operating_mode", category: "core", label: "Booking operating mode", status: pilotMode || commercialModeReady ? "ready" : "attention", required: true, detail: pilotMode ? "Private booking requests enabled" : commercialModeReady ? "Commercial booking mode configured" : "Neither private pilot nor commercial booking mode is complete" },
    { id: "email", category: "communications", label: "Transactional email", status: emailReady ? "ready" : "attention", required: true, detail: emailReady ? "Email provider and sender configured" : "Email provider or sender missing" },
    { id: "email_worker", category: "communications", label: "Email worker authorization", status: present(env.CRON_SECRET) ? "ready" : "attention", required: true, detail: present(env.CRON_SECRET) ? "Scheduled worker secret configured" : "Scheduled worker secret missing" },
    { id: "stripe_keys", category: "payments", label: "Stripe credentials", status: stripeTestKeysReady || stripeLiveKeysReady ? "ready" : "attention", required: false, detail: stripeLiveKeysReady ? "Live-mode server and browser keys configured" : stripeTestKeysReady ? "Test-mode server and browser keys configured" : "Complete Stripe key pair not configured" },
    { id: "stripe_webhook", category: "payments", label: "Stripe webhook verification", status: present(env.STRIPE_WEBHOOK_SECRET) ? "ready" : "attention", required: false, detail: present(env.STRIPE_WEBHOOK_SECRET) ? "Webhook signing secret configured" : "Webhook signing secret missing" },
    { id: "membership_prices", category: "payments", label: "Membership pricing", status: present(env.STRIPE_BASIC_PRICE_ID) && present(env.STRIPE_BUSINESS_PRICE_ID) ? "ready" : "attention", required: false, detail: present(env.STRIPE_BASIC_PRICE_ID) && present(env.STRIPE_BUSINESS_PRICE_ID) ? "Basic and Business annual prices configured" : "One or more membership prices missing" },
    { id: "partner_prices", category: "payments", label: "Partner subscription pricing", status: present(env.STRIPE_PARTNER_STARTER_PRICE_ID) && present(env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID) && present(env.STRIPE_PARTNER_PREMIUM_PRICE_ID) ? "ready" : "attention", required: false, detail: present(env.STRIPE_PARTNER_STARTER_PRICE_ID) && present(env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID) && present(env.STRIPE_PARTNER_PREMIUM_PRICE_ID) ? "Starter, Professional, and Premium prices configured" : "One or more partner prices missing" },
    { id: "test_checkout", category: "features", label: "Test checkout", status: testCheckoutEnabled ? stripeTestKeysReady && !liveBookingEnabled ? "ready" : "attention" : "off", required: false, detail: testCheckoutEnabled ? stripeTestKeysReady && !liveBookingEnabled ? "Enabled with Stripe test credentials" : "Enabled with conflicting or incomplete configuration" : "Disabled" },
    { id: "live_booking_payments", category: "features", label: "Live booking payments", status: liveBookingEnabled ? commercialModeReady ? "ready" : "attention" : "off", required: false, detail: liveBookingEnabled ? commercialModeReady ? "Enabled with all commercial launch gates" : "Enabled but one or more commercial launch gates are incomplete" : "Disabled" },
    { id: "live_stripe_webhooks", category: "features", label: "Live Stripe webhooks", status: liveWebhooksEnabled ? !pilotMode && stripeLiveKeysReady ? "ready" : "attention" : "off", required: false, detail: liveWebhooksEnabled ? !pilotMode && stripeLiveKeysReady ? "Enabled with live Stripe credentials" : "Enabled but live-mode configuration is incomplete" : "Disabled" },
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
