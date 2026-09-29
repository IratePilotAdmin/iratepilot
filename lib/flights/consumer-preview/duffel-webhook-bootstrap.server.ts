import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

import {
  DUFFEL_API_BASE_URL,
  DUFFEL_MAX_RAW_BODY_BYTES,
  parseDuffelJsonBody,
} from "../duffel-sandbox-contract";
import { validateDuffelSandboxAccessToken } from "../duffel/credentials.server";
import { createAdminClient } from "../../supabase/admin";
import { createFlightConsumerPreviewAsyncDuffelConvergence } from "./async-duffel-order-convergence.server";
import { FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS } from "./duffel-webhook.server";
import { sha256FlightConsumerPreviewReference } from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION =
  "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION =
  "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_CONVERGENCE_CONFIRMATION =
  "CONVERGE_ONE_SIGNED_PROCESSED_DUFFEL_TEST_ORDER_FROM_RETAINED_EVIDENCE" as const;

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET = Object.freeze({
  orderId: "5249a6d4-40b9-4232-8179-b326ecd8c0e4",
  customerId: "3020e8bc-1f5d-45ce-a759-dece25c65661",
} as const);

const duffelApiVersion = "v2" as const;
const stablePreviewOrigin =
  "https://iratepilot-consumer-flights-preview.vercel.app" as const;
const webhookReceiverPath = "/api/flights/preview/webhooks/duffel" as const;
const listWebhooksUrl = `${DUFFEL_API_BASE_URL}/air/webhooks?limit=200` as const;
const listFailedOrderCreatedEventsUrl =
  `${DUFFEL_API_BASE_URL}/air/webhooks/events?limit=200&type=order.created&delivery_success=false` as const;
const requestTimeoutMs = 15_000;
const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().datetime({ offset: true });
const providerWebhookIdSchema = z.string().regex(/^end_[A-Za-z0-9]{8,252}$/);
const providerWebhookEventIdSchema = z.string().regex(/^wev_[A-Za-z0-9]{8,252}$/);
const providerOrderIdSchema = z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/);
const signingSecretSchema = z.string()
  .min(16)
  .max(2_048)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/);

const inputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.union([
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION),
  ]),
  idempotencyKey: uuidSchema,
}).strict();

const retainedConvergenceInputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.literal(
    FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_CONVERGENCE_CONFIRMATION,
  ),
  idempotencyKey: uuidSchema,
}).strict();

const webhookSchema = z.object({
  active: z.boolean(),
  events: z.array(z.string().min(1).max(128)).max(64),
  id: providerWebhookIdSchema,
  live_mode: z.boolean(),
  url: z.string().url().max(4_096),
}).passthrough();

const listResponseSchema = z.object({
  data: z.array(webhookSchema).max(200),
  meta: z.object({
    after: z.string().max(4_096).nullable(),
    before: z.string().max(4_096).nullable().optional(),
    limit: z.literal(200),
  }).passthrough(),
}).passthrough();

const createResponseSchema = z.object({
  data: webhookSchema.extend({
    secret: signingSecretSchema,
  }),
}).passthrough();

const failedOrderCreatedEventSchema = z.object({
  api_version: z.literal(duffelApiVersion),
  created_at: z.string().min(20).max(64)
    .refine((value) => Number.isFinite(Date.parse(value))),
  id: providerWebhookEventIdSchema,
  idempotency_key: providerOrderIdSchema,
  live_mode: z.literal(false),
  type: z.literal("order.created"),
}).passthrough();

const failedEventListResponseSchema = z.object({
  data: z.array(failedOrderCreatedEventSchema).max(200),
  meta: z.object({
    after: z.string().max(4_096).nullable(),
    before: z.string().max(4_096).nullable().optional(),
    limit: z.literal(200),
  }).passthrough(),
}).passthrough();

const convergenceContextSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  order_status: z.enum(["requires_review", "ticketed"]),
  execution_scope_sha256: sha256Schema,
  provider_attempt_id: uuidSchema,
  provider_attempt_state: z.literal("succeeded"),
  provider_attempt_revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  ledger_id: uuidSchema,
  ledger_state: z.literal("processed"),
  ledger_revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  provider_offer_ref_sha256: sha256Schema,
  provider_order_ref_sha256: sha256Schema,
  recovery_evidence_receipt_sha256: sha256Schema,
  recovery_retention_expires_at: instantSchema,
  reconciliation_case_id: uuidSchema,
  reconciliation_case_status: z.enum(["open", "investigating", "blocked", "resolved"]),
  reconciliation_resolution_code: z.string().nullable(),
  reconciliation_resolution_actor_type: z.enum(["administrator", "system"]).nullable(),
  reconciliation_system_receipt_sha256: sha256Schema.nullable(),
  reconciliation_updated_at: instantSchema,
  issued_ticket_count: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number),
}).strict();

const replayLinkSchema = z.object({
  replay_found: z.literal(true),
  order_id: uuidSchema,
  customer_id: uuidSchema,
  provider_attempt_id: uuidSchema,
  order_status: z.enum(["requires_review", "ticketed"]),
  execution_scope_sha256: sha256Schema,
}).strict();

const recoveryEvidenceIdentitySchema = z.object({
  ledger_id: uuidSchema,
  attempt_id: uuidSchema,
  order_id: uuidSchema,
  customer_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  provider_offer_ref_sha256: sha256Schema,
  provider_order_ref_sha256: sha256Schema,
  webhook_verification_receipt_sha256: sha256Schema,
  recovery_evidence_receipt_sha256: sha256Schema,
  retention_expires_at: instantSchema,
}).passthrough();

const reconciliationDetailSchema = z.object({
  case_id: uuidSchema,
  order_id: uuidSchema,
  customer_id: uuidSchema,
  order_status: z.enum(["requires_review", "ticketed"]),
  payment_id: uuidSchema,
  payment_status: z.literal("captured"),
  provider_attempt_id: uuidSchema,
  provider_attempt_state: z.literal("succeeded"),
  provider_attempt_revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  authorized_cents: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  captured_cents: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  refunded_cents: z.union([z.literal(0), z.literal("0")]),
  total_cents: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  ticket_count: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number),
  execution_scope_sha256: sha256Schema,
}).passthrough();

const convergenceResultSchema = z.object({
  orderId: uuidSchema,
  status: z.literal("ticketed"),
  issuedTicketCount: z.number().int().positive(),
  reconciliationCaseId: uuidSchema.nullable(),
  webhookLeaseCompletionRequired: z.literal(false),
}).strict();

const completionLeaseReplayResultSchema = z.array(z.object({
  decision: z.literal("replayed"),
  lease_revision: z.number().int().nonnegative(),
  lease_state: z.literal("completed"),
  lease_token_sha256: z.null(),
  lease_expires_at: z.null(),
  order_status: z.literal("ticketed"),
  issued_ticket_count: z.number().int().positive(),
  provider_attempt_state: z.literal("succeeded"),
  provider_attempt_revision: z.literal(2),
  payment_attempt_state: z.literal("succeeded"),
  payment_attempt_revision: z.literal(2),
  provider_redispatch_authorized: z.literal(false),
}).strict()).length(1);

const providerErrorTokenSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_]+$/);

const providerErrorResponseSchema = z.object({
  errors: z.array(z.object({
    code: providerErrorTokenSchema,
    type: providerErrorTokenSchema,
  }).passthrough()).min(1).max(16),
  meta: z.object({
    request_id: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
    status: z.number().int(),
  }).passthrough(),
}).passthrough();

type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerPreviewDuffelWebhookBootstrapDependencies = Readonly<{
  env: BootstrapEnvironment;
  fetcher: typeof fetch;
}>;

export type FlightConsumerPreviewDuffelWebhookBootstrapResult = Readonly<{
  decision: "created";
  mode: "duffel_test_mode";
  signingSecret: string;
  storeSigningSecretImmediately: true;
  webhookIdSha256: string;
}>;

export type FlightConsumerPreviewDuffelWebhookPingResult = Readonly<{
  decision: "ping_requested";
  mode: "duffel_test_mode";
  webhookIdSha256: string;
}>;

type FlightConsumerPreviewRuntime = Awaited<
  ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>
>;

type RetainedTargetSnapshot = Readonly<{
  executionScopeSha256: string;
  orderStatus: "requires_review" | "ticketed";
  issuedTicketCount: number;
}>;

