import {
  getApprovedBookingPaymentMode,
  getStripeWebhookMode,
} from "../stripe/booking-payment-mode";

type PaymentEnvironment = Record<string, string | undefined>;

export type PaymentReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

function check(id: string, label: string, passed: boolean, detail: string): PaymentReadinessCheck {
  return { id, label, passed, detail };
}

function summarize(checks: PaymentReadinessCheck[]) {
  return {
    passed: checks.filter((item) => item.passed).length,
    total: checks.length,
    ready: checks.every((item) => item.passed),
    checks,
  };
}

export function buildPaymentReadiness(env: PaymentEnvironment = process.env) {
  const paymentMode = getApprovedBookingPaymentMode(env);
  const webhookMode = getStripeWebhookMode(env);
  const testKeyPair = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
  const liveKeyPair = env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_") === true;
  const webhookSecretConfigured = env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true;

  const testMode = summarize([
    check("pilot_enabled", "Private pilot remains enabled", env.PILOT_MODE === "true", "PILOT_MODE must be true for test payments."),
    check("public_booking_off", "Public booking remains disabled", env.NEXT_PUBLIC_PUBLIC_BOOKING !== "true", "Public booking must stay off during test validation."),
    check("live_booking_off", "Live booking payments remain disabled", env.ENABLE_LIVE_BOOKING_PAYMENTS !== "true", "Live payment creation must stay off during the pilot."),
    check("live_webhooks_off", "Live Stripe webhooks remain disabled", env.ENABLE_LIVE_STRIPE_WEBHOOKS !== "true", "Only test-mode webhook processing is allowed."),
    check("live_payouts_off", "Live partner payouts remain disabled", env.ENABLE_LIVE_PARTNER_PAYOUTS !== "true", "No live partner transfer may be created during test validation."),
    check("test_checkout_on", "Test checkout is explicitly enabled", env.ENABLE_TEST_CHECKOUT === "true", "ENABLE_TEST_CHECKOUT must be true in the approved test environment."),
    check("test_key_pair", "Stripe test key pair is configured", testKeyPair, "Both server and browser keys must be Stripe test-mode keys."),
    check("webhook_secret", "Webhook signing secret is configured", webhookSecretConfigured, "A Stripe webhook signing secret is required."),
    check("test_payment_mode", "Approved-reservation payment mode resolves to test", paymentMode === "test", "The fail-closed payment gate must resolve to test mode."),
    check("test_webhook_mode", "Webhook mode resolves to test", webhookMode === "test", "The fail-closed webhook gate must resolve to test mode."),
  ]);

  const productionConfiguration = summarize([
    check("pilot_off", "Private pilot is disabled", env.PILOT_MODE === "false", "Commercial payment mode requires an explicit pilot shutdown."),
    check("public_booking_on", "Public booking is enabled", env.NEXT_PUBLIC_PUBLIC_BOOKING === "true", "Commercial booking must be explicitly enabled."),
    check("test_checkout_off", "Server test checkout is disabled", env.ENABLE_TEST_CHECKOUT === "false", "The server test-checkout flag must be false."),
    check("browser_test_checkout_off", "Browser test checkout is disabled", env.NEXT_PUBLIC_ENABLE_TEST_CHECKOUT !== "true", "The browser test-checkout flag must not be enabled."),
    check("live_booking_on", "Live booking payments are enabled", env.ENABLE_LIVE_BOOKING_PAYMENTS === "true", "Live payment creation requires an explicit enable flag."),
    check("live_webhooks_on", "Live Stripe webhooks are enabled", env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true", "Live webhook processing requires an explicit enable flag."),
    check("live_payouts_on", "Live partner payouts are enabled", env.ENABLE_LIVE_PARTNER_PAYOUTS === "true", "Full commercial settlement requires an explicit payout enable flag."),
    check("live_key_pair", "Stripe live key pair is configured", liveKeyPair, "Both server and browser keys must be Stripe live-mode keys."),
    check("webhook_secret", "Webhook signing secret is configured", webhookSecretConfigured, "A Stripe webhook signing secret is required."),
    check("live_payment_mode", "Approved-reservation payment mode resolves to live", paymentMode === "live", "The fail-closed payment gate must resolve to live mode."),
    check("live_webhook_mode", "Webhook mode resolves to live", webhookMode === "live", "The fail-closed webhook gate must resolve to live mode."),
  ]);

  return {
    testMode,
    productionConfiguration: {
      ...productionConfiguration,
      launchAuthorized: false,
      authorizationDetail: "Configuration readiness never authorizes production. Hotel, Stripe, legal, support, and deployment approvals remain separate gates.",
    },
    activePaymentMode: paymentMode,
    activeWebhookMode: webhookMode,
  };
}
