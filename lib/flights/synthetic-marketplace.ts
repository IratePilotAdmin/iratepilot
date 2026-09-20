import type { FlightCabin, FlightPlanningQuery } from "@/lib/flights/search";
import {
  type FlightCommerceSearchRequest,
  type FlightOfferSnapshot,
  validateFlightCommerceSearchRequest,
  validateFlightOfferSnapshot,
} from "./commerce-domain";
import {
  type FlightProviderAdapter,
  type FlightProviderSearchResult,
  SyntheticFlightProviderAdapter,
  syntheticFlightOfferObservedAt,
} from "./provider-adapter";
import {
  evaluateFlightRuntimeAuthorization,
  resolveFlightRuntimePolicy,
  type FlightRuntimeAuthorizationDecision,
  type FlightRuntimeOperation,
} from "./runtime-safety";

export const SYNTHETIC_FLIGHT_MODE = "synthetic_preview_only" as const;

const syntheticPreviewRuntimeSettings = Object.freeze({
  FLIGHT_RUNTIME_MODE: "synthetic",
  FLIGHT_RUNTIME_ENVIRONMENT: "preview",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "true",
} as const);

export type SyntheticFlightSegment = {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  carrierName: string;
  carrierCode: string;
  flightNumber: string;
};

export type SyntheticFlightOffer = {
  id: string;
  mode: typeof SYNTHETIC_FLIGHT_MODE;
  synthetic: true;
  carrierName: string;
  cabin: FlightCabin;
  travelerCount: number;
  slices: readonly SyntheticFlightSegment[];
  stopCount: number;
  totalAmount: string;
  totalCurrency: "USD";
  baggageSummary: string;
  changeSummary: string;
  cancellationSummary: string;
  expiresAt: string;
  bookingAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
};

export type SyntheticFlightOrchestrationEvidence = {
  commerceDomainValidated: true;
  runtimeOperation: "search" | "reprice";
  runtimeAuthorized: true;
  providerId: string;
  providerMode: "synthetic_fixture";
  liveProviderBinding: null;
  externalNetworkAccess: false;
  externalSideEffect: false;
};

export type SyntheticFlightSearchPlan = {
  mode: typeof SYNTHETIC_FLIGHT_MODE;
  offers: readonly SyntheticFlightOffer[];
  orchestration: SyntheticFlightOrchestrationEvidence;
};

export type SyntheticRepriceReceipt = {
  mode: typeof SYNTHETIC_FLIGHT_MODE;
  offerId: string;
  status: "unchanged";
  observedAt: string;
  expiresAt: string;
  totalAmount: string;
  totalCurrency: "USD";
  bookingAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
  orchestration: SyntheticFlightOrchestrationEvidence;
};

export type SyntheticFlightRepricePlan = {
  offer: SyntheticFlightOffer;
  receipt: SyntheticRepriceReceipt;
};

type SyntheticFlightMarketplaceOptions = {
  now?: Date;
  adapter?: FlightProviderAdapter;
};

export class SyntheticFlightMarketplaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticFlightMarketplaceError";
  }
}

function toCommerceSearchRequest(query: FlightPlanningQuery): FlightCommerceSearchRequest {
  return {
    origin: query.origin,
    destination: query.destination,
    departureDate: query.departureDate,
    returnDate: query.tripType === "roundtrip" ? query.returnDate : null,
    cabin: query.cabin,
    passengers: {
      adults: query.travelers,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0,
    },
  };
}

function validatedNow(value: Date | undefined) {
  const now = value ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new SyntheticFlightMarketplaceError("Synthetic preview clock is invalid.");
  return new Date(now.getTime());
}

export function resolveSyntheticFlightPreviewPolicy() {
  return resolveFlightRuntimePolicy(syntheticPreviewRuntimeSettings);
}

export async function evaluateSyntheticFlightPreviewOperation(operation: FlightRuntimeOperation): Promise<FlightRuntimeAuthorizationDecision> {
  return evaluateFlightRuntimeAuthorization(resolveSyntheticFlightPreviewPolicy(), operation, "synthetic");
}

function assertPreviewAdapter(adapter: FlightProviderAdapter) {
  if (
    adapter.mode !== "synthetic_fixture"
    || adapter.executionBinding !== null
    || adapter.paymentExecutionBinding !== null
    || adapter.externalNetworkAccess
    || adapter.supportsLiveTraffic
  ) {
    throw new SyntheticFlightMarketplaceError("Synthetic preview accepts only the network-free synthetic adapter.");
  }
}

