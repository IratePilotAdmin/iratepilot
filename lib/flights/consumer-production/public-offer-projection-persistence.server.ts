import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import type {
  FlightConsumerProductionPublicOfferProjectionRecord,
  FlightConsumerProductionPublicOfferRefusalRecord,
} from "./duffel-live-public-offer-projection.server";
import {
  flightConsumerProductionPublicOfferProjectionSchema,
} from "./public-offer-projection-contract";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_MIGRATION_VERSION =
  "202608260116" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_COMPLETE_RPC =
  "complete_flight_consumer_live_public_offer_projection_batch_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_GET_RPC =
  "get_flight_consumer_live_public_offer_projection_batch_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_READ_RPC =
  "read_flight_consumer_live_public_offer_projection_batch_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_SOURCE_LIST_RPC =
  "list_flight_consumer_live_duffel_pending_offer_sources_v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const receiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  batch_id: uuidSchema,
  projection_batch_sha256: sha256Schema,
  projection_receipt_sha256: sha256Schema,
  projected_offer_count: z.number().int().min(0).max(25),
  refused_offer_count: z.number().int().min(0).max(1_000),
  provider_dispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  order_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
  blind_retry_authorized: z.literal(false),
}).strict();
const inspectionSchema = z.object({
  batch_id: uuidSchema,
  projection_batch_sha256: sha256Schema,
  projection_receipt_sha256: sha256Schema,
  projected_offer_count: z.number().int().min(0).max(25),
  refused_offer_count: z.number().int().min(0).max(1_000),
  observed_at: z.string().datetime({ offset: true }),
}).strict();
const safeReadSchema = z.object({
  local_offer_id: uuidSchema,
  display_rank: z.number().int().min(1).max(25),
  owner_name: z.string().min(2).max(120),
  owner_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/).nullable(),
  currency: z.literal("USD"),
  base_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  tax_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  total_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  offer_expires_at: z.string().datetime({ offset: true }),
  presentation_expires_at: z.string().datetime({ offset: true }),
  changeable: z.boolean().nullable(),
  refundable: z.boolean().nullable(),
  change_penalty_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]).nullable(),
  refund_penalty_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]).nullable(),
  segment_sequence: z.number().int().min(1).max(4),
  slice_sequence: z.number().int().min(1).max(2),
  journey_direction: z.enum(["outbound", "return"]),
  origin_iata: z.string().regex(/^[A-Z]{3}$/),
  destination_iata: z.string().regex(/^[A-Z]{3}$/),
  departing_at_local: z.string(),
  arriving_at_local: z.string(),
  origin_time_zone: z.string(),
  destination_time_zone: z.string(),
  marketing_carrier_name: z.string(),
  marketing_carrier_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/),
  operating_carrier_name: z.string(),
  operating_carrier_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/),
  marketing_flight_number: z.string().regex(/^[A-Z0-9]{1,4}$/),
  duration_minutes: z.number().int().min(1).max(2_160),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
}).strict();
const pendingSourceSchema = z.object({
  source_id: uuidSchema,
  offer_id_sha256: sha256Schema,
  source_offer_evidence_sha256: sha256Schema,
  expires_at: z.string().datetime({ offset: true }),
}).strict();

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
export type FlightConsumerProductionPublicOfferProjectionRpcClient = Readonly<{
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<RpcResponse>;
}>;

export class FlightConsumerProductionPublicOfferProjectionPersistenceError
  extends Error {
  constructor(readonly reason = "persistence_refused") {
    super("The public live-offer projection evidence could not be persisted.");
    this.name = "FlightConsumerProductionPublicOfferProjectionPersistenceError";
  }
}

function one<T>(schema: z.ZodType<T>, value: unknown) {
  const accepted = z.array(schema).length(1).safeParse(value);
  if (!accepted.success) {
    throw new FlightConsumerProductionPublicOfferProjectionPersistenceError(
      "receipt_refused",
    );
  }
  return Object.freeze(accepted.data[0]!);
}

function projectionRecord(item: FlightConsumerProductionPublicOfferProjectionRecord) {
  const projection = flightConsumerProductionPublicOfferProjectionSchema.parse(
    item.projection,
  );
  return {
    sourceId: item.sourceId,
    sourceOfferEvidenceSha256: item.sourceOfferEvidenceSha256,
    offerIdSha256: item.offerIdSha256,
    projectionSha256: item.projectionSha256,
    projection,
    encryptedReference: item.encryptedReference,
  };
}

