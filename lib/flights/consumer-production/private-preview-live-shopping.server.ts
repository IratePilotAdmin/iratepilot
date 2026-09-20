import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  acceptFlightConsumerProductionDuffelOfferSourceRecord,
  createFlightConsumerProductionDuffelOfferSourcePort,
} from "./duffel-offer-source.server";
import {
  createFlightConsumerProductionDuffelShoppingJournalPort,
} from "./duffel-shopping.server";
import {
  createFlightConsumerProductionDuffelOfferReferenceEncryption,
} from "./duffel-live-public-offer-reference-encryption.server";
import {
  createFlightConsumerProductionPublicOfferProjectionPersistence,
} from "./public-offer-projection-persistence.server";
import {
  createFlightConsumerProductionPublicShoppingAdmissionService,
  createFlightConsumerProductionPublicShoppingTrustedIdentityCapability,
  FlightConsumerProductionPublicShoppingAdmissionError,
  requireFlightConsumerProductionPublicShoppingAdmissionRuntime,
} from "./public-shopping-admission.server";
import {
  flightConsumerProductionPublicShoppingSearchSchema,
  validateFlightConsumerProductionPublicShoppingTravelWindow,
  type FlightConsumerProductionPublicShoppingSearch,
} from "./public-shopping-contract";
import {
  createFlightConsumerProductionPublicShoppingDispatchPersistence,
} from "./public-shopping-dispatch-persistence.server";
import {
  createFlightConsumerProductionPublicShoppingDispatchRuntime,
  dispatchFlightConsumerProductionPublicShopping,
  FlightConsumerProductionPublicShoppingDispatchError,
} from "./public-shopping-dispatch.server";
import {
  createFlightConsumerProductionPrivatePreviewFoundationPersistence,
  createFlightConsumerProductionPrivatePreviewPreRpcLimiter,
  FlightConsumerProductionPrivatePreviewFoundationError,
} from "./public-shopping-private-preview-foundation.server";

export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED =
  "FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_RECONCILE_RPC =
  "reconcile_flight_consumer_live_private_preview_exposure_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_VERSION =
  "flight-consumer-production-private-preview-live-shopping-route-v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const inputSchema = z.object({
  authenticatedCustomerId: uuidSchema,
  idempotencyKey: uuidSchema,
  search: flightConsumerProductionPublicShoppingSearchSchema,
}).strict();

const safeRowSchema = z.object({
  local_offer_id: uuidSchema,
  display_rank: z.number().int().min(1).max(25),
  owner_name: z.string().min(2).max(120),
  owner_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/).nullable(),
  currency: z.literal("USD"),
  base_amount_minor: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  tax_amount_minor: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  total_amount_minor: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  offer_expires_at: instantSchema,
  presentation_expires_at: instantSchema,
  changeable: z.boolean(),
  refundable: z.boolean(),
  change_penalty_amount_minor: z.union([
    z.number().int().nonnegative(), z.string().regex(/^\d+$/),
  ]).nullable(),
  refund_penalty_amount_minor: z.union([
    z.number().int().nonnegative(), z.string().regex(/^\d+$/),
  ]).nullable(),
  segment_sequence: z.number().int().min(1).max(4),
  slice_sequence: z.number().int().min(1).max(2),
  journey_direction: z.enum(["outbound", "return"]),
  origin_iata: z.string().regex(/^[A-Z]{3}$/),
  destination_iata: z.string().regex(/^[A-Z]{3}$/),
  departing_at_local: z.string().min(16).max(40),
  arriving_at_local: z.string().min(16).max(40),
  origin_time_zone: z.string().min(1).max(64),
  destination_time_zone: z.string().min(1).max(64),
  marketing_carrier_name: z.string().min(1).max(120),
  marketing_carrier_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/),
  operating_carrier_name: z.string().min(1).max(120),
  operating_carrier_iata_code: z.string().regex(/^[A-Z0-9]{2,3}$/),
  marketing_flight_number: z.string().regex(/^[A-Z0-9]{1,4}$/),
  duration_minutes: z.number().int().min(1).max(2_160),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
}).strict();

const reconciliationSchema = z.object({
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
}).strict().superRefine((value, context) => {
  if (value.projected_offer_count + value.refused_offer_count
    !== value.source_offer_count) {
    context.addIssue({
      code: "custom",
      path: ["source_offer_count"],
      message: "Every provider source must have exactly one disposition.",
    });
  }
});

