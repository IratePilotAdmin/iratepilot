import "server-only";

import { z } from "zod";

import { validateDuffelSandboxAccessToken } from "../duffel/credentials.server";
import { readFlightConsumerPreviewOfferEvidenceKeyring } from "./evidence-crypto.server";
import { readFlightConsumerPreviewPiiKeyring } from "./pii-crypto.server";
import { readFlightConsumerPreviewReferenceKeyring } from "./reference-crypto.server";
import { hasIsolatedFlightConsumerPreviewStripeKeyPair } from "./stripe-credential.server";

export const FLIGHT_CONSUMER_PREVIEW_MODE = "flight_consumer_preview_test" as const;
export const FLIGHT_CONSUMER_PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa" as const;

type FlightConsumerPreviewEnvironment = Readonly<Record<string, string | undefined>>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const stableDatabaseNameSchema = z.string().regex(/^[A-Za-z0-9_-]{1,63}$/);
const stableSessionUserSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/);

/**
 * Sanitized output of the service-role-only runtime-control verification RPC.
 * The RPC, not a browser or request body, must construct this authority after
 * proving current-control/receipt parity and the exact split payment bindings.
 */
const flightConsumerPreviewRuntimeAuthorityObjectSchema = z.object({
  version: z.literal("flight-consumer-preview-runtime-authority-v1"),
  authorized: z.literal(true),
  controlKey: z.literal("global"),
  executionMode: z.literal("test"),
  executionKillSwitchEngaged: z.literal(false),
  syntheticExecutionEnabled: z.literal(false),
  providerSandboxTrafficEnabled: z.literal(true),
  providerLiveTrafficEnabled: z.literal(false),
  shoppingEnabled: z.literal(true),
  orderEnabled: z.literal(true),
  paymentEnabled: z.literal(true),
  ticketingEnabled: z.literal(true),
  servicingEnabled: z.literal(false),
  providerEventsEnabled: z.literal(true),
  productionReleaseEnabled: z.literal(false),
  boundEnvironment: z.literal("preview"),
  boundProjectRef: z.literal(FLIGHT_CONSUMER_PREVIEW_PROJECT_REF),
  boundDatabaseName: stableDatabaseNameSchema,
  boundSessionUser: stableSessionUserSchema,
  boundProviderCode: z.literal("duffel"),
  boundProviderAccountSha256: sha256Schema,
  boundPointOfSale: z.literal("US"),
  boundContentScopeSha256: sha256Schema,
  boundAdapterVersionSha256: sha256Schema,
  boundPaymentProcessorCode: z.literal("stripe"),
  boundPaymentAccountSha256: sha256Schema,
  boundPaymentEnvironment: z.literal("test"),
  boundPaymentSourceSha256: sha256Schema,
  boundPaymentAdapterVersionSha256: sha256Schema,
  boundProviderSettlementProcessorCode: z.literal("duffel_balance"),
  boundProviderSettlementAccountSha256: sha256Schema,
  boundProviderSettlementEnvironment: z.literal("test"),
  boundProviderSettlementSourceSha256: sha256Schema,
  boundProviderSettlementAdapterVersionSha256: sha256Schema,
  boundExecutionScopeSha256: sha256Schema,
  activationEvidenceSha256: sha256Schema,
  runtimeControlReceiptSha256: sha256Schema,
}).strict();

