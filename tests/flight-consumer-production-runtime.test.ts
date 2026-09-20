import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FLIGHT_CONSUMER_PRODUCTION_DARK_MODE,
  FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
  requireFlightConsumerProductionDarkRuntime,
  resolveFlightConsumerProductionDarkRuntime,
} from "../lib/flights/consumer-production/runtime.server";

const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
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
  DUFFEL_LIVE_ACCESS_TOKEN: `duffel_live_${"D".repeat(32)}`,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

describe("Flight Consumer Production dark runtime", () => {
  it("authorizes only verified-ping infrastructure with every transaction capability closed", () => {
    const decision = resolveFlightConsumerProductionDarkRuntime(baseEnv);
    expect(decision).toEqual({
      authorized: true,
      mode: FLIGHT_CONSUMER_PRODUCTION_DARK_MODE,
      reasons: [],
      binding: {
        providerCode: "duffel",
        providerEnvironment: "live",
        webhookMode: "durable_quarantine",
        executionScopeSha256:
          FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
        consumerReleaseEnabled: false,
        providerTrafficEnabled: false,
        bookingEnabled: false,
        paymentEnabled: false,
        settlementEnabled: false,
        ticketingEnabled: false,
        servicingEnabled: false,
        transactionKillSwitchEngaged: true,
      },
    });
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain(baseEnv.DUFFEL_LIVE_ACCESS_TOKEN);
    expect(serialized).not.toContain(
      baseEnv.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET,
    );
  });

  it.each([
    ["VERCEL_ENV", "preview"],
    ["NEXT_PUBLIC_APP_URL", "https://iratepilot.com"],
    ["FLIGHT_CONSUMER_PREVIEW_ENABLED", "true"],
    ["FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED", "false"],
    ["FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED", "true"],
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
    ["FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET", "short"],
    ["SUPABASE_SERVICE_ROLE_KEY", "short"],
  ])("fails closed when %s is %s", (name, value) => {
    expect(resolveFlightConsumerProductionDarkRuntime({
      ...baseEnv,
      [name]: value,
    })).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("throws a generic unavailable error without echoing credentials", () => {
    const privateValue = "duffel_live_private!bad!value";
    let thrown: unknown;
    try {
      requireFlightConsumerProductionDarkRuntime({
        ...baseEnv,
        DUFFEL_LIVE_ACCESS_TOKEN: privateValue,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toContain(privateValue);
  });
});
