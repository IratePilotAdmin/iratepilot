import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { validateDuffelSandboxAccessToken } from "../duffel/credentials.server";
import { sha256FlightEvidence } from "../runtime-safety";
import { readFlightConsumerPreviewOfferEvidenceKeyring } from "./evidence-crypto.server";
import {
  inspectFlightConsumerPreviewPreflight,
  type FlightConsumerPreviewPreflightResult,
} from "./preflight.server";
import { readFlightConsumerPreviewPiiKeyring } from "./pii-crypto.server";
import { readFlightConsumerPreviewReferenceKeyring } from "./reference-crypto.server";
import { flightConsumerPreviewRuntimeAuthoritySchema } from "./runtime.server";

export const FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION =
  "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY" as const;
export const FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION =
  "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS" as const;

const previewProjectRef = "eiqmdldjnedqgbtoozqa" as const;
const previewSupabaseUrl = `https://${previewProjectRef}.supabase.co` as const;
const lockedAuthorityIssue = "Verified database runtime authority is unavailable." as const;
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

const exactActivationEnvironment = Object.freeze({
  VERCEL_ENV: "preview",
  PILOT_MODE: "true",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
  FLIGHT_RUNTIME_MODE: "sandbox",
  FLIGHT_RUNTIME_ENVIRONMENT: "preview",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
  FLIGHT_BOOKING_ENABLED: "true",
  FLIGHT_PAYMENT_ENABLED: "true",
  FLIGHT_SETTLEMENT_ENABLED: "true",
  FLIGHT_TICKETING_ENABLED: "true",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "true",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  FLIGHT_DUFFEL_TEST_BOOKING_ENABLED: "false",
  FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED: "false",
  EMAIL_WORKER_ENABLED: "false",
} as const);

const activationInputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.literal(FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION),
  idempotencyKey: uuidSchema,
}).strict();

const relockInputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.literal(FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION),
  idempotencyKey: uuidSchema,
}).strict();

const activationInspectionSchema = z.object({
  version: z.literal("flight-consumer-preview-preflight-v1"),
  ready: z.literal(false),
  checkedAt: timestampSchema,
  checks: z.object({
    databaseAuthority: z.literal(false),
    runtimeConfiguration: z.literal(false),
    stripeTestAccount: z.literal(true),
    stripeAccountBinding: z.literal(true),
  }).strict(),
  stripeAccountId: z.string().regex(/^acct_[A-Za-z0-9]{8,127}$/),
  stripeAccountSha256: sha256Schema,
  issues: z.tuple([z.literal(lockedAuthorityIssue)]),
}).strict();

const activationPreflightRowSchema = z.object({
  version: z.literal("flight-consumer-preview-activation-preflight-v2"),
  ready: z.literal(true),
  control_key: z.literal("global"),
  expected_updated_at: timestampSchema,
  expected_execution_scope_sha256: sha256Schema,
  expected_activation_evidence_sha256: sha256Schema,
  expected_runtime_control_receipt_sha256: sha256Schema,
  target_execution_scope_sha256: sha256Schema,
  activation_manifest_sha256: sha256Schema,
}).strict();

const mutationResultRowSchema = z.object({
  decision: z.enum(["activated", "relocked"]),
  control_key: z.literal("global"),
  updated_at: timestampSchema,
  bound_execution_scope_sha256: sha256Schema,
  activation_evidence_sha256: sha256Schema,
  runtime_control_receipt_sha256: sha256Schema,
}).strict();

const serviceRoleControlSchema = z.object({
  control_key: z.literal("global"),
  bound_environment: z.literal("preview"),
  bound_project_ref: z.literal(previewProjectRef),
  bound_database_name: z.literal("postgres"),
  bound_session_user: z.literal("authenticator"),
}).strict();

const activeControlSchema = z.object({
  control_key: z.literal("global"),
  updated_at: timestampSchema,
  bound_execution_scope_sha256: sha256Schema,
  activation_evidence_sha256: sha256Schema,
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
}).strict();

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type SelectResult = PromiseLike<{ data: unknown; error: unknown }>;

export type FlightConsumerPreviewActivationControlClient = Readonly<{
  rpc(name: string, parameters?: Readonly<Record<string, unknown>>): RpcResult;
  from(table: "flight_runtime_controls"): {
    select(columns: string): {
      eq(column: "control_key", value: "global"): {
        maybeSingle(): SelectResult;
      };
    };
  };
}>;

export type FlightConsumerPreviewActivationControlResult = Readonly<{
  decision: "activated" | "relocked";
  controlKey: "global";
  updatedAt: string;
  executionScopeSha256: string;
  activationEvidenceSha256: string;
  runtimeControlReceiptSha256: string;
}>;

