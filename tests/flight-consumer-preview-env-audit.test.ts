import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  auditFlightConsumerPreviewEnvironment,
  discoverStripeTestAccountBinding,
  parseDotenv,
  verifyStripeTestAccountBinding,
// @ts-expect-error -- The environment gate is an executable .mjs module without a declaration file.
} from "../scripts/audit-flight-consumer-preview-env.mjs";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validEnvironment() {
  const accountId = "acct_preview12345678";
  const stripeRestrictedKey = "rk_test_preview_restricted_12345678";
  const key = () => randomBytes(32).toString("base64url");
  return {
    VERCEL_ENV: "preview",
    PILOT_MODE: "true",
    FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
    FLIGHT_RUNTIME_MODE: "sandbox",
    FLIGHT_RUNTIME_ENVIRONMENT: "preview",
    FLIGHT_RUNTIME_ENABLED: "true",
    FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
    FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
    FLIGHT_BOOKING_ENABLED: "true",
    FLIGHT_PAYMENT_ENABLED: "true",
    FLIGHT_SETTLEMENT_ENABLED: "true",
    FLIGHT_TICKETING_ENABLED: "true",
    FLIGHT_SERVICING_ENABLED: "false",
    FLIGHT_WEBHOOKS_ENABLED: "true",
    FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
    FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    ENABLE_LIVE_BOOKING_PAYMENTS: "false",
    ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
    NEXT_PUBLIC_PUBLIC_BOOKING: "false",
    FLIGHT_DUFFEL_TEST_BOOKING_ENABLED: "false",
    FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED: "false",
    EMAIL_WORKER_ENABLED: "false",
    NEXT_PUBLIC_APP_URL: "https://flight-preview.example.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://eiqmdldjnedqgbtoozqa.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-preview-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-preview-key",
    DUFFEL_TEST_ACCESS_TOKEN: "duffel_test_1234567890abcdef",
    FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET: "authority-secret-at-least-thirty-two-characters",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: stripeRestrictedKey,
    FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256:
      sha256(stripeRestrictedKey),
    NEXT_PUBLIC_FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY:
      "pk_test_12345678",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256:
      sha256("pk_test_12345678"),
    STRIPE_WEBHOOK_SECRET: "whsec_generic123456789",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_preview123456789",
    FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET: "duffel-webhook-preview-secret",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID: accountId,
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256: sha256(accountId),
    FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION: "preview-pii-v1",
    FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION: "preview-evidence-v1",
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION: "preview-reference-v1",
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL: key(),
  };
}

describe("Consumer Preview environment audit", () => {
  it("accepts only the complete Preview/test-only binding", () => {
    expect(auditFlightConsumerPreviewEnvironment(validEnvironment())).toMatchObject({
      ready: true,
      issues: [],
      projectRef: "eiqmdldjnedqgbtoozqa",
    });
  });

  it("reports names and reasons without returning secret values", () => {
    const env = validEnvironment();
    env.FLIGHT_PAYMENT_ENABLED = "false";
    env.EMAIL_WORKER_ENABLED = "true";
    env.FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL =
      env.FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL;
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256 = "f".repeat(64);
    const result = auditFlightConsumerPreviewEnvironment(env);
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      { variable: "FLIGHT_PAYMENT_ENABLED", reason: "unexpected_or_missing" },
      { variable: "EMAIL_WORKER_ENABLED", reason: "unexpected_or_missing" },
      { variable: "FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256", reason: "does_not_bind_account_id" },
      { variable: "FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL", reason: "must_differ_from_encryption_key" },
    ]));
    expect(JSON.stringify(result)).not.toContain(
      env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY,
    );
    expect(JSON.stringify(result)).not.toContain(env.FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL);
  });

  it("rejects a non-Preview host, a broad shared key, or an unbound publishable key", () => {
    const broad: Record<string, string> = validEnvironment();
    broad.STRIPE_SECRET_KEY = "sk_test_broad_not_allowed_12345678";
    expect(auditFlightConsumerPreviewEnvironment(broad).issues).toContainEqual({
      variable: "STRIPE_SECRET_KEY",
      reason: "broad_secret_must_be_absent",
    });

    const wrongEnvironment = validEnvironment();
    wrongEnvironment.VERCEL_ENV = "production";
    expect(auditFlightConsumerPreviewEnvironment(wrongEnvironment).issues).toContainEqual({
      variable: "VERCEL_ENV",
      reason: "unexpected_or_missing",
    });

    const unboundPublishable = validEnvironment();
    unboundPublishable.FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256 =
      "0".repeat(64);
    expect(auditFlightConsumerPreviewEnvironment(unboundPublishable).issues).toContainEqual({
      variable: "FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256",
      reason: "does_not_bind_publishable_key",
    });
  });

  it("parses quoted Vercel dotenv output and rejects unsupported lines", () => {
    expect(parseDotenv('A="one\\ntwo"\nB=plain\nC=\'quoted\'\n')).toEqual({
      A: "one\ntwo",
      B: "plain",
      C: "quoted",
    });
    expect(() => parseDotenv("not-an-assignment")).toThrow();
  });

  it("proves the Stripe test secret resolves to the bound account", async () => {
    const env = validEnvironment();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID,
      livemode: false,
    }), { status: 200 }));
    await expect(verifyStripeTestAccountBinding(env, fetcher)).resolves.toEqual({
      verified: true,
      reason: "verified",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("discovers only a non-live Stripe account identity and digest", async () => {
    const env = validEnvironment();
    await expect(discoverStripeTestAccountBinding(env, async () => new Response(JSON.stringify({
      id: env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID,
      livemode: false,
    }), { status: 200 }))).resolves.toEqual({
      discovered: true,
      reason: "discovered",
      accountId: env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID,
      accountSha256: env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256,
    });
    await expect(discoverStripeTestAccountBinding(env, async () => new Response(JSON.stringify({
      id: env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID,
      livemode: true,
    }), { status: 200 }))).resolves.toEqual({ discovered: false, reason: "invalid_test_account" });

    const fetcher = vi.fn();
    await expect(discoverStripeTestAccountBinding({
      ...env,
      FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256: "0".repeat(64),
    }, fetcher)).resolves.toEqual({
      discovered: false,
      reason: "test_secret_unavailable",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on a Stripe account mismatch or incomplete environment", async () => {
    const env = validEnvironment();
    await expect(verifyStripeTestAccountBinding(env, async () => new Response(JSON.stringify({
      id: "acct_other12345678",
      livemode: false,
    }), { status: 200 }))).resolves.toEqual({ verified: false, reason: "account_binding_mismatch" });
    env.FLIGHT_RUNTIME_ENABLED = "false";
    await expect(verifyStripeTestAccountBinding(env, vi.fn())).resolves.toEqual({
      verified: false,
      reason: "environment_not_ready",
    });
  });
});
