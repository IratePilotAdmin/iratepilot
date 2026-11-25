export type RatehawkCertificationReviewEnvironment = Record<string, string | undefined>;

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function reviewerEmails(environment: RatehawkCertificationReviewEnvironment) {
  return new Set(
    (environment.RATEHAWK_CERTIFICATION_REVIEW_EMAILS ?? "")
      .split(",")
      .map(normalizedEmail)
      .filter(Boolean),
  );
}

export function isRatehawkCertificationReviewRuntime(
  environment: RatehawkCertificationReviewEnvironment = process.env,
) {
  const previewRuntime = environment.VERCEL_ENV === "preview";
  const localRuntime = environment.NODE_ENV !== "production"
    && environment.RATEHAWK_CERTIFICATION_REVIEW_ALLOW_LOCAL === "true";
  return environment.ENABLE_RATEHAWK_CERTIFICATION_REVIEW === "true"
    && environment.HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED === "true"
    && environment.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    && environment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true
    && (previewRuntime || localRuntime);
}

export function isRatehawkCertificationReviewer(
  email: string | null | undefined,
  environment: RatehawkCertificationReviewEnvironment = process.env,
) {
  const candidate = normalizedEmail(email);
  return Boolean(candidate)
    && isRatehawkCertificationReviewRuntime(environment)
    && reviewerEmails(environment).has(candidate);
}