export class FlightConsumerPreviewActivationControlError extends Error {
  readonly kind: "conflict" | "unavailable";

  constructor(kind: "conflict" | "unavailable" = "unavailable") {
    super("Flight Consumer Preview activation control is unavailable.");
    this.name = "FlightConsumerPreviewActivationControlError";
    this.kind = kind;
  }
}

type ActivationControlEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerPreviewActivationControlDependencies = Readonly<{
  env: ActivationControlEnvironment;
  inspectRuntimePreflight: (
    env: ActivationControlEnvironment,
  ) => Promise<FlightConsumerPreviewPreflightResult>;
  verifyServiceRoleControlBinding: () => Promise<boolean>;
  readActiveRuntimeAuthority: () => Promise<unknown>;
  readCurrentControl: (
    client: FlightConsumerPreviewActivationControlClient,
  ) => Promise<unknown>;
  createNonce: () => string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function oneRow(value: unknown) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
  return value ?? null;
}

function activationEnvironmentIsReady(env: ActivationControlEnvironment) {
  if (Object.entries(exactActivationEnvironment).some(([name, expected]) => env[name] !== expected)) {
    return false;
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== previewSupabaseUrl) return false;
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET",
  ] as const) {
    if (typeof env[name] !== "string" || env[name]!.length < 16) return false;
  }
  if (!/^sk_test_[A-Za-z0-9_]{8,}$/.test(env.STRIPE_SECRET_KEY ?? "")) return false;
  if (!/^pk_test_[A-Za-z0-9_]{8,}$/.test(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "")) return false;
  if (!/^whsec_[A-Za-z0-9_]{16,}$/.test(
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET ?? "",
  )) return false;
  if (
    env.STRIPE_WEBHOOK_SECRET !== undefined
    && env.STRIPE_WEBHOOK_SECRET === env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET
  ) return false;
  const duffelWebhookSecret = env.FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET ?? "";
  if (duffelWebhookSecret.length < 16 || duffelWebhookSecret.length > 512) return false;
  const stripeAccountId = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID ?? "";
  if (!/^acct_[A-Za-z0-9]{8,127}$/.test(stripeAccountId)) return false;
  if (env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256 !== sha256(stripeAccountId)) return false;
  try {
    validateDuffelSandboxAccessToken(env.DUFFEL_TEST_ACCESS_TOKEN);
    readFlightConsumerPreviewPiiKeyring(env);
    readFlightConsumerPreviewOfferEvidenceKeyring(env);
    readFlightConsumerPreviewReferenceKeyring(env);
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL ?? "");
    if (
      appUrl.protocol !== "https:"
      || appUrl.username.length > 0
      || appUrl.password.length > 0
      || appUrl.search.length > 0
      || appUrl.hash.length > 0
    ) return false;
  } catch {
    return false;
  }
  return true;
}

async function defaultVerifyServiceRoleControlBinding() {
  try {
    const result = await createAdminClient()
      .from("flight_runtime_controls")
      .select("control_key,bound_environment,bound_project_ref,bound_database_name,bound_session_user")
      .eq("control_key", "global")
      .maybeSingle();
    return !result.error && serviceRoleControlSchema.safeParse(result.data).success;
  } catch {
    return false;
  }
}

async function defaultReadActiveRuntimeAuthority() {
  const result = await createAdminClient().rpc("get_flight_consumer_preview_runtime_authority_v1");
  if (result.error) throw new FlightConsumerPreviewActivationControlError("conflict");
  return oneRow(result.data);
}

async function defaultReadCurrentControl(client: FlightConsumerPreviewActivationControlClient) {
  const result = await client
    .from("flight_runtime_controls")
    .select([
      "control_key",
      "updated_at",
      "bound_execution_scope_sha256",
      "activation_evidence_sha256",
      "execution_kill_switch_engaged",
      "synthetic_execution_enabled",
      "provider_sandbox_traffic_enabled",
      "provider_live_traffic_enabled",
      "shopping_enabled",
      "order_enabled",
      "payment_enabled",
      "ticketing_enabled",
      "servicing_enabled",
      "provider_events_enabled",
      "production_release_enabled",
    ].join(","))
    .eq("control_key", "global")
    .maybeSingle();
  if (result.error) throw new FlightConsumerPreviewActivationControlError("conflict");
  return result.data;
}

const defaultDependencies: FlightConsumerPreviewActivationControlDependencies = Object.freeze({
  env: process.env,
  inspectRuntimePreflight: (env) => inspectFlightConsumerPreviewPreflight(env),
  verifyServiceRoleControlBinding: defaultVerifyServiceRoleControlBinding,
  readActiveRuntimeAuthority: defaultReadActiveRuntimeAuthority,
  readCurrentControl: defaultReadCurrentControl,
  createNonce: () => randomBytes(32).toString("base64url"),
});