const publicSegmentSchema = z.object({
  sequence: z.number().int().min(1).max(4),
  sliceSequence: z.number().int().min(1).max(2),
  direction: z.enum(["outbound", "return"]),
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departingAtLocal: z.string().min(16).max(40),
  arrivingAtLocal: z.string().min(16).max(40),
  originTimeZone: z.string().min(1).max(64),
  destinationTimeZone: z.string().min(1).max(64),
  marketingCarrier: z.object({
    name: z.string().min(1).max(120),
    iataCode: z.string().regex(/^[A-Z0-9]{2,3}$/),
  }).strict(),
  operatingCarrier: z.object({
    name: z.string().min(1).max(120),
    iataCode: z.string().regex(/^[A-Z0-9]{2,3}$/),
  }).strict(),
  flightNumber: z.string().regex(/^[A-Z0-9]{1,4}$/),
  durationMinutes: z.number().int().min(1).max(2_160),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
}).strict();
const publicOfferSchema = z.object({
  id: uuidSchema,
  rank: z.number().int().min(1).max(25),
  owner: z.object({
    name: z.string().min(2).max(120),
    iataCode: z.string().regex(/^[A-Z0-9]{2,3}$/).nullable(),
  }).strict(),
  price: z.object({
    currency: z.literal("USD"),
    baseMinor: z.string().regex(/^\d{1,12}$/),
    taxMinor: z.string().regex(/^\d{1,12}$/),
    totalMinor: z.string().regex(/^\d{1,12}$/),
  }).strict(),
  offerExpiresAt: instantSchema,
  presentationExpiresAt: instantSchema,
  terms: z.object({
    changeable: z.boolean(),
    refundable: z.boolean(),
    changePenaltyMinor: z.string().regex(/^\d{1,12}$/).nullable(),
    refundPenaltyMinor: z.string().regex(/^\d{1,12}$/).nullable(),
  }).strict(),
  segments: z.array(publicSegmentSchema).min(1).max(4),
}).strict();
export const flightConsumerProductionPrivatePreviewLiveShoppingResultSchema =
  z.object({
    status: z.literal("complete"),
    replay: z.boolean(),
    offerCount: z.number().int().min(0).max(25),
    offers: z.array(publicOfferSchema).max(25),
    providerReferenceExposed: z.literal(false),
    orderAuthorized: z.literal(false),
    paymentAuthorized: z.literal(false),
    captureAuthorized: z.literal(false),
    refundAuthorized: z.literal(false),
    ticketingAuthorized: z.literal(false),
    servicingAuthorized: z.literal(false),
    consumerPublicReleaseAuthorized: z.literal(false),
    blindRetryAuthorized: z.literal(false),
  }).strict().superRefine((value, context) => {
    if (value.offerCount !== value.offers.length
      || new Set(value.offers.map((offer) => offer.id)).size
        !== value.offers.length
      || new Set(value.offers.map((offer) => offer.rank)).size
        !== value.offers.length) {
      context.addIssue({
        code: "custom",
        path: ["offers"],
        message: "The private-preview offer result is inconsistent.",
      });
    }
  });

export function acceptFlightConsumerProductionPrivatePreviewLiveShoppingResult(
  value: unknown,
) {
  const accepted =
    flightConsumerProductionPrivatePreviewLiveShoppingResultSchema.safeParse(value);
  if (!accepted.success) {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "invalid_result",
      503,
    );
  }
  return Object.freeze(accepted.data);
}

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;
type SafeRow = z.output<typeof safeRowSchema>;

type Admission = Readonly<{
  admissionId: string;
  admissionReceiptSha256: string;
  admissionExecutionScopeSha256: string;
  policySha256: string;
  admissionPolicySha256: string;
  cohortSha256: string;
  subjectSha256: string;
  admissionIdempotencySha256: string;
  publicRequestSha256: string;
}>;
const admissionSchema = z.object({
  admissionId: uuidSchema,
  admissionReceiptSha256: sha256Schema,
  admissionExecutionScopeSha256: sha256Schema,
  policySha256: sha256Schema,
  admissionPolicySha256: sha256Schema,
  cohortSha256: sha256Schema,
  subjectSha256: sha256Schema,
  admissionIdempotencySha256: sha256Schema,
  publicRequestSha256: sha256Schema,
}).strict();
const dispatchResultSchema = z.object({ replay: z.boolean() }).strict();

