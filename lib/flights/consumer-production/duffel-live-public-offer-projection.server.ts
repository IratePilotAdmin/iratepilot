import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { parseDuffelJsonBody } from "../duffel-sandbox-contract";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import {
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
} from "./duffel-live-offer-reprice.server";
import {
  flightConsumerProductionPublicOfferProjectionBatchSchema,
  flightConsumerProductionPublicOfferProjectionSchema,
} from "./public-offer-projection-contract";
import {
  acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult,
  requireFlightConsumerLiveDuffelOfferReferenceEncryptionPort,
  type FlightConsumerLiveDuffelOfferReferenceEncryptionPort,
} from "./public-offer-reference-encryption-port.server";
import {
  canonicalFlightConsumerProductionPublicShoppingSearchJson,
  flightConsumerProductionPublicShoppingSearchSchema,
  type FlightConsumerProductionPublicShoppingSearch,
} from "./public-shopping-contract";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_VERSION =
  "flight-consumer-production-public-offer-projection-v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_LIMIT = 25 as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PRESENTATION_TTL_MS =
  10 * 60_000;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_EXPIRY_BUFFER_MS =
  120_000;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const offerIdSchema = z.string().regex(/^off_[A-Za-z0-9]{8,252}$/);
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,6})\.\d{2}$/);
const utcInstantSchema = z.string().min(20).max(64).refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
});
const localInstantSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
);
const timeZoneSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_+.\-/]+$/);
const carrierCodeSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const carrierNameSchema = z.string().min(2).max(120).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
);
const carrierSchema = z.object({
  name: carrierNameSchema,
  iata_code: carrierCodeSchema,
}).passthrough();
const airportSchema = z.object({
  iata_code: z.string().regex(/^[A-Z]{3}$/),
  time_zone: timeZoneSchema,
}).passthrough();
const conditionSchema = z.object({
  allowed: z.boolean(),
  penalty_amount: amountSchema.nullable(),
  penalty_currency: z.literal("USD").nullable(),
}).strict().superRefine((value, context) => {
  if ((value.penalty_amount === null) !== (value.penalty_currency === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["penalty_amount"],
      message: "Penalty amount and currency must be present together.",
    });
  }
  if (!value.allowed && value.penalty_amount !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["penalty_amount"],
      message: "A prohibited action cannot carry a penalty.",
    });
  }
});
const segmentSchema = z.object({
  marketing_carrier: carrierSchema,
  operating_carrier: carrierSchema,
  marketing_carrier_flight_number: z.string().regex(/^[A-Z0-9]{1,4}$/),
  origin: airportSchema,
  destination: airportSchema,
  departing_at: localInstantSchema,
  arriving_at: localInstantSchema,
  duration: z.string().regex(/^PT(?:(?:\d{1,2})H)?(?:(?:\d{1,2})M)?$/),
  passengers: z.array(z.object({
    cabin_class: z.enum(["economy", "premium_economy", "business", "first"]),
  }).passthrough()).min(1).max(4),
}).passthrough();
const sliceSchema = z.object({
  origin: z.object({ iata_code: z.string().regex(/^[A-Z]{3}$/) }).passthrough(),
  destination: z.object({ iata_code: z.string().regex(/^[A-Z]{3}$/) }).passthrough(),
  segments: z.array(segmentSchema).min(1).max(2),
}).passthrough();
const eligibleOfferSchema = z.object({
  id: offerIdSchema,
  live_mode: z.literal(true),
  partial: z.literal(false),
  total_amount: amountSchema,
  total_currency: z.literal("USD"),
  base_amount: amountSchema,
  base_currency: z.literal("USD"),
  tax_amount: amountSchema,
  tax_currency: z.literal("USD"),
  expires_at: utcInstantSchema,
  passenger_identity_documents_required: z.literal(false),
  payment_requirements: z.object({
    requires_instant_payment: z.literal(true),
  }).passthrough(),
  owner: z.object({
    name: carrierNameSchema,
    iata_code: carrierCodeSchema.nullable(),
  }).passthrough(),
  passengers: z.array(z.object({ type: z.literal("adult") }).passthrough())
    .min(1).max(4),
  conditions: z.object({
    change_before_departure: conditionSchema.nullable(),
    refund_before_departure: conditionSchema.nullable(),
  }).strict(),
  slices: z.array(sliceSchema).min(1).max(2),
}).passthrough();
const responseSchema = z.object({
  data: z.object({
    id: z.string().regex(/^orq_[A-Za-z0-9]{8,252}$/),
    live_mode: z.literal(true),
    offers: z.array(z.unknown()).max(1_000),
  }).passthrough(),
}).passthrough();