function presentationSegment(segment: FlightOfferSnapshot["segments"][number]): SyntheticFlightSegment {
  const departure = Date.parse(segment.departsAt);
  const arrival = Date.parse(segment.arrivesAt);
  return {
    origin: segment.origin,
    destination: segment.destination,
    departureAt: segment.departsAt,
    arrivalAt: segment.arrivesAt,
    durationMinutes: Math.round((arrival - departure) / 60_000),
    carrierName: `Synthetic Carrier ${segment.marketingCarrier}`,
    carrierCode: segment.marketingCarrier,
    flightNumber: `${segment.marketingCarrier}${segment.marketingFlightNumber}`,
  };
}

function presentationOffer(query: FlightPlanningQuery, offer: FlightOfferSnapshot): SyntheticFlightOffer {
  return {
    id: offer.offerId,
    mode: SYNTHETIC_FLIGHT_MODE,
    synthetic: true,
    carrierName: `Synthetic Carrier ${offer.segments[0]!.marketingCarrier}`,
    cabin: query.cabin,
    travelerCount: query.travelers,
    slices: offer.segments.map(presentationSegment),
    stopCount: 0,
    totalAmount: (offer.total.amountMinor / 100).toFixed(2),
    totalCurrency: "USD",
    baggageSummary: "One carry-on test allowance; no real airline allowance was queried.",
    changeSummary: "Synthetic rule only. Actual change eligibility and penalties require a fresh provider offer.",
    cancellationSummary: "Synthetic rule only. No cancellation or refund is authorized.",
    expiresAt: offer.expiresAt,
    bookingAuthorized: false,
    paymentAuthorized: false,
    ticketingAuthorized: false,
  };
}

function orchestrationEvidence(
  operation: "search" | "reprice",
  decision: FlightRuntimeAuthorizationDecision,
  adapter: FlightProviderAdapter,
  externalSideEffect: boolean,
): SyntheticFlightOrchestrationEvidence {
  if (!decision.authorized) throw new SyntheticFlightMarketplaceError(decision.reasons.join(" "));
  if (
    adapter.providerId.length === 0
    || adapter.mode !== "synthetic_fixture"
    || adapter.executionBinding !== null
    || adapter.paymentExecutionBinding !== null
    || adapter.externalNetworkAccess
    || externalSideEffect
  ) {
    throw new SyntheticFlightMarketplaceError("Synthetic preview adapter evidence is not fail-closed.");
  }
  return {
    commerceDomainValidated: true,
    runtimeOperation: operation,
    runtimeAuthorized: true,
    providerId: adapter.providerId,
    providerMode: "synthetic_fixture",
    liveProviderBinding: null,
    externalNetworkAccess: false,
    externalSideEffect: false,
  };
}

async function executeSyntheticSearch(
  query: FlightPlanningQuery,
  options: SyntheticFlightMarketplaceOptions = {},
): Promise<{
  adapter: FlightProviderAdapter;
  request: FlightCommerceSearchRequest;
  providerResult: FlightProviderSearchResult;
  plan: SyntheticFlightSearchPlan;
}> {
  if ((query.tripType === "roundtrip") !== (query.returnDate !== null)) {
    throw new SyntheticFlightMarketplaceError("Trip type and return date must describe the same itinerary shape.");
  }
  const request = toCommerceSearchRequest(query);
  const validation = validateFlightCommerceSearchRequest(request);
  if (!validation.valid) throw new SyntheticFlightMarketplaceError(validation.errors.join(" "));
  const decision = await evaluateSyntheticFlightPreviewOperation("search");
  const now = validatedNow(options.now);
  const adapter = options.adapter ?? new SyntheticFlightProviderAdapter({ enabled: true, now: () => new Date(now.getTime()) });
  assertPreviewAdapter(adapter);
  const providerResult = await adapter.search(request, resolveSyntheticFlightPreviewPolicy(), {});
  if (providerResult.providerId !== adapter.providerId || providerResult.source !== "synthetic_fixture") {
    throw new SyntheticFlightMarketplaceError("Synthetic preview search returned mismatched provider evidence.");
  }
  for (const offer of providerResult.offers) {
    const offerValidation = validateFlightOfferSnapshot(offer);
    if (
      !offerValidation.valid
      || offer.searchDigest !== providerResult.requestDigest
      || offer.providerId !== adapter.providerId
      || offer.source !== providerResult.source
    ) {
      throw new SyntheticFlightMarketplaceError("Synthetic preview search returned invalid or unbound offer evidence.");
    }
  }
  return {
    adapter,
    request,
    providerResult,
    plan: {
      mode: SYNTHETIC_FLIGHT_MODE,
      offers: providerResult.offers.map((offer) => presentationOffer(query, offer)),
      orchestration: orchestrationEvidence("search", decision, adapter, providerResult.externalSideEffect),
    },
  };
}