export type FlightConsumerProductionPrivatePreviewLiveShoppingPorts = Readonly<{
  reserve(input: Readonly<{
    authenticatedCustomerId: string;
    idempotencyKey: string;
    search: FlightConsumerProductionPublicShoppingSearch;
  }>): Promise<Admission>;
  dispatch(input: Admission & Readonly<{
    search: FlightConsumerProductionPublicShoppingSearch;
  }>): Promise<Readonly<{ replay: boolean }>>;
  reconcile(input: Pick<Admission,
    "admissionId" | "admissionReceiptSha256" | "subjectSha256"
    | "publicRequestSha256">): Promise<z.output<typeof reconciliationSchema>>;
  readSafe(input: Readonly<{
    exposureReceiptSha256: string;
    subjectSha256: string;
    requestSha256: string;
  }>): Promise<readonly unknown[]>;
}>;

export class FlightConsumerProductionPrivatePreviewLiveShoppingError
  extends Error {
  constructor(
    readonly reason:
      | "runtime_disabled"
      | "invalid_input"
      | "membership_or_budget_refused"
      | "dispatch_refused"
      | "exposure_refused"
      | "invalid_result",
    readonly status: 400 | 403 | 429 | 503,
  ) {
    super("Private-preview live-flight shopping is unavailable.");
    this.name = "FlightConsumerProductionPrivatePreviewLiveShoppingError";
  }
}

function one<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "invalid_result",
      503,
    );
  }
  return Object.freeze(parsed.data[0]!);
}

function minor(value: string | number) {
  const canonical = typeof value === "number" ? String(value) : value;
  if (!/^\d{1,12}$/.test(canonical)) {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "invalid_result",
      503,
    );
  }
  return canonical;
}

function mapSafeRows(value: unknown, expectedOfferCount: number) {
  const parsed = z.array(safeRowSchema).max(100).safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "invalid_result",
      503,
    );
  }
  const grouped = new Map<string, SafeRow[]>();
  for (const row of parsed.data) {
    const rows = grouped.get(row.local_offer_id) ?? [];
    rows.push(row);
    grouped.set(row.local_offer_id, rows);
  }
  if (grouped.size !== expectedOfferCount) {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "invalid_result",
      503,
    );
  }
  const ranks = new Set<number>();
  const offers = [...grouped.values()].map((rows) => {
    const first = rows[0]!;
    const stable = rows.every((row) =>
      row.display_rank === first.display_rank
      && row.owner_name === first.owner_name
      && row.owner_iata_code === first.owner_iata_code
      && row.currency === first.currency
      && minor(row.base_amount_minor) === minor(first.base_amount_minor)
      && minor(row.tax_amount_minor) === minor(first.tax_amount_minor)
      && minor(row.total_amount_minor) === minor(first.total_amount_minor)
      && row.offer_expires_at === first.offer_expires_at
      && row.presentation_expires_at === first.presentation_expires_at
      && row.changeable === first.changeable
      && row.refundable === first.refundable
      && row.change_penalty_amount_minor === first.change_penalty_amount_minor
      && row.refund_penalty_amount_minor === first.refund_penalty_amount_minor);
    const sequences = new Set(rows.map((row) => row.segment_sequence));
    if (!stable || sequences.size !== rows.length || ranks.has(first.display_rank)) {
      throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
        "invalid_result",
        503,
      );
    }
    ranks.add(first.display_rank);
    return Object.freeze({
      id: first.local_offer_id,
      rank: first.display_rank,
      owner: Object.freeze({
        name: first.owner_name,
        iataCode: first.owner_iata_code,
      }),
      price: Object.freeze({
        currency: "USD" as const,
        baseMinor: minor(first.base_amount_minor),
        taxMinor: minor(first.tax_amount_minor),
        totalMinor: minor(first.total_amount_minor),
      }),
      offerExpiresAt: first.offer_expires_at,
      presentationExpiresAt: first.presentation_expires_at,
      terms: Object.freeze({
        changeable: first.changeable,
        refundable: first.refundable,
        changePenaltyMinor: first.change_penalty_amount_minor === null
          ? null : minor(first.change_penalty_amount_minor),
        refundPenaltyMinor: first.refund_penalty_amount_minor === null
          ? null : minor(first.refund_penalty_amount_minor),
      }),
      segments: Object.freeze([...rows]
        .sort((left, right) => left.segment_sequence - right.segment_sequence)
        .map((row) => Object.freeze({
          sequence: row.segment_sequence,
          sliceSequence: row.slice_sequence,
          direction: row.journey_direction,
          origin: row.origin_iata,
          destination: row.destination_iata,
          departingAtLocal: row.departing_at_local,
          arrivingAtLocal: row.arriving_at_local,
          originTimeZone: row.origin_time_zone,
          destinationTimeZone: row.destination_time_zone,
          marketingCarrier: Object.freeze({
            name: row.marketing_carrier_name,
            iataCode: row.marketing_carrier_iata_code,
          }),
          operatingCarrier: Object.freeze({
            name: row.operating_carrier_name,
            iataCode: row.operating_carrier_iata_code,
          }),
          flightNumber: row.marketing_flight_number,
          durationMinutes: row.duration_minutes,
          cabin: row.cabin,
        }))),
    });
  }).sort((left, right) => left.rank - right.rank);
  return Object.freeze(offers);
}

