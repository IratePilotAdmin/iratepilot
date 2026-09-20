import "server-only";

import { createHash } from "node:crypto";

import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import { resolveFlightRuntimePolicy } from "../runtime-safety";

export const FLIGHT_CONSUMER_PRODUCTION_DARK_MODE =
  "flight_consumer_production_dark" as const;
export const FLIGHT_CONSUMER_PRODUCTION_ORIGIN =
  "https://www.iratepilot.com" as const;
export const FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256 =
  createHash("sha256")
    .update("iratepilot:production:duffel:live:webhook:v1:www.iratepilot.com", "utf8")
    .digest("hex");

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerProductionDarkRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_DARK_MODE;
    reasons: readonly [];
    binding: Readonly<{
      providerCode: "duffel";
      providerEnvironment: "live";
      webhookMode: "durable_quarantine";
      executionScopeSha256: string;
      consumerReleaseEnabled: false;
      providerTrafficEnabled: false;
      bookingEnabled: false;
      paymentEnabled: false;
      settlementEnabled: false;
      ticketingEnabled: false;
      servicingEnabled: false;
      transactionKillSwitchEngaged: true;
    }>;
  }>
  | Readonly<{
    authorized: false;
    mode: "disabled";
    reasons: readonly string[];
    binding: null;
  }>;

export class FlightConsumerProductionDarkUnavailableError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Production dark runtime is unavailable.");
    this.name = "FlightConsumerProductionDarkUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

function requireExact(
  env: ProductionEnvironment,
  name: string,
  expected: string,
  reasons: string[],
) {
  if (env[name] !== expected) {
    reasons.push(`${name} is not set to its approved dark-launch value.`);
  }
}

function hasDedicatedWebhookSecret(env: ProductionEnvironment) {
  const value = env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET;
  return typeof value === "string"
    && value.length >= 16
    && value.length <= 2_048
    && /^[^\s\u0000-\u001f\u007f]+$/.test(value);
}

function hasSupabaseServiceAuthority(env: ProductionEnvironment) {
  const value = env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof value === "string" && value.length >= 32 && value.length <= 8_192;
}

export function resolveFlightConsumerProductionDarkRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionDarkRuntimeDecision {
  const reasons: string[] = [];

  requireExact(env, "VERCEL_ENV", "production", reasons);
  requireExact(env, "NEXT_PUBLIC_APP_URL", FLIGHT_CONSUMER_PRODUCTION_ORIGIN, reasons);
  requireExact(env, "FLIGHT_CONSUMER_PREVIEW_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED", "true", reasons);
  requireExact(env, "FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_RUNTIME_MODE", "production", reasons);
  requireExact(env, "FLIGHT_RUNTIME_ENVIRONMENT", "production", reasons);
  requireExact(env, "FLIGHT_RUNTIME_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_SYNTHETIC_ADAPTER_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_PROVIDER_TRAFFIC_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_BOOKING_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_PAYMENT_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_SETTLEMENT_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_TICKETING_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_SERVICING_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_WEBHOOKS_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_PRODUCTION_TRAFFIC_ENABLED", "false", reasons);
  requireExact(env, "FLIGHT_TRANSACTION_KILL_SWITCH", "engaged", reasons);

  const policy = resolveFlightRuntimePolicy(env);
  if (policy.invalidSettings.length > 0) {
    reasons.push("The shared flight runtime policy contains invalid settings.");
  }
  if (
    policy.runtimeEnabled
    || policy.syntheticAdapterEnabled
    || policy.providerTrafficEnabled
    || policy.bookingEnabled
    || policy.paymentEnabled
    || policy.settlementEnabled
    || policy.ticketingEnabled
    || policy.servicingEnabled
    || policy.webhookEnabled
    || policy.productionTrafficEnabled
    || !policy.transactionKillSwitchEngaged
  ) {
    reasons.push("A transaction capability conflicts with the production dark launch.");
  }

  try {
    validateDuffelLiveAccessToken(env.DUFFEL_LIVE_ACCESS_TOKEN);
  } catch {
    reasons.push("The dedicated Duffel live credential is unavailable.");
  }
  if (!hasDedicatedWebhookSecret(env)) {
    reasons.push("The dedicated Duffel live webhook secret is unavailable.");
  }
  if (!hasSupabaseServiceAuthority(env)) {
    reasons.push("The Production database service authority is unavailable.");
  }

  if (reasons.length > 0) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }

  return Object.freeze({
    authorized: true as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_DARK_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      providerCode: "duffel" as const,
      providerEnvironment: "live" as const,
      webhookMode: "durable_quarantine" as const,
      executionScopeSha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
      consumerReleaseEnabled: false as const,
      providerTrafficEnabled: false as const,
      bookingEnabled: false as const,
      paymentEnabled: false as const,
      settlementEnabled: false as const,
      ticketingEnabled: false as const,
      servicingEnabled: false as const,
      transactionKillSwitchEngaged: true as const,
    }),
  });
}

export function requireFlightConsumerProductionDarkRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision = resolveFlightConsumerProductionDarkRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionDarkUnavailableError(decision.reasons);
  }
  return decision;
}