/** Exact single-row shape returned by `get_flight_consumer_preview_runtime_authority_v1()`. */
export const flightConsumerPreviewRuntimeAuthorityRpcRowSchema = z.object({
  version: z.literal("flight-consumer-preview-runtime-authority-v1"),
  authorized: z.literal(true),
  control_key: z.literal("global"),
  execution_mode: z.literal("test"),
  execution_kill_switch_engaged: z.literal(false),
  synthetic_execution_enabled: z.literal(false),
  provider_sandbox_traffic_enabled: z.literal(true),
  provider_live_traffic_enabled: z.literal(false),
  shopping_enabled: z.literal(true),
  order_enabled: z.literal(true),
  payment_enabled: z.literal(true),
  ticketing_enabled: z.literal(true),
  servicing_enabled: z.literal(false),
  provider_events_enabled: z.literal(true),
  production_release_enabled: z.literal(false),
  bound_environment: z.literal("preview"),
  bound_project_ref: z.literal(FLIGHT_CONSUMER_PREVIEW_PROJECT_REF),
  bound_database_name: stableDatabaseNameSchema,
  bound_session_user: stableSessionUserSchema,
  bound_provider_code: z.literal("duffel"),
  bound_provider_account_sha256: sha256Schema,
  bound_point_of_sale: z.literal("US"),
  bound_content_scope_sha256: sha256Schema,
  bound_adapter_version_sha256: sha256Schema,
  bound_payment_processor_code: z.literal("stripe"),
  bound_payment_account_sha256: sha256Schema,
  bound_payment_environment: z.literal("test"),
  bound_payment_source_sha256: sha256Schema,
  bound_payment_adapter_version_sha256: sha256Schema,
  bound_provider_settlement_processor_code: z.literal("duffel_balance"),
  bound_provider_settlement_account_sha256: sha256Schema,
  bound_provider_settlement_environment: z.literal("test"),
  bound_provider_settlement_source_sha256: sha256Schema,
  bound_provider_settlement_adapter_version_sha256: sha256Schema,
  bound_execution_scope_sha256: sha256Schema,
  activation_evidence_sha256: sha256Schema,
  runtime_control_receipt_sha256: sha256Schema,
}).strict();

export type FlightConsumerPreviewRuntimeAuthorityRpcRow = z.infer<
  typeof flightConsumerPreviewRuntimeAuthorityRpcRowSchema
>;

function normalizeRuntimeAuthority(value: unknown) {
  const row = flightConsumerPreviewRuntimeAuthorityRpcRowSchema.safeParse(value);
  if (!row.success) return value;
  const data = row.data;
  return {
    version: data.version,
    authorized: data.authorized,
    controlKey: data.control_key,
    executionMode: data.execution_mode,
    executionKillSwitchEngaged: data.execution_kill_switch_engaged,
    syntheticExecutionEnabled: data.synthetic_execution_enabled,
    providerSandboxTrafficEnabled: data.provider_sandbox_traffic_enabled,
    providerLiveTrafficEnabled: data.provider_live_traffic_enabled,
    shoppingEnabled: data.shopping_enabled,
    orderEnabled: data.order_enabled,
    paymentEnabled: data.payment_enabled,
    ticketingEnabled: data.ticketing_enabled,
    servicingEnabled: data.servicing_enabled,
    providerEventsEnabled: data.provider_events_enabled,
    productionReleaseEnabled: data.production_release_enabled,
    boundEnvironment: data.bound_environment,
    boundProjectRef: data.bound_project_ref,
    boundDatabaseName: data.bound_database_name,
    boundSessionUser: data.bound_session_user,
    boundProviderCode: data.bound_provider_code,
    boundProviderAccountSha256: data.bound_provider_account_sha256,
    boundPointOfSale: data.bound_point_of_sale,
    boundContentScopeSha256: data.bound_content_scope_sha256,
    boundAdapterVersionSha256: data.bound_adapter_version_sha256,
    boundPaymentProcessorCode: data.bound_payment_processor_code,
    boundPaymentAccountSha256: data.bound_payment_account_sha256,
    boundPaymentEnvironment: data.bound_payment_environment,
    boundPaymentSourceSha256: data.bound_payment_source_sha256,
    boundPaymentAdapterVersionSha256: data.bound_payment_adapter_version_sha256,
    boundProviderSettlementProcessorCode: data.bound_provider_settlement_processor_code,
    boundProviderSettlementAccountSha256: data.bound_provider_settlement_account_sha256,
    boundProviderSettlementEnvironment: data.bound_provider_settlement_environment,
    boundProviderSettlementSourceSha256: data.bound_provider_settlement_source_sha256,
    boundProviderSettlementAdapterVersionSha256: data.bound_provider_settlement_adapter_version_sha256,
    boundExecutionScopeSha256: data.bound_execution_scope_sha256,
    activationEvidenceSha256: data.activation_evidence_sha256,
    runtimeControlReceiptSha256: data.runtime_control_receipt_sha256,
  };
}

export const flightConsumerPreviewRuntimeAuthoritySchema = z.preprocess(
  normalizeRuntimeAuthority,
  flightConsumerPreviewRuntimeAuthorityObjectSchema,
);

export type FlightConsumerPreviewRuntimeAuthority = z.infer<
  typeof flightConsumerPreviewRuntimeAuthoritySchema
>;