export const flightConsumerProductionPublicOfferRefusalCodes = [
  "capacity_truncated",
  "identity_document_required",
  "too_close_to_expiry",
  "unsupported_contract",
  "unsupported_currency",
  "unsupported_payment_profile",
] as const;

type RefusalCode = (typeof flightConsumerProductionPublicOfferRefusalCodes)[number];

export type FlightConsumerProductionPublicOfferProjectionRecord = Readonly<{
  sourceId: string;
  sourceOfferEvidenceSha256: string;
  offerIdSha256: string;
  projectionSha256: string;
  projection: z.output<typeof flightConsumerProductionPublicOfferProjectionSchema>;
  encryptedReference: Readonly<{
    ciphertext: string;
    plaintextReferenceSha256: string;
    keyVersion: string;
    aadSha256: string;
    ciphertextSha256: string;
    recordHmacSha256: string;
  }>;
}>;

export type FlightConsumerProductionPublicOfferRefusalRecord = Readonly<{
  sourceId: string;
  sourceOfferEvidenceSha256: string;
  offerIdSha256: string;
  refusalCode: RefusalCode;
}>;

export class FlightConsumerProductionPublicOfferProjectionError extends Error {
  constructor(readonly reason = "projection_refused") {
    super("The Duffel live response could not be projected for public shopping.");
    this.name = "FlightConsumerProductionPublicOfferProjectionError";
  }
}

function equalSha256(left: string, right: string) {
  return sha256Schema.safeParse(left).success
    && sha256Schema.safeParse(right).success
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function moneyMinor(value: string) {
  const [whole, fraction] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(result) || result < 0 || result > 99_999_999) {
    throw new FlightConsumerProductionPublicOfferProjectionError();
  }
  return result;
}

export function parseFlightConsumerProductionDuffelDurationMinutes(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value);
  const minutes = Number(match?.[1] ?? 0) * 60 + Number(match?.[2] ?? 0);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 2_160) {
    throw new FlightConsumerProductionPublicOfferProjectionError();
  }
  return minutes;
}

function conditionProjection(condition: z.output<typeof conditionSchema> | null) {
  return {
    allowed: condition?.allowed ?? null,
    penaltyAmountMinor: condition?.penalty_amount === null
      || condition === null
      ? null
      : moneyMinor(condition.penalty_amount),
  };
}

export function buildFlightConsumerProductionDuffelPublicShoppingRequestBody(
  search: FlightConsumerProductionPublicShoppingSearch,
) {
  return {
    data: {
      cabin_class: search.cabin,
      passengers: Array.from({ length: search.adults }, () => ({ type: "adult" })),
      slices: [
        {
          origin: search.origin,
          destination: search.destination,
          departure_date: search.departureDate,
        },
        ...(search.returnDate === null ? [] : [{
          origin: search.destination,
          destination: search.origin,
          departure_date: search.returnDate,
        }]),
      ],
    },
  } as const;
}

export function deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256(
  input: Readonly<{
    executionScopeSha256: string;
    policySha256: string;
    admissionPolicySha256: string;
    cohortSha256: string;
    subjectSha256: string;
    search: FlightConsumerProductionPublicShoppingSearch;
  }>,
) {
  return sha256FlightEvidence({
    version: "flight-consumer-production-public-shopping-admission-request-v1",
    executionScopeSha256: input.executionScopeSha256,
    policySha256: input.policySha256,
    admissionPolicySha256: input.admissionPolicySha256,
    cohortSha256: input.cohortSha256,
    subjectSha256: input.subjectSha256,
    search: JSON.parse(
      canonicalFlightConsumerProductionPublicShoppingSearchJson(input.search),
    ) as FlightCanonicalJsonValue,
  });
}

function refusalFor(raw: unknown, nowMs: number): RefusalCode | null {
  if (typeof raw !== "object" || raw === null) return "unsupported_contract";
  const record = raw as Record<string, unknown>;
  if (record.total_currency !== "USD" || record.base_currency !== "USD" || record.tax_currency !== "USD") {
    return "unsupported_currency";
  }
  if ((record.payment_requirements as Record<string, unknown> | undefined)?.requires_instant_payment !== true) {
    return "unsupported_payment_profile";
  }
  if (record.passenger_identity_documents_required === true) {
    return "identity_document_required";
  }
  const expiry = typeof record.expires_at === "string" ? Date.parse(record.expires_at) : Number.NaN;
  if (Number.isFinite(expiry) && expiry <= nowMs + FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_EXPIRY_BUFFER_MS) {
    return "too_close_to_expiry";
  }
  return "unsupported_contract";
}

