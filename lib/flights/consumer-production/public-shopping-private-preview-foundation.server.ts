import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { sha256FlightEvidence } from "../runtime-safety";
import {
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
} from "./public-shopping-contract";
import {
  requireFlightConsumerProductionPublicShoppingAdmissionRuntime,
  type FlightConsumerProductionPublicShoppingPreRpcLimiter,
} from "./public-shopping-admission.server";

export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MIGRATION_VERSION =
  "202608260139" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_VERSION =
  "flight-consumer-production-public-shopping-pre-rpc-limiter-v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MEMBERSHIP_RPC =
  "record_flight_consumer_live_private_preview_membership_event_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_RPC =
  "consume_flight_consumer_live_private_preview_limiter_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_STALE_RPC =
  "classify_flight_consumer_live_private_preview_stale_dispatches_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_EXPOSURE_RPC =
  "authorize_flight_consumer_live_private_preview_exposure_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_READ_RPC =
  "read_flight_consumer_live_private_preview_offer_batch_v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const falseAuthoritySchema = {
  order_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
  blind_retry_authorized: z.literal(false),
} as const;

const membershipReceiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  membership_event_id: uuidSchema,
  event_sequence: z.number().int().positive(),
  event_type: z.enum(["granted", "revoked"]),
  membership_not_after: instantSchema.nullable(),
  membership_receipt_sha256: sha256Schema,
  membership_active: z.boolean(),
  provider_dispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  ...falseAuthoritySchema,
}).strict().superRefine((value, context) => {
  if ((value.event_type === "granted") !== (value.membership_not_after !== null)) {
    context.addIssue({ code: "custom", path: ["membership_not_after"],
      message: "Membership lifetime must match its event." });
  }
});

const limiterReceiptSchema = z.object({
  decision: z.enum(["allowed", "refused"]),
  execution_scope_sha256: sha256Schema,
  subject_sha256: sha256Schema,
  idempotency_sha256: sha256Schema,
  request_sha256: sha256Schema,
  limiter_receipt_sha256: sha256Schema,
  refusal_code: z.enum([
    "membership_inactive",
    "subject_minute_budget_exhausted",
    "subject_day_budget_exhausted",
    "cohort_minute_budget_exhausted",
    "cohort_day_budget_exhausted",
    "global_minute_budget_exhausted",
    "global_day_budget_exhausted",
  ]).nullable(),
  claim_expires_at: instantSchema.nullable(),
  subject_minute_claim_count: z.number().int().nonnegative(),
  subject_day_claim_count: z.number().int().nonnegative(),
  cohort_minute_claim_count: z.number().int().nonnegative(),
  cohort_day_claim_count: z.number().int().nonnegative(),
  global_minute_claim_count: z.number().int().nonnegative(),
  global_day_claim_count: z.number().int().nonnegative(),
  provider_dispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  ...falseAuthoritySchema,
}).strict().superRefine((value, context) => {
  const allowed = value.decision === "allowed";
  if (allowed !== (value.claim_expires_at !== null)
    || allowed !== (value.refusal_code === null)) {
    context.addIssue({ code: "custom", path: ["decision"],
      message: "Limiter decision evidence is inconsistent." });
  }
});

const staleReceiptSchema = z.object({
  decision: z.literal("classified"),
  stale_classification_id: uuidSchema,
  dispatch_id: uuidSchema,
  shopping_attempt_id: uuidSchema,
  classification: z.literal("stale_ambiguous"),
  classification_receipt_sha256: sha256Schema,
  provider_redispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  ...falseAuthoritySchema,
}).strict();

const exposureReceiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  exposure_id: uuidSchema,
  exposure_receipt_sha256: sha256Schema,
  reconciliation_mode: z.enum(["direct", "late_success_after_stale"]),
  exposure_not_after: instantSchema,
  source_offer_count: z.number().int().min(0).max(1_000),
  projected_offer_count: z.number().int().min(0).max(25),
  refused_offer_count: z.number().int().min(0).max(1_000),
  private_preview_exposure_authorized: z.literal(true),
  consumer_public_release_authorized: z.literal(false),
  ...falseAuthoritySchema,
}).strict().superRefine((value, context) => {
  if (value.projected_offer_count + value.refused_offer_count
    !== value.source_offer_count) {
    context.addIssue({ code: "custom", path: ["source_offer_count"],
      message: "Every source must have one disposition." });
  }
});