export type FlightConsumerPreviewRuntimeBinding = Readonly<{
  projectRef: typeof FLIGHT_CONSUMER_PREVIEW_PROJECT_REF;
  providerCode: "duffel";
  providerAccountSha256: string;
  pointOfSale: "US";
  contentScopeSha256: string;
  providerAdapterVersionSha256: string;
  paymentProcessorCode: "stripe";
  paymentAccountSha256: string;
  paymentEnvironment: "test";
  paymentSourceSha256: string;
  paymentAdapterVersionSha256: string;
  providerSettlementProcessorCode: "duffel_balance";
  providerSettlementAccountSha256: string;
  providerSettlementEnvironment: "test";
  providerSettlementSourceSha256: string;
  providerSettlementAdapterVersionSha256: string;
  executionScopeSha256: string;
  activationEvidenceSha256: string;
  runtimeControlReceiptSha256: string;
  piiKeyVersion: string;
  evidenceKeyVersion: string;
  referenceKeyVersion: string;
}>;

export type FlightConsumerPreviewRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PREVIEW_MODE;
    reasons: readonly [];
    binding: FlightConsumerPreviewRuntimeBinding;
  }>
  | Readonly<{
    authorized: false;
    mode: "disabled";
    reasons: readonly string[];
    binding: null;
  }>;

export class FlightConsumerPreviewUnavailableError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Preview is unavailable.");
    this.name = "FlightConsumerPreviewUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

function requiresExact(
  env: FlightConsumerPreviewEnvironment,
  name: string,
  expected: string,
  reasons: string[],
) {
  if (env[name] !== expected) reasons.push(`${name} is not set to its approved value.`);
}

function testStripeKeysAreExact(env: FlightConsumerPreviewEnvironment) {
  return hasIsolatedFlightConsumerPreviewStripeKeyPair(env);
}

function testPreviewWebhookConfigurationIsSafe(
  env: FlightConsumerPreviewEnvironment,
  paymentAccountSha256: string | null,
) {
  const previewSecret = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET ?? "";
  const previewAccountSha256 = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256 ?? "";
  const previewAccountId = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID;
  return /^whsec_[A-Za-z0-9_]{8,}$/.test(previewSecret)
    && sha256Schema.safeParse(previewAccountSha256).success
    && paymentAccountSha256 !== null
    && previewAccountSha256 === paymentAccountSha256
    && (previewAccountId === undefined || /^acct_[A-Za-z0-9]{8,127}$/.test(previewAccountId))
    && (env.STRIPE_WEBHOOK_SECRET === undefined || env.STRIPE_WEBHOOK_SECRET !== previewSecret);
}

function testPreviewDuffelWebhookConfigurationIsSafe(
  env: FlightConsumerPreviewEnvironment,
) {
  const secret = env.FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET ?? "";
  return secret.length >= 16 && secret.length <= 512;
}

