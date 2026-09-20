import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  DUFFEL_MAX_RAW_BODY_BYTES,
  DuffelContractError,
  parseDuffelJsonBody,
  sanitizeVerifiedDuffelSandboxWebhook,
  verifyDuffelWebhookSignature,
} from "../duffel-sandbox-contract";
import {
  canonicalFlightJson,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { createFlightConsumerPreviewAsyncDuffelConvergence } from "./async-duffel-order-convergence.server";
import { sha256FlightConsumerPreviewReference } from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES =
  DUFFEL_MAX_RAW_BODY_BYTES;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS = Object.freeze([
  "order.created",
  "order.creation_failed",
  "air.order.changed",
  "order.airline_initiated_change_detected",
] as const);

type SupportedEventType =
  (typeof FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS)[number];

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const providerOrderIdSchema = z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/);
const providerOfferIdSchema = z.string().regex(/^off_[A-Za-z0-9]{8,252}$/);
const ledgerStateSchema = z.enum([
  "verified",
  "processing",
  "processed",
  "duplicate",
  "blocked",
  "failed",
]);

const linkSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  provider_attempt_id: uuidSchema,
  order_status: z.enum([
    "pending_payment",
    "payment_authorized",
    "order_creating",
    "booked",
    "ticketing_pending",
    "ticketed",
    "servicing",
    "cancellation_pending",
    "cancelled",
    "refund_pending",
    "refunded",
    "failed",
    "requires_review",
  ]),
  execution_scope_sha256: sha256Schema,
}).strict();

const replayLinkSchema = z.array(z.object({
  replay_found: z.literal(true),
  order_id: uuidSchema.nullable(),
  customer_id: uuidSchema.nullable(),
  provider_attempt_id: uuidSchema.nullable(),
  order_status: linkSchema.shape.order_status.nullable(),
  execution_scope_sha256: sha256Schema,
}).strict()).max(1);

const pendingAssociationSchema = z.array(z.object({
  pending_link_id: uuidSchema,
  pending_revision: z.union([z.literal(0), z.literal(1)]),
  pending_state: z.enum(["pending", "linked", "review"]),
}).strict()).max(1);

const pendingResolutionSchema = z.array(z.object({
  pending_link_id: uuidSchema,
  pending_revision: z.union([z.literal(0), z.literal(1)]),
  pending_state: z.enum(["pending", "linked", "review"]),
  order_id: uuidSchema.nullable(),
  customer_id: uuidSchema.nullable(),
  provider_attempt_id: uuidSchema.nullable(),
  order_status: linkSchema.shape.order_status.nullable(),
  execution_scope_sha256: sha256Schema.nullable(),
}).strict()).length(1);

const recordResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay", "duplicate"]),
  ledger_id: uuidSchema,
  ledger_revision: z.number().int().min(0).max(2),
  ledger_state: ledgerStateSchema,
}).strict()).length(1);

const claimResultSchema = z.array(z.object({
  ledger_id: uuidSchema,
  ledger_revision: z.literal(1),
  ledger_state: z.literal("processing"),
  processing_lease_token_sha256: sha256Schema,
  processing_lease_expires_at: z.string().datetime({ offset: true }),
  processing_attempt_count: z.number().int().min(1),
}).strict()).length(1);

const reclaimResultSchema = claimResultSchema;

const completeResultSchema = z.array(z.object({
  ledger_id: uuidSchema,
  ledger_revision: z.literal(2),
  ledger_state: z.enum(["processed", "duplicate", "blocked", "failed"]),
}).strict()).length(1);

const operationalEscalationResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay"]),
  reconciliation_case_id: uuidSchema,
  order_id: uuidSchema,
  event_type: z.enum([
    "order.creation_failed",
    "air.order.changed",
    "order.airline_initiated_change_detected",
  ]),
  case_status: z.enum(["open", "investigating", "blocked", "resolved"]),
}).strict()).length(1);

const orderConvergenceResultSchema = z.object({
  orderId: uuidSchema,
  status: z.literal("ticketed"),
  issuedTicketCount: z.number().int().min(1),
  reconciliationCaseId: uuidSchema.nullable(),
  webhookLeaseCompletionRequired: z.boolean(),
}).strict();

type WebhookLink = z.infer<typeof linkSchema>;

export type FlightConsumerDuffelLinkedWebhookRecordParameters = Readonly<{
  p_event_id_sha256: string;
  p_idempotency_sha256: string;
  p_event_type: SupportedEventType;
  p_payload_sha256: string;
  p_semantic_sha256: string;
  p_verification_receipt_sha256: string;
  p_occurred_at: string;
  p_live_mode: false;
  p_provider_order_ref_sha256: string | null;
  p_provider_offer_ref_sha256: string | null;
}>;