export type FlightConsumerPreviewDuffelRetainedOrderOperatorClient = Readonly<{
  rpc(
    name: "get_flight_consumer_admin_reconciliation_v1",
    parameters: Readonly<{ p_case_id: string }>,
  ): Promise<Readonly<{ data: unknown; error: unknown }>>;
}>;

export type FlightConsumerPreviewDuffelRetainedOrderConvergenceDependencies = Readonly<{
  env: BootstrapEnvironment;
  fetcher: typeof fetch;
  sha256: (value: string) => string;
  providerOrderReferenceSha256: (value: string) => string;
  requireRuntime: typeof requireFlightConsumerPreviewRequestRuntime;
  readTarget: (
    runtime: FlightConsumerPreviewRuntime,
    operatorClient: FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
  ) => Promise<RetainedTargetSnapshot>;
  createConvergence: typeof createFlightConsumerPreviewAsyncDuffelConvergence;
  completeCheckoutReplay: (
    runtime: FlightConsumerPreviewRuntime,
  ) => Promise<Readonly<{ issuedTicketCount: number }>>;
}>;

export type FlightConsumerPreviewDuffelRetainedOrderConvergenceResult = Readonly<{
  decision: "locally_converged";
  mode: "duffel_test_mode";
  status: "ticketed";
  issuedTicketCount: number;
  completionLeaseState: "completed";
}>;

const retainedTargetIdentity = Object.freeze({
  ...FLIGHT_CONSUMER_PREVIEW_DUFFEL_RETAINED_ORDER_TARGET,
  attemptId: "497887f8-61d7-4efe-b377-8002046d554b",
  ledgerId: "b0c13dde-4b5e-42e1-baad-0871f09729c6",
  paymentId: "a9bc4fa2-d088-4712-9f84-a255436efdfb",
  eventIdSha256: "2dae01ccc165801e723f873c57b87c2bfe163854e034aa989b491a1c75ef21fc",
  idempotencySha256: "b2144674d5aea77874690139cb7f93148fa7fa8c9e06f91c9a1e0832d707dc88",
  payloadSha256: "4c35eb2465a1b2ab666b571272e5e6423454b3db4f05fe0d419aa38ed0b49e26",
  semanticSha256: "05ba3beb9623c2f363135f70852e3e69feffd5401d79fc0aa63ad3ad85bf0b06",
  verificationReceiptSha256:
    "6c2e5bd585a3d24929f73b73a155835950ec63a4f42261d98b206e080d74aaf9",
  providerOrderRefSha256:
    "2d441f12b7684529ad06e83e399afabe46dd6ac5404a2e51750eca3408ff53af",
  providerOfferRefSha256:
    "82f8a62c9b72b9a469f56d1e9c0ddeef0d726ecda2ef86902081034097378c24",
  recoveryEvidenceReceiptSha256:
    "69365626a4aa1cf92edf5f2b0ee47fcbb65cfe0b600bad283783d1d68a97986e",
  recoveryRetentionExpiresAt: "2026-09-03T06:36:45.402Z",
  occurredAt: "2026-08-27T06:36:43.834Z",
  completionIdempotencyKeySha256:
    "89ab257265cabd16255cf6b86d078d57a8ea62ebde302a32eab634c8397fc797",
  completionRequestSha256:
    "22f61c203268825572491b17f2e5e84737b0827254cfba145b35aefdede193e5",
} as const);

export class FlightConsumerPreviewDuffelWebhookBootstrapError extends Error {
  readonly kind: "conflict" | "unavailable";
  readonly diagnostic: Readonly<{
    operation: "ping_response_contract";
    responseStatus: number;
    redirected: boolean;
    urlMatched: boolean;
    bodyWasNull: boolean;
    providerErrorCodes: readonly string[];
    providerErrorTypes: readonly string[];
    providerRequestId: string | null;
  }> | null;

  constructor(
    kind: "conflict" | "unavailable" = "unavailable",
    diagnostic: FlightConsumerPreviewDuffelWebhookBootstrapError["diagnostic"] = null,
  ) {
    super("The temporary Duffel test-webhook operation is unavailable.");
    this.name = "FlightConsumerPreviewDuffelWebhookBootstrapError";
    this.kind = kind;
    this.diagnostic = diagnostic === null ? null : Object.freeze({
      ...diagnostic,
      providerErrorCodes: Object.freeze([...diagnostic.providerErrorCodes]),
      providerErrorTypes: Object.freeze([...diagnostic.providerErrorTypes]),
    });
  }
}

