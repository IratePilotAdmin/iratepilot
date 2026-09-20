import "server-only";

import { sha256FlightEvidence } from "../runtime-safety";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_PREREQUISITE_MODE =
  "flight_consumer_production_public_shopping_preview_prerequisite" as const;

const sha256Pattern = /^[0-9a-f]{64}$/;
const gitCommitShaPattern = /^[0-9a-f]{40}$/;

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerProductionPublicShoppingPreviewRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_PREREQUISITE_MODE;
    reasons: readonly [];
    binding: Readonly<{
      lifecycle: "code_only_prerequisite";
      providerCode: "duffel";
      providerEnvironment: "live";
      executionScopeSha256: string;
      plannedOperations: readonly ["create_offer_request", "retrieve_offer"];
      allowedProviderOperations: readonly [];
      providerDispatchEnabled: false;
      persistenceEnabled: false;
      budgetClaimEnabled: false;
      consumerExposureEnabled: false;
      orderEndpointEnabled: false;
      stripeEnabled: false;
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

export class FlightConsumerProductionPublicShoppingPreviewUnavailableError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(
      "Flight Consumer Production public-shopping preview prerequisite is unavailable.",
    );
    this.name =
      "FlightConsumerProductionPublicShoppingPreviewUnavailableError";
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
    reasons.push(`${name} is not set to its approved prerequisite value.`);
  }
}

export function resolveFlightConsumerProductionPublicShoppingPreviewRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionPublicShoppingPreviewRuntimeDecision {
  const reasons: string[] = [];

  try {
    requireFlightConsumerProductionDarkRuntime(env);
  } catch {
    reasons.push("The Production dark runtime is unavailable.");
  }

  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
    "true",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
    "false",
    reasons,
  );

  const policySha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256 ?? "";
  const cohortSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256 ?? "";
  const sourceCommitSha =
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA ?? "";
  const deployedCommitSha = env.VERCEL_GIT_COMMIT_SHA ?? "";

  if (!sha256Pattern.test(policySha256)) {
    reasons.push("The approved public-shopping policy binding is unavailable.");
  }
  if (!sha256Pattern.test(cohortSha256)) {
    reasons.push("The approved public-shopping cohort binding is unavailable.");
  }
  if (
    !gitCommitShaPattern.test(sourceCommitSha)
    || !gitCommitShaPattern.test(deployedCommitSha)
    || sourceCommitSha !== deployedCommitSha
  ) {
    reasons.push("The deployed source does not match the approved source binding.");
  }

  if (reasons.length > 0) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }

  const executionScopeSha256 = sha256FlightEvidence({
    version:
      "flight-consumer-production-public-shopping-preview-prerequisite-v1",
    deploymentOrigin: "https://www.iratepilot.com",
    providerCode: "duffel",
    providerEnvironment: "live",
    lifecycle: "code_only_prerequisite",
    plannedOperations: ["create_offer_request", "retrieve_offer"],
    allowedProviderOperations: [],
    policySha256,
    cohortSha256,
    sourceCommitSha,
  });

  return Object.freeze({
    authorized: true as const,
    mode:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_PREREQUISITE_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      lifecycle: "code_only_prerequisite" as const,
      providerCode: "duffel" as const,
      providerEnvironment: "live" as const,
      executionScopeSha256,
      plannedOperations: Object.freeze([
        "create_offer_request",
        "retrieve_offer",
      ] as const),
      allowedProviderOperations: Object.freeze([]) as readonly [],
      providerDispatchEnabled: false as const,
      persistenceEnabled: false as const,
      budgetClaimEnabled: false as const,
      consumerExposureEnabled: false as const,
      orderEndpointEnabled: false as const,
      stripeEnabled: false as const,
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

export function requireFlightConsumerProductionPublicShoppingPreviewRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision =
    resolveFlightConsumerProductionPublicShoppingPreviewRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionPublicShoppingPreviewUnavailableError(
      decision.reasons,
    );
  }
  return decision;
}
