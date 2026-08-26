import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deriveFlightConsumerProductionDuffelCredentialSha256,
  deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256,
  deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_MODE,
  requireFlightConsumerProductionDuffelOrderPlanRehearsalRuntime,
  resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime,
  resolveFlightConsumerProductionShoppingDarkRuntime,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"R".repeat(32)}`;
const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "true",
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
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "a".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(token),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

describe("Flight Consumer Production Duffel order-plan rehearsal runtime", () => {
  it("authorizes only offer creation and inert order-request planning", () => {
    const decision =
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime(baseEnv);
    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_MODE,
      reasons: [],
      binding: {
        providerCode: "duffel",
        providerEnvironment: "live",
        executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        allowedOperations: [
          "create_offer_request",
          "build_order_request_plan",
        ],
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
    expect(
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime(baseEnv),
    ).toEqual(decision);
    expect(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION)
      .toBe(
        "PLAN_ONE_DUFFEL_LIVE_OFFER_WITH_FICTIONAL_TRAVELER_WITHOUT_ORDER_OR_PAYMENT",
      );
    expect(JSON.stringify(decision)).not.toContain(token);
  });

  it("uses a distinct scope and server-owned idempotency domain from the shopping canary", () => {
    const rehearsal =
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime(baseEnv);
    const shopping = resolveFlightConsumerProductionShoppingDarkRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
    });
    expect(rehearsal.authorized).toBe(true);
    expect(shopping.authorized).toBe(true);
    if (!rehearsal.authorized || !shopping.authorized) {
      throw new Error("expected both isolated runtime profiles to resolve");
    }

    expect(rehearsal.binding.executionScopeSha256)
      .not.toBe(shopping.binding.executionScopeSha256);
    const rehearsalIdempotency =
      deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256(
        rehearsal.binding.executionScopeSha256,
      );
    expect(rehearsalIdempotency).toMatch(/^[0-9a-f]{64}$/);
    expect(
      deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256(
        rehearsal.binding.executionScopeSha256,
      ),
    ).toBe(rehearsalIdempotency);
    expect(rehearsalIdempotency).not.toBe(
      deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256(
        rehearsal.binding.executionScopeSha256,
      ),
    );
    expect(rehearsalIdempotency).not.toBe(
      deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256(
        shopping.binding.executionScopeSha256,
      ),
    );
  });

  it("binds the rehearsal scope to the exact approved account and credential", () => {
    const approved =
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime(baseEnv);
    const otherToken = `duffel_live_${"S".repeat(32)}`;
    const rotated =
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime({
        ...baseEnv,
        DUFFEL_LIVE_ACCESS_TOKEN: otherToken,
        FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
          deriveFlightConsumerProductionDuffelCredentialSha256(otherToken),
      });
    const otherAccount =
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime({
        ...baseEnv,
        FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "b".repeat(64),
      });
    expect(approved.authorized).toBe(true);
    expect(rotated.authorized).toBe(true);
    expect(otherAccount.authorized).toBe(true);
    if (!approved.authorized || !rotated.authorized || !otherAccount.authorized) {
      throw new Error("expected credential-bound rehearsal runtimes");
    }
    expect(rotated.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
    expect(otherAccount.binding.executionScopeSha256)
      .not.toBe(approved.binding.executionScopeSha256);
  });

  it.each([
    ["VERCEL_ENV", "preview"],
    ["NEXT_PUBLIC_APP_URL", "https://iratepilot.com"],
    ["FLIGHT_CONSUMER_PREVIEW_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED", "true"],
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
    ["DUFFEL_LIVE_ACCESS_TOKEN", "duffel_test_not_allowed_123456"],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256", ""],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256", "0".repeat(64)],
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET", "short"],
    ["SUPABASE_SERVICE_ROLE_KEY", "short"],
  ])("fails closed when %s is %s", (name, value) => {
    expect(
      resolveFlightConsumerProductionDuffelOrderPlanRehearsalRuntime({
        ...baseEnv,
        [name]: value,
      }),
    ).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("throws a generic unavailable error without echoing credentials", () => {
    const privateValue = "duffel_live_private!bad!value";
    let thrown: unknown;
    try {
      requireFlightConsumerProductionDuffelOrderPlanRehearsalRuntime({
        ...baseEnv,
        DUFFEL_LIVE_ACCESS_TOKEN: privateValue,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(/unavailable/i);
    expect(String(thrown)).not.toContain(privateValue);
  });

  it.each(["", "a", "g".repeat(64), "a".repeat(63)])(
    "rejects malformed rehearsal execution scope %j",
    (executionScopeSha256) => {
      expect(() =>
        deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256(
          executionScopeSha256,
        )
      ).toThrow(/execution scope is invalid/i);
    },
  );
});