function fail(
  kind: "conflict" | "unavailable" = "unavailable",
  diagnostic: FlightConsumerPreviewDuffelWebhookBootstrapError["diagnostic"] = null,
): never {
  throw new FlightConsumerPreviewDuffelWebhookBootstrapError(kind, diagnostic);
}

function readExactPreviewOrigin(env: BootstrapEnvironment) {
  const raw = env.NEXT_PUBLIC_APP_URL;
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) fail();
  try {
    const parsed = new URL(raw);
    if (
      env.VERCEL_ENV !== "preview"
      || parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.port !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.hostname === "localhost"
      || isIP(parsed.hostname) !== 0
      || raw !== parsed.origin
      || parsed.origin !== stablePreviewOrigin
    ) fail();
    return parsed.origin;
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) throw error;
    fail();
  }
}

function readBypassSecret(env: BootstrapEnvironment) {
  const value = env.FLIGHT_CONSUMER_PREVIEW_PROVIDER_WEBHOOK_BYPASS_SECRET;
  if (
    typeof value !== "string"
    || value.length < 16
    || value.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) fail();
  return value;
}

function createExactReceiverUrl(env: BootstrapEnvironment) {
  const url = new URL(webhookReceiverPath, readExactPreviewOrigin(env));
  url.searchParams.set(
    "x-vercel-protection-bypass",
    readBypassSecret(env),
  );
  return url.toString();
}

function hasExactEvents(events: readonly string[]) {
  if (events.length !== FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS.length) {
    return false;
  }
  const expected = [...FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS].sort();
  const actual = [...events].sort();
  return actual.every((event, index) => event === expected[index]);
}

function isExactTestWebhook(webhook: z.infer<typeof webhookSchema>, receiverUrl: string) {
  return webhook.live_mode === false
    && webhook.active === true
    && webhook.url === receiverUrl
    && hasExactEvents(webhook.events);
}

function assertJsonResponse(response: Response, url: string, status: number) {
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (
    response.status !== status
    || response.redirected
    || (response.url !== "" && response.url !== url)
    || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)
  ) fail();
}

function parseContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d{0,6})$/.test(value)) fail();
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > DUFFEL_MAX_RAW_BODY_BYTES) fail();
  return length;
}

async function readBoundedJsonResponse(response: Response) {
  const declaredLength = parseContentLength(response);
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      byteLength += item.value.byteLength;
      if (byteLength > DUFFEL_MAX_RAW_BODY_BYTES) {
        await reader.cancel();
        fail();
      }
      chunks.push(Uint8Array.from(item.value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 2) fail();
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  if (
    declaredLength !== null
    && (contentEncoding === undefined || contentEncoding === "identity")
    && declaredLength !== byteLength
  ) fail();
  const rawBody = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  try {
    return parseDuffelJsonBody(rawBody);
  } finally {
    rawBody.fill(0);
  }
}

async function projectProviderError(response: Response) {
  const empty = Object.freeze({
    providerErrorCodes: Object.freeze([] as string[]),
    providerErrorTypes: Object.freeze([] as string[]),
    providerRequestId: null as string | null,
  });
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (
    response.body === null
    || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)
  ) return empty;
  try {
    const parsed = providerErrorResponseSchema.safeParse(
      await readBoundedJsonResponse(response.clone()),
    );
    if (!parsed.success || parsed.data.meta.status !== response.status) return empty;
    return Object.freeze({
      providerErrorCodes: Object.freeze(parsed.data.errors.map((item) => item.code)),
      providerErrorTypes: Object.freeze(parsed.data.errors.map((item) => item.type)),
      providerRequestId: parsed.data.meta.request_id,
    });
  } catch {
    return empty;
  }
}

function requestHeaders(accessToken: string, correlationId: string) {
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    Authorization: `Bearer ${accessToken}`,
    "Duffel-Version": duffelApiVersion,
    "x-client-correlation-id": correlationId,
  } as const;
}