function sourceFor(
  sources: ReadonlyMap<string, Readonly<{
    sourceId: string;
    sourceOfferEvidenceSha256: string;
    expiresAt: string;
  }>>,
  offerId: string,
) {
  const offerIdSha256 = deriveFlightConsumerProductionDuffelLiveOfferIdSha256(offerId);
  const source = sources.get(offerIdSha256);
  if (source === undefined) {
    throw new FlightConsumerProductionPublicOfferProjectionError(
      "source_binding_refused",
    );
  }
  return { ...source, offerIdSha256 };
}

function projectSegments(
  offer: z.output<typeof eligibleOfferSchema>,
  search: FlightConsumerProductionPublicShoppingSearch,
) {
  const expectedSliceCount = search.returnDate === null ? 1 : 2;
  if (offer.slices.length !== expectedSliceCount || offer.passengers.length !== search.adults) {
    throw new FlightConsumerProductionPublicOfferProjectionError();
  }
  const output: Array<Record<string, unknown>> = [];
  let globalSequence = 0;
  offer.slices.forEach((slice, sliceIndex) => {
    const expectedOrigin = sliceIndex === 0 ? search.origin : search.destination;
    const expectedDestination = sliceIndex === 0 ? search.destination : search.origin;
    const expectedDepartureDate = sliceIndex === 0
      ? search.departureDate
      : search.returnDate;
    if (
      slice.origin.iata_code !== expectedOrigin
      || slice.destination.iata_code !== expectedDestination
      || slice.segments[0]?.origin.iata_code !== expectedOrigin
      || slice.segments[0]?.departing_at.slice(0, 10) !== expectedDepartureDate
      || slice.segments.at(-1)?.destination.iata_code !== expectedDestination
    ) throw new FlightConsumerProductionPublicOfferProjectionError();
    slice.segments.forEach((segment, index) => {
      if (
        segment.passengers.length !== search.adults
        || segment.passengers.some((passenger) => passenger.cabin_class !== search.cabin)
        || (index > 0
          && slice.segments[index - 1]?.destination.iata_code
            !== segment.origin.iata_code)
      ) throw new FlightConsumerProductionPublicOfferProjectionError();
      globalSequence += 1;
      output.push({
        sliceSequence: sliceIndex + 1,
        segmentSequence: globalSequence,
        journeyDirection: sliceIndex === 0 ? "outbound" : "return",
        originIata: segment.origin.iata_code,
        destinationIata: segment.destination.iata_code,
        departingAtLocal: segment.departing_at,
        arrivingAtLocal: segment.arriving_at,
        originTimeZone: segment.origin.time_zone,
        destinationTimeZone: segment.destination.time_zone,
        marketingCarrierName: segment.marketing_carrier.name,
        marketingCarrierIataCode: segment.marketing_carrier.iata_code,
        operatingCarrierName: segment.operating_carrier.name,
        operatingCarrierIataCode: segment.operating_carrier.iata_code,
        marketingFlightNumber: segment.marketing_carrier_flight_number,
        durationMinutes: parseFlightConsumerProductionDuffelDurationMinutes(
          segment.duration,
        ),
        cabin: search.cabin,
      });
    });
  });
  if (globalSequence > 4) throw new FlightConsumerProductionPublicOfferProjectionError();
  return output;
}