type DuffelWebhookLeaseClaimParameters = Readonly<{
  p_ledger_id: string;
  p_expected_revision: 0;
  p_lease_token_sha256: string;
  p_lease_duration_seconds: 60;
}>;

type DuffelWebhookLeaseReclaimParameters = Readonly<{
  p_ledger_id: string;
  p_expected_revision: 1;
  p_stale_before: string;
  p_recovery_receipt_sha256: string;
  p_lease_token_sha256: string;
  p_lease_duration_seconds: 60;
}>;

export interface FlightConsumerPreviewDuffelWebhookLedgerPort {
  resolveReplayLink(input: Readonly<{
    eventIdSha256: string;
    idempotencySha256: string;
    eventType: SupportedEventType;
    payloadSha256: string;
    semanticSha256: string;
    verificationReceiptSha256: string;
    occurredAt: string;
    providerOrderRefSha256: string | null;
    providerOfferRefSha256: string | null;
  }>): Promise<unknown>;
  resolveLink(input: Readonly<{
    providerOrderRefSha256: string | null;
    providerOfferRefSha256: string | null;
  }>): Promise<unknown>;
  recordLinked(parameters: FlightConsumerDuffelLinkedWebhookRecordParameters): Promise<unknown>;
  recordUnlinked(parameters: FlightConsumerDuffelLinkedWebhookRecordParameters): Promise<unknown>;
  enqueuePending(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_ledger_revision: number;
    p_provider_order_ref_sha256: string;
    p_provider_offer_ref_sha256: string;
  }>): Promise<unknown>;
  resolvePending(parameters: Readonly<{
    p_pending_link_id: string;
    p_expected_pending_revision: 0 | 1;
  }>): Promise<unknown>;
  claim(parameters: DuffelWebhookLeaseClaimParameters): Promise<unknown>;
  reclaim(parameters: DuffelWebhookLeaseReclaimParameters): Promise<unknown | null>;
  escalate(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_event_type: Exclude<SupportedEventType, "order.created">;
    p_expected_semantic_sha256: string;
    p_expected_lease_token_sha256: string | null;
  }>): Promise<unknown>;
  complete(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_revision: 1;
    p_lease_token_sha256: string;
    p_outcome: "processed" | "duplicate" | "blocked";
    p_outcome_sha256: string;
  }>): Promise<unknown>;
}

export interface FlightConsumerPreviewDuffelOrderConvergencePort {
  converge(input: Readonly<{
    customerId: string;
    orderId: string;
    attemptId: string;
    ledgerId: string;
    leaseTokenSha256: string | null;
    providerOrderId: string;
    providerOrderRefSha256: string;
    providerOfferRefSha256: string;
  }>): Promise<unknown>;
}

export type FlightConsumerPreviewDuffelWebhookResult = Readonly<{
  version: "flight-consumer-preview-duffel-webhook-result-v1";
  decision:
    | "processed"
    | "replayed"
    | "processing"
    | "deferred"
    | "blocked"
    | "verified_ping";
  eventType: SupportedEventType | "ping.triggered";
  linkedOrderId: string | null;
  reconciliationRequired: true;
  directMutationAuthorized: false;
}>;

export class FlightConsumerPreviewDuffelWebhookError extends Error {
  readonly status: 400 | 503;
  readonly diagnostic: string;

