import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().min(20).max(64)
  .refine((value) => Number.isFinite(Date.parse(value)));

const recordReceiptSchema = z.array(z.object({
  source_shopping_attempt_id: uuidSchema,
  recorded_source_count: z.number().int().min(0).max(1_000),
}).strict()).length(1);

const sourceReceiptSchema = z.array(z.object({
  source_id: uuidSchema,
  source_shopping_attempt_id: uuidSchema,
  source_shopping_execution_scope_sha256: sha256Schema,
  source_response_sha256: sha256Schema,
  offer_id_sha256: sha256Schema,
  source_offer_evidence_sha256: sha256Schema,
  expires_at: instantSchema,
}).strict()).max(1);

export type FlightConsumerProductionDuffelOfferSourceItem = Readonly<{
  offerIdSha256: string;
  expiresAt: string;
}>;

export type FlightConsumerProductionDuffelOfferSource = Readonly<{
  sourceId: string;
  sourceShoppingAttemptId: string;
  sourceShoppingExecutionScopeSha256: string;
  sourceResponseSha256: string;
  offerIdSha256: string;
  sourceOfferEvidenceSha256: string;
  expiresAt: string;
}>;

export interface FlightConsumerProductionDuffelOfferSourcePort {
  record(parameters: Readonly<{
    p_source_shopping_attempt_id: string;
    p_source_shopping_execution_scope_sha256: string;
    p_source_response_sha256: string;
    p_sources: readonly FlightConsumerProductionDuffelOfferSourceItem[];
  }>): Promise<unknown>;
  resolve(parameters: Readonly<{
    p_source_shopping_attempt_id: string;
    p_source_shopping_execution_scope_sha256: string;
    p_offer_id_sha256: string;
  }>): Promise<unknown>;
}

export class FlightConsumerProductionDuffelOfferSourceError extends Error {
  constructor(readonly diagnostic = "offer_source_unavailable") {
    super("The bound Duffel Production live-offer source is unavailable.");
    this.name = "FlightConsumerProductionDuffelOfferSourceError";
  }
}

class SupabaseFlightConsumerProductionDuffelOfferSourcePort
implements FlightConsumerProductionDuffelOfferSourcePort {
  async record(parameters: Parameters<
    FlightConsumerProductionDuffelOfferSourcePort["record"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "record_flight_consumer_live_duffel_offer_sources_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferSourceError(
      "offer_source_record_failed",
    );
    return data;
  }

  async resolve(parameters: Parameters<
    FlightConsumerProductionDuffelOfferSourcePort["resolve"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "resolve_flight_consumer_live_duffel_offer_refresh_source_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferSourceError(
      "offer_source_resolution_failed",
    );
    return data;
  }
}

export function createFlightConsumerProductionDuffelOfferSourcePort():
FlightConsumerProductionDuffelOfferSourcePort {
  return Object.freeze(new SupabaseFlightConsumerProductionDuffelOfferSourcePort());
}

export function acceptFlightConsumerProductionDuffelOfferSourceRecord(
  value: unknown,
  expected: Readonly<{ attemptId: string; count: number }>,
) {
  const accepted = recordReceiptSchema.safeParse(value);
  if (
    !accepted.success
    || accepted.data[0]!.source_shopping_attempt_id !== expected.attemptId
    || accepted.data[0]!.recorded_source_count !== expected.count
  ) {
    throw new FlightConsumerProductionDuffelOfferSourceError(
      "offer_source_record_receipt_rejected",
    );
  }
  return Object.freeze({
    attemptId: accepted.data[0]!.source_shopping_attempt_id,
    count: accepted.data[0]!.recorded_source_count,
  });
}

export function acceptFlightConsumerProductionDuffelOfferSource(
  value: unknown,
  expected: Readonly<{
    attemptId: string;
    executionScopeSha256: string;
  }>,
): FlightConsumerProductionDuffelOfferSource {
  const accepted = sourceReceiptSchema.safeParse(value);
  if (
    !accepted.success
    || accepted.data.length !== 1
    || accepted.data[0]!.source_shopping_attempt_id !== expected.attemptId
    || accepted.data[0]!.source_shopping_execution_scope_sha256
      !== expected.executionScopeSha256
  ) {
    throw new FlightConsumerProductionDuffelOfferSourceError(
      "offer_source_receipt_rejected",
    );
  }
  const source = accepted.data[0]!;
  return Object.freeze({
    sourceId: source.source_id,
    sourceShoppingAttemptId: source.source_shopping_attempt_id,
    sourceShoppingExecutionScopeSha256:
      source.source_shopping_execution_scope_sha256,
    sourceResponseSha256: source.source_response_sha256,
    offerIdSha256: source.offer_id_sha256,
    sourceOfferEvidenceSha256: source.source_offer_evidence_sha256,
    expiresAt: new Date(source.expires_at).toISOString(),
  });
}
