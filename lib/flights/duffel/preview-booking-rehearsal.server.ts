import "server-only";

import { createHmac } from "node:crypto";
import {
  digestDuffelSandboxOrderTravelerPii,
  persistDuffelSandboxInitialOfferEvidence,
  persistDuffelSandboxRefreshedOfferEvidence,
  sanitizeDuffelSandboxOfferResponse,
  type DuffelAuthenticatedOfferEvidenceRepository,
  type DuffelDurableOfferEvidenceRecord,
  type DuffelOfferEvidenceScope,
  type DuffelSandboxOrderCreateAuthorityVerifier,
} from "../duffel-sandbox-contract";
import {
  prepareDuffelSandboxCreateOrderBridge,
  projectDuffelSandboxCreateOrderResult,
  type DuffelSandboxTrustedTravelerResolver,
} from "../duffel-sandbox-bridge";
import type { FlightCommerceSearchRequest } from "../commerce-domain";
import type { FlightProviderCreateOrderInput } from "../provider-adapter";
import {
  buildFlightIdempotencyIntent,
  canonicalFlightJson,
  digestFlightRuntimeSettlementBinding,
  sha256FlightEvidence,
  type FlightRuntimeSettlementBinding,
} from "../runtime-safety";
import {
  copyDuffelHttpTransportRawBody,
  createDuffelTestHttpTransport,
} from "./http-transport.server";
import { createDuffelPreviewTransportDependencies } from "./preview-ports.server";

const CONFIRMATION = "BOOK_ONE_DUFFEL_TEST_FLIGHT";

function secret() {
  const value = process.env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET;
  if (process.env.VERCEL_ENV !== "preview" || typeof value !== "string" || value.length < 32) {
    throw new Error("Duffel Preview rehearsal authority is unavailable.");
  }
  return value;
}

function receipt(label: string, value: unknown) {
  return createHmac("sha256", secret())
    .update(label)
    .update("\0")
    .update(canonicalFlightJson(value as never))
    .digest("hex");
}

class RequestEvidenceRepository implements DuffelAuthenticatedOfferEvidenceRepository {
  readonly #records = new Map<string, DuffelDurableOfferEvidenceRecord>();
  #trustedTime = new Date().toISOString();

  setTrustedTime(value: string) {
    this.#trustedTime = value;
  }

  async readOfferEvidencePolicy() {
    return Object.freeze({
      version: "duffel-offer-evidence-repository-policy-v1" as const,
      decision: "accepted" as const,
      dataClassification: "synthetic_fixture_only" as const,
      realProviderDataAuthorized: false as const,
      rawBodyLoggingDisabled: true as const,
      tenantAccessControlRequired: true as const,
      retentionDeletionRequired: true as const,
      maximumRetentionSeconds: 3_600,
      trustedTime: this.#trustedTime,
    });
  }

  async storeOfferEvidence(record: DuffelDurableOfferEvidenceRecord, expectedScope: DuffelOfferEvidenceScope) {
    if (canonicalFlightJson(record.scope as never) !== canonicalFlightJson(expectedScope as never)) {
      throw new Error("Cross-scope Duffel evidence store refused.");
    }
    const receiptDigest = receipt("duffel-preview-offer-evidence-v1", record.recordDigest);
    const existed = this.#records.has(receiptDigest);
    this.#records.set(receiptDigest, structuredClone(record));
    return Object.freeze({
      decision: existed ? "already_stored" as const : "stored" as const,
      receiptDigest,
      recordDigest: record.recordDigest,
    });
  }

  async verifyAndLoadOfferEvidence(receiptDigest: string, expectedScope: DuffelOfferEvidenceScope) {
    const record = this.#records.get(receiptDigest);
    if (!record) return Object.freeze({ decision: "not_found" as const });
    if (
      canonicalFlightJson(record.scope as never) !== canonicalFlightJson(expectedScope as never)
      || receipt("duffel-preview-offer-evidence-v1", record.recordDigest) !== receiptDigest
    ) return Object.freeze({ decision: "invalid" as const });
    return Object.freeze({
      decision: "verified" as const,
      receiptDigest,
      record: structuredClone(record),
    });
  }
}

class RequestAuthorityVerifier implements DuffelSandboxOrderCreateAuthorityVerifier {
  #trustedTime: string;

  constructor(trustedTime: string) {
    this.#trustedTime = trustedTime;
  }

  readTrustedTime() {
    return this.#trustedTime;
  }

