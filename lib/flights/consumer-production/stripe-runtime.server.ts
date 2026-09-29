import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  digestFlightRuntimePaymentBinding,
  resolveFlightRuntimePolicy,
  sha256FlightEvidence,
  type FlightRuntimePaymentBinding,
} from "../runtime-safety";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE =
  "flight_consumer_production_stripe_account_preflight" as const;
export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION =
  "VERIFY_STRIPE_LIVE_ACCOUNT_WITHOUT_PAYMENT_OR_CHARGE" as const;
export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MODE =
  "flight_consumer_production_stripe_payment_plan_dark" as const;

const sha256Pattern = /^[0-9a-f]{64}$/;
const liveRestrictedCredentialPattern = /^rk_live_[A-Za-z0-9_]{8,256}$/;
const livePublishableKeyPattern = /^pk_live_[A-Za-z0-9_]{8,256}$/;
const accountIdPattern = /^acct_[A-Za-z0-9]{8,127}$/;
const credentialFingerprintDomain =
  "iratepilot:production:stripe:live:credential-fingerprint:v1" as const;
const accountFingerprintDomain =
  "iratepilot:production:stripe:live:account-fingerprint:v1" as const;
const publishableKeyFingerprintDomain =
  "iratepilot:production:stripe:live:publishable-key-fingerprint:v1" as const;

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerProductionStripeAccountPreflightRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE;
    reasons: readonly [];
    binding: Readonly<{
      processorCode: "stripe";
      processorEnvironment: "live";
      executionScopeSha256: string;
      approvedAccountSha256: string;
      publishableKeyBindingMatched: true;
      allowedOperations: readonly ["retrieve_platform_account"];
      accountReadEnabled: true;
      stripeMutationEnabled: false;
      paymentIntentEnabled: false;
      chargeEnabled: false;
      refundEnabled: false;
      webhookEnabled: false;
      providerOrderDispatchEnabled: false;
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

export type FlightConsumerProductionStripePaymentPlanRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MODE;
    reasons: readonly [];
    binding: Readonly<{
      processorCode: "stripe";
      processorEnvironment: "live";
      executionScopeSha256: string;
      approvedAccountSha256: string;
      paymentBinding: Readonly<FlightRuntimePaymentBinding>;
      paymentBindingSha256: string;
      allowedOperations: readonly [
        "build_and_record_zero_dispatch_payment_intent_plan",
      ];
      planRecordingEnabled: true;
      accountReadEnabled: false;
      stripeTransportEnabled: false;
      stripeMutationEnabled: false;
      paymentIntentEnabled: false;
      chargeEnabled: false;
      refundEnabled: false;
      webhookEnabled: false;
      providerOrderDispatchEnabled: false;
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

export class FlightConsumerProductionStripeAccountPreflightUnavailableError
  extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Production Stripe account preflight is unavailable.");
    this.name =
      "FlightConsumerProductionStripeAccountPreflightUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

export class FlightConsumerProductionStripePaymentPlanUnavailableError
  extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Production Stripe payment-plan dark runtime is unavailable.");
    this.name = "FlightConsumerProductionStripePaymentPlanUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

function domainSeparatedSha256(domain: string, value: string) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function equalSha256(left: string, right: string) {
  if (!sha256Pattern.test(left) || !sha256Pattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function validateFlightConsumerProductionStripeLiveCredential(
  value: string | undefined,
) {
  if (
    typeof value !== "string"
    || !liveRestrictedCredentialPattern.test(value)
  ) {
    throw new TypeError(
      "The dedicated Stripe live restricted credential is invalid.",
    );
  }
  return value;
}

export function deriveFlightConsumerProductionStripeCredentialSha256(
  credential: string,
) {
  return domainSeparatedSha256(
    credentialFingerprintDomain,
    validateFlightConsumerProductionStripeLiveCredential(credential),
  );
}

export function validateFlightConsumerProductionStripeLivePublishableKey(
  value: string | undefined,
) {
  if (typeof value !== "string" || !livePublishableKeyPattern.test(value)) {
    throw new TypeError("The Stripe live publishable key is invalid.");
  }
  return value;
}

export function deriveFlightConsumerProductionStripePublishableKeySha256(
  publishableKey: string,
) {
  return domainSeparatedSha256(
    publishableKeyFingerprintDomain,
    validateFlightConsumerProductionStripeLivePublishableKey(publishableKey),
  );
}

export function deriveFlightConsumerProductionStripeAccountSha256(
  accountId: string,
) {
  if (!accountIdPattern.test(accountId)) {
    throw new TypeError("The Stripe account identifier is invalid.");
  }
  return domainSeparatedSha256(accountFingerprintDomain, accountId);
}

function requireExact(
  env: ProductionEnvironment,
  name: string,
  expected: string,
  reasons: string[],
) {
  if (env[name] !== expected) {
    reasons.push(`${name} is not set to its approved read-only value.`);
  }
}

export function resolveFlightConsumerProductionStripeAccountPreflightRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionStripeAccountPreflightRuntimeDecision {
  const reasons: string[] = [];
  try {
    requireFlightConsumerProductionDarkRuntime(env);
  } catch {
    reasons.push("The Production dark runtime is unavailable.");
  }

  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED",
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
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED",
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
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
    "false",
    reasons,
  );
  const approvedAccountSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256 ?? "";
  const approvedCredentialSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_CREDENTIAL_SHA256 ?? "";
  const approvedPublishableKeySha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256 ?? "";
  if (!sha256Pattern.test(approvedAccountSha256)) {
    reasons.push("The approved Stripe live account binding is unavailable.");
  }
  if (!sha256Pattern.test(approvedCredentialSha256)) {
    reasons.push("The approved Stripe live credential binding is unavailable.");
  }
  if (!sha256Pattern.test(approvedPublishableKeySha256)) {
    reasons.push("The approved Stripe live publishable-key binding is unavailable.");
  }

  let observedCredentialSha256: string | null = null;
  try {
    observedCredentialSha256 =
      deriveFlightConsumerProductionStripeCredentialSha256(
        validateFlightConsumerProductionStripeLiveCredential(
          env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY,
        ),
      );
    if (
      sha256Pattern.test(approvedCredentialSha256)
      && !equalSha256(observedCredentialSha256, approvedCredentialSha256)
    ) {
      reasons.push("The Stripe live credential does not match its approved binding.");
    }
  } catch {
    reasons.push("The dedicated Stripe live credential is unavailable.");
  }

  let observedPublishableKeySha256: string | null = null;
  try {
    observedPublishableKeySha256 =
      deriveFlightConsumerProductionStripePublishableKeySha256(
        validateFlightConsumerProductionStripeLivePublishableKey(
          env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY,
        ),
      );
    if (
      sha256Pattern.test(approvedPublishableKeySha256)
      && !equalSha256(
        observedPublishableKeySha256,
        approvedPublishableKeySha256,
      )
    ) {
      reasons.push(
        "The Stripe live publishable key does not match its approved binding.",
      );
    }
  } catch {
    reasons.push("The Stripe live publishable key is unavailable.");
  }

  if (
    reasons.length > 0
    || !sha256Pattern.test(approvedAccountSha256)
    || !sha256Pattern.test(approvedCredentialSha256)
    || !sha256Pattern.test(approvedPublishableKeySha256)
    || observedCredentialSha256 === null
    || observedPublishableKeySha256 === null
    || !equalSha256(observedCredentialSha256, approvedCredentialSha256)
    || !equalSha256(
      observedPublishableKeySha256,
      approvedPublishableKeySha256,
    )
  ) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }

  const executionScopeSha256 = sha256FlightEvidence({
    version:
      "flight-consumer-production-stripe-account-preflight-execution-scope-v1",
    deploymentOrigin: "https://www.iratepilot.com",
    processorCode: "stripe",
    processorEnvironment: "live",
    operation: "retrieve_platform_account",
    confirmation:
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
    approvedAccountSha256,
    approvedCredentialSha256: observedCredentialSha256,
    approvedPublishableKeySha256: observedPublishableKeySha256,
  });

  return Object.freeze({
    authorized: true as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      processorCode: "stripe" as const,
      processorEnvironment: "live" as const,
      executionScopeSha256,
      approvedAccountSha256,
      publishableKeyBindingMatched: true as const,
      allowedOperations: Object.freeze(["retrieve_platform_account"] as const),
      accountReadEnabled: true as const,
      stripeMutationEnabled: false as const,
      paymentIntentEnabled: false as const,
      chargeEnabled: false as const,
      refundEnabled: false as const,
      webhookEnabled: false as const,
      providerOrderDispatchEnabled: false as const,
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

export function resolveFlightConsumerProductionStripePaymentPlanRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionStripePaymentPlanRuntimeDecision {
  const reasons: string[] = [];
  try {
    requireFlightConsumerProductionDarkRuntime(env);
  } catch {
    reasons.push("The Production dark runtime is unavailable.");
  }

  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
    "true",
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
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED",
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
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED",
    "false",
    reasons,
  );

  const approvedAccountSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256 ?? "";
  if (!sha256Pattern.test(approvedAccountSha256)) {
    reasons.push("The approved Stripe live account binding is unavailable.");
  }

  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED",
    "false",
    reasons,
  );
  requireExact(
    env,
    "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
    "false",
    reasons,
  );

  const policy = resolveFlightRuntimePolicy(env);
  const paymentBinding = policy.paymentBinding;
  if (policy.invalidSettings.length > 0) {
    reasons.push("The shared flight runtime policy contains invalid settings.");
  }
  if (paymentBinding === null) {
    reasons.push("The exact Stripe live payment execution binding is unavailable.");
  } else {
    if (paymentBinding.processorId !== "stripe_live") {
      reasons.push("The payment execution binding is not pinned to Stripe live.");
    }
    if (
      sha256Pattern.test(approvedAccountSha256)
      && !equalSha256(
        paymentBinding.accountScopeReceiptDigest,
        approvedAccountSha256,
      )
    ) {
      reasons.push("The payment execution binding does not match the approved Stripe account.");
    }
  }

  if (
    reasons.length > 0
    || paymentBinding === null
    || paymentBinding.processorId !== "stripe_live"
    || !sha256Pattern.test(approvedAccountSha256)
    || !equalSha256(
      paymentBinding.accountScopeReceiptDigest,
      approvedAccountSha256,
    )
  ) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }

  const frozenPaymentBinding = Object.freeze({ ...paymentBinding });
  const paymentBindingSha256 = digestFlightRuntimePaymentBinding(
    frozenPaymentBinding,
  );
  const executionScopeSha256 = sha256FlightEvidence({
    version:
      "flight-consumer-production-stripe-payment-plan-execution-scope-v1",
    deploymentOrigin: "https://www.iratepilot.com",
    processorCode: "stripe",
    processorEnvironment: "live",
    operation: "build_and_record_zero_dispatch_payment_intent_plan",
    approvedAccountSha256,
    paymentBindingSha256,
    stripeTransportEnabled: false,
    stripeMutationEnabled: false,
    paymentIntentEnabled: false,
    paymentAuthorized: false,
    captureAuthorized: false,
    refundAuthorized: false,
    providerOrderDispatchEnabled: false,
    consumerReleaseEnabled: false,
    transactionKillSwitchEngaged: true,
  });

  return Object.freeze({
    authorized: true as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      processorCode: "stripe" as const,
      processorEnvironment: "live" as const,
      executionScopeSha256,
      approvedAccountSha256,
      paymentBinding: frozenPaymentBinding,
      paymentBindingSha256,
      allowedOperations: Object.freeze([
        "build_and_record_zero_dispatch_payment_intent_plan",
      ] as const),
      planRecordingEnabled: true as const,
      accountReadEnabled: false as const,
      stripeTransportEnabled: false as const,
      stripeMutationEnabled: false as const,
      paymentIntentEnabled: false as const,
      chargeEnabled: false as const,
      refundEnabled: false as const,
      webhookEnabled: false as const,
      providerOrderDispatchEnabled: false as const,
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

export function requireFlightConsumerProductionStripeAccountPreflightRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision =
    resolveFlightConsumerProductionStripeAccountPreflightRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionStripeAccountPreflightUnavailableError(
      decision.reasons,
    );
  }
  return decision;
}

export function requireFlightConsumerProductionStripePaymentPlanRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision =
    resolveFlightConsumerProductionStripePaymentPlanRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionStripePaymentPlanUnavailableError(
      decision.reasons,
    );
  }
  return decision;
}
