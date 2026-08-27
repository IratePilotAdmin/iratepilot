import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_PREREQUISITE_MODE,
  requireFlightConsumerProductionPublicShoppingPreviewRuntime,
  resolveFlightConsumerProductionPublicShoppingPreviewRuntime,
} from "../lib/flights/consumer-production/public-shopping-runtime.server";

const token = `duffel_live_${"P".repeat(32)}`;
const sourceCommitSha = "1".repeat(40);
const policySha256 = "2".repeat(64);
const cohortSha256 = "3".repeat(64);

const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: sourceCommitSha,
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: policySha256,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256: cohortSha256,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA:
    sourceCommitSha,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
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
  DUFFEL_LIVE_ACCESS_TOKEN: token,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

describe("Flight Consumer Production public-shopping preview prerequisite", () => {
  it("authorizes only a code-only prerequisite with every external capability closed", () => {
    const decision =
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime(baseEnv);

    expect(decision).toEqual({
      authorized: true,
      mode:
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_PREREQUISITE_MODE,
      reasons: [],
      binding: {
        lifecycle: "code_only_prerequisite",
        providerCode: "duffel",
        providerEnvironment: "live",
        executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        plannedOperations: ["create_offer_request", "retrieve_offer"],
        allowedProviderOperations: [],
        providerDispatchEnabled: false,
        persistenceEnabled: false,
        budgetClaimEnabled: false,
        consumerExposureEnabled: false,
        orderEndpointEnabled: false,
        stripeEnabled: false,
        consumerReleaseEnabled: false,
        bookingEnabled: false,
        paymentEnabled: false,
        settlementEnabled: false,
        ticketingEnabled: false,
        servicingEnabled: false,
        transactionKillSwitchEngaged: true,
      },
    });
    expect(resolveFlightConsumerProductionPublicShoppingPreviewRuntime(baseEnv))
      .toEqual(decision);
    expect(JSON.stringify(decision)).not.toContain(token);
  });

  it("binds the prerequisite scope to policy, cohort, and exact deployed source", () => {
    const approved =
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime(baseEnv);
    const policyChanged =
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256:
          "4".repeat(64),
      });
    const cohortChanged =
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256:
          "5".repeat(64),
      });
    const otherSourceCommitSha = "6".repeat(40);
    const sourceChanged =
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime({
        ...baseEnv,
        VERCEL_GIT_COMMIT_SHA: otherSourceCommitSha,
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA:
          otherSourceCommitSha,
      });

    expect(approved.authorized).toBe(true);
    expect(policyChanged.authorized).toBe(true);
    expect(cohortChanged.authorized).toBe(true);
    expect(sourceChanged.authorized).toBe(true);
    if (
      !approved.authorized
      || !policyChanged.authorized
      || !cohortChanged.authorized
      || !sourceChanged.authorized
    ) {
      throw new Error("expected source-bound prerequisite runtimes");
    }
    expect(policyChanged.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
    expect(cohortChanged.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
    expect(sourceChanged.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
  });

  it.each([
    ["FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256", "invalid"],
    ["FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256", "invalid"],
    ["VERCEL_GIT_COMMIT_SHA", "7".repeat(40)],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED", "true"],
    ["FLIGHT_PROVIDER_TRAFFIC_ENABLED", "true"],
    ["FLIGHT_BOOKING_ENABLED", "true"],
    ["FLIGHT_PAYMENT_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED", "true"],
    ["FLIGHT_TRANSACTION_KILL_SWITCH", "disengaged"],
  ])("fails closed when %s is %s", (name, value) => {
    expect(
      resolveFlightConsumerProductionPublicShoppingPreviewRuntime({
        ...baseEnv,
        [name]: value,
      }),
    ).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("is default-off when its dedicated gate is absent", () => {
    const env = { ...baseEnv } as Record<string, string>;
    delete env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED;
    expect(resolveFlightConsumerProductionPublicShoppingPreviewRuntime(env))
      .toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("throws a generic error without echoing private or malformed bindings", () => {
    const privateValue = "private-policy-binding-value";
    try {
      requireFlightConsumerProductionPublicShoppingPreviewRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: privateValue,
      });
      throw new Error("expected prerequisite runtime rejection");
    } catch (error) {
      expect(String(error)).toMatch(/unavailable/i);
      expect(String(error)).not.toContain(privateValue);
    }
  });

  it("contains no live transport, persistence, or payment implementation", () => {
    const source = readFileSync(
      "lib/flights/consumer-production/public-shopping-runtime.server.ts",
      "utf8",
    );
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/createClient\s*\(/);
    expect(source).not.toMatch(/from ["'][^"']*(stripe|duffel-live-client)/i);
  });
});
