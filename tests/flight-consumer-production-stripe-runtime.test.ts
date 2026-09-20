import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deriveFlightConsumerProductionDuffelCredentialSha256 } from "../lib/flights/consumer-production/shopping-runtime.server";
import {
  deriveFlightConsumerProductionStripeAccountSha256,
  deriveFlightConsumerProductionStripeCredentialSha256,
  deriveFlightConsumerProductionStripePublishableKeySha256,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MODE,
  requireFlightConsumerProductionStripeAccountPreflightRuntime,
  requireFlightConsumerProductionStripePaymentPlanRuntime,
  resolveFlightConsumerProductionStripeAccountPreflightRuntime,
  resolveFlightConsumerProductionStripePaymentPlanRuntime,
  validateFlightConsumerProductionStripeLiveCredential,
  validateFlightConsumerProductionStripeLivePublishableKey,
} from "../lib/flights/consumer-production/stripe-runtime.server";

const duffelToken = `duffel_live_${"D".repeat(32)}`;
const stripeCredential = `rk_live_${"R".repeat(32)}`;
const stripePublishableKey = `pk_live_${"P".repeat(32)}`;
const accountId = "acct_1234567890abcdef";
const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
  FLIGHT_RUNTIME_MODE: "production",
  FLIGHT_RUNTIME_ENVIRONMENT: "production",
  FLIGHT_RUNTIME_ENABLED: "false",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "false",
  FLIGHT_BOOKING_ENABLED: "false",
  FLIGHT_PAYMENT_ENABLED: "false",
  FLIGHT_SETTLEMENT_ENABLED: "false",
  FLIGHT_TICKETING_ENABLED: "false",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "false",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "engaged",
  DUFFEL_LIVE_ACCESS_TOKEN: duffelToken,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "a".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(duffelToken),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "dedicated-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY: stripeCredential,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256:
    deriveFlightConsumerProductionStripeAccountSha256(accountId),
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionStripeCredentialSha256(stripeCredential),
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256:
    deriveFlightConsumerProductionStripePublishableKeySha256(
      stripePublishableKey,
    ),
  FLIGHT_PAYMENT_PROCESSOR_ID: "stripe_live",
  FLIGHT_PAYMENT_ADAPTER_VERSION: "22.4.0",
  FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256: "b".repeat(64),
  FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256:
    deriveFlightConsumerProductionStripeAccountSha256(accountId),
  FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256: "c".repeat(64),
}) satisfies Record<string, string>;

const paymentPlanEnv = Object.freeze({
  ...baseEnv,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "true",
}) satisfies Record<string, string>;

