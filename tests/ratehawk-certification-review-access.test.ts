import { describe, expect, it } from "vitest";
import {
  isRatehawkCertificationReviewer,
  isRatehawkCertificationReviewRuntime,
} from "../lib/ratehawk/certification-review-access";

const ready = {
  ENABLE_RATEHAWK_CERTIFICATION_REVIEW: "true",
  HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_example",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  RATEHAWK_CERTIFICATION_REVIEW_EMAILS: "sofia@example.com, reviewer@example.com",
};

describe("RateHawk certification reviewer access", () => {
  it("authorizes an allowlisted reviewer in a Preview with sandbox and Stripe test mode", () => {
    expect(isRatehawkCertificationReviewRuntime(ready)).toBe(true);
    expect(isRatehawkCertificationReviewer(" Sofia@Example.com ", ready)).toBe(true);
  });

  it("fails closed in Production", () => {
    expect(isRatehawkCertificationReviewer("sofia@example.com", { ...ready, VERCEL_ENV: "production" })).toBe(false);
  });

  it("rejects live Stripe credentials", () => {
    expect(isRatehawkCertificationReviewer("sofia@example.com", { ...ready, STRIPE_SECRET_KEY: "sk_live_example" })).toBe(false);
  });

  it("rejects a reviewer not on the allowlist", () => {
    expect(isRatehawkCertificationReviewer("other@example.com", ready)).toBe(false);
  });

  it("permits explicitly enabled local development without opening Production", () => {
    expect(isRatehawkCertificationReviewer("sofia@example.com", {
      ...ready,
      VERCEL_ENV: undefined,
      NODE_ENV: "development",
      RATEHAWK_CERTIFICATION_REVIEW_ALLOW_LOCAL: "true",
    })).toBe(true);
  });
});