export async function projectFlightConsumerProductionDuffelPublicOffers(
  input: Readonly<{
    admissionId: string;
    admissionExecutionScopeSha256: string;
    policySha256: string;
    admissionPolicySha256: string;
    cohortSha256: string;
    subjectSha256: string;
    idempotencySha256: string;
    requestSha256: string;
    admissionReceiptSha256: string;
    sourceShoppingAttemptId: string;
    sourceShoppingExecutionScopeSha256: string;
    sourceResponseSha256: string;
    search: unknown;
    rawBody: Uint8Array;
    observedAt: string;
    sources: readonly Readonly<{
      sourceId: string;
      offerIdSha256: string;
      sourceOfferEvidenceSha256: string;
      expiresAt: string;
    }>[];
    encryption: FlightConsumerLiveDuffelOfferReferenceEncryptionPort;
    newLocalOfferId?: () => string;
  }>,
) {
  const search = flightConsumerProductionPublicShoppingSearchSchema.parse(input.search);
  const admissionId = uuidSchema.parse(input.admissionId);
  const observedAtMs = Date.parse(input.observedAt);
  if (!Number.isFinite(observedAtMs)) throw new FlightConsumerProductionPublicOfferProjectionError();
  for (const digest of [
    input.admissionExecutionScopeSha256,
    input.policySha256,
    input.admissionPolicySha256,
    input.cohortSha256,
    input.subjectSha256,
    input.idempotencySha256,
    input.requestSha256,
    input.admissionReceiptSha256,
    input.sourceShoppingExecutionScopeSha256,
    input.sourceResponseSha256,
  ]) sha256Schema.parse(digest);
  uuidSchema.parse(input.sourceShoppingAttemptId);
  const expectedAdmissionRequestSha256 =
    deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256({
      executionScopeSha256: input.admissionExecutionScopeSha256,
      policySha256: input.policySha256,
      admissionPolicySha256: input.admissionPolicySha256,
      cohortSha256: input.cohortSha256,
      subjectSha256: input.subjectSha256,
      search,
    });
  if (!equalSha256(expectedAdmissionRequestSha256, input.requestSha256)) {
    throw new FlightConsumerProductionPublicOfferProjectionError(
      "admission_request_binding_refused",
    );
  }
  const rawSnapshot = new Uint8Array(input.rawBody);
  const responseSha256 = createHash("sha256").update(rawSnapshot).digest("hex");
  if (!equalSha256(responseSha256, input.sourceResponseSha256)) {
    rawSnapshot.fill(0);
    throw new FlightConsumerProductionPublicOfferProjectionError(
      "response_binding_refused",
    );
  }
  const sourceMap = new Map(input.sources.map((source) => [
    sha256Schema.parse(source.offerIdSha256),
    Object.freeze({
      sourceId: uuidSchema.parse(source.sourceId),
      sourceOfferEvidenceSha256: sha256Schema.parse(
        source.sourceOfferEvidenceSha256,
      ),
      expiresAt: z.string().datetime({ offset: true }).parse(source.expiresAt),
    }),
  ]));
  if (sourceMap.size !== input.sources.length) {
    rawSnapshot.fill(0);
    throw new FlightConsumerProductionPublicOfferProjectionError(
      "source_binding_refused",
    );
  }
  const encryption = requireFlightConsumerLiveDuffelOfferReferenceEncryptionPort(
    input.encryption,
  );
  const localId = input.newLocalOfferId ?? randomUUID;
  try {
    const decoded = responseSchema.parse(parseDuffelJsonBody(rawSnapshot));
    if (decoded.data.offers.length !== sourceMap.size) {
      throw new FlightConsumerProductionPublicOfferProjectionError(
        "source_binding_refused",
      );
    }
    const observedOfferIds = new Set<string>();
    const observedOfferIdSha256 = new Set<string>();
    const candidates = decoded.data.offers.map((raw) => {
      const record = z.object({ id: offerIdSchema }).passthrough().parse(raw);
      if (observedOfferIds.has(record.id)) {
        throw new FlightConsumerProductionPublicOfferProjectionError(
          "source_binding_refused",
        );
      }
      observedOfferIds.add(record.id);
      const source = sourceFor(sourceMap, record.id);
      if (observedOfferIdSha256.has(source.offerIdSha256)) {
        throw new FlightConsumerProductionPublicOfferProjectionError(
          "source_binding_refused",
        );
      }
      observedOfferIdSha256.add(source.offerIdSha256);
      const accepted = eligibleOfferSchema.safeParse(raw);
      if (!accepted.success) {
        return { raw, providerOfferId: record.id, source, refusal: refusalFor(raw, observedAtMs) } as const;
      }
      try {
        const offer = accepted.data;
        const sourceExpiry = Date.parse(source.expiresAt);
        const providerExpiry = Date.parse(offer.expires_at);
        if (
          providerExpiry !== sourceExpiry
          || providerExpiry <= observedAtMs
            + FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_EXPIRY_BUFFER_MS
        ) {
          return { raw, providerOfferId: record.id, source, refusal: "too_close_to_expiry" as const };
        }
        if (
          offer.conditions.change_before_departure === null
          || offer.conditions.refund_before_departure === null
        ) {
          return { raw, providerOfferId: record.id, source,
            refusal: "unsupported_contract" as const };
        }
        const baseAmountMinor = moneyMinor(offer.base_amount);
        const taxAmountMinor = moneyMinor(offer.tax_amount);
        const totalAmountMinor = moneyMinor(offer.total_amount);
        if (baseAmountMinor + taxAmountMinor !== totalAmountMinor) {
          throw new FlightConsumerProductionPublicOfferProjectionError();
        }
        const termsChange = conditionProjection(offer.conditions.change_before_departure);
        const termsRefund = conditionProjection(offer.conditions.refund_before_departure);
        const terms = {
          changeable: termsChange.allowed,
          refundable: termsRefund.allowed,
          changePenaltyAmountMinor: termsChange.penaltyAmountMinor,
          refundPenaltyAmountMinor: termsRefund.penaltyAmountMinor,
          termsSummarySha256: sha256FlightEvidence({
            version: "flight-consumer-production-public-offer-terms-v1",
            owner: {
              name: offer.owner.name,
              iataCode: offer.owner.iata_code,
            },
            change: termsChange,
            refund: termsRefund,
          }),
        };
        return {
          providerOfferId: record.id,
          source,
          refusal: null,
          sortAmount: totalAmountMinor,
          providerExpiry,
          offer,
          terms,
          segments: projectSegments(offer, search),
          price: { currency: "USD" as const, baseAmountMinor, taxAmountMinor, totalAmountMinor },
        } as const;
      } catch {
        return { raw, providerOfferId: record.id, source, refusal: "unsupported_contract" as const };
      }
    });
    const eligible = candidates.filter(
      (candidate): candidate is Extract<typeof candidate, { refusal: null }> =>
        candidate.refusal === null,
    )
      .sort((left, right) => {
        if (left.refusal !== null || right.refusal !== null) return 0;
        return left.sortAmount - right.sortAmount
          || left.providerExpiry - right.providerExpiry
          || left.source.offerIdSha256.localeCompare(right.source.offerIdSha256);
      });
    const selectedOfferIds = new Set(eligible
      .slice(0, FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_LIMIT)
      .map((candidate) => candidate.source.offerIdSha256));
    const projected: FlightConsumerProductionPublicOfferProjectionRecord[] = [];
    const refused: FlightConsumerProductionPublicOfferRefusalRecord[] = [];
    for (const candidate of candidates) {
      if (
        candidate.refusal !== null
        || !selectedOfferIds.has(candidate.source.offerIdSha256)
      ) {
        refused.push(Object.freeze({
          sourceId: candidate.source.sourceId,
          sourceOfferEvidenceSha256: candidate.source.sourceOfferEvidenceSha256,
          offerIdSha256: candidate.source.offerIdSha256,
          refusalCode: candidate.refusal ?? "capacity_truncated",
        }));
        continue;
      }
      const eligibleCandidate = candidate as Extract<typeof candidate, { refusal: null }>;
      const localOfferId = uuidSchema.parse(localId());
      const presentationExpiresAt = new Date(Math.min(
        eligibleCandidate.providerExpiry,
        observedAtMs + FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PRESENTATION_TTL_MS,
      )).toISOString();
      const projectionWithoutDigest = {
        localOfferId,
        displayRank: eligible.indexOf(eligibleCandidate) + 1,
        providerCode: "duffel" as const,
        owner: {
          name: eligibleCandidate.offer.owner.name,
          iataCode: eligibleCandidate.offer.owner.iata_code,
        },
        price: eligibleCandidate.price,
        passengerIdentityDocumentsRequired: false as const,
        requiresInstantPayment: true as const,
        offerExpiresAt: new Date(eligibleCandidate.providerExpiry).toISOString(),
        presentationExpiresAt,
        terms: eligibleCandidate.terms,
        segments: eligibleCandidate.segments,
      };
      const projection = flightConsumerProductionPublicOfferProjectionSchema
        .parse(projectionWithoutDigest);
      const projectionSha256 = sha256FlightEvidence({
        version: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_VERSION,
        admissionId,
        sourceId: eligibleCandidate.source.sourceId,
        sourceOfferEvidenceSha256:
          eligibleCandidate.source.sourceOfferEvidenceSha256,
        offerIdSha256: eligibleCandidate.source.offerIdSha256,
        projection: projection as unknown as FlightCanonicalJsonValue,
      });
      const encryptedReference =
        acceptFlightConsumerLiveDuffelOfferReferenceEncryptionResult(
          await encryption.encryptOfferReference({
            plaintextReference: eligibleCandidate.providerOfferId,
            plaintextReferenceSha256: eligibleCandidate.source.offerIdSha256,
            localOfferId,
            sourceId: eligibleCandidate.source.sourceId,
            sourceOfferEvidenceSha256:
              eligibleCandidate.source.sourceOfferEvidenceSha256,
            admissionReceiptSha256: input.admissionReceiptSha256,
            subjectSha256: input.subjectSha256,
            requestSha256: input.requestSha256,
            projectionSha256,
            offerExpiresAt: projection.offerExpiresAt,
            keyVersion: encryption.keyVersion,
          }),
          {
            plaintextReferenceSha256: eligibleCandidate.source.offerIdSha256,
            keyVersion: encryption.keyVersion,
            admissionReceiptSha256: input.admissionReceiptSha256,
            subjectSha256: input.subjectSha256,
            requestSha256: input.requestSha256,
            localOfferId,
            sourceId: eligibleCandidate.source.sourceId,
            sourceOfferEvidenceSha256:
              eligibleCandidate.source.sourceOfferEvidenceSha256,
            projectionSha256,
            offerExpiresAt: projection.offerExpiresAt,
          },
        );
      projected.push(Object.freeze({
        sourceId: eligibleCandidate.source.sourceId,
        sourceOfferEvidenceSha256:
          eligibleCandidate.source.sourceOfferEvidenceSha256,
        offerIdSha256: eligibleCandidate.source.offerIdSha256,
        projectionSha256,
        projection: Object.freeze(projection),
        encryptedReference,
      }));
    }
    const sourceRequestBodySha256 = createHash("sha256").update(
      canonicalFlightJson(JSON.parse(JSON.stringify(
        buildFlightConsumerProductionDuffelPublicShoppingRequestBody(search),
      ))),
    ).digest("hex");
    const projectionBatchSha256 = sha256FlightEvidence({
      version: "flight-consumer-production-public-offer-projection-batch-v1",
      admissionId,
      admissionReceiptSha256: input.admissionReceiptSha256,
      sourceShoppingAttemptId: input.sourceShoppingAttemptId,
      sourceShoppingExecutionScopeSha256:
        input.sourceShoppingExecutionScopeSha256,
      sourceResponseSha256: input.sourceResponseSha256,
      sourceRequestBodySha256,
      projected: projected.map((item) => ({
        sourceId: item.sourceId,
        sourceOfferEvidenceSha256: item.sourceOfferEvidenceSha256,
        offerIdSha256: item.offerIdSha256,
        projectionSha256: item.projectionSha256,
      })).sort((left, right) => left.offerIdSha256.localeCompare(right.offerIdSha256)),
      refused: refused.map((item) => item).sort(
        (left, right) => left.offerIdSha256.localeCompare(right.offerIdSha256),
      ),
      observedAt: new Date(observedAtMs).toISOString(),
    });
    const safeBatch = flightConsumerProductionPublicOfferProjectionBatchSchema.parse({
      version: "flight-consumer-production-public-offer-projection-batch-v1",
      admissionId,
      projectionBatchSha256,
      offers: projected.map((item) => item.projection),
      sourceOfferCount: input.sources.length,
      refusedOfferCount: refused.length,
      observedAt: new Date(observedAtMs).toISOString(),
      rawProviderReferencesExposed: false,
      providerDispatchAuthorized: false,
      consumerExposureAuthorized: false,
      orderAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
    });
    return Object.freeze({
      version: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_VERSION,
      safeBatch: Object.freeze(safeBatch),
      projected: Object.freeze(projected),
      refused: Object.freeze(refused),
      sourceRequestBodySha256,
      providerRequests: 0 as const,
      routeExposed: false as const,
      providerDispatchAuthorized: false as const,
      consumerExposureAuthorized: false as const,
      orderAuthorized: false as const,
      stripeDispatchAuthorized: false as const,
      bookingAuthorized: false as const,
      paymentAuthorized: false as const,
      settlementAuthorized: false as const,
      ticketingAuthorized: false as const,
      servicingAuthorized: false as const,
      captureAuthorized: false as const,
      refundAuthorized: false as const,
      consumerReleaseEnabled: false as const,
      blindRetryAuthorized: false as const,
    });
  } catch (error) {
    if (error instanceof FlightConsumerProductionPublicOfferProjectionError) throw error;
    throw new FlightConsumerProductionPublicOfferProjectionError();
  } finally {
    rawSnapshot.fill(0);
  }
}
