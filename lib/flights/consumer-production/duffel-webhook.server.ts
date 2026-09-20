import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  DUFFEL_API_VERSION,
  DUFFEL_MAX_RAW_BODY_BYTES,
  parseDuffelJsonBody,
  verifyDuffelWebhookSignature,
} from "../duffel-sandbox-contract";
import { canonicalFlightJson } from "../runtime-safety";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_MAX_BYTES =
  DUFFEL_MAX_RAW_BODY_BYTES;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_EVENTS = Object.freeze([
  "order.created",
  "order.creation_failed",
  "air.order.changed",
  "order.airline_initiated_change_detected",
] as const);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const eventSchema = z.object({
  id: z.string().regex(/^wev_[A-Za-z0-9]{8,252}$/),
  api_version: z.literal(DUFFEL_API_VERSION),
  type: z.string().min(1).max(128),
  live_mode: z.literal(true),
  idempotency_key: z.string().min(8).max(256),
  created_at: z.string().min(20).max(64)
    .refine((value) => Number.isFinite(Date.parse(value))),
}).passthrough();
const recordResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay"]),
  inbox_id: uuidSchema,
  inbox_state: z.enum(["verified_ping", "quarantined"]),
  event_type: z.string().min(1).max(128),
  execution_scope_sha256: sha256Schema,
}).strict()).length(1);

type WebhookRecordParameters = Readonly<{
  p_execution_scope_sha256: string;
  p_event_id_sha256: string;
  p_idempotency_sha256: string;
  p_event_type: string;
  p_payload_sha256: string;
  p_semantic_sha256: string;
  p_verification_receipt_sha256: string;
  p_occurred_at: string;
  p_live_mode: true;
}>;

export interface FlightConsumerProductionDuffelWebhookInboxPort {
  record(parameters: WebhookRecordParameters): Promise<unknown>;
}

export type FlightConsumerProductionDuffelWebhookResult = Readonly<{
  version: "flight-consumer-production-duffel-webhook-result-v1";
  decision: "verified_ping" | "quarantined" | "replayed";
  eventType: string;
  liveMode: true;
  durableInboxRecorded: true;
  consumerReleaseEnabled: false;
  providerMutationAuthorized: false;
}>;

export class FlightConsumerProductionDuffelWebhookError extends Error {
  readonly status: 400 | 503;
  readonly diagnostic: string;

  constructor(status: 400 | 503 = 503, diagnostic = "workflow_unavailable") {
    super("Duffel Consumer Production webhook could not be processed.");
    this.name = "FlightConsumerProductionDuffelWebhookError";
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

class SupabaseFlightConsumerProductionDuffelWebhookInboxPort
implements FlightConsumerProductionDuffelWebhookInboxPort {
  async record(parameters: WebhookRecordParameters) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_live_duffel_webhook_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelWebhookError(
      503,
      "durable_inbox_unavailable",
    );
    return data;
  }
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeOccurredAt(value: string) {
  const normalized = new Date(value).toISOString();
  if (normalized === "Invalid Date") {
    throw new FlightConsumerProductionDuffelWebhookError(
      400,
      "event_contract_rejected",
    );
  }
  return normalized;
}

export function createFlightConsumerProductionDarkDuffelWebhookWorkflow(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Readonly<{
    inbox?: FlightConsumerProductionDuffelWebhookInboxPort;
    nowSeconds?: () => number;
  }> = {},
) {
  let runtime;
  try {
    runtime = requireFlightConsumerProductionDarkRuntime(env);
  } catch {
    throw new FlightConsumerProductionDuffelWebhookError();
  }
  const webhookSecret = env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET ?? "";
  const inbox = dependencies.inbox
    ?? Object.freeze(new SupabaseFlightConsumerProductionDuffelWebhookInboxPort());
  const nowSeconds = dependencies.nowSeconds
    ?? (() => Math.floor(Date.now() / 1_000));

  return Object.freeze({
    async ingest(input: Readonly<{ rawBody: Uint8Array; signature: string }>): Promise<FlightConsumerProductionDuffelWebhookResult> {
      try {
        const verification = verifyDuffelWebhookSignature({
          rawBody: input.rawBody,
          signatureHeader: input.signature,
          secret: webhookSecret,
          nowSeconds: nowSeconds(),
        });
        if (!verification.verified || verification.bodyDigest === null) {
          const retryable = verification.reason === "missing_secret";
          throw new FlightConsumerProductionDuffelWebhookError(
            retryable ? 503 : 400,
            `signature_${verification.reason}`,
          );
        }
        const parsed = eventSchema.safeParse(parseDuffelJsonBody(input.rawBody));
        if (!parsed.success) {
          throw new FlightConsumerProductionDuffelWebhookError(
            400,
            "event_contract_rejected",
          );
        }
        const occurredAt = normalizeOccurredAt(parsed.data.created_at);
        const eventIdSha256 = sha256(parsed.data.id);
        const idempotencySha256 = sha256(parsed.data.idempotency_key);
        const semanticSha256 = sha256(canonicalFlightJson({
          version: "flight-consumer-production-duffel-webhook-semantic-v1",
          executionScopeSha256: runtime.binding.executionScopeSha256,
          eventIdSha256,
          idempotencySha256,
          eventType: parsed.data.type,
          apiVersion: parsed.data.api_version,
          liveMode: true,
          occurredAt,
          payloadSha256: verification.bodyDigest,
        }));
        const verificationReceiptSha256 = sha256(canonicalFlightJson({
          version: "flight-consumer-production-duffel-webhook-verification-v1",
          executionScopeSha256: runtime.binding.executionScopeSha256,
          eventIdSha256,
          payloadSha256: verification.bodyDigest,
          signatureTimestampSeconds: verification.timestampSeconds,
        }));
        const recorded = recordResultSchema.parse(await inbox.record({
          p_execution_scope_sha256: runtime.binding.executionScopeSha256,
          p_event_id_sha256: eventIdSha256,
          p_idempotency_sha256: idempotencySha256,
          p_event_type: parsed.data.type,
          p_payload_sha256: verification.bodyDigest,
          p_semantic_sha256: semanticSha256,
          p_verification_receipt_sha256: verificationReceiptSha256,
          p_occurred_at: occurredAt,
          p_live_mode: true,
        }))[0]!;
        if (
          recorded.event_type !== parsed.data.type
          || recorded.execution_scope_sha256
            !== runtime.binding.executionScopeSha256
          || (parsed.data.type === "ping.triggered"
            ? recorded.inbox_state !== "verified_ping"
            : recorded.inbox_state !== "quarantined")
        ) {
          throw new FlightConsumerProductionDuffelWebhookError(
            503,
            "durable_inbox_receipt_rejected",
          );
        }
        return Object.freeze({
          version: "flight-consumer-production-duffel-webhook-result-v1" as const,
          decision: recorded.decision === "replay"
            ? "replayed" as const
            : parsed.data.type === "ping.triggered"
              ? "verified_ping" as const
              : "quarantined" as const,
          eventType: parsed.data.type,
          liveMode: true as const,
          durableInboxRecorded: true as const,
          consumerReleaseEnabled: false as const,
          providerMutationAuthorized: false as const,
        });
      } catch (error) {
        if (error instanceof FlightConsumerProductionDuffelWebhookError) throw error;
        throw new FlightConsumerProductionDuffelWebhookError(
          503,
          "durable_inbox_unavailable",
        );
      }
    },
  });
}