async function listAllTestWebhooks(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
}>) {
  const response = await input.fetcher(listWebhooksUrl, {
    method: "GET",
    headers: requestHeaders(input.accessToken, input.correlationId),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  assertJsonResponse(response, listWebhooksUrl, 200);
  const parsed = listResponseSchema.safeParse(await readBoundedJsonResponse(response));
  if (!parsed.success || parsed.data.meta.after !== null) fail();
  return parsed.data.data;
}

function oneRow<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) fail();
  return parsed.data[0]!;
}

async function readAdminRpc(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
) {
  const result = await createAdminClient().rpc(name, parameters);
  if (result.error !== null) fail();
  return result.data;
}

function sameInstant(left: string, right: string) {
  const leftMilliseconds = Date.parse(left);
  const rightMilliseconds = Date.parse(right);
  return Number.isFinite(leftMilliseconds)
    && leftMilliseconds === rightMilliseconds;
}

function exactMoney(value: number | string) {
  try {
    return BigInt(value);
  } catch {
    fail();
  }
}

export async function readFlightConsumerPreviewDuffelRetainedOrderTarget(
  runtime: FlightConsumerPreviewRuntime,
  operatorClient: FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
): Promise<RetainedTargetSnapshot> {
  const target = retainedTargetIdentity;
  const context = oneRow(convergenceContextSchema, await readAdminRpc(
    "get_flight_consumer_async_duffel_convergence_lease_bound_v1",
    {
      p_customer_id: target.customerId,
      p_order_id: target.orderId,
      p_ledger_id: target.ledgerId,
      p_expected_lease_token_sha256: null,
    },
  ));
  const preterminal = context.order_status === "requires_review"
    && context.issued_ticket_count === 0;
  const terminal = context.order_status === "ticketed"
    && context.issued_ticket_count > 0;
  if (
    context.customer_id !== target.customerId
    || context.order_id !== target.orderId
    || context.provider_attempt_id !== target.attemptId
    || context.ledger_id !== target.ledgerId
    || context.execution_scope_sha256 !== runtime.binding.executionScopeSha256
    || context.provider_offer_ref_sha256 !== target.providerOfferRefSha256
    || context.provider_order_ref_sha256 !== target.providerOrderRefSha256
    || context.recovery_evidence_receipt_sha256
      !== target.recoveryEvidenceReceiptSha256
    || !sameInstant(
      context.recovery_retention_expires_at,
      target.recoveryRetentionExpiresAt,
    )
    || (!preterminal && !terminal)
  ) fail("conflict");

  const replay = oneRow(replayLinkSchema, await readAdminRpc(
    "resolve_flight_consumer_duffel_webhook_replay_v1",
    {
      p_event_id_sha256: target.eventIdSha256,
      p_idempotency_sha256: target.idempotencySha256,
      p_event_type: "order.created",
      p_payload_sha256: target.payloadSha256,
      p_semantic_sha256: target.semanticSha256,
      p_verification_receipt_sha256: target.verificationReceiptSha256,
      p_occurred_at: target.occurredAt,
      p_provider_order_ref_sha256: target.providerOrderRefSha256,
      p_provider_offer_ref_sha256: target.providerOfferRefSha256,
    },
  ));
  if (
    replay.order_id !== target.orderId
    || replay.customer_id !== target.customerId
    || replay.provider_attempt_id !== target.attemptId
    || replay.order_status !== context.order_status
    || replay.execution_scope_sha256 !== context.execution_scope_sha256
  ) fail("conflict");

  const evidence = oneRow(recoveryEvidenceIdentitySchema, await readAdminRpc(
    "load_flight_consumer_duffel_order_recovery_evidence_v1",
    {
      p_customer_id: target.customerId,
      p_order_id: target.orderId,
      p_ledger_id: target.ledgerId,
      p_recovery_evidence_receipt_sha256:
        target.recoveryEvidenceReceiptSha256,
    },
  ));
  if (
    evidence.ledger_id !== target.ledgerId
    || evidence.attempt_id !== target.attemptId
    || evidence.order_id !== target.orderId
    || evidence.customer_id !== target.customerId
    || evidence.execution_scope_sha256 !== context.execution_scope_sha256
    || evidence.provider_offer_ref_sha256 !== target.providerOfferRefSha256
    || evidence.provider_order_ref_sha256 !== target.providerOrderRefSha256
    || evidence.webhook_verification_receipt_sha256
      !== target.verificationReceiptSha256
    || evidence.recovery_evidence_receipt_sha256
      !== target.recoveryEvidenceReceiptSha256
    || !sameInstant(evidence.retention_expires_at, target.recoveryRetentionExpiresAt)
  ) fail("conflict");

  oneRow(z.object({ created_at: instantSchema }).strict(), await readAdminRpc(
    "get_flight_consumer_duffel_recovery_evidence_observation_v1",
    {
      p_customer_id: target.customerId,
      p_order_id: target.orderId,
      p_ledger_id: target.ledgerId,
      p_recovery_evidence_receipt_sha256:
        target.recoveryEvidenceReceiptSha256,
    },
  ));

  const detailResult = await operatorClient.rpc(
    "get_flight_consumer_admin_reconciliation_v1",
    { p_case_id: context.reconciliation_case_id },
  );
  if (detailResult.error !== null) fail();
  const detail = oneRow(reconciliationDetailSchema, detailResult.data);
  const authorized = exactMoney(detail.authorized_cents);
  const captured = exactMoney(detail.captured_cents);
  const refunded = exactMoney(detail.refunded_cents);
  const total = exactMoney(detail.total_cents);
  if (
    detail.case_id !== context.reconciliation_case_id
    || detail.order_id !== target.orderId
    || detail.customer_id !== target.customerId
    || detail.order_status !== context.order_status
    || detail.payment_id !== target.paymentId
    || detail.provider_attempt_id !== target.attemptId
    || detail.execution_scope_sha256 !== context.execution_scope_sha256
    || detail.ticket_count !== context.issued_ticket_count
    || authorized !== total
    || captured !== total
    || refunded !== BigInt(0)
  ) fail("conflict");

  return Object.freeze({
    executionScopeSha256: context.execution_scope_sha256,
    orderStatus: context.order_status,
    issuedTicketCount: context.issued_ticket_count,
  });
}