describe("Flight Consumer Production Stripe read-only runtime", () => {
  it("authorizes only one live platform-account read while every mutation stays false", () => {
    const decision =
      resolveFlightConsumerProductionStripeAccountPreflightRuntime(baseEnv);

    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE,
      reasons: [],
      binding: {
        processorCode: "stripe",
        processorEnvironment: "live",
        executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        approvedAccountSha256:
          deriveFlightConsumerProductionStripeAccountSha256(accountId),
        publishableKeyBindingMatched: true,
        allowedOperations: ["retrieve_platform_account"],
        accountReadEnabled: true,
        stripeMutationEnabled: false,
        paymentIntentEnabled: false,
        chargeEnabled: false,
        refundEnabled: false,
        webhookEnabled: false,
        providerOrderDispatchEnabled: false,
        consumerReleaseEnabled: false,
        bookingEnabled: false,
        paymentEnabled: false,
        settlementEnabled: false,
        ticketingEnabled: false,
        servicingEnabled: false,
        transactionKillSwitchEngaged: true,
      },
    });
    expect(
      resolveFlightConsumerProductionStripeAccountPreflightRuntime(baseEnv),
    ).toEqual(decision);
    expect(JSON.stringify(decision)).not.toContain(stripeCredential);
    expect(JSON.stringify(decision)).not.toContain(stripePublishableKey);
    expect(FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION)
      .toBe("VERIFY_STRIPE_LIVE_ACCOUNT_WITHOUT_PAYMENT_OR_CHARGE");
  });

  it("ignores generic Stripe variables when dedicated keys are absent", () => {
    const isolatedEnv: Record<string, string | undefined> = {
      ...baseEnv,
      STRIPE_SECRET_KEY: `sk_live_${"S".repeat(32)}`,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
    };
    delete isolatedEnv.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY;
    delete isolatedEnv.FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY;

    expect(resolveFlightConsumerProductionStripeAccountPreflightRuntime(
      isolatedEnv,
    )).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("accepts only bounded restricted live keys and binds rotations to a new scope", () => {
    const restricted = `rk_live_${"Q".repeat(32)}`;
    const initial =
      resolveFlightConsumerProductionStripeAccountPreflightRuntime(baseEnv);
    const rotated = resolveFlightConsumerProductionStripeAccountPreflightRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY: restricted,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_CREDENTIAL_SHA256:
        deriveFlightConsumerProductionStripeCredentialSha256(restricted),
    });

    expect(initial.authorized).toBe(true);
    expect(rotated.authorized).toBe(true);
    if (!initial.authorized || !rotated.authorized) {
      throw new Error("expected exact live credential bindings");
    }
    expect(rotated.binding.executionScopeSha256)
      .not.toBe(initial.binding.executionScopeSha256);
    expect(validateFlightConsumerProductionStripeLiveCredential(restricted))
      .toBe(restricted);
  });

  it("binds an approved account change to a distinct execution scope", () => {
    const initial =
      resolveFlightConsumerProductionStripeAccountPreflightRuntime(baseEnv);
    const changed = resolveFlightConsumerProductionStripeAccountPreflightRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256:
        deriveFlightConsumerProductionStripeAccountSha256(
          "acct_fedcba0987654321",
        ),
    });

    expect(initial.authorized).toBe(true);
    expect(changed.authorized).toBe(true);
    if (!initial.authorized || !changed.authorized) {
      throw new Error("expected approved account bindings");
    }
    expect(changed.binding.executionScopeSha256)
      .not.toBe(initial.binding.executionScopeSha256);
  });

  it("binds a publishable-key rotation to a distinct execution scope", () => {
    const rotatedKey = `pk_live_${"Q".repeat(32)}`;
    const initial =
      resolveFlightConsumerProductionStripeAccountPreflightRuntime(baseEnv);
    const rotated = resolveFlightConsumerProductionStripeAccountPreflightRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY: rotatedKey,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256:
        deriveFlightConsumerProductionStripePublishableKeySha256(rotatedKey),
    });
    expect(initial.authorized).toBe(true);
    expect(rotated.authorized).toBe(true);
    if (!initial.authorized || !rotated.authorized) {
      throw new Error("expected exact publishable-key bindings");
    }
    expect(rotated.binding.executionScopeSha256)
      .not.toBe(initial.binding.executionScopeSha256);
  });

  it.each([
    ["VERCEL_ENV", "preview"],
    ["NEXT_PUBLIC_APP_URL", "https://iratepilot.com"],
    ["FLIGHT_CONSUMER_PREVIEW_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED", "true"],
    ["FLIGHT_RUNTIME_MODE", "sandbox"],
    ["FLIGHT_RUNTIME_ENVIRONMENT", "preview"],
    ["FLIGHT_RUNTIME_ENABLED", "true"],
    ["FLIGHT_SYNTHETIC_ADAPTER_ENABLED", "true"],
    ["FLIGHT_PROVIDER_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_BOOKING_ENABLED", "true"],
    ["FLIGHT_PAYMENT_ENABLED", "true"],
    ["FLIGHT_SETTLEMENT_ENABLED", "true"],
    ["FLIGHT_TICKETING_ENABLED", "true"],
    ["FLIGHT_SERVICING_ENABLED", "true"],
    ["FLIGHT_WEBHOOKS_ENABLED", "true"],
    ["FLIGHT_PRODUCTION_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_TRANSACTION_KILL_SWITCH", "disengaged"],
    [
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY",
      `rk_test_${"T".repeat(32)}`,
    ],
    [
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY",
      `sk_live_${"S".repeat(32)}`,
    ],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY", "rk_live_short"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY", ""],
    [
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY",
      `pk_test_${"T".repeat(32)}`,
    ],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY", "pk_live_short"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256", ""],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_CREDENTIAL_SHA256", "0".repeat(64)],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256", ""],
    [
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256",
      "0".repeat(64),
    ],
    ["DUFFEL_LIVE_ACCESS_TOKEN", "duffel_test_not_allowed_123456"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET", "short"],
    ["SUPABASE_SERVICE_ROLE_KEY", "short"],
  ])("fails closed when %s is %s", (name, value) => {
    expect(
      resolveFlightConsumerProductionStripeAccountPreflightRuntime({
        ...baseEnv,
        [name]: value,
      }),
    ).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("defaults the new gate closed when the flag is absent", () => {
    const env: Record<string, string | undefined> = { ...baseEnv };
    delete env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED;
    expect(resolveFlightConsumerProductionStripeAccountPreflightRuntime(env))
      .toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("throws a generic unavailable error without echoing credential material", () => {
    const privateValue = "rk_live_private!invalid!secret";
    let thrown: unknown;
    try {
      requireFlightConsumerProductionStripeAccountPreflightRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY: privateValue,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(/unavailable/i);
    expect(String(thrown)).not.toContain(privateValue);
  });

  it.each([
    "",
    `sk_live_${"S".repeat(32)}`,
    `sk_test_${"T".repeat(32)}`,
    `rk_test_${"T".repeat(32)}`,
    "rk_live_short",
    `pk_live_${"P".repeat(32)}`,
    `rk_live_${"!".repeat(32)}`,
    `rk_live_${"R".repeat(257)}`,
  ])("rejects malformed or non-restricted live credential %j", (value) => {
    expect(() => validateFlightConsumerProductionStripeLiveCredential(value))
      .toThrow(/credential is invalid/i);
  });

  it.each([
    "",
    `pk_test_${"T".repeat(32)}`,
    "pk_live_short",
    `sk_live_${"S".repeat(32)}`,
    `pk_live_${"!".repeat(32)}`,
    `pk_live_${"P".repeat(257)}`,
  ])("rejects malformed or non-live publishable key %j", (value) => {
    expect(() =>
      validateFlightConsumerProductionStripeLivePublishableKey(value)
    ).toThrow(/publishable key is invalid/i);
  });

  it.each(["", "acct_short", "cus_1234567890abcdef", "acct_invalid!"])(
    "rejects malformed account identifier %j",
    (value) => {
      expect(() => deriveFlightConsumerProductionStripeAccountSha256(value))
        .toThrow(/account identifier is invalid/i);
    },
  );

  it("keeps the runtime server-only and free of Stripe transports or mutations", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/stripe-runtime.server.ts",
      import.meta.url,
    ), "utf8");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toContain("STRIPE_SECRET_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(source).not.toMatch(/\bfetch\s*\(|from\s+["']stripe["']/);
    expect(source).not.toMatch(/\.paymentIntents\.|\.charges\.|\.refunds\./);
    expect(source).not.toMatch(/supabase\/migrations|createAdminClient/);
  });
});