function requireRouteRuntime(env: ProductionEnvironment) {
  if (env[FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED] !== "true") {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "runtime_disabled",
      503,
    );
  }
  try {
    return requireFlightConsumerProductionPublicShoppingAdmissionRuntime(env);
  } catch {
    throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
      "runtime_disabled",
      503,
    );
  }
}

export function createFlightConsumerProductionPrivatePreviewLiveShoppingPorts(
  environment: ProductionEnvironment = process.env,
): FlightConsumerProductionPrivatePreviewLiveShoppingPorts {
  const env = Object.freeze({ ...environment });
  const admissionRuntime = requireRouteRuntime(env);
  const foundation =
    createFlightConsumerProductionPrivatePreviewFoundationPersistence();
  const limiter = createFlightConsumerProductionPrivatePreviewPreRpcLimiter({
    environment: env,
    persistence: foundation,
  });
  const admission = createFlightConsumerProductionPublicShoppingAdmissionService(
    env,
    { preRpcLimiter: limiter },
  );
  const dispatchRuntime =
    createFlightConsumerProductionPublicShoppingDispatchRuntime(env);
  const dispatchPersistence =
    createFlightConsumerProductionPublicShoppingDispatchPersistence();
  const projection =
    createFlightConsumerProductionPublicOfferProjectionPersistence();
  const offerSources = createFlightConsumerProductionDuffelOfferSourcePort();
  const journal = createFlightConsumerProductionDuffelShoppingJournalPort();
  const encryption =
    createFlightConsumerProductionDuffelOfferReferenceEncryption(env);

  return Object.freeze({
    async reserve(input) {
      const trusted =
        createFlightConsumerProductionPublicShoppingTrustedIdentityCapability(
          input.authenticatedCustomerId,
        );
      const receipt = await admission.reserve({
        idempotencyKey: input.idempotencyKey,
        search: input.search,
      }, trusted);
      if (receipt.admissionState !== "admitted" || !receipt.budgetClaimed) {
        throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
          "membership_or_budget_refused",
          429,
        );
      }
      return Object.freeze({
        admissionId: receipt.admissionId,
        admissionReceiptSha256: receipt.admissionReceiptSha256,
        admissionExecutionScopeSha256:
          admissionRuntime.binding.executionScopeSha256,
        policySha256: admissionRuntime.binding.policySha256,
        admissionPolicySha256: receipt.admissionPolicySha256,
        cohortSha256: admissionRuntime.binding.cohortSha256,
        subjectSha256: receipt.subjectSha256,
        admissionIdempotencySha256: receipt.idempotencySha256,
        publicRequestSha256: receipt.requestSha256,
      });
    },
    async dispatch(input) {
      const result = await dispatchFlightConsumerProductionPublicShopping({
        admissionId: input.admissionId,
        admissionReceiptSha256: input.admissionReceiptSha256,
        admissionExecutionScopeSha256: input.admissionExecutionScopeSha256,
        policySha256: input.policySha256,
        admissionPolicySha256: input.admissionPolicySha256,
        cohortSha256: input.cohortSha256,
        subjectSha256: input.subjectSha256,
        admissionIdempotencySha256: input.admissionIdempotencySha256,
        publicRequestSha256: input.publicRequestSha256,
        shoppingExecutionScopeSha256:
          dispatchRuntime.shoppingExecutionScopeSha256,
        search: input.search,
      }, {
        runtime: dispatchRuntime,
        fetch,
        claim: dispatchPersistence.claim,
        async terminalize(value) {
          await journal.complete({
            p_attempt_id: value.attemptId,
            p_expected_revision: 1,
            p_terminal_state: value.state,
            p_terminal_http_status: value.httpStatus,
            p_terminal_response_sha256: value.responseSha256,
            p_terminal_response_bytes: value.responseBytes,
            p_offer_count: null,
          });
        },
        async recordSources(value) {
          const receipt = await offerSources.record({
            p_source_shopping_attempt_id: value.attemptId,
            p_source_shopping_execution_scope_sha256:
              value.executionScopeSha256,
            p_source_response_sha256: value.responseSha256,
            p_sources: value.sources,
          });
          acceptFlightConsumerProductionDuffelOfferSourceRecord(receipt, {
            attemptId: value.attemptId,
            count: value.sources.length,
          });
        },
        listPendingSources: projection.listPendingSources,
        completeProjection: projection.complete as (
          input: Readonly<Record<string, unknown>>,
        ) => Promise<unknown>,
        readSafe: projection.readSafe,
        encryption,
      });
      return Object.freeze({ replay: result.replay });
    },
    async reconcile(input) {
      let response: Awaited<ReturnType<ReturnType<typeof createAdminClient>["rpc"]>>;
      try {
        response = await createAdminClient().rpc(
          FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_RECONCILE_RPC,
          {
            p_admission_id: input.admissionId,
            p_admission_receipt_sha256: input.admissionReceiptSha256,
            p_subject_sha256: input.subjectSha256,
            p_request_sha256: input.publicRequestSha256,
          },
        );
      } catch {
        throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
          "exposure_refused",
          503,
        );
      }
      if (response.error !== null) {
        throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
          "exposure_refused",
          503,
        );
      }
      return one(reconciliationSchema, response.data);
    },
    readSafe: foundation.readSafe,
  });
}

