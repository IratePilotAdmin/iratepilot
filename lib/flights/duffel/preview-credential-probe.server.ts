import "server-only";

import type { FlightCommerceSearchRequest } from "../commerce-domain";
import { sanitizeDuffelSandboxOfferResponse } from "../duffel-sandbox-contract";
import { copyDuffelHttpTransportRawBody } from "./http-transport.server";
import { createDuffelPreviewTransportDependencies } from "./preview-ports.server";
import { createInjectedDuffelSandboxSearchOnlyIntegration } from "./search-only-integration.server";

const CONFIRMATION = "PROBE_ONE_DUFFEL_TEST_SEARCH";

function isoDateAfter(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export const DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION = CONFIRMATION;

export type DuffelPreviewCredentialProbeResult = Readonly<{
  mode: "duffel_test_mode";
  operation: "create_offer_request";
  credentialAuthenticated: true;
  providerHttpStatus: number;
  requestDigest: string;
  responseDigest: string;
  inboundBodyBytes: number;
  certifiedDuffelAirwaysOfferCount: number;
  bookableWithoutIdentityDocumentsCount: number;
  search: FlightCommerceSearchRequest;
  externalTestSideEffect: "offer_request_only";
  automaticRetryAttempted: false;
}>;

export async function executeDuffelPreviewCredentialProbe(
  confirmation: string,
): Promise<DuffelPreviewCredentialProbeResult> {
  if (
    confirmation !== CONFIRMATION
    || process.env.VERCEL_ENV !== "preview"
    || process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "true"
    || process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "false"
  ) throw new Error("Duffel Preview credential probe is disabled or not exactly confirmed.");

  const search: FlightCommerceSearchRequest = Object.freeze({
    origin: "ORD",
    destination: "MIA",
    departureDate: isoDateAfter(68),
    returnDate: null,
    cabin: "economy",
    passengers: Object.freeze({ adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 }),
  });
  const integration = createInjectedDuffelSandboxSearchOnlyIntegration(
    createDuffelPreviewTransportDependencies(),
  );
  const result = await integration.createOfferRequest(search);
  if (
    result.operation !== "create_offer_request"
    || result.automaticRetryAttempted !== false
    || result.idempotencyKeyIncluded !== false
  ) throw new Error("Duffel Preview credential-probe receipt is invalid.");
  const rawBody = copyDuffelHttpTransportRawBody(result);
  const retrievedAt = new Date().toISOString();
  const projected = sanitizeDuffelSandboxOfferResponse(rawBody, { search, retrievedAt });
  const bookableWithoutIdentityDocumentsCount = projected.result.offers.filter((offer, index) => (
    Date.parse(offer.expiresAt) > Date.now() + 60_000
    && projected.evidence[index]?.passengerIdentityDocumentsRequired === false
  )).length;
  if (projected.result.offers.length < 1 || bookableWithoutIdentityDocumentsCount < 1) {
    throw new Error("Duffel Preview contract probe returned no certified bookable Duffel Airways offer.");
  }
  return Object.freeze({
    mode: "duffel_test_mode" as const,
    operation: "create_offer_request" as const,
    credentialAuthenticated: true as const,
    providerHttpStatus: result.status,
    requestDigest: result.requestDigest,
    responseDigest: result.responseDigest,
    inboundBodyBytes: result.inboundBodyBytes,
    certifiedDuffelAirwaysOfferCount: projected.result.offers.length,
    bookableWithoutIdentityDocumentsCount,
    search,
    externalTestSideEffect: "offer_request_only" as const,
    automaticRetryAttempted: false as const,
  });
}
