import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const restrictedTestKeyPattern = /^rk_test_[A-Za-z0-9_]{8,}$/;
const publishableTestKeyPattern = /^pk_test_[A-Za-z0-9_]{8,}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

type FlightConsumerPreviewStripeEnvironment = Readonly<
  Record<string, string | undefined>
>;

export class FlightConsumerPreviewStripeCredentialError extends Error {
  constructor() {
    super("The dedicated Flight Consumer Preview Stripe credential is unavailable.");
    this.name = "FlightConsumerPreviewStripeCredentialError";
  }
}

export function deriveFlightConsumerPreviewStripeCredentialSha256(
  credential: string,
) {
  if (!restrictedTestKeyPattern.test(credential)) {
    throw new FlightConsumerPreviewStripeCredentialError();
  }
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export function readFlightConsumerPreviewStripeRestrictedKey(
  env: FlightConsumerPreviewStripeEnvironment = process.env,
) {
  const credential = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY ?? "";
  const expectedSha256 =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256 ?? "";
  const derivedSha256 = deriveFlightConsumerPreviewStripeCredentialSha256(
    credential,
  );
  if (
    !sha256Pattern.test(expectedSha256)
    || !timingSafeEqual(
      Buffer.from(derivedSha256, "hex"),
      Buffer.from(expectedSha256, "hex"),
    )
  ) {
    throw new FlightConsumerPreviewStripeCredentialError();
  }
  return credential;
}

export function hasBoundFlightConsumerPreviewStripeRestrictedKey(
  env: FlightConsumerPreviewStripeEnvironment,
) {
  try {
    readFlightConsumerPreviewStripeRestrictedKey(env);
    return true;
  } catch {
    return false;
  }
}

export function hasBoundFlightConsumerPreviewStripePublishableKey(
  env: FlightConsumerPreviewStripeEnvironment,
) {
  const credential =
    env.NEXT_PUBLIC_FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY ?? "";
  const expectedSha256 =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256 ?? "";
  if (
    !publishableTestKeyPattern.test(credential)
    || !sha256Pattern.test(expectedSha256)
  ) return false;
  const derivedSha256 = createHash("sha256")
    .update(credential, "utf8")
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(derivedSha256, "hex"),
    Buffer.from(expectedSha256, "hex"),
  );
}

export function hasIsolatedFlightConsumerPreviewStripeKeyPair(
  env: FlightConsumerPreviewStripeEnvironment,
) {
  return hasBoundFlightConsumerPreviewStripeRestrictedKey(env)
    && hasBoundFlightConsumerPreviewStripePublishableKey(env)
    && !(env.STRIPE_SECRET_KEY ?? "").trim();
}