export function resolveFlightConsumerPreviewRuntime(
  env: FlightConsumerPreviewEnvironment = process.env,
  databaseAuthority: unknown = null,
): FlightConsumerPreviewRuntimeDecision {
  const reasons: string[] = [];

  requiresExact(env, "VERCEL_ENV", "preview", reasons);
  requiresExact(env, "PILOT_MODE", "true", reasons);
  requiresExact(env, "FLIGHT_CONSUMER_PREVIEW_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_RUNTIME_MODE", "sandbox", reasons);
  requiresExact(env, "FLIGHT_RUNTIME_ENVIRONMENT", "preview", reasons);
  requiresExact(env, "FLIGHT_RUNTIME_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_SYNTHETIC_ADAPTER_ENABLED", "false", reasons);
  requiresExact(env, "FLIGHT_PROVIDER_TRAFFIC_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_BOOKING_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_PAYMENT_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_SETTLEMENT_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_TICKETING_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_SERVICING_ENABLED", "false", reasons);
  requiresExact(env, "FLIGHT_WEBHOOKS_ENABLED", "true", reasons);
  requiresExact(env, "FLIGHT_PRODUCTION_TRAFFIC_ENABLED", "false", reasons);
  requiresExact(env, "FLIGHT_TRANSACTION_KILL_SWITCH", "disengaged", reasons);

  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${FLIGHT_CONSUMER_PREVIEW_PROJECT_REF}.supabase.co`) {
    reasons.push("Supabase is not bound to the approved Preview project.");
  }
  if (!testStripeKeysAreExact(env)) {
    reasons.push("A matching Stripe test key pair is unavailable.");
  }
  if (
    env.ENABLE_LIVE_BOOKING_PAYMENTS === "true"
    || env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true"
    || env.NEXT_PUBLIC_PUBLIC_BOOKING === "true"
  ) {
    reasons.push("A live booking or Stripe gate conflicts with Consumer Preview.");
  }

  try {
    validateDuffelSandboxAccessToken(env.DUFFEL_TEST_ACCESS_TOKEN);
  } catch {
    reasons.push("The Duffel test credential is unavailable.");
  }

  let piiKeyVersion: string | null = null;
  try {
    piiKeyVersion = readFlightConsumerPreviewPiiKeyring(env).keyVersion;
  } catch {
    reasons.push("The Preview PII keyring is unavailable.");
  }

  let evidenceKeyVersion: string | null = null;
  try {
    evidenceKeyVersion = readFlightConsumerPreviewOfferEvidenceKeyring(env).keyVersion;
  } catch {
    reasons.push("The Preview offer-evidence keyring is unavailable.");
  }

  let referenceKeyVersion: string | null = null;
  try {
    referenceKeyVersion = readFlightConsumerPreviewReferenceKeyring(env).keyVersion;
  } catch {
    reasons.push("The Preview provider-reference keyring is unavailable.");
  }

  const authority = flightConsumerPreviewRuntimeAuthoritySchema.safeParse(databaseAuthority);
  if (!authority.success) {
    reasons.push("Verified database runtime authority is unavailable.");
  }
  if (authority.success && !testPreviewWebhookConfigurationIsSafe(
    env,
    authority.data.boundPaymentAccountSha256,
  )) {
    reasons.push("The dedicated Stripe Preview webhook binding is unavailable or unsafe.");
  }
  if (!testPreviewDuffelWebhookConfigurationIsSafe(env)) {
    reasons.push("The dedicated Duffel Preview webhook binding is unavailable or unsafe.");
  }

  if (
    reasons.length > 0
    || !authority.success
    || piiKeyVersion === null
    || evidenceKeyVersion === null
    || referenceKeyVersion === null
  ) {
    return Object.freeze({
      authorized: false,
      mode: "disabled",
      reasons: Object.freeze([...reasons]),
      binding: null,
    });
  }

  return Object.freeze({
    authorized: true,
    mode: FLIGHT_CONSUMER_PREVIEW_MODE,
    reasons: Object.freeze([] as const),
    binding: Object.freeze({
      projectRef: FLIGHT_CONSUMER_PREVIEW_PROJECT_REF,
      providerCode: authority.data.boundProviderCode,
      providerAccountSha256: authority.data.boundProviderAccountSha256,
      pointOfSale: authority.data.boundPointOfSale,
      contentScopeSha256: authority.data.boundContentScopeSha256,
      providerAdapterVersionSha256: authority.data.boundAdapterVersionSha256,
      paymentProcessorCode: authority.data.boundPaymentProcessorCode,
      paymentAccountSha256: authority.data.boundPaymentAccountSha256,
      paymentEnvironment: authority.data.boundPaymentEnvironment,
      paymentSourceSha256: authority.data.boundPaymentSourceSha256,
      paymentAdapterVersionSha256: authority.data.boundPaymentAdapterVersionSha256,
      providerSettlementProcessorCode: authority.data.boundProviderSettlementProcessorCode,
      providerSettlementAccountSha256: authority.data.boundProviderSettlementAccountSha256,
      providerSettlementEnvironment: authority.data.boundProviderSettlementEnvironment,
      providerSettlementSourceSha256: authority.data.boundProviderSettlementSourceSha256,
      providerSettlementAdapterVersionSha256: authority.data.boundProviderSettlementAdapterVersionSha256,
      executionScopeSha256: authority.data.boundExecutionScopeSha256,
      activationEvidenceSha256: authority.data.activationEvidenceSha256,
      runtimeControlReceiptSha256: authority.data.runtimeControlReceiptSha256,
      piiKeyVersion,
      evidenceKeyVersion,
      referenceKeyVersion,
    }),
  });
}

export function requireFlightConsumerPreviewRuntime(
  env: FlightConsumerPreviewEnvironment = process.env,
  databaseAuthority: unknown = null,
) {
  const decision = resolveFlightConsumerPreviewRuntime(env, databaseAuthority);
  if (!decision.authorized) throw new FlightConsumerPreviewUnavailableError(decision.reasons);
  return decision;
}