export function createFlightConsumerProductionPublicOfferProjectionPersistence(
  client: FlightConsumerProductionPublicOfferProjectionRpcClient = {
    async rpc(name, args) {
      const { data, error } = await createAdminClient().rpc(name, args);
      return { data, error };
    },
  },
) {
  async function call(name: string, args: Readonly<Record<string, unknown>>) {
    let response: RpcResponse;
    try {
      response = await client.rpc(name, args);
    } catch {
      throw new FlightConsumerProductionPublicOfferProjectionPersistenceError();
    }
    if (response.error !== null) {
      throw new FlightConsumerProductionPublicOfferProjectionPersistenceError();
    }
    return response.data;
  }

  return Object.freeze({
    version: "flight-consumer-production-public-offer-projection-persistence-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_MIGRATION_VERSION,
    routeExposed: false as const,
    providerTransportImplemented: false as const,
    providerDispatchAuthorized: false as const,
    consumerExposureAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
    async listPendingSources(input: Readonly<{
      sourceShoppingAttemptId: string;
      sourceShoppingExecutionScopeSha256: string;
      sourceResponseSha256: string;
    }>) {
      const rows = await call(
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_SOURCE_LIST_RPC,
        {
          p_source_shopping_attempt_id: input.sourceShoppingAttemptId,
          p_source_shopping_execution_scope_sha256:
            input.sourceShoppingExecutionScopeSha256,
          p_source_response_sha256: input.sourceResponseSha256,
        },
      );
      const accepted = z.array(pendingSourceSchema).max(1_000)
        .safeParse(rows);
      if (!accepted.success
        || new Set(accepted.data.map((row) => row.offer_id_sha256)).size
          !== accepted.data.length
        || new Set(accepted.data.map((row) => row.source_id)).size
          !== accepted.data.length) {
        throw new FlightConsumerProductionPublicOfferProjectionPersistenceError(
          "pending_sources_refused",
        );
      }
      return Object.freeze(accepted.data.map((row) => Object.freeze(row)));
    },
    async complete(input: Readonly<{
      admissionId: string;
      admissionReceiptSha256: string;
      admissionExecutionScopeSha256: string;
      policySha256: string;
      admissionPolicySha256: string;
      cohortSha256: string;
      subjectSha256: string;
      idempotencySha256: string;
      requestSha256: string;
      search: unknown;
      sourceShoppingAttemptId: string;
      sourceShoppingExecutionScopeSha256: string;
      sourceResponseSha256: string;
      sourceRequestBodySha256: string;
      projectionBatchSha256: string;
      observedAt: string;
      terminalResponseBytes: number;
      projected: readonly FlightConsumerProductionPublicOfferProjectionRecord[];
      refused: readonly FlightConsumerProductionPublicOfferRefusalRecord[];
    }>) {
      return one(receiptSchema, await call(
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_COMPLETE_RPC,
        {
          p_admission_id: input.admissionId,
          p_admission_receipt_sha256: input.admissionReceiptSha256,
          p_execution_scope_sha256: input.admissionExecutionScopeSha256,
          p_policy_sha256: input.policySha256,
          p_admission_policy_sha256: input.admissionPolicySha256,
          p_cohort_sha256: input.cohortSha256,
          p_subject_sha256: input.subjectSha256,
          p_idempotency_sha256: input.idempotencySha256,
          p_request_sha256: input.requestSha256,
          p_search: input.search,
          p_source_shopping_attempt_id: input.sourceShoppingAttemptId,
          p_source_shopping_execution_scope_sha256:
            input.sourceShoppingExecutionScopeSha256,
          p_source_response_sha256: input.sourceResponseSha256,
          p_source_request_body_sha256: input.sourceRequestBodySha256,
          p_projection_batch_sha256: input.projectionBatchSha256,
          p_observed_at: input.observedAt,
          p_terminal_response_bytes: input.terminalResponseBytes,
          p_projected_offers: input.projected.map(projectionRecord),
          p_refused_sources: input.refused,
        },
      ));
    },
    async inspect(input: Readonly<{
      admissionId: string;
      admissionReceiptSha256: string;
      subjectSha256: string;
      requestSha256: string;
      projectionBatchSha256: string;
    }>) {
      return one(inspectionSchema, await call(
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_GET_RPC,
        {
          p_admission_id: input.admissionId,
          p_admission_receipt_sha256: input.admissionReceiptSha256,
          p_subject_sha256: input.subjectSha256,
          p_request_sha256: input.requestSha256,
          p_projection_batch_sha256: input.projectionBatchSha256,
        },
      ));
    },
    async readSafe(input: Readonly<{
      admissionId: string;
      admissionReceiptSha256: string;
      subjectSha256: string;
      requestSha256: string;
    }>) {
      const rows = await call(
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_READ_RPC,
        {
          p_admission_id: input.admissionId,
          p_admission_receipt_sha256: input.admissionReceiptSha256,
          p_subject_sha256: input.subjectSha256,
          p_request_sha256: input.requestSha256,
        },
      );
      const accepted = z.array(safeReadSchema).max(100).safeParse(rows);
      if (!accepted.success) {
        throw new FlightConsumerProductionPublicOfferProjectionPersistenceError(
          "safe_read_refused",
        );
      }
      return Object.freeze(accepted.data.map((row) => Object.freeze(row)));
    },
  });
}