  async verifyOrderCreateAuthority(
    input: Parameters<DuffelSandboxOrderCreateAuthorityVerifier["verifyOrderCreateAuthority"]>[0],
  ) {
    if (input.evaluatedAt !== this.#trustedTime) return Object.freeze({ decision: "invalid" as const });
    const claimsDigest = sha256FlightEvidence(input.claims as never);
    return Object.freeze({
      decision: "verified" as const,
      claimsDigest,
      authorityReceiptDigest: receipt("duffel-preview-order-authority-v1", {
        claimsDigest,
        evaluatedAt: input.evaluatedAt,
      }),
    });
  }
}

function isoDateAfter(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export type DuffelPreviewBookingRehearsalResult = Readonly<{
  mode: "duffel_test_mode";
  consumerDataUsed: false;
  providerOrderId: string;
  orderState: "order_confirmed";
  ticketState: "not_started" | "issuance_pending" | "issued";
  ticketReferenceDigests: readonly string[];
  total: Readonly<{ currency: string; amountMinor: number }>;
  search: FlightCommerceSearchRequest;
  externalTestSideEffect: true;
  automaticRetryAttempted: false;
}>;

export async function executeDuffelPreviewBookingRehearsal(
  confirmation: string,
): Promise<DuffelPreviewBookingRehearsalResult> {
  if (
    confirmation !== CONFIRMATION
    || process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "true"
    || process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "false"
  ) {
    throw new Error("Duffel Preview test booking is disabled or not exactly confirmed.");
  }
  secret();
  const now = new Date();
  const search: FlightCommerceSearchRequest = Object.freeze({
    origin: "ORD",
    destination: "MIA",
    departureDate: isoDateAfter(72),
    returnDate: null,
    cabin: "economy",
    passengers: Object.freeze({ adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 }),
  });
  const scope: DuffelOfferEvidenceScope = Object.freeze({
    tenantId: "tenant_iratepilot_preview_0001",
    commerceId: `commerce_preview_rehearsal_${now.getTime()}`,
    actorId: "actor_vercel_preview_operator_0001",
  });
  const repository = new RequestEvidenceRepository();
  const transport = createDuffelTestHttpTransport(createDuffelPreviewTransportDependencies());

  const { buildDuffelSandboxOfferRequestPlan, buildDuffelSandboxOfferRetrievalPlan } = await import("../duffel-sandbox-contract");
  const searchReceipt = await transport.execute(buildDuffelSandboxOfferRequestPlan(search));
  const searchBytes = copyDuffelHttpTransportRawBody(searchReceipt);
  const retrievedAt = new Date().toISOString();
  repository.setTrustedTime(retrievedAt);
  const projected = sanitizeDuffelSandboxOfferResponse(searchBytes, { search, retrievedAt });
  const selected = projected.result.offers.find((offer, index) => (
    Date.parse(offer.expiresAt) > Date.now() + 60_000
    && projected.evidence[index]?.passengerIdentityDocumentsRequired === false
  ));
  if (!selected) throw new Error("Duffel returned no currently bookable test offer.");
  const retentionExpiresAt = new Date(Date.parse(retrievedAt) + 45 * 60_000).toISOString();
  const initial = await persistDuffelSandboxInitialOfferEvidence(repository, searchBytes, {
    search,
    retrievedAt,
    offerId: selected.offerId,
    scope,
    retentionExpiresAt,
  });

  const refreshReceipt = await transport.execute(buildDuffelSandboxOfferRetrievalPlan(initial.evidence));
  const refreshBytes = copyDuffelHttpTransportRawBody(refreshReceipt);
  const refreshedAt = new Date().toISOString();
  repository.setTrustedTime(refreshedAt);
  const refreshed = await persistDuffelSandboxRefreshedOfferEvidence(repository, refreshBytes, {
    predecessorReceiptDigest: initial.receiptDigest,
    repricedAt: refreshedAt,
    scope,
  });
  if (refreshed.evidence.version !== "duffel-refreshed-offer-v1") {
    throw new Error("Duffel refreshed offer evidence is unavailable.");
  }

  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(refreshBytes)) as {
    data?: { passengers?: Array<{ id?: unknown }> };
  };
  const providerPassengerId = parsed.data?.passengers?.[0]?.id;
  if (typeof providerPassengerId !== "string" || !/^pas_[A-Za-z0-9]{8,252}$/.test(providerPassengerId)) {
    throw new Error("Duffel refreshed offer passenger identity is malformed.");
  }
  const travelerFields = Object.freeze({
    travelerRef: "traveler:synthetic:preview:0001",
    providerPassengerId,
    title: "ms" as const,
    gender: "f" as const,
    givenName: "Synthetic",
    familyName: "Traveler",
    bornOn: "1990-01-01",
    email: "flight.preview.synthetic@example.test",
    phoneNumber: "+13125550123",
  });
  const traveler = Object.freeze({
    ...travelerFields,
    piiRecordDigest: digestDuffelSandboxOrderTravelerPii({
      scope,
      departureDate: search.departureDate,
      traveler: travelerFields,
    }),
  });
  const travelerResolver: DuffelSandboxTrustedTravelerResolver = Object.freeze({
    async resolveSyntheticAdultTraveler(binding: FlightProviderCreateOrderInput["travelers"][number]) {
      if (binding.travelerRef !== traveler.travelerRef || binding.piiRecordDigest !== traveler.piiRecordDigest) {
        throw new Error("Duffel synthetic traveler binding is invalid.");
      }
      return Object.freeze({
        decision: "verified_synthetic_adult" as const,
        traveler,
        piiAuthorityReceiptDigest: receipt("duffel-preview-synthetic-traveler-v1", binding),
      });
    },
  });
  const settlementBinding: FlightRuntimeSettlementBinding = Object.freeze({
    providerId: "duffel_sandbox_contract_v1",
    method: "provider_balance",
    accountScopeReceiptDigest: receipt("duffel-preview-balance-account-v1", scope),
    environmentScopeReceiptDigest: receipt("duffel-preview-balance-environment-v1", scope),
    currency: "USD",
  });
  const settlementBindingDigest = digestFlightRuntimeSettlementBinding(settlementBinding);
  const withoutIdempotency = Object.freeze({
    offerId: refreshed.snapshot.offerId,
    acceptedTermsDigest: refreshed.evidence.termsDigest,
    offerRefreshReceiptDigest: refreshed.receiptDigest,
    total: refreshed.snapshot.total,
    travelers: Object.freeze([{ travelerRef: traveler.travelerRef, piiRecordDigest: traveler.piiRecordDigest }]),
    settlementIntent: Object.freeze({
      method: "provider_balance" as const,
      amount: refreshed.snapshot.total,
      settlementBindingDigest,
    }),
  });
  const providerInput: FlightProviderCreateOrderInput = Object.freeze({
    ...withoutIdempotency,
    idempotency: buildFlightIdempotencyIntent({
      operation: "create_order",
      scopeId: scope.commerceId,
      requestId: `request_preview_rehearsal_${now.getTime()}`,
      payload: withoutIdempotency,
    }),
  });
  const termsAcceptanceReceiptDigest = receipt("duffel-preview-terms-acceptance-v1", {
    scope,
    termsDigest: refreshed.evidence.termsDigest,
    confirmation,
  });
  const settlementAuthorityReceiptDigest = receipt("duffel-preview-settlement-authority-v1", {
    scope,
    settlementBindingDigest,
    amount: refreshed.snapshot.total,
    confirmation,
  });
  repository.setTrustedTime(new Date().toISOString());
  const bridgePackage = await prepareDuffelSandboxCreateOrderBridge({
    repository,
    refreshedOfferReceiptDigest: refreshed.receiptDigest,
    providerInput,
    settlementBinding,
    travelerResolver,
    authorityVerifier: new RequestAuthorityVerifier(new Date().toISOString()),
    termsAcceptanceReceiptDigest,
    settlementAuthorityReceiptDigest,
    scope,
  });
  const orderReceipt = await transport.execute(bridgePackage.orderCreatePlan);
  const orderBytes = copyDuffelHttpTransportRawBody(orderReceipt);
  const result = projectDuffelSandboxCreateOrderResult(orderBytes, {
    bridgePackage,
    retrievedAt: new Date().toISOString(),
    providerOperationRequestReceiptDigest: receipt("duffel-preview-order-request-v1", {
      requestDigest: orderReceipt.requestDigest,
    }),
    providerOperationReceiptDigest: receipt("duffel-preview-order-response-v1", {
      requestDigest: orderReceipt.requestDigest,
      responseDigest: orderReceipt.responseDigest,
    }),
  });
  if (
    result.orderState !== "order_confirmed"
    || !["not_started", "issuance_pending", "issued"].includes(result.ticketState)
  ) throw new Error("Duffel Preview order result is outside the accepted completion matrix.");
  return Object.freeze({
    mode: "duffel_test_mode" as const,
    consumerDataUsed: false as const,
    providerOrderId: result.orderId,
    orderState: result.orderState,
    ticketState: result.ticketState as "not_started" | "issuance_pending" | "issued",
    ticketReferenceDigests: result.ticketReferenceDigests,
    total: result.total,
    search,
    externalTestSideEffect: true as const,
    automaticRetryAttempted: false as const,
  });
}

export { CONFIRMATION as DUFFEL_PREVIEW_BOOKING_CONFIRMATION };
