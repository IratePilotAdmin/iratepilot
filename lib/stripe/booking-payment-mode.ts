export type BookingPaymentMode = "test" | "live";

type PaymentEnvironment = Record<string, string | undefined>;

function keyMatchesMode(secret: string | undefined, publishable: string | undefined, mode: BookingPaymentMode) {
  const suffix = mode === "test" ? "test" : "live";
  return secret?.startsWith(`sk_${suffix}_`) === true
    && publishable?.startsWith(`pk_${suffix}_`) === true;
}

export function getApprovedBookingPaymentMode(env: PaymentEnvironment = process.env): BookingPaymentMode | null {
  const testEnabled = env.ENABLE_TEST_CHECKOUT === "true";
  const liveEnabled = env.ENABLE_LIVE_BOOKING_PAYMENTS === "true";

  // Fail closed if an operator tries to expose both Stripe environments at once.
  if (testEnabled === liveEnabled) return null;

  if (testEnabled) {
    return env.PILOT_MODE === "true"
      && keyMatchesMode(env.STRIPE_SECRET_KEY, env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "test")
      ? "test"
      : null;
  }

  const commercialLaunchApproved = env.PILOT_MODE === "false"
    && env.NEXT_PUBLIC_PUBLIC_BOOKING === "true";
  return commercialLaunchApproved
    && keyMatchesMode(env.STRIPE_SECRET_KEY, env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "live")
    ? "live"
    : null;
}

export function getStripeWebhookMode(env: PaymentEnvironment = process.env): BookingPaymentMode | null {
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && env.PILOT_MODE === "true") return "test";
  if (
    env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
    && env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true"
    && env.PILOT_MODE === "false"
  ) return "live";
  return null;
}

export function getApprovedBookingMetadataMode(mode: BookingPaymentMode) {
  return mode === "test" ? "approved_booking_test" : "approved_booking_live";
}