  constructor(status: 400 | 503 = 503, diagnostic = "workflow_unavailable") {
    super("Duffel Consumer Preview webhook could not be processed.");
    this.name = "FlightConsumerPreviewDuffelWebhookError";
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

class SupabaseDuffelWebhookLedgerPort
implements FlightConsumerPreviewDuffelWebhookLedgerPort {
  async resolveReplayLink(input: Readonly<{
    eventIdSha256: string;
    idempotencySha256: string;
    eventType: SupportedEventType;
    payloadSha256: string;
    semanticSha256: string;
    verificationReceiptSha256: string;
    occurredAt: string;
    providerOrderRefSha256: string | null;
    providerOfferRefSha256: string | null;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "resolve_flight_consumer_duffel_webhook_replay_v1",
      {
        p_event_id_sha256: input.eventIdSha256,
        p_idempotency_sha256: input.idempotencySha256,
        p_event_type: input.eventType,
        p_payload_sha256: input.payloadSha256,
        p_semantic_sha256: input.semanticSha256,
        p_verification_receipt_sha256: input.verificationReceiptSha256,
        p_occurred_at: input.occurredAt,
        p_provider_order_ref_sha256: input.providerOrderRefSha256,
        p_provider_offer_ref_sha256: input.providerOfferRefSha256,
      },
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async resolveLink(input: Readonly<{
    providerOrderRefSha256: string | null;
    providerOfferRefSha256: string | null;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "resolve_flight_consumer_duffel_webhook_link_v1",
      {
        p_provider_order_ref_sha256: input.providerOrderRefSha256,
        p_provider_offer_ref_sha256: input.providerOfferRefSha256,
      },
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async recordLinked(parameters: FlightConsumerDuffelLinkedWebhookRecordParameters) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_verified_duffel_order_webhook_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async recordUnlinked(parameters: FlightConsumerDuffelLinkedWebhookRecordParameters) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_verified_unlinked_duffel_webhook_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async enqueuePending(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_ledger_revision: number;
    p_provider_order_ref_sha256: string;
    p_provider_offer_ref_sha256: string;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "enqueue_flight_consumer_duffel_pending_webhook_link_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async resolvePending(parameters: Readonly<{
    p_pending_link_id: string;
    p_expected_pending_revision: 0 | 1;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async claim(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_revision: 0;
    p_lease_token_sha256: string;
    p_lease_duration_seconds: 60;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "claim_flight_consumer_webhook_lease_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async reclaim(parameters: DuffelWebhookLeaseReclaimParameters) {
    const { data, error } = await createAdminClient().rpc(
      "reclaim_flight_consumer_webhook_v1",
      parameters,
    );
    if (error?.message.includes("Flight webhook reclaim CAS failed")) return null;
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async escalate(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_event_type: Exclude<SupportedEventType, "order.created">;
    p_expected_semantic_sha256: string;
    p_expected_lease_token_sha256: string | null;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_webhook_operational_escalation_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }

  async complete(parameters: Readonly<{
    p_ledger_id: string;
    p_expected_revision: 1;
    p_lease_token_sha256: string;
    p_outcome: "processed" | "duplicate" | "blocked";
    p_outcome_sha256: string;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_webhook_lease_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewDuffelWebhookError();
    return data;
  }
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function signedEnvelopeDiagnostic(error: unknown) {
  if (!(error instanceof DuffelContractError)) return "signed_envelope_unexpected";
  const message = error.message;
  if (message.includes("successful signature verification")) return "signed_envelope_verification_binding";
  if (message.includes("live_mode")) return "signed_envelope_live_mode";
  if (message.includes("API version")) return "signed_envelope_api_version";
  if (message.includes("event ID")) return "signed_envelope_event_id";
  if (message.includes("idempotency key")) return "signed_envelope_idempotency_key";
  if (message.includes("event type")) return "signed_envelope_event_type";
  if (message.includes("creation time")) return "signed_envelope_created_at";
  return "signed_envelope_json_shape";
}

function verifyIncomingDuffelSandboxEvent(input: Readonly<{
  rawBody: unknown;
  signature: unknown;
  webhookSecret: unknown;
  nowSeconds: unknown;
}>) {
  if (
    !(input.rawBody instanceof Uint8Array)
    || input.rawBody.byteLength < 2
    || input.rawBody.byteLength > FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_MAX_BYTES
    || typeof input.signature !== "string"
    || input.signature.length < 8
    || input.signature.length > 4_096
  ) throw new FlightConsumerPreviewDuffelWebhookError(400, "request_contract_rejected");
  if (
    typeof input.webhookSecret !== "string"
    || input.webhookSecret.length < 16
    || input.webhookSecret.length > 512
    || typeof input.nowSeconds !== "number"
    || !Number.isSafeInteger(input.nowSeconds)
    || input.nowSeconds < 0
  ) throw new FlightConsumerPreviewDuffelWebhookError();
  const rawBody = Uint8Array.from(input.rawBody);
  const verification = verifyDuffelWebhookSignature({
    rawBody,
    signatureHeader: input.signature,
    secret: input.webhookSecret,
    nowSeconds: input.nowSeconds,
  });
  if (!verification.verified) {
    rawBody.fill(0);
    throw new FlightConsumerPreviewDuffelWebhookError(
      400,
      `signature_${verification.reason}`,
    );
  }
  try {
    return Object.freeze({
      event: sanitizeVerifiedDuffelSandboxWebhook(rawBody, verification),
      rawBody,
    });
  } catch (error) {
    rawBody.fill(0);
    throw new FlightConsumerPreviewDuffelWebhookError(
      400,
      signedEnvelopeDiagnostic(error),
    );
  }
}

function verifiedPingResult(): FlightConsumerPreviewDuffelWebhookResult {
  return Object.freeze({
    version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
    decision: "verified_ping" as const,
    eventType: "ping.triggered" as const,
    linkedOrderId: null,
    reconciliationRequired: true as const,
    directMutationAuthorized: false as const,
  });
}

function newWebhookLeaseTokenSha256() {
  return sha256(randomBytes(32));
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  const prototype = value !== null && typeof value === "object"
    ? Object.getPrototypeOf(value)
    : undefined;
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (prototype !== Object.prototype && prototype !== null)
  ) return null;
  return value as Record<string, unknown>;
}

function providerReferences(rawBody: Uint8Array, eventType: SupportedEventType) {
  const envelope = plainRecord(parseDuffelJsonBody(rawBody));
  const data = plainRecord(envelope?.data);
  const object = plainRecord(data?.object) ?? data;
  if (object === null) throw new FlightConsumerPreviewDuffelWebhookError(400);
  const orderCandidate = object.order_id ?? object.id;
  const offerCandidate = object.offer_id;
  const order = providerOrderIdSchema.safeParse(orderCandidate);
  const offer = providerOfferIdSchema.safeParse(offerCandidate);
  if (
    (eventType === "order.created" && (!order.success || !offer.success))
    || (eventType === "order.creation_failed" && !offer.success)
    || ((eventType === "air.order.changed"
      || eventType === "order.airline_initiated_change_detected") && !order.success)
  ) throw new FlightConsumerPreviewDuffelWebhookError(400);
  return Object.freeze({
    providerOrderId: order.success ? order.data : null,
    providerOfferId: offer.success ? offer.data : null,
  });
}

function oneLink(value: unknown): WebhookLink | null {
  if (Array.isArray(value) && value.length === 0) return null;
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value;
  const parsed = linkSchema.safeParse(candidate);
  if (!parsed.success) throw new FlightConsumerPreviewDuffelWebhookError();
  return Object.freeze(parsed.data);
}

function isAdverseDuffelEvent(
  eventType: SupportedEventType,
): eventType is Exclude<SupportedEventType, "order.created"> {
  return eventType !== "order.created";
}

export function createInjectedFlightConsumerPreviewDuffelWebhookWorkflow(input: Readonly<{
  executionScopeSha256: string;
  webhookSecret: string;
  ledger: FlightConsumerPreviewDuffelWebhookLedgerPort;
  orderConvergence: FlightConsumerPreviewDuffelOrderConvergencePort;
  onOrderTicketed?: (input: Readonly<{ customerId: string; orderId: string }>) => void;
  nowSeconds: () => number;
}>) {
  const executionScopeSha256 = sha256Schema.parse(input.executionScopeSha256);
  if (
    typeof input.webhookSecret !== "string"
    || input.webhookSecret.length < 16
    || input.webhookSecret.length > 512
    || typeof input.ledger?.resolveReplayLink !== "function"
    || typeof input.ledger?.resolveLink !== "function"
    || typeof input.ledger?.recordLinked !== "function"
    || typeof input.ledger?.recordUnlinked !== "function"
    || typeof input.ledger?.enqueuePending !== "function"
    || typeof input.ledger?.resolvePending !== "function"
    || typeof input.ledger?.claim !== "function"
    || typeof input.ledger?.reclaim !== "function"
    || typeof input.ledger?.escalate !== "function"
    || typeof input.ledger?.complete !== "function"
    || typeof input.orderConvergence?.converge !== "function"
    || (input.onOrderTicketed !== undefined && typeof input.onOrderTicketed !== "function")
    || typeof input.nowSeconds !== "function"
  ) throw new FlightConsumerPreviewDuffelWebhookError();

  return Object.freeze({
    async ingest(untrusted: Readonly<{ rawBody: Uint8Array; signature: string }>) {
      let verifiedRawBody: Uint8Array | null = null;
      try {
        const verified = verifyIncomingDuffelSandboxEvent({
          rawBody: untrusted.rawBody,
          signature: untrusted.signature,
          webhookSecret: input.webhookSecret,
          nowSeconds: input.nowSeconds(),
        });
        verifiedRawBody = verified.rawBody;
        const event = verified.event;
        if (event.eventType === "ping.triggered") {
          return verifiedPingResult();
        }
        if (!FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS.includes(
          event.eventType as SupportedEventType,
        )) throw new FlightConsumerPreviewDuffelWebhookError(400, "unsupported_event_type");
        const eventType = event.eventType as SupportedEventType;
        const references = providerReferences(verifiedRawBody, eventType);
        const providerOrderRefSha256 = references.providerOrderId === null
          ? null
          : sha256FlightConsumerPreviewReference({
            kind: "duffel_order",
            value: references.providerOrderId,
          });
        const providerOfferRefSha256 = references.providerOfferId === null
          ? null
          : sha256FlightConsumerPreviewReference({
            kind: "duffel_offer",
            value: references.providerOfferId,
          });
        const eventIdSha256 = sha256(event.eventId);
        const idempotencySha256 = sha256(event.idempotencyKey);
        const verificationReceiptSha256 = createHmac("sha256", input.webhookSecret)
          .update("flight-consumer-preview-duffel-webhook-verification-v1")
          .update("\0")
          .update(canonicalFlightJson({
            eventIdSha256,
            idempotencySha256,
            eventType,
            payloadSha256: event.bodyDigest,
            semanticSha256: event.semanticDigest,
            executionScopeSha256,
            providerOrderRefSha256,
            providerOfferRefSha256,
          } as FlightCanonicalJsonValue))
          .digest("hex");
        const replayRows = replayLinkSchema.parse(await input.ledger.resolveReplayLink({
          eventIdSha256,
          idempotencySha256,
          eventType,
          payloadSha256: event.bodyDigest,
          semanticSha256: event.semanticDigest,
          verificationReceiptSha256,
          occurredAt: event.createdAt,
          providerOrderRefSha256,
          providerOfferRefSha256,
        }));
        const replay = replayRows[0] ?? null;
        let link: WebhookLink | null;
        let linkFromPendingAssociation = false;
        if (replay === null) {
          link = oneLink(await input.ledger.resolveLink({
            providerOrderRefSha256,
            providerOfferRefSha256,
          }));
        } else if (replay.order_id === null) {
          if (
            replay.customer_id !== null
            || replay.provider_attempt_id !== null
            || replay.order_status !== null
          ) throw new FlightConsumerPreviewDuffelWebhookError();
          link = null;
        } else {
          link = linkSchema.parse({
            order_id: replay.order_id,
            customer_id: replay.customer_id,
            provider_attempt_id: replay.provider_attempt_id,
            order_status: replay.order_status,
            execution_scope_sha256: replay.execution_scope_sha256,
          });
        }
        if (link !== null && link.execution_scope_sha256 !== executionScopeSha256) {
          throw new FlightConsumerPreviewDuffelWebhookError();
        }
        const commonParameters = Object.freeze({
          p_event_id_sha256: eventIdSha256,
          p_idempotency_sha256: idempotencySha256,
          p_event_type: eventType,
          p_payload_sha256: event.bodyDigest,
          p_semantic_sha256: event.semanticDigest,
          p_verification_receipt_sha256: verificationReceiptSha256,
          p_occurred_at: event.createdAt,
        });
        const duffelEnvelope = Object.freeze({
          ...commonParameters,
          p_live_mode: false as const,
          p_provider_order_ref_sha256: providerOrderRefSha256,
          p_provider_offer_ref_sha256: providerOfferRefSha256,
        });
        const recorded = recordResultSchema.parse(await (
          link === null
            ? input.ledger.recordUnlinked(duffelEnvelope)
            : input.ledger.recordLinked(duffelEnvelope)
        ))[0]!;
        if (
          link === null
          && eventType === "order.created"
          && providerOrderRefSha256 !== null
          && providerOfferRefSha256 !== null
        ) {
          const pendingRows = pendingAssociationSchema.parse(
            await input.ledger.enqueuePending({
              p_ledger_id: recorded.ledger_id,
              p_expected_ledger_revision: recorded.ledger_revision,
              p_provider_order_ref_sha256: providerOrderRefSha256,
              p_provider_offer_ref_sha256: providerOfferRefSha256,
            }),
          );
          const pending = pendingRows[0] ?? null;
          if (pending !== null) {
            const resolved = pendingResolutionSchema.parse(
              await input.ledger.resolvePending({
                p_pending_link_id: pending.pending_link_id,
                p_expected_pending_revision: pending.pending_revision,
              }),
            )[0]!;
            if (resolved.pending_link_id !== pending.pending_link_id) {
              throw new FlightConsumerPreviewDuffelWebhookError();
            }
            const hasNoLink = resolved.order_id === null
              && resolved.customer_id === null
              && resolved.provider_attempt_id === null
              && resolved.order_status === null
              && resolved.execution_scope_sha256 === null;
            if (resolved.pending_state === "linked") {
              if (
                resolved.pending_revision !== 1
                || resolved.order_id === null
                || resolved.customer_id === null
                || resolved.provider_attempt_id === null
                || resolved.order_status === null
                || resolved.execution_scope_sha256 !== executionScopeSha256
              ) throw new FlightConsumerPreviewDuffelWebhookError();
              link = linkSchema.parse({
                order_id: resolved.order_id,
                customer_id: resolved.customer_id,
                provider_attempt_id: resolved.provider_attempt_id,
                order_status: resolved.order_status,
                execution_scope_sha256: resolved.execution_scope_sha256,
              });
              linkFromPendingAssociation = true;
            } else if (!hasNoLink) {
              throw new FlightConsumerPreviewDuffelWebhookError();
            } else if (resolved.pending_state === "pending") {
              if (resolved.pending_revision !== 0) {
                throw new FlightConsumerPreviewDuffelWebhookError();
              }
              return Object.freeze({
                version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
                decision: "deferred" as const,
                eventType,
                linkedOrderId: null,
                reconciliationRequired: true as const,
                directMutationAuthorized: false as const,
              });
            } else if (resolved.pending_revision !== 1) {
              throw new FlightConsumerPreviewDuffelWebhookError();
            }
          }
        }
        if (
          linkFromPendingAssociation
          && link !== null
          && link.order_status !== "ticketed"
        ) {
          return Object.freeze({
            version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
            decision: "deferred" as const,
            eventType,
            linkedOrderId: link.order_id,
            reconciliationRequired: true as const,
            directMutationAuthorized: false as const,
          });
        }
        if (recorded.ledger_revision === 2) {
          if (
            link !== null
            && eventType === "order.created"
            && (
              link.order_status === "ticketed"
              || (
                !linkFromPendingAssociation
                && link.order_status === "requires_review"
              )
            )
          ) {
            if (linkFromPendingAssociation) {
              try {
                input.onOrderTicketed?.({
                  customerId: link.customer_id,
                  orderId: link.order_id,
                });
              } catch {
                // Ticket state is authoritative; notification scheduling is fail-open.
              }
              return Object.freeze({
                version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
                decision: "replayed" as const,
                eventType,
                linkedOrderId: link.order_id,
                reconciliationRequired: true as const,
                directMutationAuthorized: false as const,
              });
            }
            if (
              references.providerOrderId === null
              || references.providerOfferId === null
              || providerOrderRefSha256 === null
              || providerOfferRefSha256 === null
            ) {
              throw new FlightConsumerPreviewDuffelWebhookError(400);
            }
            const converged = orderConvergenceResultSchema.parse(
              await input.orderConvergence.converge({
              customerId: link.customer_id,
              orderId: link.order_id,
              attemptId: link.provider_attempt_id,
              ledgerId: recorded.ledger_id,
              leaseTokenSha256: null,
              providerOrderId: references.providerOrderId,
              providerOrderRefSha256,
              providerOfferRefSha256,
              }),
            );
            if (
              converged.orderId !== link.order_id
              || converged.webhookLeaseCompletionRequired
            ) throw new FlightConsumerPreviewDuffelWebhookError();
            try {
              input.onOrderTicketed?.({
                customerId: link.customer_id,
                orderId: link.order_id,
              });
            } catch {
              // Ticket state is authoritative; notification scheduling is fail-open.
            }
          } else if (link !== null && isAdverseDuffelEvent(eventType)) {
            const escalated = operationalEscalationResultSchema.parse(
              await input.ledger.escalate({
                p_ledger_id: recorded.ledger_id,
                p_expected_event_type: eventType,
                p_expected_semantic_sha256: event.semanticDigest,
                p_expected_lease_token_sha256: null,
              }),
            )[0]!;
            if (
              escalated.order_id !== link.order_id
              || escalated.event_type !== eventType
            ) throw new FlightConsumerPreviewDuffelWebhookError();
          }
          return Object.freeze({
            version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
            decision: "replayed" as const,
            eventType,
            linkedOrderId: link?.order_id ?? null,
            reconciliationRequired: true as const,
            directMutationAuthorized: false as const,
          });
        }
        const leaseTokenSha256 = newWebhookLeaseTokenSha256();
        if (recorded.ledger_revision === 1 && recorded.ledger_state === "processing") {
          const staleBefore = new Date((input.nowSeconds() - 180) * 1_000).toISOString();
          const recoveryReceiptSha256 = sha256(canonicalFlightJson({
            version: "flight-consumer-preview-duffel-webhook-recovery-v1",
            ledgerId: recorded.ledger_id,
            eventType,
            semanticSha256: event.semanticDigest,
            leaseTokenSha256,
            staleBefore,
          }));
          const reclaimedRaw = await input.ledger.reclaim({
            p_ledger_id: recorded.ledger_id,
            p_expected_revision: 1,
            p_stale_before: staleBefore,
            p_recovery_receipt_sha256: recoveryReceiptSha256,
            p_lease_token_sha256: leaseTokenSha256,
            p_lease_duration_seconds: 60,
          });
          if (reclaimedRaw === null) {
            return Object.freeze({
              version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
              decision: "processing" as const,
              eventType,
              linkedOrderId: link?.order_id ?? null,
              reconciliationRequired: true as const,
              directMutationAuthorized: false as const,
            });
          }
          const reclaimed = reclaimResultSchema.parse(reclaimedRaw)[0]!;
          if (
            reclaimed.ledger_id !== recorded.ledger_id
            || reclaimed.processing_lease_token_sha256 !== leaseTokenSha256
          ) throw new FlightConsumerPreviewDuffelWebhookError();
        }
        if (
          recorded.ledger_revision !== 0
          && !(recorded.ledger_revision === 1 && recorded.ledger_state === "processing")
        ) {
          throw new FlightConsumerPreviewDuffelWebhookError();
        }
        if (recorded.ledger_revision === 0) {
          if (recorded.ledger_state !== "verified") throw new FlightConsumerPreviewDuffelWebhookError();
          const claim = claimResultSchema.parse(await input.ledger.claim({
            p_ledger_id: recorded.ledger_id,
            p_expected_revision: 0,
            p_lease_token_sha256: leaseTokenSha256,
            p_lease_duration_seconds: 60,
          }))[0]!;
          if (
            claim.ledger_id !== recorded.ledger_id
            || claim.processing_lease_token_sha256 !== leaseTokenSha256
          ) {
            throw new FlightConsumerPreviewDuffelWebhookError();
          }
        }
        if (link !== null && eventType === "order.created") {
          if (
            references.providerOrderId === null
            || references.providerOfferId === null
            || providerOrderRefSha256 === null
            || providerOfferRefSha256 === null
          ) {
            throw new FlightConsumerPreviewDuffelWebhookError(400);
          }
          if (linkFromPendingAssociation) {
            const outcomeSha256 = sha256(canonicalFlightJson({
              version: "flight-consumer-preview-duffel-webhook-outcome-v1",
              ledgerId: recorded.ledger_id,
              eventType,
              semanticSha256: event.semanticDigest,
              linkedOrderId: link.order_id,
              outcome: "processed",
              reconciliationRequired: true,
              directMutationAuthorized: false,
            }));
            const completed = completeResultSchema.parse(await input.ledger.complete({
              p_ledger_id: recorded.ledger_id,
              p_expected_revision: 1,
              p_lease_token_sha256: leaseTokenSha256,
              p_outcome: "processed",
              p_outcome_sha256: outcomeSha256,
            }))[0]!;
            if (
              completed.ledger_id !== recorded.ledger_id
              || completed.ledger_state !== "processed"
            ) throw new FlightConsumerPreviewDuffelWebhookError();
            try {
              input.onOrderTicketed?.({
                customerId: link.customer_id,
                orderId: link.order_id,
              });
            } catch {
              // Ticket state is authoritative; notification scheduling is fail-open.
            }
            return Object.freeze({
              version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
              decision: "processed" as const,
              eventType,
              linkedOrderId: link.order_id,
              reconciliationRequired: true as const,
              directMutationAuthorized: false as const,
            });
          }
          const converged = orderConvergenceResultSchema.parse(
            await input.orderConvergence.converge({
            customerId: link.customer_id,
            orderId: link.order_id,
            attemptId: link.provider_attempt_id,
            ledgerId: recorded.ledger_id,
            leaseTokenSha256,
            providerOrderId: references.providerOrderId,
            providerOrderRefSha256,
            providerOfferRefSha256,
            }),
          );
          if (converged.orderId !== link.order_id) {
            throw new FlightConsumerPreviewDuffelWebhookError();
          }
          if (converged.webhookLeaseCompletionRequired) {
            const outcomeSha256 = sha256(canonicalFlightJson({
              version: "flight-consumer-preview-duffel-webhook-outcome-v1",
              ledgerId: recorded.ledger_id,
              eventType,
              semanticSha256: event.semanticDigest,
              linkedOrderId: link.order_id,
              outcome: "processed",
              reconciliationRequired: true,
              directMutationAuthorized: false,
            }));
            const completed = completeResultSchema.parse(await input.ledger.complete({
              p_ledger_id: recorded.ledger_id,
              p_expected_revision: 1,
              p_lease_token_sha256: leaseTokenSha256,
              p_outcome: "processed",
              p_outcome_sha256: outcomeSha256,
            }))[0]!;
            if (
              completed.ledger_id !== recorded.ledger_id
              || completed.ledger_state !== "processed"
            ) throw new FlightConsumerPreviewDuffelWebhookError();
          }
          try {
            input.onOrderTicketed?.({
              customerId: link.customer_id,
              orderId: link.order_id,
            });
          } catch {
            // Ticket state is authoritative; notification scheduling is fail-open.
          }
          return Object.freeze({
            version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
            decision: "processed" as const,
            eventType,
            linkedOrderId: link.order_id,
            reconciliationRequired: true as const,
            directMutationAuthorized: false as const,
          });
        }
        if (link !== null && isAdverseDuffelEvent(eventType)) {
          const escalated = operationalEscalationResultSchema.parse(
            await input.ledger.escalate({
              p_ledger_id: recorded.ledger_id,
              p_expected_event_type: eventType,
              p_expected_semantic_sha256: event.semanticDigest,
              p_expected_lease_token_sha256: leaseTokenSha256,
            }),
          )[0]!;
          if (
            escalated.order_id !== link.order_id
            || escalated.event_type !== eventType
          ) throw new FlightConsumerPreviewDuffelWebhookError();
        }
        const outcome = link === null || isAdverseDuffelEvent(eventType)
          ? "blocked" as const
          : recorded.decision === "duplicate" ? "duplicate" as const : "processed" as const;
        const outcomeSha256 = sha256(canonicalFlightJson({
          version: "flight-consumer-preview-duffel-webhook-outcome-v1",
          ledgerId: recorded.ledger_id,
          eventType,
          semanticSha256: event.semanticDigest,
          linkedOrderId: link?.order_id ?? null,
          outcome,
          reconciliationRequired: true,
          directMutationAuthorized: false,
        }));
        const completed = completeResultSchema.parse(await input.ledger.complete({
          p_ledger_id: recorded.ledger_id,
          p_expected_revision: 1,
          p_lease_token_sha256: leaseTokenSha256,
          p_outcome: outcome,
          p_outcome_sha256: outcomeSha256,
        }))[0]!;
        if (completed.ledger_id !== recorded.ledger_id || completed.ledger_state !== outcome) {
          throw new FlightConsumerPreviewDuffelWebhookError();
        }
        return Object.freeze({
          version: "flight-consumer-preview-duffel-webhook-result-v1" as const,
          decision: link === null || isAdverseDuffelEvent(eventType)
            ? "blocked" as const
            : "processed" as const,
          eventType,
          linkedOrderId: link?.order_id ?? null,
          reconciliationRequired: true as const,
          directMutationAuthorized: false as const,
        });
      } catch (error) {
        if (error instanceof FlightConsumerPreviewDuffelWebhookError) throw error;
        throw new FlightConsumerPreviewDuffelWebhookError();
      } finally {
        verifiedRawBody?.fill(0);
      }
    },
  });
}

export function verifyFlightConsumerPreviewDuffelPing(
  untrusted: Readonly<{ rawBody: Uint8Array; signature: string }>,
  dependencies: Readonly<{
    webhookSecret: string;
    nowSeconds: () => number;
  }> = {
    webhookSecret: process.env.FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET ?? "",
    nowSeconds: () => Math.floor(Date.now() / 1_000),
  },
): FlightConsumerPreviewDuffelWebhookResult | null {
  try {
    if (typeof dependencies.nowSeconds !== "function") {
      throw new FlightConsumerPreviewDuffelWebhookError();
    }
    const verified = verifyIncomingDuffelSandboxEvent({
      rawBody: untrusted.rawBody,
      signature: untrusted.signature,
      webhookSecret: dependencies.webhookSecret,
      nowSeconds: dependencies.nowSeconds(),
    });
    try {
      return verified.event.eventType === "ping.triggered" ? verifiedPingResult() : null;
    } finally {
      verified.rawBody.fill(0);
    }
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookError) throw error;
    throw new FlightConsumerPreviewDuffelWebhookError();
  }
}

export async function createFlightConsumerPreviewDuffelWebhookWorkflow(input: Readonly<{
  onOrderTicketed?: (event: Readonly<{ customerId: string; orderId: string }>) => void;
}> = {}) {
  try {
    const runtime = await requireFlightConsumerPreviewRequestRuntime();
    return createInjectedFlightConsumerPreviewDuffelWebhookWorkflow({
      executionScopeSha256: runtime.binding.executionScopeSha256,
      webhookSecret: process.env.FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET ?? "",
      ledger: Object.freeze(new SupabaseDuffelWebhookLedgerPort()),
      orderConvergence: createFlightConsumerPreviewAsyncDuffelConvergence(runtime),
      onOrderTicketed: input.onOrderTicketed,
      nowSeconds: () => Math.floor(Date.now() / 1_000),
    });
  } catch {
    throw new FlightConsumerPreviewDuffelWebhookError();
  }
}