export async function searchSyntheticFlightMarketplace(
  query: FlightPlanningQuery,
  now = new Date(),
): Promise<SyntheticFlightSearchPlan> {
  return (await executeSyntheticSearch(query, { now })).plan;
}

export async function buildSyntheticFlightOffers(
  query: FlightPlanningQuery,
  now = new Date(),
): Promise<readonly SyntheticFlightOffer[]> {
  return (await searchSyntheticFlightMarketplace(query, now)).offers;
}

export async function getSyntheticFlightOffer(
  query: FlightPlanningQuery,
  id: string,
  now = new Date(),
) {
  const currentTime = validatedNow(now);
  const observedAt = syntheticFlightOfferObservedAt(id);
  if (observedAt === null || observedAt.getTime() > currentTime.getTime()) return null;
  const execution = await executeSyntheticSearch(query, { now: observedAt });
  const offer = execution.plan.offers.find((candidate) => candidate.id === id) ?? null;
  if (offer === null || Date.parse(offer.expiresAt) <= currentTime.getTime()) return null;
  return offer;
}

export async function repriceSyntheticFlightOffer(
  query: FlightPlanningQuery,
  id: string,
  now = new Date(),
): Promise<SyntheticFlightRepricePlan | null> {
  const currentTime = validatedNow(now);
  const observedAt = syntheticFlightOfferObservedAt(id);
  if (observedAt === null || observedAt.getTime() > currentTime.getTime()) return null;
  const execution = await executeSyntheticSearch(query, { now: observedAt });
  const snapshot = execution.providerResult.offers.find((offer) => offer.offerId === id);
  if (!snapshot || Date.parse(snapshot.expiresAt) <= currentTime.getTime()) return null;
  const decision = await evaluateSyntheticFlightPreviewOperation("reprice");
  const repriceAdapter = new SyntheticFlightProviderAdapter({ enabled: true, now: () => new Date(currentTime.getTime()) });
  assertPreviewAdapter(repriceAdapter);
  const repriced = await repriceAdapter.reprice(snapshot, resolveSyntheticFlightPreviewPolicy(), {});
  const validation = validateFlightOfferSnapshot(repriced.repricedOffer);
  if (
    !validation.valid
    || repriced.originalOfferId !== snapshot.offerId
    || repriced.repricedOffer.searchDigest !== execution.providerResult.requestDigest
    || repriced.repricedOffer.providerId !== repriceAdapter.providerId
  ) {
    throw new SyntheticFlightMarketplaceError("Synthetic reprice evidence is invalid or bound to another search.");
  }
  const offer = presentationOffer(query, repriced.repricedOffer);
  const orchestration = orchestrationEvidence("reprice", decision, repriceAdapter, repriced.externalSideEffect);
  return {
    offer,
    receipt: {
      mode: SYNTHETIC_FLIGHT_MODE,
      offerId: offer.id,
      status: "unchanged",
      observedAt: repriced.repricedAt,
      expiresAt: offer.expiresAt,
      totalAmount: offer.totalAmount,
      totalCurrency: offer.totalCurrency,
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      orchestration,
    },
  };
}

export function flightSearchQueryString(query: FlightPlanningQuery) {
  return new URLSearchParams({
    tripType: query.tripType,
    origin: query.origin,
    destination: query.destination,
    departureDate: query.departureDate,
    ...(query.returnDate ? { returnDate: query.returnDate } : {}),
    travelers: String(query.travelers),
    cabin: query.cabin,
  }).toString();
}

export function formatSyntheticFlightMoney(amount: string, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

export function syntheticPreviewReference(offerId: string) {
  return `PREVIEW-${offerId.replace(/^offer_syn_/, "").replaceAll("_", "-").toUpperCase()}`;
}