export function createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow(
  input: Readonly<{
    environment?: ProductionEnvironment;
    ports?: FlightConsumerProductionPrivatePreviewLiveShoppingPorts;
    now?: () => Date;
  }> = {},
) {
  const env = Object.freeze({ ...(input.environment ?? process.env) });
  requireRouteRuntime(env);
  const ports = input.ports
    ?? createFlightConsumerProductionPrivatePreviewLiveShoppingPorts(env);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    version: FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_VERSION,
    routeExposed: true as const,
    privateCohortOnly: true as const,
    providerReferenceExposed: false as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerPublicReleaseAuthorized: false as const,
    blindRetryAuthorized: false as const,
    async execute(value: unknown) {
      const accepted = inputSchema.safeParse(value);
      if (!accepted.success
        || !validateFlightConsumerProductionPublicShoppingTravelWindow(
          accepted.data.search,
          now(),
        )) {
        throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
          "invalid_input",
          400,
        );
      }
      try {
        const admissionResult = admissionSchema.safeParse(
          await ports.reserve(accepted.data),
        );
        if (!admissionResult.success) {
          throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
            "invalid_result",
            503,
          );
        }
        const admission = admissionResult.data;
        const dispatchedResult = dispatchResultSchema.safeParse(
          await ports.dispatch({
          ...admission,
          search: accepted.data.search,
          }),
        );
        if (!dispatchedResult.success) {
          throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
            "invalid_result",
            503,
          );
        }
        const dispatched = dispatchedResult.data;
        const exposureResult = reconciliationSchema.safeParse(
          await ports.reconcile(admission),
        );
        if (!exposureResult.success) {
          throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
            "invalid_result",
            503,
          );
        }
        const exposure = exposureResult.data;
        const rows = await ports.readSafe({
          exposureReceiptSha256: exposure.exposure_receipt_sha256,
          subjectSha256: admission.subjectSha256,
          requestSha256: admission.publicRequestSha256,
        });
        const offers = mapSafeRows(rows, exposure.projected_offer_count);
        return acceptFlightConsumerProductionPrivatePreviewLiveShoppingResult({
          status: "complete" as const,
          replay: dispatched.replay,
          offerCount: offers.length,
          offers,
          providerReferenceExposed: false as const,
          orderAuthorized: false as const,
          paymentAuthorized: false as const,
          captureAuthorized: false as const,
          refundAuthorized: false as const,
          ticketingAuthorized: false as const,
          servicingAuthorized: false as const,
          consumerPublicReleaseAuthorized: false as const,
          blindRetryAuthorized: false as const,
        });
      } catch (error) {
        if (error instanceof FlightConsumerProductionPrivatePreviewLiveShoppingError) {
          throw error;
        }
        if (error instanceof FlightConsumerProductionPublicShoppingAdmissionError
          || error instanceof FlightConsumerProductionPrivatePreviewFoundationError) {
          throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
            "membership_or_budget_refused",
            429,
          );
        }
        if (error instanceof FlightConsumerProductionPublicShoppingDispatchError) {
          throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
            "dispatch_refused",
            503,
          );
        }
        throw new FlightConsumerProductionPrivatePreviewLiveShoppingError(
          "invalid_result",
          503,
        );
      }
    },
  });
}
