import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import { sha256FlightEvidence } from "../runtime-safety";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_MODE =
  "flight_consumer_production_duffel_shopping_dark" as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_CONFIRMATION =
  "SEARCH_DUFFEL_LIVE_INVENTORY_WITHOUT_BOOKING" as const;
const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ONE_SHOT_GRANT_SHA256 =
  createHash("sha256")
    .update(
      "iratepilot:production:duffel:live:shopping-dark:one-shot-grant:v1:www.iratepilot.com",
      "utf8",
    )
    .digest("hex");

const sha256Pattern = /^[0-9a-f]{64}$/;
const credentialFingerprintDomain =
  "iratepilot:production:duffel:live:credential-fingerprint:v1" as const;

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerProductionShoppingDarkRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_MODE;
    reasons: readonly [];
    binding: Readonly<{
      providerCode: "duffel";
      providerEnvironment: "live";
      executionScopeSha256: string;
      allowedOperations: readonly ["create_offer_request"];
      consumerReleaseEnabled: false;
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

export class FlightConsumerProductionShoppingDarkUnavailableError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Production Duffel shopping dark runtime is unavailable.");
    this.name = "FlightConsumerProductionShoppingDarkUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

export function deriveFlightConsumerProductionDuffelCredentialSha256(
  credential: string,
) {
  return createHash("sha256")
    .update(credentialFingerprintDomain, "utf8")
    .update("\0", "utf8")
    .update(credential, "utf8")
    .digest("hex");
}

function equalSha256(left: string, right: string) {
  if (!sha256Pattern.test(left) || !sha256Pattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function resolveCredentialBoundExecutionScope(
  env: ProductionEnvironment,
  reasons: string[],
) {
  const providerAccountSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256 ?? "";
  const approvedCredentialSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256 ?? "";
  if (!sha256Pattern.test(providerAccountSha256)) {
    reasons.push("The approved Duffel live account binding is unavailable.");
  }
  if (!sha256Pattern.test(approvedCredentialSha256)) {
    reasons.push("The approved Duffel live credential binding is unavailable.");
  }

  let observedCredentialSha256: string | null = null;
  try {
    const credential = validateDuffelLiveAccessToken(env.DUFFEL_LIVE_ACCESS_TOKEN);
    observedCredentialSha256 =
      deriveFlightConsumerProductionDuffelCredentialSha256(credential);
    if (
      sha256Pattern.test(approvedCredentialSha256)
      && !equalSha256(observedCredentialSha256, approvedCredentialSha256)
    ) {
      reasons.push("The Duffel live credential does not match its approved binding.");
    }
  } catch {
    reasons.push("The dedicated Duffel live credential is unavailable.");
  }

  if (
    !sha256Pattern.test(providerAccountSha256)
    || !sha256Pattern.test(approvedCredentialSha256)
    || observedCredentialSha256 === null
    || !equalSha256(observedCredentialSha256, approvedCredentialSha256)
  ) {
    return null;
  }

  return sha256FlightEvidence({
    version: "flight-consumer-production-duffel-shopping-execution-scope-v2",
    deploymentOrigin: "https://www.iratepilot.com",
    providerCode: "duffel",
    providerEnvironment: "live",
    operation: "create_offer_request",
    providerAccountSha256,
    providerCredentialSha256: observedCredentialSha256,
    oneShotGrantSha256:
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ONE_SHOT_GRANT_SHA256,
  });
}

export function deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256(
  executionScopeSha256: string,
) {
  if (!sha256Pattern.test(executionScopeSha256)) {
    throw new TypeError("The Duffel live-shopping execution scope is invalid.");
  }
  return sha256FlightEvidence({
    version: "flight-consumer-production-duffel-shopping-one-shot-idempotency-v1",
    executionScopeSha256,
    oneShotGrantSha256:
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ONE_SHOT_GRANT_SHA256,
  });
}

export function resolveFlightConsumerProductionShoppingDarkRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionShoppingDarkRuntimeDecision {
  const reasons: string[] = [];
  try {
    requireFlightConsumerProductionDarkRuntime(env);
  } catch {
    reasons.push("The Production dark runtime is unavailable.");
  }
  if (env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED !== "true") {
    reasons.push("The dedicated Duffel live-shopping dark gate is disabled.");
  }
  if (env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED !== "false") {
    reasons.push("The Duffel live-shopping order capability is not explicitly disabled.");
  }
  const executionScopeSha256 = resolveCredentialBoundExecutionScope(env, reasons);

  if (reasons.length > 0 || executionScopeSha256 === null) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }

  return Object.freeze({
    authorized: true as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      providerCode: "duffel" as const,
      providerEnvironment: "live" as const,
      executionScopeSha256,
      allowedOperations: Object.freeze(["create_offer_request"] as const),
      consumerReleaseEnabled: false as const,
      bookingEnabled: false as const,
      paymentEnabled: false as const,
      settlementEnabled: false as const,
      ticketingEnabled: false as const,
      servicingEnabled: false as const,
      transactionKillSwitchEngaged: true as const,
    }),
  });
}

export function requireFlightConsumerProductionShoppingDarkRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision = resolveFlightConsumerProductionShoppingDarkRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionShoppingDarkUnavailableError(decision.reasons);
  }
  return decision;
}
