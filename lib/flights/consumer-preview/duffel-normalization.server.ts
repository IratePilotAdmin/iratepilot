import "server-only";

import { z } from "zod";

import type {
  DuffelRefreshedOfferEvidence,
  DuffelRehydratedOfferEvidence,
  DuffelSanitizedOfferEvidence,
} from "../duffel-sandbox-contract";
import { sha256FlightEvidence, type FlightCanonicalJsonValue } from "../runtime-safety";
import type { FlightOfferEvidenceStoreRpcParameters } from "./offer-evidence-repository.server";
import {
  encryptFlightConsumerPreviewReference,
  type FlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

function safeMinorUnits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new FlightConsumerPreviewDuffelNormalizationError(label);
  return value;
}

function minuteDuration(departsAt: string, arrivesAt: string) {
  const difference = Date.parse(arrivesAt) - Date.parse(departsAt);
  if (!Number.isSafeInteger(difference) || difference <= 0 || difference % 60_000 !== 0) {
    throw new FlightConsumerPreviewDuffelNormalizationError("segment duration");
  }
  const minutes = difference / 60_000;
  if (minutes < 1 || minutes > 2_160) throw new FlightConsumerPreviewDuffelNormalizationError("segment duration");
  return minutes;
}

function utcDate(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new FlightConsumerPreviewDuffelNormalizationError("segment instant");
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export class FlightConsumerPreviewDuffelNormalizationError extends Error {
  constructor(_detail?: string) {
    void _detail;
    super("Duffel test offer could not be normalized for Consumer Preview.");
    this.name = "FlightConsumerPreviewDuffelNormalizationError";
  }
}

export function normalizedStagedFlightOfferEvidence(
  parameters: FlightOfferEvidenceStoreRpcParameters,
) {
  return Object.freeze({
    stage: parameters.p_stage,
    predecessor_receipt_sha256: parameters.p_predecessor_receipt_sha256,
    observed_at: parameters.p_observed_at,
    retention_expires_at: parameters.p_retention_expires_at,
    raw_body_sha256: parameters.p_raw_body_sha256,
    evidence_sha256: parameters.p_evidence_sha256,
    snapshot_sha256: parameters.p_snapshot_sha256,
    record_sha256: parameters.p_record_sha256,
    receipt_sha256: parameters.p_receipt_sha256,
    key_version: parameters.p_key_version,
    iv_base64url: parameters.p_iv_base64url,
    auth_tag_base64url: parameters.p_auth_tag_base64url,
    ciphertext_base64url: parameters.p_ciphertext_base64url,
    aad_sha256: parameters.p_aad_sha256,
    record_hmac_sha256: parameters.p_record_hmac_sha256,
  });
}

function normalizedSegments(
  rehydrated: DuffelRehydratedOfferEvidence,
  evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence,
) {
  const firstSliceSize = evidence.sliceSegmentIdentityDigests[0]?.length ?? evidence.segments.length;
  const disclosures = new Map(evidence.operatingCarrierDisclosures.map((item) => [item.segmentId, item]));
  return Object.freeze(rehydrated.snapshot.segments.map((segment, index) => {
    if (!/^[0-9]{1,4}[A-Z]?$/.test(segment.marketingFlightNumber)) {
      throw new FlightConsumerPreviewDuffelNormalizationError("flight number");
    }
    const disclosure = disclosures.get(segment.segmentId);
    if (!disclosure || disclosure.marketingCarrierIataCode !== segment.marketingCarrier) {
      throw new FlightConsumerPreviewDuffelNormalizationError("operating-carrier disclosure");
    }
    return Object.freeze({
      segment_sequence: index + 1,
      journey_direction: index < firstSliceSize ? "outbound" : "return",
      origin_iata: segment.origin,
      destination_iata: segment.destination,
      marketing_carrier: segment.marketingCarrier,
      operating_carrier: disclosure.operatingCarrierIataCode,
      marketing_flight_number: segment.marketingFlightNumber,
      departure_at: segment.departsAt,
      arrival_at: segment.arrivesAt,
      departure_local_date: utcDate(segment.departsAt),
      arrival_local_date: utcDate(segment.arrivesAt),
      cabin: evidence.cabin,
      booking_class: null,
      duration_minutes: minuteDuration(segment.departsAt, segment.arrivesAt),
      aircraft_code: null,
    });
  }));
}

export function normalizeFlightConsumerPreviewDuffelOffer(input: Readonly<{
  customerId: string;
  offerId: string;
  executionScopeSha256: string;
  rehydrated: DuffelRehydratedOfferEvidence;
  stagedEvidence: FlightOfferEvidenceStoreRpcParameters;
  referenceKeyring: FlightConsumerPreviewReferenceKeyring;
}>) {
  try {
    const customerId = uuidSchema.parse(input.customerId);
    const offerId = uuidSchema.parse(input.offerId);
    const executionScopeSha256 = sha256Schema.parse(input.executionScopeSha256);
    const evidence = input.rehydrated.evidence;
    if (
      input.rehydrated.stage !== "initial"
      || evidence.version !== "duffel-sanitized-offer-v1"
      || input.stagedEvidence.p_stage !== "initial"
      || input.stagedEvidence.p_offer_id !== offerId
      || input.stagedEvidence.p_customer_id !== customerId
      || input.stagedEvidence.p_search_id !== input.rehydrated.scope.commerceId
      || input.stagedEvidence.p_execution_scope_sha256 !== executionScopeSha256
      || input.stagedEvidence.p_receipt_sha256 !== input.rehydrated.receiptDigest
    ) throw new FlightConsumerPreviewDuffelNormalizationError();
    const totalCents = safeMinorUnits(evidence.total.amountMinor, "total");
    const baseFareCents = safeMinorUnits(evidence.base.amountMinor, "base");
    const taxCents = safeMinorUnits(evidence.tax?.amountMinor ?? totalCents - baseFareCents, "tax");
    const feeCents = safeMinorUnits(totalCents - baseFareCents - taxCents, "fee");
    if (
      evidence.total.currency !== evidence.base.currency
      || (evidence.tax !== null && evidence.tax.currency !== evidence.total.currency)
      || evidence.liveMode !== false
      || evidence.ownerIataCode !== "ZZ"
      || evidence.passengerIdentityDocumentsRequired
    ) throw new FlightConsumerPreviewDuffelNormalizationError();
    const providerReference = encryptFlightConsumerPreviewReference({
      value: evidence.providerOfferId,
      context: {
        kind: "duffel_offer",
        customerId,
        resourceId: offerId,
        executionScopeSha256,
      },
      keyring: input.referenceKeyring,
    });
    const segments = normalizedSegments(input.rehydrated, evidence);
    return Object.freeze({
      offer_id: offerId,
      local_offer_id: input.rehydrated.snapshot.offerId,
      provider_offer_ref_ciphertext: providerReference.ciphertext,
      provider_offer_ref_sha256: providerReference.referenceSha256,
      provider_payload_sha256: evidence.rawBodyDigest,
      currency: evidence.total.currency,
      base_fare_cents: baseFareCents,
      tax_cents: taxCents,
      fee_cents: feeCents,
      total_cents: totalCents,
      validating_carrier: evidence.ownerIataCode,
      itinerary_sha256: sha256FlightEvidence({
        version: "flight-consumer-preview-itinerary-v1",
        segments,
      } as FlightCanonicalJsonValue),
      fare_rules_sha256: evidence.termsDigest,
      expires_at: evidence.expiresAt,
      segments,
      fare_terms: Object.freeze({
        refundable: false,
        changeable: false,
        change_fee_cents: null,
        cancellation_fee_cents: null,
        checked_bag_pieces: 0,
        carry_on_pieces: 0,
        checked_bag_weight_kg: null,
        terms_summary_sha256: evidence.termsDigest,
      }),
      evidence: normalizedStagedFlightOfferEvidence(input.stagedEvidence),
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelNormalizationError) throw error;
    throw new FlightConsumerPreviewDuffelNormalizationError();
  }
}