describe("Flight Consumer Production Stripe payment-plan dark runtime", () => {
  it("authorizes only deterministic zero-dispatch plan recording", () => {
    const decision =
      resolveFlightConsumerProductionStripePaymentPlanRuntime(paymentPlanEnv);

    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MODE,
      reasons: [],
      binding: {
        processorCode: "stripe",
        processorEnvironment: "live",
        executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        approvedAccountSha256:
          deriveFlightConsumerProductionStripeAccountSha256(accountId),
        paymentBinding: {
          processorId: "stripe_live",
          adapterVersion: "22.4.0",
          adapterSourceDigest: "b".repeat(64),
          accountScopeReceiptDigest:
            deriveFlightConsumerProductionStripeAccountSha256(accountId),
          environmentScopeReceiptDigest: "c".repeat(64),
        },
        paymentBindingSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        allowedOperations: [
          "build_and_record_zero_dispatch_payment_intent_plan",
        ],
        planRecordingEnabled: true,
        accountReadEnabled: false,
        stripeTransportEnabled: false,
        stripeMutationEnabled: false,
        paymentIntentEnabled: false,
        chargeEnabled: false,
        refundEnabled: false,
        webhookEnabled: false,
        providerOrderDispatchEnabled: false,
        consumerReleaseEnabled: false,
        bookingEnabled: false,
        paymentEnabled: false,
        settlementEnabled: false,
        ticketingEnabled: false,
        servicingEnabled: false,
        transactionKillSwitchEngaged: true,
      },
    });
    expect(Object.isFrozen(decision)).toBe(true);
    if (!decision.authorized) throw new Error("expected dark plan runtime");
    expect(Object.isFrozen(decision.binding)).toBe(true);
    expect(Object.isFrozen(decision.binding.paymentBinding)).toBe(true);
    expect(JSON.stringify(decision)).not.toContain(stripeCredential);
    expect(JSON.stringify(decision)).not.toContain(stripePublishableKey);
  });

  it("binds adapter or environment-scope changes to a distinct execution scope", () => {
    const initial =
      requireFlightConsumerProductionStripePaymentPlanRuntime(paymentPlanEnv);
    const changed =
      requireFlightConsumerProductionStripePaymentPlanRuntime({
        ...paymentPlanEnv,
        FLIGHT_PAYMENT_ADAPTER_VERSION: "22.4.1",
        FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256: "d".repeat(64),
      });

    expect(changed.binding.paymentBindingSha256)
      .not.toBe(initial.binding.paymentBindingSha256);
    expect(changed.binding.executionScopeSha256)
      .not.toBe(initial.binding.executionScopeSha256);
  });

  it.each([
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED", "true"],
    ["FLIGHT_PAYMENT_PROCESSOR_ID", "adyen_live"],
    ["FLIGHT_PAYMENT_ADAPTER_VERSION", "latest"],
    ["FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256", "bad"],
    ["FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256", "0".repeat(64)],
    ["FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256", "bad"],
    ["FLIGHT_RUNTIME_ENABLED", "true"],
    ["FLIGHT_PROVIDER_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_BOOKING_ENABLED", "true"],
    ["FLIGHT_PAYMENT_ENABLED", "true"],
    ["FLIGHT_PRODUCTION_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_TRANSACTION_KILL_SWITCH", "disengaged"],
  ])("fails closed when %s is %s", (name, value) => {
    expect(resolveFlightConsumerProductionStripePaymentPlanRuntime({
      ...paymentPlanEnv,
      [name]: value,
    })).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("defaults closed and rejects an incomplete canonical payment binding", () => {
    const disabled: Record<string, string | undefined> = { ...paymentPlanEnv };
    delete disabled.FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED;
    expect(resolveFlightConsumerProductionStripePaymentPlanRuntime(disabled))
      .toMatchObject({ authorized: false, mode: "disabled", binding: null });

    const incomplete: Record<string, string | undefined> = {
      ...paymentPlanEnv,
    };
    delete incomplete.FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256;
    expect(resolveFlightConsumerProductionStripePaymentPlanRuntime(incomplete))
      .toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("keeps the dark gate free of Stripe transport and persistence code", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/stripe-runtime.server.ts",
      import.meta.url,
    ), "utf8");

    expect(source).not.toMatch(/\bfetch\s*\(|from\s+["']stripe["']/);
    expect(source).not.toMatch(/\.paymentIntents\.|\.charges\.|\.refunds\./);
    expect(source).not.toMatch(/\brpc\s*\(|createAdminClient/);
  });
});