async function callRpc(
  client: FlightConsumerPreviewActivationControlClient,
  name: string,
  parameters: Readonly<Record<string, unknown>>,
) {
  try {
    const result = await client.rpc(name, parameters);
    if (result.error) throw new FlightConsumerPreviewActivationControlError("conflict");
    return oneRow(result.data);
  } catch (error) {
    if (error instanceof FlightConsumerPreviewActivationControlError) throw error;
    throw new FlightConsumerPreviewActivationControlError("conflict");
  }
}

function resultDto(row: z.infer<typeof mutationResultRowSchema>) {
  return Object.freeze({
    decision: row.decision,
    controlKey: row.control_key,
    updatedAt: row.updated_at,
    executionScopeSha256: row.bound_execution_scope_sha256,
    activationEvidenceSha256: row.activation_evidence_sha256,
    runtimeControlReceiptSha256: row.runtime_control_receipt_sha256,
  });
}

export function createFlightConsumerPreviewActivationPacketSha256(input: Readonly<{
  actorId: string;
  idempotencyKey: string;
  stripeAccountSha256: string;
  preflight: z.infer<typeof activationPreflightRowSchema>;
}>) {
  return sha256FlightEvidence({
    version: "flight-consumer-preview-activation-packet-v1",
    operation: "activate_consumer_preview",
    preflightVersion: input.preflight.version,
    actorId: input.actorId,
    confirmationSha256: sha256(FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION),
    idempotencyKeySha256: sha256(input.idempotencyKey),
    stripeAccountSha256: input.stripeAccountSha256,
    controlKey: input.preflight.control_key,
    expectedUpdatedAt: input.preflight.expected_updated_at,
    expectedExecutionScopeSha256: input.preflight.expected_execution_scope_sha256,
    expectedActivationEvidenceSha256: input.preflight.expected_activation_evidence_sha256,
    expectedRuntimeControlReceiptSha256: input.preflight.expected_runtime_control_receipt_sha256,
    targetExecutionScopeSha256: input.preflight.target_execution_scope_sha256,
    activationManifestSha256: input.preflight.activation_manifest_sha256,
  });
}

export function createFlightConsumerPreviewRelockPacketSha256(input: Readonly<{
  actorId: string;
  idempotencyKey: string;
  control: z.infer<typeof activeControlSchema>;
  runtimeControlReceiptSha256: string;
}>) {
  return sha256FlightEvidence({
    version: "flight-consumer-preview-relock-packet-v1",
    operation: "relock_consumer_preview",
    actorId: input.actorId,
    confirmationSha256: sha256(FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION),
    idempotencyKeySha256: sha256(input.idempotencyKey),
    controlKey: input.control.control_key,
    expectedUpdatedAt: input.control.updated_at,
    expectedExecutionScopeSha256: input.control.bound_execution_scope_sha256,
    expectedActivationEvidenceSha256: input.control.activation_evidence_sha256,
    expectedRuntimeControlReceiptSha256: input.runtimeControlReceiptSha256,
  });
}

export async function activateFlightConsumerPreview(
  client: FlightConsumerPreviewActivationControlClient,
  input: Readonly<{ actorId: string; confirmation: string; idempotencyKey: string }>,
  dependencies: FlightConsumerPreviewActivationControlDependencies = defaultDependencies,
): Promise<FlightConsumerPreviewActivationControlResult> {
  const request = activationInputSchema.safeParse(input);
  if (!request.success) throw new FlightConsumerPreviewActivationControlError("conflict");
  if (!activationEnvironmentIsReady(dependencies.env)) {
    throw new FlightConsumerPreviewActivationControlError("unavailable");
  }
  if (!await dependencies.verifyServiceRoleControlBinding()) {
    throw new FlightConsumerPreviewActivationControlError("unavailable");
  }

  let inspection: z.infer<typeof activationInspectionSchema>;
  try {
    inspection = activationInspectionSchema.parse(
      await dependencies.inspectRuntimePreflight(dependencies.env),
    );
  } catch {
    throw new FlightConsumerPreviewActivationControlError("unavailable");
  }
  if (
    inspection.stripeAccountId !== dependencies.env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID
    || inspection.stripeAccountSha256
      !== dependencies.env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256
    || sha256(inspection.stripeAccountId) !== inspection.stripeAccountSha256
  ) throw new FlightConsumerPreviewActivationControlError("unavailable");

  const preflight = activationPreflightRowSchema.safeParse(await callRpc(
    client,
    "get_flight_consumer_preview_activation_preflight_v1",
    { p_stripe_account_id: inspection.stripeAccountId },
  ));
  if (!preflight.success) throw new FlightConsumerPreviewActivationControlError("unavailable");

  const nonce = dependencies.createNonce();
  if (!nonceSchema.safeParse(nonce).success) {
    throw new FlightConsumerPreviewActivationControlError("unavailable");
  }
  const activationPacketSha256 = createFlightConsumerPreviewActivationPacketSha256({
    actorId: request.data.actorId,
    idempotencyKey: request.data.idempotencyKey,
    stripeAccountSha256: inspection.stripeAccountSha256,
    preflight: preflight.data,
  });
  const activated = mutationResultRowSchema.safeParse(await callRpc(
    client,
    "activate_flight_consumer_preview_v1",
    {
      p_expected_updated_at: preflight.data.expected_updated_at,
      p_expected_execution_scope_sha256: preflight.data.expected_execution_scope_sha256,
      p_expected_activation_evidence_sha256: preflight.data.expected_activation_evidence_sha256,
      p_expected_runtime_control_receipt_sha256:
        preflight.data.expected_runtime_control_receipt_sha256,
      p_stripe_account_id: inspection.stripeAccountId,
      p_activation_packet_sha256: activationPacketSha256,
      p_activation_nonce: nonce,
    },
  ));
  if (
    !activated.success
    || activated.data.decision !== "activated"
    || activated.data.bound_execution_scope_sha256
      !== preflight.data.target_execution_scope_sha256
    || activated.data.activation_evidence_sha256
      === preflight.data.expected_activation_evidence_sha256
    || activated.data.runtime_control_receipt_sha256
      === preflight.data.expected_runtime_control_receipt_sha256
  ) throw new FlightConsumerPreviewActivationControlError("unavailable");
  return resultDto(activated.data);
}

