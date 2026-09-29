import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_MODE,
  requireFlightConsumerProductionShoppingDarkRuntime,
  resolveFlightConsumerProductionShoppingDarkRuntime,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"D".repeat(32)}`;
const accountId = "acc_0000B9iZ8kto4H8uYhKSzO";
const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
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
  DUFFEL_LIVE_ACCESS_TOKEN: token,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID: accountId,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256:
    deriveFlightConsumerProductionDuffelAccountSha256(accountId),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(token),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

describe("Flight Consumer Production Duffel shopping dark runtime", () => {
  it("derives the approved account fingerprint with the frozen domain", () => {
    expect(deriveFlightConsumerProductionDuffelAccountSha256(accountId)).toBe(
      createHash("sha256")
        .update(
          "iratepilot:production:duffel:live:account-fingerprint:v1",
          "utf8",
        )
        .update("\0", "utf8")
        .update(accountId, "utf8")
        .digest("hex"),
    );
    expect(deriveFlightConsumerProductionDuffelAccountSha256(accountId))
      .toBe(deriveFlightConsumerProductionDuffelAccountSha256(accountId));
  });

  it.each([
    "",
    "acc_",
    "acc_1234567",
    "acc_1234567-",
    "ACC_0000B9iZ8kto4H8uYhKSzO",
    `acc_${"A".repeat(128)}`,
  ])("rejects malformed account identifier %j", (value) => {
    expect(() => deriveFlightConsumerProductionDuffelAccountSha256(value))
      .toThrow(/account identifier is invalid/i);
  });

  it("authorizes only create_offer_request while every transaction capability stays closed", () => {
    const decision = resolveFlightConsumerProductionShoppingDarkRuntime(baseEnv);
    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_MODE,
      reasons: [],
      binding: {
        providerCode: "duffel",
        providerEnvironment: "live",
        executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        allowedOperations: ["create_offer_request"],
        consumerReleaseEnabled: false,
        bookingEnabled: false,
        paymentEnabled: false,
        settlementEnabled: false,
        ticketingEnabled: false,
        servicingEnabled: false,
        transactionKillSwitchEngaged: true,
      },
    });
    expect(resolveFlightConsumerProductionShoppingDarkRuntime(baseEnv))
      .toEqual(decision);
  });

  it("binds the execution scope to the exact approved account and credential", () => {
    const approved = resolveFlightConsumerProductionShoppingDarkRuntime(baseEnv);
    expect(approved.authorized).toBe(true);
    if (!approved.authorized) throw new Error("expected approved runtime");

    const otherToken = `duffel_live_${"E".repeat(32)}`;
    const rotated = resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      DUFFEL_LIVE_ACCESS_TOKEN: otherToken,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
        deriveFlightConsumerProductionDuffelCredentialSha256(otherToken),
    });
    const otherAccount = resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID:
        "acc_0000B9iZ8kto4H8uYhKSzP",
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256:
        deriveFlightConsumerProductionDuffelAccountSha256(
          "acc_0000B9iZ8kto4H8uYhKSzP",
        ),
    });
    expect(rotated.authorized).toBe(true);
    expect(otherAccount.authorized).toBe(true);
    if (!rotated.authorized || !otherAccount.authorized) {
      throw new Error("expected credential-bound runtimes");
    }
    expect(rotated.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
    expect(otherAccount.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
    expect(JSON.stringify(approved)).not.toContain(token);
    expect(JSON.stringify(approved)).not.toContain(accountId);
  });

  it.each([
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED", "true"],
    ["FLIGHT_BOOKING_ENABLED", "true"],
    ["FLIGHT_PAYMENT_ENABLED", "true"],
    ["FLIGHT_TRANSACTION_KILL_SWITCH", "disengaged"],
    ["DUFFEL_LIVE_ACCESS_TOKEN", "duffel_test_not_allowed_123456"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID", ""],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256", ""],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256", "0".repeat(64)],
  ])("fails closed when %s is %s", (name, value) => {
    expect(resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      [name]: value,
    })).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("throws a generic error without echoing credentials", () => {
    const privateValue = "duffel_live_private!bad!value";
    expect(() => requireFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      DUFFEL_LIVE_ACCESS_TOKEN: privateValue,
    })).toThrow(/unavailable/i);
    try {
      requireFlightConsumerProductionShoppingDarkRuntime({
        ...baseEnv,
        DUFFEL_LIVE_ACCESS_TOKEN: privateValue,
      });
    } catch (error) {
      expect(String(error)).not.toContain(privateValue);
    }
  });

  it("rejects a prefix-valid token that is not the approved credential", () => {
    const unapproved = `duffel_live_${"U".repeat(32)}`;
    const decision = resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      DUFFEL_LIVE_ACCESS_TOKEN: unapproved,
    });
    expect(decision).toMatchObject({
      authorized: false,
      mode: "disabled",
      binding: null,
    });
    expect(JSON.stringify(decision)).not.toContain(unapproved);
  });

  it("rejects an account identifier that does not match the approved digest without leaking it", () => {
    const unapprovedAccountId = "acc_0000B9iZ8kto4H8uYhKSzP";
    const decision = resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID: unapprovedAccountId,
    });
    expect(decision).toMatchObject({
      authorized: false,
      mode: "disabled",
      binding: null,
    });
    expect(JSON.stringify(decision)).not.toContain(unapprovedAccountId);
    expect(JSON.stringify(decision)).not.toContain(accountId);
  });
});
