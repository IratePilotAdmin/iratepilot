import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  canonicalFlightJson,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";

const offerRequestIdSchema = z.string().regex(/^orq_[A-Za-z0-9]{8,252}$/);
const offerIdSchema = z.string().regex(/^off_[A-Za-z0-9]{8,252}$/);
const passengerIdSchema = z.string().regex(/^pas_[A-Za-z0-9]{8,252}$/);
const moneyAmountSchema = z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const utcInstantSchema = z.string().regex(
  /^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/,
);

const passengerSchema = z.object({
  id: passengerIdSchema,
  type: z.string().min(1).max(32),
}).passthrough();

const offerSchema = z.object({
  id: offerIdSchema,
  live_mode: z.boolean(),
  partial: z.boolean(),
  total_amount: moneyAmountSchema,
  total_currency: currencySchema,
  expires_at: utcInstantSchema,
  passenger_identity_documents_required: z.boolean(),
  payment_requirements: z.object({
    requires_instant_payment: z.boolean(),
  }).passthrough(),
  passengers: z.array(passengerSchema).max(9),
}).passthrough();

const offerRequestResponseSchema = z.object({
  data: z.object({
    id: offerRequestIdSchema,
    live_mode: z.literal(true),
    passengers: z.array(z.object({
      id: passengerIdSchema,
      type: z.literal("adult"),
    }).passthrough()).length(1),
    offers: z.array(offerSchema).max(1_000),
  }).passthrough(),
}).passthrough();

const OFFER_MINIMUM_REMAINING_VALIDITY_MS = 15 * 60_000;
const OFFER_ID_TIEBREAK_DOMAIN =
  "iratepilot:flight-consumer-production:duffel-order-plan:offer-id-tiebreak:v1";

const fictionalTraveler = Object.freeze({
  title: "ms" as const,
  gender: "f" as const,
  given_name: "Synthetic" as const,
  family_name: "Traveler" as const,
  born_on: "1990-01-01" as const,
  email: "flight-order-plan@example.test" as const,
  phone_number: "+13125550121" as const,
});

export type FlightConsumerProductionDuffelOrderPlanErrorCode =
  | "invalid_clock"
  | "provider_contract_refused"
  | "no_eligible_offer";

export class FlightConsumerProductionDuffelOrderPlanError extends Error {
  readonly code: FlightConsumerProductionDuffelOrderPlanErrorCode;

  constructor(code: FlightConsumerProductionDuffelOrderPlanErrorCode) {
    super("A zero-dispatch Duffel Production order plan could not be built.");
    this.name = "FlightConsumerProductionDuffelOrderPlanError";
    this.code = code;
  }
}

export type FlightConsumerProductionDuffelOrderPlanResult = Readonly<{
  offerCount: number;
  eligibleOfferCount: number;
  selectionPolicySha256: string;
  fictionalTravelerFixtureSha256: string;
  orderRequestBodySha256: string;
  orderRequestEnvelopeSha256: string;
  providerOrderDispatchCount: 0;
  stripeRequestCount: 0;
  rawProviderReferencesExposed: false;
  orderEndpointAuthorized: false;
  stripeAuthorized: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
}>;

type AcceptedOffer = z.infer<typeof offerSchema> & Readonly<{
  amountMinor: number;
  expiresAtNanoseconds: bigint;
  offerIdTiebreakSha256: string;
}>;

function domainSeparatedSha256(domain: string, value: FlightCanonicalJsonValue) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(canonicalFlightJson(value), "utf8")
    .digest("hex");
}

function parseAmountMinor(amount: string) {
  const [major, minor] = amount.split(".") as [string, string];
  const value = Number(major) * 100 + Number(minor);
  if (!Number.isSafeInteger(value)) {
    throw new FlightConsumerProductionDuffelOrderPlanError("provider_contract_refused");
  }
  return value;
}

function parseUtcInstantNanoseconds(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (match === null) {
    throw new FlightConsumerProductionDuffelOrderPlanError("provider_contract_refused");
  }
  const second = match[1]!;
  const fraction = match[2] ?? "";
  const milliseconds = Date.parse(`${second}.${fraction.padEnd(3, "0").slice(0, 3)}Z`);
  if (
    !Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString().slice(0, 19) !== second
  ) {
    throw new FlightConsumerProductionDuffelOrderPlanError("provider_contract_refused");
  }
  const epochSeconds = Math.floor(milliseconds / 1_000);
  return BigInt(epochSeconds) * BigInt(1_000_000_000)
    + BigInt(fraction.padEnd(9, "0"));
}

