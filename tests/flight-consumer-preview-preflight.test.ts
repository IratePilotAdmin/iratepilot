import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { inspectFlightConsumerPreviewPreflight } from "../lib/flights/consumer-preview/preflight.server";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function key() {
  return randomBytes(32).toString("base64url");
}

function fixture() {
  const accountId = "acct_preview12345678";
  const accountSha256 = sha256(accountId);
  const restrictedKey = "rk_test_preview_restricted_12345678";
  const authority = {
    version: "flight-consumer-preview-runtime-authority-v1",
    authorized: true,
    control_key: "global",
    execution_mode: "test",
    execution_kill_switch_engaged: false,
    synthetic_execution_enabled: false,
    provider_sandbox_traffic_enabled: true,
    provider_live_traffic_enabled: false,
    shopping_enabled: true,
    order_enabled: true,
    payment_enabled: true,
    ticketing_enabled: true,
    servicing_enabled: false,
    provider_events_enabled: true,
    production_release_enabled: false,
    bound_environment: "preview",
    bound_project_ref: "eiqmdldjnedqgbtoozqa",
    bound_database_name: "postgres",
    bound_session_user: "authenticator",
    bound_provider_code: "duffel",
    bound_provider_account_sha256: "1".repeat(64),
    bound_point_of_sale: "US",
    bound_content_scope_sha256: "2".repeat(64),
    bound_adapter_version_sha256: "3".repeat(64),
    bound_payment_processor_code: "stripe",
    bound_payment_account_sha256: accountSha256,
    bound_payment_environment: "test",
    bound_payment_source_sha256: "4".repeat(64),
    bound_payment_adapter_version_sha256: "5".repeat(64),
    bound_provider_settlement_processor_code: "duffel_balance",
    bound_provider_settlement_account_sha256: "6".repeat(64),
    bound_provider_settlement_environment: "test",
    bound_provider_settlement_source_sha256: "7".repeat(64),
    bound_provider_settlement_adapter_version_sha256: "8".repeat(64),
    bound_execution_scope_sha256: "9".repeat(64),
    activation_evidence_sha256: "a".repeat(64),
    runtime_control_receipt_sha256: "b".repeat(64),
  };
  const env = {
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
    NEXT_PUBLIC_SUPABASE_URL: "https://eiqmdldjnedqgbtoozqa.supabase.co",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
    FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256: sha256(restrictedKey),
    NEXT_PUBLIC_FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY:
      "pk_test_12345678",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256:
      sha256("pk_test_12345678"),
    FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_preview123456789",
    FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET: "duffel-preview-webhook-secret",
    STRIPE_WEBHOOK_SECRET: "whsec_generic123456789",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID: accountId,
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256: accountSha256,
    DUFFEL_TEST_ACCESS_TOKEN: "duffel_test_1234567890abcdef",
    FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION: "pii-v1",
    FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION: "evidence-v1",
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION: "reference-v1",
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL: key(),
  };
  return { accountId, accountSha256, authority, env };
}

describe("Consumer Preview runtime preflight", () => {
  it("proves the deployed Stripe test account against exact database authority", async () => {
    const { accountId, accountSha256, authority, env } = fixture();
    const result = await inspectFlightConsumerPreviewPreflight(env, {
      readDatabaseAuthority: async () => authority,
      fetchStripeAccount: async () => ({ id: accountId, livemode: false }),
      now: () => "2026-08-25T20:00:00.000Z",
    });
    expect(result).toMatchObject({
      ready: true,
      stripeAccountId: accountId,
      stripeAccountSha256: accountSha256,
      checks: {
        databaseAuthority: true,
        runtimeConfiguration: true,
        stripeTestAccount: true,
        stripeAccountBinding: true,
      },
      issues: [],
    });
  });

  it("fails closed without leaking the Stripe secret", async () => {
    const { accountId, authority, env } = fixture();
    env.FLIGHT_PAYMENT_ENABLED = "false";
    const result = await inspectFlightConsumerPreviewPreflight(env, {
      readDatabaseAuthority: async () => authority,
      fetchStripeAccount: async () => ({ id: `${accountId}other`, livemode: false }),
      now: () => "2026-08-25T20:00:00.000Z",
    });
    expect(result.ready).toBe(false);
    expect(result.checks.runtimeConfiguration).toBe(false);
    expect(result.checks.stripeAccountBinding).toBe(false);
    expect(JSON.stringify(result)).not.toContain(
      env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY,
    );
  });
});