export async function relockFlightConsumerPreview(
  client: FlightConsumerPreviewActivationControlClient,
  input: Readonly<{ actorId: string; confirmation: string; idempotencyKey: string }>,
  dependencies: FlightConsumerPreviewActivationControlDependencies = defaultDependencies,
): Promise<FlightConsumerPreviewActivationControlResult> {
  const request = relockInputSchema.safeParse(input);
  if (!request.success) throw new FlightConsumerPreviewActivationControlError("conflict");
  if (
    dependencies.env.VERCEL_ENV !== "preview"
    || dependencies.env.NEXT_PUBLIC_SUPABASE_URL !== previewSupabaseUrl
  ) throw new FlightConsumerPreviewActivationControlError("unavailable");

  let authority: z.infer<typeof flightConsumerPreviewRuntimeAuthoritySchema>;
  let control: z.infer<typeof activeControlSchema>;
  try {
    authority = flightConsumerPreviewRuntimeAuthoritySchema.parse(
      await dependencies.readActiveRuntimeAuthority(),
    );
    control = activeControlSchema.parse(await dependencies.readCurrentControl(client));
  } catch (error) {
    if (error instanceof FlightConsumerPreviewActivationControlError) throw error;
    throw new FlightConsumerPreviewActivationControlError("conflict");
  }
  if (
    authority.boundDatabaseName !== "postgres"
    || authority.boundSessionUser !== "authenticator"
    || authority.boundExecutionScopeSha256 !== control.bound_execution_scope_sha256
    || authority.activationEvidenceSha256 !== control.activation_evidence_sha256
  ) throw new FlightConsumerPreviewActivationControlError("conflict");

  const nonce = dependencies.createNonce();
  if (!nonceSchema.safeParse(nonce).success) {
    throw new FlightConsumerPreviewActivationControlError("unavailable");
  }
  const relockPacketSha256 = createFlightConsumerPreviewRelockPacketSha256({
    actorId: request.data.actorId,
    idempotencyKey: request.data.idempotencyKey,
    control,
    runtimeControlReceiptSha256: authority.runtimeControlReceiptSha256,
  });
  const relocked = mutationResultRowSchema.safeParse(await callRpc(
    client,
    "relock_flight_consumer_preview_v1",
    {
      p_expected_updated_at: control.updated_at,
      p_expected_execution_scope_sha256: control.bound_execution_scope_sha256,
      p_expected_activation_evidence_sha256: control.activation_evidence_sha256,
      p_expected_runtime_control_receipt_sha256: authority.runtimeControlReceiptSha256,
      p_relock_packet_sha256: relockPacketSha256,
      p_relock_nonce: nonce,
    },
  ));
  if (
    !relocked.success
    || relocked.data.decision !== "relocked"
    || relocked.data.bound_execution_scope_sha256 !== control.bound_execution_scope_sha256
    || relocked.data.activation_evidence_sha256 === control.activation_evidence_sha256
    || relocked.data.runtime_control_receipt_sha256 === authority.runtimeControlReceiptSha256
  ) throw new FlightConsumerPreviewActivationControlError("unavailable");
  return resultDto(relocked.data);
}