function offerIdTiebreakSha256(offerId: string) {
  return createHash("sha256")
    .update(OFFER_ID_TIEBREAK_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(offerId, "utf8")
    .digest("hex");
}

function isEligible(
  offer: AcceptedOffer,
  offerRequestPassengerId: string,
  minimumExpiryNanoseconds: bigint,
) {
  return offer.live_mode
    && !offer.partial
    && offer.total_currency === "USD"
    && offer.amountMinor > 0
    && offer.expiresAtNanoseconds >= minimumExpiryNanoseconds
    && offer.payment_requirements.requires_instant_payment
    && !offer.passenger_identity_documents_required
    && offer.passengers.length === 1
    && offer.passengers[0]?.type === "adult"
    && offer.passengers[0]?.id === offerRequestPassengerId;
}

function compareEligibleOffers(left: AcceptedOffer, right: AcceptedOffer) {
  if (left.amountMinor !== right.amountMinor) {
    return left.amountMinor - right.amountMinor;
  }
  if (left.expiresAtNanoseconds !== right.expiresAtNanoseconds) {
    return left.expiresAtNanoseconds > right.expiresAtNanoseconds ? -1 : 1;
  }
  return left.offerIdTiebreakSha256.localeCompare(right.offerIdTiebreakSha256);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function buildFlightConsumerProductionDuffelOrderPlan(
  decoded: unknown,
  now: Date,
): FlightConsumerProductionDuffelOrderPlanResult {
  let observedAtMilliseconds: number;
  try {
    observedAtMilliseconds = Date.prototype.getTime.call(now) as number;
  } catch {
    throw new FlightConsumerProductionDuffelOrderPlanError("invalid_clock");
  }
  const minimumExpiryMilliseconds = observedAtMilliseconds + OFFER_MINIMUM_REMAINING_VALIDITY_MS;
  if (!Number.isFinite(observedAtMilliseconds) || !Number.isFinite(minimumExpiryMilliseconds)) {
    throw new FlightConsumerProductionDuffelOrderPlanError("invalid_clock");
  }

  const accepted = offerRequestResponseSchema.safeParse(decoded);
  if (!accepted.success) {
    throw new FlightConsumerProductionDuffelOrderPlanError("provider_contract_refused");
  }

  const offerIds = new Set<string>();
  const offers = accepted.data.data.offers.map((offer): AcceptedOffer => {
    if (offerIds.has(offer.id)) {
      throw new FlightConsumerProductionDuffelOrderPlanError("provider_contract_refused");
    }
    offerIds.add(offer.id);
    return {
      ...offer,
      amountMinor: parseAmountMinor(offer.total_amount),
      expiresAtNanoseconds: parseUtcInstantNanoseconds(offer.expires_at),
      offerIdTiebreakSha256: offerIdTiebreakSha256(offer.id),
    };
  });
  const offerRequestPassengerId = accepted.data.data.passengers[0]!.id;
  const minimumExpiryNanoseconds = BigInt(minimumExpiryMilliseconds) * BigInt(1_000_000);
  const eligibleOffers = offers
    .filter((offer) => isEligible(
      offer,
      offerRequestPassengerId,
      minimumExpiryNanoseconds,
    ))
    .sort(compareEligibleOffers);
  const selectedOffer = eligibleOffers[0];
  if (selectedOffer === undefined) {
    throw new FlightConsumerProductionDuffelOrderPlanError("no_eligible_offer");
  }

  const orderRequestBody = {
    data: {
      type: "instant",
      selected_offers: [selectedOffer.id],
      payments: [{
        type: "balance",
        currency: selectedOffer.total_currency,
        amount: selectedOffer.total_amount,
      }],
      passengers: [{
        id: offerRequestPassengerId,
        ...fictionalTraveler,
      }],
    },
  } satisfies FlightCanonicalJsonValue;

  const fictionalTravelerFixtureSha256 = domainSeparatedSha256(
    "iratepilot:flight-consumer-production:duffel-order-plan:fictional-traveler-fixture:v1",
    fictionalTraveler,
  );
  const orderRequestBodySha256 = domainSeparatedSha256(
    "iratepilot:flight-consumer-production:duffel-order-plan:request-body:v1",
    orderRequestBody,
  );
  const selectionEvidence = offers
    .slice()
    .sort((left, right) => left.offerIdTiebreakSha256.localeCompare(right.offerIdTiebreakSha256))
    .map((offer) => ({
      offerId: offer.id,
      liveMode: offer.live_mode,
      partial: offer.partial,
      amount: offer.total_amount,
      currency: offer.total_currency,
      expiresAt: offer.expires_at,
      requiresInstantPayment: offer.payment_requirements.requires_instant_payment,
      passengerIdentityDocumentsRequired: offer.passenger_identity_documents_required,
      passengers: offer.passengers.map((passenger) => ({
        id: passenger.id,
        type: passenger.type,
      })),
    }));
  const selectionPolicySha256 = domainSeparatedSha256(
    "iratepilot:flight-consumer-production:duffel-order-plan:selection-policy:v1",
    {
      policyVersion: "lowest-usd-minor-amount_latest-expiry_offer-id-sha256-v1",
      observedAt: new Date(observedAtMilliseconds).toISOString(),
      minimumRemainingValiditySeconds: 900,
      offerRequestPassenger: {
        id: offerRequestPassengerId,
        type: "adult",
      },
      offers: selectionEvidence,
      selectedOffer: {
        id: selectedOffer.id,
        passengerId: offerRequestPassengerId,
        amount: selectedOffer.total_amount,
        currency: selectedOffer.total_currency,
        expiresAt: selectedOffer.expires_at,
      },
    },
  );
  const orderRequestEnvelopeSha256 = domainSeparatedSha256(
    "iratepilot:flight-consumer-production:duffel-order-plan:request-envelope:v1",
    {
      method: "POST",
      path: "/air/orders",
      bodySha256: orderRequestBodySha256,
    },
  );

  return deepFreeze({
    offerCount: offers.length,
    eligibleOfferCount: eligibleOffers.length,
    selectionPolicySha256,
    fictionalTravelerFixtureSha256,
    orderRequestBodySha256,
    orderRequestEnvelopeSha256,
    providerOrderDispatchCount: 0,
    stripeRequestCount: 0,
    rawProviderReferencesExposed: false,
    orderEndpointAuthorized: false,
    stripeAuthorized: false,
    bookingAuthorized: false,
    paymentAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
  });
}
