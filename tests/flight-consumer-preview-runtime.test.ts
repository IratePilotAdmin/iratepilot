import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FLIGHT_CONSUMER_PREVIEW_MODE,
  FLIGHT_CONSUMER_PREVIEW_PROJECT_REF,
  requireFlightConsumerPreviewRuntime,
  resolveFlightConsumerPreviewRuntime,
  type FlightConsumerPreviewRuntimeAuthority,
} from "../lib/flights/consumer-preview/runtime.server";

const restrictedKey = "rk_test_preview_restricted_12345678";
const restrictedKeySha256 = createHash("sha256")
  .update(restrictedKey, "utf8")
  .digest("hex");

const baseEnv = Object.freeze({
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
  NEXT_PUBLIC_SUPABASE_URL: `https://${FLIGHT_CONSUMER_PREVIEW_PROJECT_REF}.supabase.co`,
  FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: restrictedKey,
  FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256: restrictedKeySha256,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_preview_public_12345678",
  FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256: createHash("sha256")
    .update("pk_test_preview_public_12345678", "utf8")
    .digest("hex"),
  STRIPE_WEBHOOK_SECRET: "whsec_general_12345678",
  FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_preview_12345678",
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET: "duffel-preview-webhook-secret",
  FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256: "4".repeat(64),
  FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID: "acct_preview12345678",
  DUFFEL_TEST_ACCESS_TOKEN: `duffel_test_${"D".repeat(32)}`,
  FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION: "preview-v1",
  FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: Buffer.alloc(32, 1).toString("base64url"),
  FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: Buffer.alloc(32, 2).toString("base64url"),
  FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION: "preview-evidence-v1",
  FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL: Buffer.alloc(32, 3).toString("base64url"),
  FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL: Buffer.alloc(32, 4).toString("base64url"),
  FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION: "preview-reference-v1",
  FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL: Buffer.alloc(32, 5).toString("base64url"),
  FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL: Buffer.alloc(32, 6).toString("base64url"),
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
}) satisfies Record<string, string>;

const authority = Object.freeze({
  version: "flight-consumer-preview-runtime-authority-v1",
  authorized: true,
  controlKey: "global",
  executionMode: "test",
  executionKillSwitchEngaged: false,
  syntheticExecutionEnabled: false,
  providerSandboxTrafficEnabled: true,
  providerLiveTrafficEnabled: false,
  shoppingEnabled: true,
  orderEnabled: true,
  paymentEnabled: true,
  ticketingEnabled: true,
  servicingEnabled: false,
  providerEventsEnabled: true,
  productionReleaseEnabled: false,
  boundEnvironment: "preview",
  boundProjectRef: FLIGHT_CONSUMER_PREVIEW_PROJECT_REF,
  boundDatabaseName: "postgres",
  boundSessionUser: "authenticator",
  boundProviderCode: "duffel",
  boundProviderAccountSha256: "1".repeat(64),
  boundPointOfSale: "US",
  boundContentScopeSha256: "2".repeat(64),
  boundAdapterVersionSha256: "3".repeat(64),
  boundPaymentProcessorCode: "stripe",
  boundPaymentAccountSha256: "4".repeat(64),
  boundPaymentEnvironment: "test",
  boundPaymentSourceSha256: "5".repeat(64),
  boundPaymentAdapterVersionSha256: "6".repeat(64),
  boundProviderSettlementProcessorCode: "duffel_balance",
  boundProviderSettlementAccountSha256: "7".repeat(64),
  boundProviderSettlementEnvironment: "test",
  boundProviderSettlementSourceSha256: "8".repeat(64),
  boundProviderSettlementAdapterVersionSha256: "9".repeat(64),
  boundExecutionScopeSha256: "a".repeat(64),
  activationEvidenceSha256: "b".repeat(64),
  runtimeControlReceiptSha256: "c".repeat(64),
}) satisfies FlightConsumerPreviewRuntimeAuthority;