const safeReadSchema = z.object({
  local_offer_id: uuidSchema,
  display_rank: z.number().int().min(1).max(25),
  owner_name: z.string().min(2).max(120),
  owner_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/).nullable(),
  currency: z.literal("USD"),
  base_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  tax_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  total_amount_minor: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  offer_expires_at: instantSchema,
  presentation_expires_at: instantSchema,
  changeable: z.boolean(),
  refundable: z.boolean(),
  change_penalty_amount_minor: z.union([
    z.number().int(), z.string().regex(/^\d+$/),
  ]).nullable(),
  refund_penalty_amount_minor: z.union([
    z.number().int(), z.string().regex(/^\d+$/),
  ]).nullable(),
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

type RpcClient = Readonly<{
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{
    data: unknown;
    error: unknown;
  }>;
}>;

export class FlightConsumerProductionPrivatePreviewFoundationError
  extends Error {
  constructor(readonly reason = "persistence_refused") {
    super("The private-preview foundation refused the operation.");
    this.name = "FlightConsumerProductionPrivatePreviewFoundationError";
  }
}

function one<T>(schema: z.ZodType<T>, value: unknown) {
  const accepted = z.array(schema).length(1).safeParse(value);
  if (!accepted.success) {
    throw new FlightConsumerProductionPrivatePreviewFoundationError(
      "receipt_refused",
    );
  }
  return Object.freeze(accepted.data[0]!);
}

export function deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256(
  input: Readonly<{
    admissionExecutionScopeSha256: string;
    policySha256: string;
    admissionPolicySha256: string;
    cohortSha256: string;
  }>,
) {
  sha256Schema.parse(input.admissionExecutionScopeSha256);
  sha256Schema.parse(input.policySha256);
  sha256Schema.parse(input.admissionPolicySha256);
  sha256Schema.parse(input.cohortSha256);
  return sha256FlightEvidence({
    version: "flight-consumer-production-private-preview-exposure-scope-v1",
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MIGRATION_VERSION,
    admissionExecutionScopeSha256: input.admissionExecutionScopeSha256,
    policySha256: input.policySha256,
    admissionPolicySha256: input.admissionPolicySha256,
    cohortSha256: input.cohortSha256,
    privatePreviewExposureOnly: true,
    consumerPublicReleaseAuthorized: false,
    orderAuthorized: false,
    stripeDispatchAuthorized: false,
    bookingAuthorized: false,
    paymentAuthorized: false,
    captureAuthorized: false,
    refundAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
    servicingAuthorized: false,
    consumerReleaseEnabled: false,
    blindRetryAuthorized: false,
  });
}

export function createFlightConsumerProductionPrivatePreviewFoundationPersistence(
  client: RpcClient = {
    async rpc(name, args) {
      const { data, error } = await createAdminClient().rpc(name, args);
      return { data, error };
    },
  },
) {
  async function call(name: string, args: Readonly<Record<string, unknown>>) {
    let result: Awaited<ReturnType<RpcClient["rpc"]>>;
    try {
      result = await client.rpc(name, args);
    } catch {
      throw new FlightConsumerProductionPrivatePreviewFoundationError();
    }
    if (result.error !== null) {
      throw new FlightConsumerProductionPrivatePreviewFoundationError();
    }
    return result.data;
  }

  return Object.freeze({
    version: "flight-consumer-production-private-preview-foundation-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MIGRATION_VERSION,
    routeExposed: false as const,
    providerTransportImplemented: false as const,
    providerDispatchAuthorized: false as const,
    consumerPublicReleaseAuthorized: false as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
    async recordMembershipEvent(input: Readonly<{
      policySha256: string;
      cohortSha256: string;
      subjectSha256: string;
      eventIdempotencySha256: string;
      eventType: "granted" | "revoked";
      membershipNotAfter: string | null;
    }>) {
      return one(membershipReceiptSchema, await call(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MEMBERSHIP_RPC,
        {
          p_policy_sha256: input.policySha256,
          p_cohort_sha256: input.cohortSha256,
          p_subject_sha256: input.subjectSha256,
          p_event_idempotency_sha256: input.eventIdempotencySha256,
          p_event_type: input.eventType,
          p_membership_not_after: input.membershipNotAfter,
        },
      ));
    },
    async consumeLimiter(input: Readonly<{
      executionScopeSha256: string;
      policySha256: string;
      cohortSha256: string;
      subjectSha256: string;
      idempotencySha256: string;
      requestSha256: string;
    }>) {
      return one(limiterReceiptSchema, await call(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_RPC,
        {
          p_execution_scope_sha256: input.executionScopeSha256,
          p_policy_sha256: input.policySha256,
          p_cohort_sha256: input.cohortSha256,
          p_subject_sha256: input.subjectSha256,
          p_idempotency_sha256: input.idempotencySha256,
          p_request_sha256: input.requestSha256,
        },
      ));
    },
    async classifyStale(limit = 25) {
      const result = await call(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_STALE_RPC,
        { p_limit: limit },
      );
      const accepted = z.array(staleReceiptSchema).max(25).safeParse(result);
      if (!accepted.success) {
        throw new FlightConsumerProductionPrivatePreviewFoundationError(
          "stale_receipt_refused",
        );
      }
      return Object.freeze(accepted.data.map((item) => Object.freeze(item)));
    },
    async authorizeExposure(input: Readonly<{
      admissionExecutionScopeSha256: string;
      policySha256: string;
      admissionPolicySha256: string;
      cohortSha256: string;
      admissionId: string;
      admissionReceiptSha256: string;
      subjectSha256: string;
      requestSha256: string;
      dispatchId: string;
      dispatchReceiptSha256: string;
      projectionBatchSha256: string;
      projectionReceiptSha256: string;
      sourceOfferCount: number;
      projectedOfferCount: number;
      refusedOfferCount: number;
      exposureNotAfter: string;
    }>) {
      const previewExecutionScopeSha256 =
        deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256(input);
      return one(exposureReceiptSchema, await call(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_EXPOSURE_RPC,
        {
          p_preview_execution_scope_sha256: previewExecutionScopeSha256,
          p_admission_id: input.admissionId,
          p_admission_receipt_sha256: input.admissionReceiptSha256,
          p_subject_sha256: input.subjectSha256,
          p_request_sha256: input.requestSha256,
          p_dispatch_id: input.dispatchId,
          p_dispatch_receipt_sha256: input.dispatchReceiptSha256,
          p_projection_batch_sha256: input.projectionBatchSha256,
          p_projection_receipt_sha256: input.projectionReceiptSha256,
          p_source_offer_count: input.sourceOfferCount,
          p_projected_offer_count: input.projectedOfferCount,
          p_refused_offer_count: input.refusedOfferCount,
          p_exposure_not_after: input.exposureNotAfter,
        },
      ));
    },
    async readSafe(input: Readonly<{
      exposureReceiptSha256: string;
      subjectSha256: string;
      requestSha256: string;
    }>) {
      const rows = await call(
        FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_READ_RPC,
        {
          p_exposure_receipt_sha256: input.exposureReceiptSha256,
          p_subject_sha256: input.subjectSha256,
          p_request_sha256: input.requestSha256,
        },
      );
      const accepted = z.array(safeReadSchema).max(100).safeParse(rows);
      if (!accepted.success) {
        throw new FlightConsumerProductionPrivatePreviewFoundationError(
          "safe_read_refused",
        );
      }
      return Object.freeze(accepted.data.map((item) => Object.freeze(item)));
    },
  });
}

export function createFlightConsumerProductionPrivatePreviewPreRpcLimiter(
  input: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    persistence?: ReturnType<
      typeof createFlightConsumerProductionPrivatePreviewFoundationPersistence
    >;
  }> = {},
): FlightConsumerProductionPublicShoppingPreRpcLimiter {
  const runtime = requireFlightConsumerProductionPublicShoppingAdmissionRuntime(
    input.environment ?? process.env,
  );
  const persistence = input.persistence
    ?? createFlightConsumerProductionPrivatePreviewFoundationPersistence();
  return Object.freeze({
    version: FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_VERSION,
    routeExposed: false as const,
    authenticatedSubjectRequired: true as const,
    distributedBudgetEnforced: true as const,
    failClosed: true as const,
    budget: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
    async consume(request) {
      if (request.executionScopeSha256
          !== runtime.binding.executionScopeSha256
        || request.cohortSha256 !== runtime.binding.cohortSha256) {
        throw new FlightConsumerProductionPrivatePreviewFoundationError(
          "runtime_binding_refused",
        );
      }
      const receipt = await persistence.consumeLimiter({
        executionScopeSha256: request.executionScopeSha256,
        policySha256: runtime.binding.policySha256,
        cohortSha256: request.cohortSha256,
        subjectSha256: request.subjectSha256,
        idempotencySha256: request.idempotencySha256,
        requestSha256: request.requestSha256,
      });
      if (receipt.execution_scope_sha256 !== request.executionScopeSha256
        || receipt.subject_sha256 !== request.subjectSha256
        || receipt.idempotency_sha256 !== request.idempotencySha256
        || receipt.request_sha256 !== request.requestSha256) {
        throw new FlightConsumerProductionPrivatePreviewFoundationError(
          "receipt_binding_refused",
        );
      }
      return Object.freeze({
        decision: receipt.decision,
        executionScopeSha256: receipt.execution_scope_sha256,
        subjectSha256: receipt.subject_sha256,
        idempotencySha256: receipt.idempotency_sha256,
        requestSha256: receipt.request_sha256,
        limiterReceiptSha256: receipt.limiter_receipt_sha256,
      });
    },
  });
}