async function listFailedOrderCreatedEvents(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
}>) {
  const response = await input.fetcher(listFailedOrderCreatedEventsUrl, {
    method: "GET",
    headers: requestHeaders(input.accessToken, input.correlationId),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  assertJsonResponse(response, listFailedOrderCreatedEventsUrl, 200);
  const parsed = failedEventListResponseSchema.safeParse(
    await readBoundedJsonResponse(response),
  );
  if (!parsed.success || parsed.data.meta.after !== null) fail();
  return parsed.data.data;
}

async function createOneTestWebhook(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
  receiverUrl: string;
}>) {
  const createUrl = `${DUFFEL_API_BASE_URL}/air/webhooks`;
  const response = await input.fetcher(createUrl, {
    method: "POST",
    headers: {
      ...requestHeaders(input.accessToken, input.correlationId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        url: input.receiverUrl,
        events: FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS,
      },
    }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (response.status === 409) fail("conflict");
  assertJsonResponse(response, createUrl, 201);
  const parsed = createResponseSchema.safeParse(await readBoundedJsonResponse(response));
  if (!parsed.success || !isExactTestWebhook(parsed.data.data, input.receiverUrl)) fail();
  return Object.freeze({
    decision: "created" as const,
    mode: "duffel_test_mode" as const,
    signingSecret: parsed.data.data.secret,
    storeSigningSecretImmediately: true as const,
    webhookIdSha256: createHash("sha256")
      .update(parsed.data.data.id, "utf8")
      .digest("hex"),
  });
}

async function pingExactTestWebhook(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
  webhook: z.infer<typeof webhookSchema>;
}>) {
  const pingUrl = `${DUFFEL_API_BASE_URL}/air/webhooks/${input.webhook.id}/actions/ping`;
  const response = await input.fetcher(pingUrl, {
    method: "POST",
    headers: {
      ...requestHeaders(input.accessToken, input.correlationId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (
    response.status !== 204
    || response.redirected
    || (response.url !== "" && response.url !== pingUrl)
    || response.body !== null
  ) {
    const providerError = await projectProviderError(response);
    fail("unavailable", {
      operation: "ping_response_contract",
      responseStatus: response.status,
      redirected: response.redirected,
      urlMatched: response.url === "" || response.url === pingUrl,
      bodyWasNull: response.body === null,
      ...providerError,
    });
  }
  return Object.freeze({
    decision: "ping_requested" as const,
    mode: "duffel_test_mode" as const,
    webhookIdSha256: createHash("sha256")
      .update(input.webhook.id, "utf8")
      .digest("hex"),
  });
}

export async function executeFlightConsumerPreviewDuffelWebhookBootstrap(
  untrusted: Readonly<{
    actorId: string;
    confirmation: string;
    idempotencyKey: string;
  }>,
  dependencies: FlightConsumerPreviewDuffelWebhookBootstrapDependencies = {
    env: process.env,
    fetcher: fetch,
  },
): Promise<
  | FlightConsumerPreviewDuffelWebhookBootstrapResult
  | FlightConsumerPreviewDuffelWebhookPingResult
> {
  try {
    const input = inputSchema.parse(untrusted);
    if (typeof dependencies.fetcher !== "function") fail();
    const receiverUrl = createExactReceiverUrl(dependencies.env);
    const accessToken = validateDuffelSandboxAccessToken(
      dependencies.env.DUFFEL_TEST_ACCESS_TOKEN,
    );
    const webhooks = await listAllTestWebhooks({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
    });

    if (
      input.confirmation
      === FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION
    ) {
      if (webhooks.length !== 0) fail("conflict");
      return await createOneTestWebhook({
        accessToken,
        correlationId: input.idempotencyKey,
        fetcher: dependencies.fetcher,
        receiverUrl,
      });
    }

    if (
      webhooks.length !== 1
      || !isExactTestWebhook(webhooks[0]!, receiverUrl)
    ) fail("conflict");
    return await pingExactTestWebhook({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
      webhook: webhooks[0]!,
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) throw error;
    throw new FlightConsumerPreviewDuffelWebhookBootstrapError();
  }
}

export async function completeFlightConsumerPreviewDuffelRetainedOrderCheckoutReplay(
  runtime: FlightConsumerPreviewRuntime,
) {
  const leaseTokenSha256 = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const { data, error } = await createAdminClient().rpc(
    "acquire_flight_consumer_completion_lease_v1",
    {
      p_customer_id: retainedTargetIdentity.customerId,
      p_order_id: retainedTargetIdentity.orderId,
      p_idempotency_key_sha256:
        retainedTargetIdentity.completionIdempotencyKeySha256,
      p_request_sha256: retainedTargetIdentity.completionRequestSha256,
      p_execution_scope_sha256: runtime.binding.executionScopeSha256,
      p_lease_token_sha256: leaseTokenSha256,
      p_lease_duration_seconds: 60,
    },
  );
  if (error !== null) fail();
  const parsed = completionLeaseReplayResultSchema.safeParse(data);
  if (!parsed.success) fail();
  return Object.freeze({
    issuedTicketCount: parsed.data[0]!.issued_ticket_count,
  });
}

const retainedOrderConvergenceDependencies = Object.freeze({
  env: process.env,
  fetcher: fetch,
  sha256: (value: string) => createHash("sha256").update(value, "utf8").digest("hex"),
  providerOrderReferenceSha256: (value: string) =>
    sha256FlightConsumerPreviewReference({ kind: "duffel_order", value }),
  requireRuntime: requireFlightConsumerPreviewRequestRuntime,
  readTarget: readFlightConsumerPreviewDuffelRetainedOrderTarget,
  createConvergence: createFlightConsumerPreviewAsyncDuffelConvergence,
  completeCheckoutReplay:
    completeFlightConsumerPreviewDuffelRetainedOrderCheckoutReplay,
}) satisfies FlightConsumerPreviewDuffelRetainedOrderConvergenceDependencies;

export async function executeFlightConsumerPreviewDuffelRetainedOrderConvergence(
  untrusted: Readonly<{
    actorId: string;
    confirmation: string;
    idempotencyKey: string;
  }>,
  operatorClient: FlightConsumerPreviewDuffelRetainedOrderOperatorClient,
  dependencies: FlightConsumerPreviewDuffelRetainedOrderConvergenceDependencies =
    retainedOrderConvergenceDependencies,
): Promise<FlightConsumerPreviewDuffelRetainedOrderConvergenceResult> {
  try {
    const input = retainedConvergenceInputSchema.parse(untrusted);
    if (
      typeof operatorClient?.rpc !== "function"
      || typeof dependencies.fetcher !== "function"
      || typeof dependencies.sha256 !== "function"
      || typeof dependencies.providerOrderReferenceSha256 !== "function"
      || typeof dependencies.requireRuntime !== "function"
      || typeof dependencies.readTarget !== "function"
      || typeof dependencies.createConvergence !== "function"
      || typeof dependencies.completeCheckoutReplay !== "function"
    ) fail();
    const receiverUrl = createExactReceiverUrl(dependencies.env);
    const accessToken = validateDuffelSandboxAccessToken(
      dependencies.env.DUFFEL_TEST_ACCESS_TOKEN,
    );
    const firstRuntime = await dependencies.requireRuntime();
    const firstSnapshot = await dependencies.readTarget(firstRuntime, operatorClient);
    if (firstSnapshot.executionScopeSha256 !== firstRuntime.binding.executionScopeSha256) {
      fail("conflict");
    }

    const webhooks = await listAllTestWebhooks({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
    });
    if (
      webhooks.length !== 1
      || !isExactTestWebhook(webhooks[0]!, receiverUrl)
    ) fail("conflict");

    const events = await listFailedOrderCreatedEvents({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
    });
    const candidates = events.filter((event) => {
      const eventIdSha256 = dependencies.sha256(event.id);
      const idempotencySha256 = dependencies.sha256(event.idempotency_key);
      return eventIdSha256 === retainedTargetIdentity.eventIdSha256
        || idempotencySha256 === retainedTargetIdentity.idempotencySha256;
    });
    if (candidates.length !== 1) fail("conflict");
    const candidate = candidates[0]!;
    if (
      dependencies.sha256(candidate.id)
        !== retainedTargetIdentity.eventIdSha256
      || dependencies.sha256(candidate.idempotency_key)
        !== retainedTargetIdentity.idempotencySha256
      || dependencies.providerOrderReferenceSha256(candidate.idempotency_key)
        !== retainedTargetIdentity.providerOrderRefSha256
      || !sameInstant(candidate.created_at, retainedTargetIdentity.occurredAt)
    ) fail("conflict");

    const secondRuntime = await dependencies.requireRuntime();
    if (
      secondRuntime.binding.executionScopeSha256
        !== firstRuntime.binding.executionScopeSha256
      || secondRuntime.binding.runtimeControlReceiptSha256
        !== firstRuntime.binding.runtimeControlReceiptSha256
    ) fail("conflict");
    const secondSnapshot = await dependencies.readTarget(secondRuntime, operatorClient);
    if (
      secondSnapshot.executionScopeSha256 !== firstSnapshot.executionScopeSha256
      || (firstSnapshot.orderStatus === "ticketed"
        && secondSnapshot.orderStatus !== "ticketed")
      || (secondSnapshot.orderStatus === "requires_review"
        && secondSnapshot.issuedTicketCount !== 0)
      || (secondSnapshot.orderStatus === "ticketed"
        && secondSnapshot.issuedTicketCount < 1)
    ) fail("conflict");

    const convergence = dependencies.createConvergence(secondRuntime);
    const result = convergenceResultSchema.parse(await convergence.converge({
      customerId: retainedTargetIdentity.customerId,
      orderId: retainedTargetIdentity.orderId,
      attemptId: retainedTargetIdentity.attemptId,
      ledgerId: retainedTargetIdentity.ledgerId,
      leaseTokenSha256: null,
      providerOrderId: candidate.idempotency_key,
      providerOrderRefSha256: retainedTargetIdentity.providerOrderRefSha256,
      providerOfferRefSha256: retainedTargetIdentity.providerOfferRefSha256,
    }));
    if (result.orderId !== retainedTargetIdentity.orderId) fail("conflict");
    const completion = await dependencies.completeCheckoutReplay(secondRuntime);
    if (completion.issuedTicketCount !== result.issuedTicketCount) fail("conflict");
    return Object.freeze({
      decision: "locally_converged" as const,
      mode: "duffel_test_mode" as const,
      status: "ticketed" as const,
      issuedTicketCount: result.issuedTicketCount,
      completionLeaseState: "completed" as const,
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) throw error;
    throw new FlightConsumerPreviewDuffelWebhookBootstrapError();
  }
}

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_LIST_URL =
  listWebhooksUrl;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_FAILED_ORDER_CREATED_EVENTS_LIST_URL =
  listFailedOrderCreatedEventsUrl;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_RECEIVER_PATH =
  webhookReceiverPath;