describe("Flight Consumer Preview runtime gate", () => {
  it("authorizes only the exact Preview/test environment plus verified split DB bindings", () => {
    const decision = resolveFlightConsumerPreviewRuntime(baseEnv, authority);
    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PREVIEW_MODE,
      reasons: [],
      binding: {
        projectRef: FLIGHT_CONSUMER_PREVIEW_PROJECT_REF,
        providerCode: "duffel",
        providerAccountSha256: "1".repeat(64),
        pointOfSale: "US",
        contentScopeSha256: "2".repeat(64),
        providerAdapterVersionSha256: "3".repeat(64),
        paymentProcessorCode: "stripe",
        paymentAccountSha256: "4".repeat(64),
        paymentEnvironment: "test",
        paymentSourceSha256: "5".repeat(64),
        paymentAdapterVersionSha256: "6".repeat(64),
        providerSettlementProcessorCode: "duffel_balance",
        providerSettlementAccountSha256: "7".repeat(64),
        providerSettlementEnvironment: "test",
        providerSettlementSourceSha256: "8".repeat(64),
        providerSettlementAdapterVersionSha256: "9".repeat(64),
        executionScopeSha256: "a".repeat(64),
        activationEvidenceSha256: "b".repeat(64),
        runtimeControlReceiptSha256: "c".repeat(64),
        piiKeyVersion: "preview-v1",
        evidenceKeyVersion: "preview-evidence-v1",
        referenceKeyVersion: "preview-reference-v1",
      },
    });

    const serialized = JSON.stringify(decision);
    for (const secret of [
      baseEnv.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY,
      baseEnv.STRIPE_WEBHOOK_SECRET,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET,
      baseEnv.DUFFEL_TEST_ACCESS_TOKEN,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL,
      baseEnv.FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL,
    ]) expect(serialized).not.toContain(secret);
  });

  it("normalizes the exact snake_case row returned by the runtime authority RPC", () => {
    const row = {
      version: authority.version,
      authorized: authority.authorized,
      control_key: authority.controlKey,
      execution_mode: authority.executionMode,
      execution_kill_switch_engaged: authority.executionKillSwitchEngaged,
      synthetic_execution_enabled: authority.syntheticExecutionEnabled,
      provider_sandbox_traffic_enabled: authority.providerSandboxTrafficEnabled,
      provider_live_traffic_enabled: authority.providerLiveTrafficEnabled,
      shopping_enabled: authority.shoppingEnabled,
      order_enabled: authority.orderEnabled,
      payment_enabled: authority.paymentEnabled,
      ticketing_enabled: authority.ticketingEnabled,
      servicing_enabled: authority.servicingEnabled,
      provider_events_enabled: authority.providerEventsEnabled,
      production_release_enabled: authority.productionReleaseEnabled,
      bound_environment: authority.boundEnvironment,
      bound_project_ref: authority.boundProjectRef,
      bound_database_name: authority.boundDatabaseName,
      bound_session_user: authority.boundSessionUser,
      bound_provider_code: authority.boundProviderCode,
      bound_provider_account_sha256: authority.boundProviderAccountSha256,
      bound_point_of_sale: authority.boundPointOfSale,
      bound_content_scope_sha256: authority.boundContentScopeSha256,
      bound_adapter_version_sha256: authority.boundAdapterVersionSha256,
      bound_payment_processor_code: authority.boundPaymentProcessorCode,
      bound_payment_account_sha256: authority.boundPaymentAccountSha256,
      bound_payment_environment: authority.boundPaymentEnvironment,
      bound_payment_source_sha256: authority.boundPaymentSourceSha256,
      bound_payment_adapter_version_sha256: authority.boundPaymentAdapterVersionSha256,
      bound_provider_settlement_processor_code: authority.boundProviderSettlementProcessorCode,
      bound_provider_settlement_account_sha256: authority.boundProviderSettlementAccountSha256,
      bound_provider_settlement_environment: authority.boundProviderSettlementEnvironment,
      bound_provider_settlement_source_sha256: authority.boundProviderSettlementSourceSha256,
      bound_provider_settlement_adapter_version_sha256: authority.boundProviderSettlementAdapterVersionSha256,
      bound_execution_scope_sha256: authority.boundExecutionScopeSha256,
      activation_evidence_sha256: authority.activationEvidenceSha256,
      runtime_control_receipt_sha256: authority.runtimeControlReceiptSha256,
    };
    expect(resolveFlightConsumerPreviewRuntime(baseEnv, row)).toMatchObject({
      authorized: true,
      mode: FLIGHT_CONSUMER_PREVIEW_MODE,
      binding: {
        paymentProcessorCode: "stripe",
        providerSettlementProcessorCode: "duffel_balance",
      },
    });
  });

  it.each([
    ["VERCEL_ENV", "production"],
    ["PILOT_MODE", "false"],
    ["FLIGHT_CONSUMER_PREVIEW_ENABLED", "false"],
    ["FLIGHT_RUNTIME_MODE", "production"],
    ["FLIGHT_RUNTIME_ENVIRONMENT", "production"],
    ["FLIGHT_PROVIDER_TRAFFIC_ENABLED", "false"],
    ["FLIGHT_PAYMENT_ENABLED", "false"],
    ["FLIGHT_SETTLEMENT_ENABLED", "false"],
    ["FLIGHT_TRANSACTION_KILL_SWITCH", "engaged"],
    ["FLIGHT_PRODUCTION_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY", "sk_live_not_allowed_12345678"],
    ["FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256", "0".repeat(64)],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_not_allowed_12345678"],
    ["FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256", "0".repeat(64)],
    ["STRIPE_SECRET_KEY", "sk_test_broad_not_allowed_12345678"],
    ["DUFFEL_TEST_ACCESS_TOKEN", "duffel_live_not_allowed_12345678"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://production-project.supabase.co"],
  ])("fails closed when %s is %s", (name, value) => {
    const decision = resolveFlightConsumerPreviewRuntime({ ...baseEnv, [name]: value }, authority);
    expect(decision).toMatchObject({ authorized: false, mode: "disabled", binding: null });
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("fails closed on missing, stale, mixed, or non-exact database authority", () => {
    const invalidAuthorities = [
      null,
      { ...authority, authorized: false },
      { ...authority, productionReleaseEnabled: true },
      { ...authority, boundEnvironment: "production" },
      { ...authority, boundPaymentProcessorCode: "duffel_balance" },
      { ...authority, boundPaymentEnvironment: "live" },
      { ...authority, boundProviderSettlementProcessorCode: "stripe" },
      { ...authority, boundProviderSettlementEnvironment: "live" },
      { ...authority, runtimeControlReceiptSha256: "bad" },
      { ...authority, unexpected: true },
    ];
    for (const invalid of invalidAuthorities) {
      expect(resolveFlightConsumerPreviewRuntime(baseEnv, invalid)).toMatchObject({
        authorized: false,
        mode: "disabled",
        binding: null,
        reasons: ["Verified database runtime authority is unavailable."],
      });
    }
  });

  it("fails closed on absent or unsafe PII key material and conflicting live gates", () => {
    for (const override of [
      { FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: "" },
      { FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: "" },
      {
        FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL:
          baseEnv.FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL,
      },
      { FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL: "" },
      { FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL: "" },
      {
        FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL:
          baseEnv.FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL,
      },
      { FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL: "" },
      { FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL: "" },
      {
        FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL:
          baseEnv.FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL,
      },
      { ENABLE_LIVE_BOOKING_PAYMENTS: "true" },
      { ENABLE_LIVE_STRIPE_WEBHOOKS: "true" },
      { NEXT_PUBLIC_PUBLIC_BOOKING: "true" },
      { FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: "" },
      { FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256: "5".repeat(64) },
      {
        FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: baseEnv.STRIPE_WEBHOOK_SECRET,
      },
      { FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID: "acct_invalid-hyphen" },
    ]) {
      expect(resolveFlightConsumerPreviewRuntime({ ...baseEnv, ...override }, authority).authorized).toBe(false);
    }
  });

  it("throws a generic unavailable error without echoing secrets", () => {
    let thrown: unknown;
    try {
      requireFlightConsumerPreviewRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY: "private-bad-value",
      }, authority);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toContain("private-bad-value");
  });
});
