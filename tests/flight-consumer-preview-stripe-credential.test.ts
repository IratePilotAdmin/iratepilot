import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FlightConsumerPreviewStripeCredentialError,
  deriveFlightConsumerPreviewStripeCredentialSha256,
  hasBoundFlightConsumerPreviewStripeRestrictedKey,
  hasBoundFlightConsumerPreviewStripePublishableKey,
  hasIsolatedFlightConsumerPreviewStripeKeyPair,
  readFlightConsumerPreviewStripeRestrictedKey,
} from "../lib/flights/consumer-preview/stripe-credential.server";

const restrictedKey = "rk_test_preview_restricted_12345678";
const restrictedKeySha256 = createHash("sha256")
  .update(restrictedKey, "utf8")
  .digest("hex");
const publishableKey = "pk_test_preview_public_12345678";
const publishableKeySha256 = createHash("sha256")
  .update(publishableKey, "utf8")
  .digest("hex");

describe("Flight Consumer Preview dedicated Stripe credential", () => {
  it("accepts only an exactly digest-bound restricted TEST key", () => {
    const env = {
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256:
        restrictedKeySha256,
    };
    expect(readFlightConsumerPreviewStripeRestrictedKey(env)).toBe(
      restrictedKey,
    );
    expect(hasBoundFlightConsumerPreviewStripeRestrictedKey(env)).toBe(true);
    expect(deriveFlightConsumerPreviewStripeCredentialSha256(restrictedKey))
      .toBe(restrictedKeySha256);
  });

  it("accepts only a digest-bound publishable TEST key with no broad secret", () => {
    const env = {
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256:
        restrictedKeySha256,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publishableKey,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256:
        publishableKeySha256,
    };
    expect(hasBoundFlightConsumerPreviewStripePublishableKey(env)).toBe(true);
    expect(hasIsolatedFlightConsumerPreviewStripeKeyPair(env)).toBe(true);
    expect(hasIsolatedFlightConsumerPreviewStripeKeyPair({
      ...env,
      STRIPE_SECRET_KEY: "sk_test_broad_not_allowed_12345678",
    })).toBe(false);
    expect(hasIsolatedFlightConsumerPreviewStripeKeyPair({
      ...env,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256: "0".repeat(64),
    })).toBe(false);
  });

  it.each([
    {},
    {
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY:
        "sk_test_standard_not_allowed_12345678",
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256:
        restrictedKeySha256,
    },
    {
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256: "0".repeat(64),
    },
    {
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256: "not-a-digest",
    },
  ])("fails closed on missing, standard, mismatched, or malformed input", (env) => {
    expect(() => readFlightConsumerPreviewStripeRestrictedKey(env))
      .toThrow(FlightConsumerPreviewStripeCredentialError);
    expect(hasBoundFlightConsumerPreviewStripeRestrictedKey(env)).toBe(false);
  });

  it("never includes credential bytes in the refusal", () => {
    let thrown: unknown;
    try {
      readFlightConsumerPreviewStripeRestrictedKey({
        FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
        FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256:
          "0".repeat(64),
      });
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).not.toContain(restrictedKey);
  });
});
