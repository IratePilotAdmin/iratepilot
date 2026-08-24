import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DUFFEL_API_VERSION,
  DUFFEL_MAX_RAW_BODY_BYTES,
  DUFFEL_ORDER_MINIMUM_TIMEOUT_MS,
  DUFFEL_SANDBOX_CONTRACT_MODE,
  DUFFEL_SANDBOX_PROVIDER_ID,
  buildDuffelSandboxOfferRequestPlan,
  buildDuffelSandboxOfferRetrievalPlan,
  buildDuffelSandboxOrderCreatePlan,
  buildDuffelSandboxOrderListByOfferPlan,
  buildDuffelWebhookSigningPayload,
  classifyDuffelOrderCreateOutcome,
  digestDuffelSandboxOrderTravelerPii,
  duffelSandboxOfflineCapabilities,
  evaluateDuffelWebhookReplay,
  isDuffelSandboxRequestPlan,
  isDuffelSandboxOrderCreatePlan,
  parseDuffelJsonBody,
  parseDuffelWebhookSignatureHeader,
  persistDuffelSandboxInitialOfferEvidence,
  persistDuffelSandboxRefreshedOfferEvidence,
  rehydrateDuffelSandboxOfferEvidence,
  sanitizeDuffelSandboxOfferResponse,
  sanitizeDuffelSandboxOrderResponse,
  sanitizeDuffelSandboxOrdersByOfferResponse,
  sanitizeDuffelSandboxRepriceResponse,
  sanitizeVerifiedDuffelSandboxWebhook,
  verifyDuffelWebhookSignature,
  verifyDuffelSandboxOrderCreateAuthority,
  type DuffelAuthenticatedOfferEvidenceRepository,
  type DuffelDurableOfferEvidenceRecord,
  type DuffelSandboxOrderCreateAuthorityClaims,
  type DuffelSandboxOrderCreateAuthorityVerifier,
} from "../lib/flights/duffel-sandbox-contract";
import type { FlightCommerceSearchRequest } from "../lib/flights/commerce-domain";

const encoder = new TextEncoder();
const retrievedAt = "2027-01-01T00:00:00.000Z";
const adultSearch: FlightCommerceSearchRequest = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2027-02-10",
  returnDate: null,
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
};
const evidenceScope = {
  tenantId: "tenant:fixture:0001",
  commerceId: "commerce:fixture:0001",
  actorId: "actor:fixture:0001",
} as const;
const evidenceRetentionExpiresAt = "2027-01-02T00:00:00.000Z";
const trustedOfflineTime = "2027-01-01T00:10:00.000Z";

class OfflineAuthenticatedOfferEvidenceRepository implements DuffelAuthenticatedOfferEvidenceRepository {
  readonly #records = new Map<string, DuffelDurableOfferEvidenceRecord>();
  readonly #secret = "offline-authenticated-evidence-repository-secret";

  static restore(serialized: string) {
    const repository = new OfflineAuthenticatedOfferEvidenceRepository();
    const entries = JSON.parse(serialized) as [string, DuffelDurableOfferEvidenceRecord][];
    entries.forEach(([receiptDigest, record]) => repository.#records.set(receiptDigest, structuredClone(record)));
    return repository;
  }

  #receipt(recordDigest: string) {
    return createHmac("sha256", this.#secret).update(recordDigest).digest("hex");
  }

  async readOfferEvidencePolicy() {
    return {
      version: "duffel-offer-evidence-repository-policy-v1" as const,
      decision: "accepted" as const,
      dataClassification: "synthetic_fixture_only" as const,
      realProviderDataAuthorized: false as const,
      rawBodyLoggingDisabled: true as const,
      tenantAccessControlRequired: true as const,
      retentionDeletionRequired: true as const,
      maximumRetentionSeconds: 86_400,
      trustedTime: trustedOfflineTime,
    };
  }

  async storeOfferEvidence(
    record: DuffelDurableOfferEvidenceRecord,
    expectedScope: Parameters<DuffelAuthenticatedOfferEvidenceRepository["storeOfferEvidence"]>[1],
  ) {
    if (JSON.stringify(record.scope) !== JSON.stringify(expectedScope)) {
      throw new Error("Offline repository scope mismatch.");
    }
    const receiptDigest = this.#receipt(record.recordDigest);
    const existing = this.#records.get(receiptDigest);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      return { decision: "already_stored" as const, receiptDigest, recordDigest: "0".repeat(64) };
    }
    this.#records.set(receiptDigest, structuredClone(record));
    return {
      decision: existing ? "already_stored" as const : "stored" as const,
      receiptDigest,
      recordDigest: record.recordDigest,
    };
  }

  async verifyAndLoadOfferEvidence(
    receiptDigest: string,
    expectedScope: Parameters<DuffelAuthenticatedOfferEvidenceRepository["verifyAndLoadOfferEvidence"]>[1],
  ) {
    const record = this.#records.get(receiptDigest);
    if (!record) return { decision: "not_found" as const };
    if (JSON.stringify(record.scope) !== JSON.stringify(expectedScope)) return { decision: "invalid" as const };
    if (this.#receipt(record.recordDigest) !== receiptDigest) return { decision: "invalid" as const };
    return { decision: "verified" as const, receiptDigest, record: structuredClone(record) };
  }

  serialize() {
    return JSON.stringify([...this.#records.entries()]);
  }

  tamper(receiptDigest: string, mutate: (record: DuffelDurableOfferEvidenceRecord) => DuffelDurableOfferEvidenceRecord) {
    const record = this.#records.get(receiptDigest);
    if (!record) throw new Error("Missing offline evidence fixture.");
    this.#records.set(receiptDigest, mutate(structuredClone(record)));
  }
}

class OfflineAuthenticatedOrderAuthorityVerifier implements DuffelSandboxOrderCreateAuthorityVerifier {
  readonly #secret = "offline-order-authority-verifier-secret";
  readonly #approvedReceiptDigests: ReadonlySet<string>;
  readonly #trustedTime: string;

  constructor(approvedReceiptDigests: readonly string[], trustedTime = trustedOfflineTime) {
    this.#approvedReceiptDigests = new Set(approvedReceiptDigests);
    this.#trustedTime = trustedTime;
  }

  readTrustedTime() {
    return this.#trustedTime;
  }

  async verifyOrderCreateAuthority(input: Parameters<DuffelSandboxOrderCreateAuthorityVerifier["verifyOrderCreateAuthority"]>[0]) {
    const requiredReceipts = [
      input.claims.termsAcceptanceReceiptDigest,
      input.claims.settlementAuthorityReceiptDigest,
      ...input.claims.travelerAuthorities.map((traveler) => traveler.piiAuthorityReceiptDigest),
    ];
    if (requiredReceipts.some((receipt) => !this.#approvedReceiptDigests.has(receipt))) {
      return { decision: "invalid" as const };
    }
    const claimsDigest = createHash("sha256").update(input.canonicalClaimsPayload).digest("hex");
    const authorityReceiptDigest = createHmac("sha256", this.#secret)
      .update(input.canonicalClaimsPayload)
      .update("\0")
      .update(input.evaluatedAt)
      .digest("hex");
    return { decision: "verified" as const, claimsDigest, authorityReceiptDigest };
  }
}

function bytes(value: unknown) {
  return encoder.encode(JSON.stringify(value));
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "off_0000000000000001",
    live_mode: false,
    partial: false,
    expires_at: "2027-01-01T00:30:00.000Z",
    total_amount: "249.50",
    total_currency: "USD",
    base_amount: "200.00",
    base_currency: "USD",
    tax_amount: "49.50",
    tax_currency: "USD",
    owner: { name: "Duffel Airways", iata_code: "ZZ", future_owner_field: "ignored" },
    payment_requirements: {
      requires_instant_payment: true,
      payment_required_by: null,
      price_guarantee_expires_at: null,
    },
    passenger_identity_documents_required: false,
    passengers: [{ id: "pas_0000000000000001", type: "adult" }],
    conditions: {
      refund_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "50.00" },
      change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
    },
    private_fares: [],
    supported_passenger_identity_document_types: ["passport"],
    supported_loyalty_programmes: [],
    available_airline_credit_ids: [],
    slices: [{
      id: "sli_0000000000000001",
      conditions: {
        refund_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "50.00" },
        change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
        advance_seat_selection: null,
        priority_boarding: null,
        priority_check_in: null,
      },
      fare_brand_name: "Basic",
      segments: [{
        id: "seg_0000000000000001",
        marketing_carrier: { name: "Duffel Airways", iata_code: "ZZ", conditions_of_carriage_url: null },
        operating_carrier: {
          name: "Duffel Airways",
          iata_code: "ZZ",
          conditions_of_carriage_url: "https://example.test/conditions",
        },
        marketing_carrier_flight_number: "101",
        operating_carrier_flight_number: "101",
        duration: "PT3H",
        stops: [] as Record<string, unknown>[],
        origin: { iata_code: "ORD", time_zone: "America/Chicago", latitude: 41.974162, longitude: -87.907321 },
        destination: { iata_code: "MIA", time_zone: "America/New_York", latitude: 25.795865, longitude: -80.287046 },
        departing_at: "2027-02-10T09:00:00",
        arriving_at: "2027-02-10T13:00:00",
        passengers: [{
          passenger_id: "pas_0000000000000001",
          cabin_class: "economy",
          cabin_class_marketing_name: "Economy",
          fare_basis_code: "YTEST",
          baggages: [{ type: "checked", quantity: 1 }],
        }],
      }],
    }],
    ...overrides,
  };
}

function searchResponse(offerOverrides: Record<string, unknown> = {}, rootOverrides: Record<string, unknown> = {}) {
  return bytes({
    meta: null,
    data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [offer(offerOverrides)],
      future_response_field: { safe_to_ignore: true },
      ...rootOverrides,
    },
  });
}

function projectedOffer() {
  const projection = sanitizeDuffelSandboxOfferResponse(searchResponse(), { search: adultSearch, retrievedAt });
  return { snapshot: projection.result.offers[0]!, evidence: projection.evidence[0]! };
}

function offerForRefresh(overrides: Record<string, unknown> = {}) {
  return offer({ available_services: [], ...overrides });
}

function orderSlices() {
  const slices = structuredClone(offer().slices);
  slices[0]!.conditions = {
    change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
  } as typeof slices[0]["conditions"];
  slices[0]!.id = "sli_0000000000000003";
  const segment = slices[0]!.segments[0]!;
  segment.id = "seg_0000000000000003";
  delete (segment as Record<string, unknown>).operating_carrier_flight_number;
  const passenger = segment.passengers[0]! as Record<string, unknown>;
  delete passenger.passenger_id;
  delete passenger.fare_basis_code;
  return slices;
}

function refreshedOffer() {
  const initial = projectedOffer();
  const refresh = sanitizeDuffelSandboxRepriceResponse(bytes({ data: offerForRefresh() }), {
    search: adultSearch,
    original: initial.snapshot,
    originalEvidence: initial.evidence,
    repricedAt: "2027-01-01T00:05:00.000Z",
  });
  return { snapshot: refresh.result.repricedOffer, evidence: refresh.evidence, initial };
}

function webhookBody(overrides: Record<string, unknown> = {}) {
  return bytes({
    id: "wev_0000000000000001",
    api_version: "v2",
    type: "order.created",
    data: { object: { order_id: "ord_0000000000000001" } },
    live_mode: false,
    idempotency_key: "idem_0000000000000001",
    created_at: "2027-01-01T00:00:00.000Z",
    future_event_field: true,
    ...overrides,
  });
}

function signedWebhook(rawBody: Uint8Array, secret = "offline-fixture-secret-000000000000") {
  const timestamp = 1_798_761_600;
  const signature = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.concat([Buffer.from(String(timestamp)), Buffer.from("."), Buffer.from(rawBody)]))
    .digest("hex");
  return {
    secret,
    timestamp,
    header: `t=${timestamp},v1=${signature}`,
  };
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("offline Duffel sandbox contract", () => {
  it("keeps every credential, traffic, commerce, and adapter capability false and frozen", () => {
    expect(DUFFEL_SANDBOX_CONTRACT_MODE).toBe("offline_contract_only");
    expect(DUFFEL_SANDBOX_PROVIDER_ID).toBe("duffel_sandbox_contract_v1");
    expect(DUFFEL_API_VERSION).toBe("v2");
    expect(Object.values(duffelSandboxOfflineCapabilities)).toEqual(Array(10).fill(false));
    expect(Object.isFrozen(duffelSandboxOfflineCapabilities)).toBe(true);
  });

  it("builds deterministic non-executable adult-only one-way and round-trip request plans", () => {
    const oneWay = buildDuffelSandboxOfferRequestPlan(adultSearch);
    const roundTrip = buildDuffelSandboxOfferRequestPlan({ ...adultSearch, returnDate: "2027-02-14", cabin: "business" });

    expect(oneWay).toMatchObject({
      operation: "create_offer_request",
      method: "POST",
      path: "/air/offer_requests",
      apiVersion: "v2",
      requiresBearerToken: true,
      bearerTokenIncluded: false,
      providerTrafficAuthorized: false,
      externalRequestMade: false,
      providerIdempotencyKeyIncluded: false,
    });
    expect(oneWay.body).toMatchObject({ data: { cabin_class: "economy", passengers: [{ type: "adult" }] } });
    expect((oneWay.body as { data: { slices: unknown[] } }).data.slices).toHaveLength(1);
    expect((roundTrip.body as { data: { slices: unknown[] } }).data.slices).toHaveLength(2);
    expect(roundTrip.body).toMatchObject({ data: { cabin_class: "business" } });
    expect(buildDuffelSandboxOfferRequestPlan(adultSearch).requestDigest).toBe(oneWay.requestDigest);
    expect(Object.isFrozen(oneWay)).toBe(true);
    expect(isDuffelSandboxRequestPlan(oneWay)).toBe(true);
    expect(isDuffelSandboxRequestPlan({ ...oneWay })).toBe(false);
  });

  it("refuses to invent ages for children or infants", () => {
    for (const passengers of [
      { adults: 1, children: 1, infantsInSeat: 0, infantsOnLap: 0 },
      { adults: 1, children: 0, infantsInSeat: 1, infantsOnLap: 0 },
      { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 1 },
    ]) {
      expect(() => buildDuffelSandboxOfferRequestPlan({ ...adultSearch, passengers })).toThrow(/exact ages/i);
    }
    let cabinRead = 0;
    const changingCabin = { ...adultSearch } as Record<string, unknown>;
    Object.defineProperty(changingCabin, "cabin", {
      enumerable: true,
      get: () => (cabinRead++ === 0 ? "economy" : "bogus"),
    });
    expect(() => buildDuffelSandboxOfferRequestPlan(changingCabin as FlightCommerceSearchRequest)).toThrow(/plain data|data properties/i);
    expect(() => buildDuffelSandboxOfferRequestPlan(new Proxy(adultSearch, {}))).toThrow(/plain data/i);
  });

  it("projects a sandbox ZZ offer into exact USD, UTC, carrier, and request-bound evidence", () => {
    const projection = sanitizeDuffelSandboxOfferResponse(searchResponse(), { search: adultSearch, retrievedAt });
    const snapshot = projection.result.offers[0]!;
    const evidence = projection.evidence[0]!;

    expect(projection.result).toMatchObject({
      providerId: DUFFEL_SANDBOX_PROVIDER_ID,
      source: "provider_sandbox",
      retrievedAt,
      externalSideEffect: false,
    });
    expect(snapshot).toMatchObject({
      providerId: DUFFEL_SANDBOX_PROVIDER_ID,
      total: { currency: "USD", amountMinor: 24_950 },
      source: "provider_sandbox",
    });
    expect(snapshot.segments[0]).toMatchObject({
      origin: "ORD",
      destination: "MIA",
      departsAt: "2027-02-10T15:00:00.000Z",
      arrivesAt: "2027-02-10T18:00:00.000Z",
    });
    expect(evidence).toMatchObject({
      liveMode: false,
      ownerName: "Duffel Airways",
      ownerIataCode: "ZZ",
      partial: false,
      requiresInstantPayment: true,
      passengerIdentityDocumentsRequired: false,
      base: { currency: "USD", amountMinor: 20_000 },
      tax: { currency: "USD", amountMinor: 4_950 },
      retrievedAt,
    });
    expect(evidence.operatingCarrierDisclosures[0]).toMatchObject({ operatingCarrierName: "Duffel Airways", operatingCarrierIataCode: "ZZ" });
    expect(evidence.requestDigest).toBe(projection.result.requestDigest);
    expect(evidence.requestPlanDigest).toBe(buildDuffelSandboxOfferRequestPlan(adultSearch).requestDigest);
    expect(evidence.offerRequestIdDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.searchDigest).toBe(projection.result.requestDigest);
    expect(snapshot.termsDigest).toBe(evidence.termsDigest);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(snapshot.segments)).toBe(true);
  });

  it("ignores additive v2 response fields but rejects live, wrong-owner, partial, stale, route, and money drift", () => {
    expect(sanitizeDuffelSandboxOfferResponse(searchResponse({}, { another_future_field: [1, 2, 3] }), { search: adultSearch, retrievedAt }).result.offers).toHaveLength(1);
    expect(sanitizeDuffelSandboxOfferResponse(searchResponse({}, { airline_credit_ids: [], private_fares: [] }), { search: adultSearch, retrievedAt }).result.offers).toHaveLength(1);
    const noSliceRefund = offer();
    delete (noSliceRefund.slices[0]!.conditions as Record<string, unknown>).refund_before_departure;
    const noSliceRefundProjection = sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: noSliceRefund.slices }), { search: adultSearch, retrievedAt });
    expect(noSliceRefundProjection.result.offers).toHaveLength(1);
    expect(noSliceRefundProjection.evidence[0]!.termsDigest).not.toBe(projectedOffer().evidence.termsDigest);
    const priorityBoardingOffer = offer();
    Object.assign(priorityBoardingOffer.slices[0]!.conditions, { priority_boarding: true });
    expect(sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: priorityBoardingOffer.slices }), { search: adultSearch, retrievedAt }).result.offers).toHaveLength(1);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ live_mode: true }), { search: adultSearch, retrievedAt })).toThrow(/live_mode false/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ owner: { name: "Real Airline", iata_code: "AA" } }), { search: adultSearch, retrievedAt })).toThrow(/Duffel Airways/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ partial: true }), { search: adultSearch, retrievedAt })).toThrow(/partial/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ expires_at: retrievedAt }), { search: adultSearch, retrievedAt })).toThrow(/expired/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ total_currency: "GBP" }), { search: adultSearch, retrievedAt })).toThrow(/USD-only/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ total_amount: "12.345" }), { search: adultSearch, retrievedAt })).toThrow(/two decimal/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ conditions: "malformed" }), { search: adultSearch, retrievedAt })).toThrow(/conditions/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ conditions: 1.5 }), { search: adultSearch, retrievedAt })).toThrow(/conditions/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ intended_services: [] }), { search: adultSearch, retrievedAt })).toThrow(/priced-offer-only intended/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ intended_payment_methods: [] }), { search: adultSearch, retrievedAt })).toThrow(/priced-offer-only intended/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ available_services: "malformed" }), { search: adultSearch, retrievedAt })).toThrow(/available services/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ private_fares: "malformed" }), { search: adultSearch, retrievedAt })).toThrow(/private fares/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ supported_passenger_identity_document_types: ["future_unknown"] }), { search: adultSearch, retrievedAt })).toThrow(/identity-document types/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ supported_loyalty_programmes: [1.5] }), { search: adultSearch, retrievedAt })).toThrow(/loyalty programmes/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ supported_loyalty_programmes: ["ZZZ"] }), { search: adultSearch, retrievedAt })).toThrow(/loyalty programmes/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ available_airline_credit_ids: ["not-a-credit-id"] }), { search: adultSearch, retrievedAt })).toThrow(/airline-credit IDs/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ available_airline_credit_ids: ["acd_0000000000000001"] }), { search: adultSearch, retrievedAt })).toThrow(/empty available airline-credit list/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { airline_credit_ids: ["acd_0000000000000001"] }), { search: adultSearch, retrievedAt })).toThrow(/absent or empty airline-credit IDs/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ private_fares: [{ type: "corporate", corporate_code: "CODE" }] }), { search: adultSearch, retrievedAt })).toThrow(/empty offer private-fares list/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { private_fares: [{ type: "corporate", corporate_code: "CODE" }] }), { search: adultSearch, retrievedAt })).toThrow(/absent or empty private fares/i);
    for (const key of [
      "conditions", "private_fares", "base_amount", "base_currency", "tax_amount", "tax_currency",
      "supported_passenger_identity_document_types", "supported_loyalty_programmes", "available_airline_credit_ids",
    ]) {
      const missing = offer();
      (missing as Record<string, unknown>)[key] = undefined;
      expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(missing), { search: adultSearch, retrievedAt })).toThrow();
    }
    const invalidInstantPayment = offer({
      payment_requirements: {
        requires_instant_payment: true,
        payment_required_by: null,
        price_guarantee_expires_at: "2027-01-01T00:20:00.000Z",
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(invalidInstantPayment), { search: adultSearch, retrievedAt })).toThrow(/instant-payment.*null/i);
    const staleHold = offer({
      payment_requirements: {
        requires_instant_payment: false,
        payment_required_by: "2026-12-31T23:59:59.000Z",
        price_guarantee_expires_at: "2026-12-31T23:59:58.000Z",
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(staleHold), { search: adultSearch, retrievedAt })).toThrow(/deadline.*stale/i);
    const incompleteHold = offer({
      payment_requirements: {
        requires_instant_payment: false,
        payment_required_by: "2027-01-01T00:20:00.000Z",
        price_guarantee_expires_at: null,
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(incompleteHold), { search: adultSearch, retrievedAt })).toThrow(/exact payment and price-guarantee deadlines/i);
    const reversedHold = offer({
      payment_requirements: {
        requires_instant_payment: false,
        payment_required_by: "2027-01-01T00:15:00.000Z",
        price_guarantee_expires_at: "2027-01-01T00:20:00.000Z",
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(reversedHold), { search: adultSearch, retrievedAt })).toThrow(/price-guarantee.*payment deadline/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { cabin_class: "business" }), { search: adultSearch, retrievedAt })).toThrow(/cabin/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { passengers: [{ id: "pas_0000000000000001", type: "child" }] }), { search: adultSearch, retrievedAt })).toThrow(/passenger semantics/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { passengers: [{ id: "pas_0000000000000001", type: "adult", fare_type: "corporate" }] }), { search: adultSearch, retrievedAt })).toThrow(/fare-type evidence/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ passengers: [{ id: "pas_0000000000000001", type: "adult", fare_type: "corporate" }] }), { search: adultSearch, retrievedAt })).toThrow(/fare-type evidence/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { passengers: [{ id: "pas_0000000000009999", type: "adult" }] }), { search: adultSearch, retrievedAt })).toThrow(/enclosing offer request/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({}, { slices: [{ origin: "ORD", destination: "JFK", departure_date: "2027-02-10" }] }), { search: adultSearch, retrievedAt })).toThrow(/route or date/i);
    const tooManyConnections = offer();
    tooManyConnections.slices[0]!.segments = Array.from({ length: 3 }, () => structuredClone(tooManyConnections.slices[0]!.segments[0]!));
    expect(() => sanitizeDuffelSandboxOfferResponse(bytes({
      data: {
        id: "orq_0000000000000001",
        live_mode: false,
        cabin_class: "economy",
        passengers: [{ id: "pas_0000000000000001", type: "adult" }],
        slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
        offers: [tooManyConnections],
      },
    }), { search: adultSearch, retrievedAt })).toThrow(/one-connection/i);
    const invalidCarrier = offer();
    invalidCarrier.slices[0]!.segments[0]!.operating_carrier.iata_code = "ZZZ";
    expect(() => sanitizeDuffelSandboxOfferResponse(bytes({
      data: {
        id: "orq_0000000000000001",
        live_mode: false,
        cabin_class: "economy",
        passengers: [{ id: "pas_0000000000000001", type: "adult" }],
        slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
        offers: [invalidCarrier],
      },
    }), { search: adultSearch, retrievedAt })).toThrow(/IATA code/i);
    const wrongCabin = offer();
    wrongCabin.slices[0]!.segments[0]!.passengers[0]!.cabin_class = "business";
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: wrongCabin.slices }), { search: adultSearch, retrievedAt })).toThrow(/passenger cabin/i);
    const wrongSegmentPassenger = offer();
    wrongSegmentPassenger.slices[0]!.segments[0]!.passengers[0]!.passenger_id = "pas_0000000000009999";
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: wrongSegmentPassenger.slices }), { search: adultSearch, retrievedAt })).toThrow(/segment passenger IDs/i);
    for (const key of ["stops", "duration"] as const) {
      const missing = offer();
      delete (missing.slices[0]!.segments[0]! as Record<string, unknown>)[key];
      expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: missing.slices }), { search: adultSearch, retrievedAt })).toThrow(/missing|malformed/i);
    }
    const durationMismatch = offer();
    durationMismatch.slices[0]!.segments[0]!.duration = "PT4H";
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: durationMismatch.slices }), { search: adultSearch, retrievedAt })).toThrow(/duration does not match/i);
    for (const key of ["baggages", "fare_basis_code", "cabin_class_marketing_name"] as const) {
      const missing = offer();
      delete (missing.slices[0]!.segments[0]!.passengers[0]! as Record<string, unknown>)[key];
      expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: missing.slices }), { search: adultSearch, retrievedAt })).toThrow();
    }
    for (const key of ["conditions", "fare_brand_name"] as const) {
      const missing = offer();
      delete (missing.slices[0]! as Record<string, unknown>)[key];
      expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: missing.slices }), { search: adultSearch, retrievedAt })).toThrow(/missing/i);
    }
    const missingOfferSliceId = offer();
    delete (missingOfferSliceId.slices[0]! as Record<string, unknown>).id;
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: missingOfferSliceId.slices }), { search: adultSearch, retrievedAt })).toThrow(/slice 1 ID/i);
    const duplicateOfferSliceIds = offer();
    duplicateOfferSliceIds.slices.push(structuredClone(duplicateOfferSliceIds.slices[0]!));
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: duplicateOfferSliceIds.slices }), { search: adultSearch, retrievedAt })).toThrow(/slice IDs are duplicated/i);
    const duplicateOfferSegmentIds = offer();
    duplicateOfferSegmentIds.slices[0]!.segments.push(structuredClone(duplicateOfferSegmentIds.slices[0]!.segments[0]!));
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: duplicateOfferSegmentIds.slices }), { search: adultSearch, retrievedAt })).toThrow(/segment IDs are duplicated/i);
    const missingOfferSlicePerk = offer();
    delete (missingOfferSlicePerk.slices[0]!.conditions as Record<string, unknown>).priority_boarding;
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: missingOfferSlicePerk.slices }), { search: adultSearch, retrievedAt })).toThrow(/missing or unexpected fields/i);
    const unexpectedConditionLeaf = offer();
    Object.assign(unexpectedConditionLeaf.conditions.refund_before_departure, { future_material_term: true });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(unexpectedConditionLeaf), { search: adultSearch, retrievedAt })).toThrow(/missing or unexpected fields/i);
    const unexpectedTopCondition = offer();
    Object.assign(unexpectedTopCondition.conditions, { future_before_departure: null });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(unexpectedTopCondition), { search: adultSearch, retrievedAt })).toThrow(/missing or unexpected fields/i);
    const unexpectedOfferSliceCondition = offer();
    Object.assign(unexpectedOfferSliceCondition.slices[0]!.conditions, { changeable: true });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: unexpectedOfferSliceCondition.slices }), { search: adultSearch, retrievedAt })).toThrow(/missing or unexpected fields/i);
    const invalidConditionCoupling = offer({
      conditions: {
        refund_before_departure: { allowed: false, penalty_currency: "USD", penalty_amount: "50.00" },
        change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(invalidConditionCoupling), { search: adultSearch, retrievedAt })).toThrow(/cannot carry a penalty/i);
    const incompleteConditionPenalty = offer({
      conditions: {
        refund_before_departure: { allowed: true, penalty_currency: null, penalty_amount: "50.00" },
        change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
      },
    });
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse(incompleteConditionPenalty), { search: adultSearch, retrievedAt })).toThrow(/both be null or both be present/i);
    const malformedBaggage = offer();
    malformedBaggage.slices[0]!.segments[0]!.passengers[0]!.baggages[0]!.quantity = 1.5;
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: malformedBaggage.slices }), { search: adultSearch, retrievedAt })).toThrow(/baggage.*quantity/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(bytes({ data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [offer(), offer({ total_amount: "999.00" })],
    } }), { search: adultSearch, retrievedAt })).toThrow(/duplicate provider offer IDs/i);
    const changedRoute = offer();
    (changedRoute.slices[0]!.segments[0]!.destination as { iata_code: string }).iata_code = "JFK";
    expect(() => sanitizeDuffelSandboxOfferResponse(bytes({ data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [changedRoute],
    } }), { search: adultSearch, retrievedAt })).toThrow(/route/i);
  });

  it("rejects malformed UTF-8, duplicate keys, oversized bodies, and ambiguous/nonexistent local times", () => {
    expect(() => parseDuffelJsonBody(Uint8Array.from([0xc3, 0x28]))).toThrow(/UTF-8/i);
    expect(() => parseDuffelJsonBody(encoder.encode('{"data":1,"data":2}'))).toThrow(/duplicate/i);
    expect(() => parseDuffelJsonBody(encoder.encode('{"data":9007199254740993}'))).toThrow(/safe integer/i);
    expect(JSON.stringify(parseDuffelJsonBody(encoder.encode('{"data":1.5000}')))).toContain("1.5000");
    expect(() => parseDuffelJsonBody(encoder.encode('{"data":1\u00a0}'))).toThrow(/delimiter|trailing/i);
    expect(() => parseDuffelJsonBody(new Uint8Array(DUFFEL_MAX_RAW_BODY_BYTES + 1))).toThrow(/1 MiB/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(
      searchResponse({ expires_at: "2027-01-01T00:30:00.000001Z" }),
      { search: adultSearch, retrievedAt },
    )).toThrow(/millisecond precision/i);
    expect(() => sanitizeDuffelSandboxOfferResponse(
      searchResponse(),
      { search: adultSearch, retrievedAt: "2027-01-01T00:00:00.000999+00:00" },
    )).toThrow(/millisecond precision/i);
    const sharedBody = new Uint8Array(new SharedArrayBuffer(32));
    sharedBody.set(encoder.encode('{"data":1}'));
    expect(() => parseDuffelJsonBody(sharedBody)).toThrow(/shared mutable/i);
    const alternateBuffer = encoder.encode('{"data":1}');
    Object.defineProperty(alternateBuffer, "buffer", { value: new ArrayBuffer(0) });
    expect(() => parseDuffelJsonBody(alternateBuffer)).toThrow(/copied into owned memory/i);
    const changingLength = encoder.encode('{"data":1}');
    let shadowLengthReads = 0;
    Object.defineProperty(changingLength, "byteLength", {
      get: () => {
        shadowLengthReads += 1;
        return shadowLengthReads === 1 ? changingLength.length : 1;
      },
    });
    expect(() => parseDuffelJsonBody(changingLength)).toThrow(/copied into owned memory/i);
    expect(shadowLengthReads).toBe(0);
    const cappedBody = new Uint8Array(DUFFEL_MAX_RAW_BODY_BYTES + 1);
    Object.defineProperty(cappedBody, "byteLength", { value: 1 });
    expect(() => parseDuffelJsonBody(cappedBody)).toThrow(/copied into owned memory|1 MiB/i);
    const sharedSwap = new Uint8Array(new SharedArrayBuffer(32));
    Object.defineProperty(sharedSwap, "buffer", { value: new ArrayBuffer(32) });
    expect(() => parseDuffelJsonBody(sharedSwap)).toThrow(/copied into owned memory|shared mutable/i);
    class IteratorSpoofedBytes extends Uint8Array {
      *[Symbol.iterator](): ArrayIterator<number> {
        yield* encoder.encode('{"data":"iterator-spoof"}').values();
      }
    }
    const iteratorSpoof = new IteratorSpoofedBytes(encoder.encode('{"data":"backing-bytes"}'));
    expect(() => parseDuffelJsonBody(iteratorSpoof)).toThrow(/copied into owned memory/i);

    const ambiguous = offer();
    ambiguous.slices[0]!.segments[0]!.origin = {
      iata_code: "ORD",
      time_zone: "America/New_York",
      latitude: 41.974162,
      longitude: -87.907321,
    };
    ambiguous.slices[0]!.segments[0]!.departing_at = "2027-11-07T01:30:00";
    expect(() => sanitizeDuffelSandboxOfferResponse(bytes({ data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-11-07" }],
      offers: [ambiguous],
    } }), {
      search: { ...adultSearch, origin: "ORD", departureDate: "2027-11-07" },
      retrievedAt,
    })).toThrow(/ambiguous/i);
  });

  it("builds retrieval and ambiguity-reconciliation plans without a token or invented provider idempotency", () => {
    const initial = projectedOffer();
    const refreshed = refreshedOffer();
    expect(refreshed.evidence.termsChanged).toBe(false);
    expect(refreshed.evidence.segmentIdentityDigests).toEqual(initial.evidence.segmentIdentityDigests);
    expect(refreshed.evidence.segmentPhaseIdentityDigests).toEqual(initial.evidence.segmentPhaseIdentityDigests);
    expect(refreshed.evidence.slicePhaseIdentityDigests).toEqual(initial.evidence.slicePhaseIdentityDigests);
    const retrieve = buildDuffelSandboxOfferRetrievalPlan(initial.evidence);
    const reconcile = buildDuffelSandboxOrderListByOfferPlan(refreshed.evidence);
    expect(retrieve).toMatchObject({ method: "GET", path: `/air/offers/${initial.evidence.providerOfferId}`, body: null });
    expect(reconcile).toMatchObject({ method: "GET", path: "/air/orders", body: null });
    expect(reconcile.query).toEqual({ offer_id: refreshed.evidence.providerOfferId, limit: 50 });
    expect(retrieve.bearerTokenIncluded).toBe(false);
    expect(retrieve.providerIdempotencyKeyIncluded).toBe(false);
    expect(() => buildDuffelSandboxOfferRetrievalPlan({ ...initial.evidence })).toThrow(/not bound/i);
    expect(() => buildDuffelSandboxOrderListByOfferPlan(initial.evidence as never)).toThrow(/post-reprice/i);

    const listBody = (data: unknown[], meta: Record<string, unknown> = { before: null, after: null, limit: 50 }) => bytes({ data, meta });
    const orderListInput = { expectedOffer: refreshed.evidence, retrievedAt: "2027-01-01T00:06:00.000Z" };
    expect(sanitizeDuffelSandboxOrdersByOfferResponse(listBody([]), orderListInput)).toMatchObject({
      decision: "order_absent", orderCount: 0, paginationComplete: true, directMutationAuthorized: false,
    });
    const one = { id: "ord_0000000000000001", offer_id: refreshed.evidence.providerOfferId, live_mode: false };
    expect(sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one]), orderListInput)).toMatchObject({
      decision: "single_order_requires_full_validation", orderCount: 1, providerOrderId: one.id,
    });
    const two = { ...one, id: "ord_0000000000000002" };
    expect(sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one, two]), orderListInput)).toMatchObject({
      decision: "multiple_orders_manual_review", orderCount: 2, providerOrderId: null,
    });
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one, one]), orderListInput)).toThrow(/duplicate/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([{ ...one, offer_id: "off_0000000000009999" }]), orderListInput)).toThrow(/another exact refreshed offer/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([{ ...one, live_mode: true }]), orderListInput)).toThrow(/live_mode false/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one, two], { before: null, after: null, limit: 1 }), orderListInput)).toThrow(/declared pagination limit/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one], { before: null, after: "cursor", limit: 50 }), orderListInput)).toThrow(/paginated/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one], { before: null, limit: 50 }), orderListInput)).toThrow(/incomplete/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one]), { ...orderListInput, expectedOffer: { ...refreshed.evidence } })).toThrow(/post-reprice/i);
    expect(() => sanitizeDuffelSandboxOrdersByOfferResponse(listBody([one]), { ...orderListInput, retrievedAt: "2027-01-01T00:04:59.000Z" })).toThrow(/precede.*refresh/i);
  });

  it("reprices only the same exact offer, search, and itinerary and derives the price-change claim", async () => {
    const { snapshot, evidence } = projectedOffer();
    const changed = offerForRefresh({ total_amount: "259.50", base_amount: "210.00" });
    const repriced = sanitizeDuffelSandboxRepriceResponse(bytes({ data: changed }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(repriced.result).toMatchObject({ originalOfferId: snapshot.offerId, priceChanged: true, externalSideEffect: false });
    expect(repriced.termsChanged).toBe(true);
    expect(repriced.result.repricedOffer.total.amountMinor).toBe(25_950);
    expect(repriced.evidence).toMatchObject({
      version: "duffel-refreshed-offer-v1",
      refreshedAt: "2027-01-01T00:05:00.000Z",
      previousTermsDigest: evidence.termsDigest,
      termsChanged: true,
    });
    expect(repriced.evidence.refreshReceiptDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(repriced.evidence.retrievalPlanDigest).toBe(buildDuffelSandboxOfferRetrievalPlan(evidence).requestDigest);
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: offerForRefresh() }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2026-12-31T23:59:59.000Z",
    })).toThrow(/cannot precede/i);

    const samePriceDifferentTerms = offerForRefresh({
      conditions: {
        refund_before_departure: { allowed: false, penalty_currency: null, penalty_amount: null },
        change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
      },
    });
    const termsOnly = sanitizeDuffelSandboxRepriceResponse(bytes({ data: samePriceDifferentTerms }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(termsOnly.result.priceChanged).toBe(false);
    expect(termsOnly.termsChanged).toBe(true);

    const sliceTermsDrift = offerForRefresh();
    sliceTermsDrift.slices[0]!.fare_brand_name = "Flexible";
    Object.assign(sliceTermsDrift.slices[0]!.conditions, {
      refund_before_departure: { allowed: false, penalty_currency: null, penalty_amount: null },
      change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
      advance_seat_selection: true,
      priority_boarding: true,
      priority_check_in: null,
    });
    const sliceTermsOnly = sanitizeDuffelSandboxRepriceResponse(bytes({ data: sliceTermsDrift }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(sliceTermsOnly.result.priceChanged).toBe(false);
    expect(sliceTermsOnly.termsChanged).toBe(true);

    const changedIdentityDocuments = sanitizeDuffelSandboxRepriceResponse(bytes({
      data: offerForRefresh({ supported_passenger_identity_document_types: ["tax_id"] }),
    }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(changedIdentityDocuments.result.priceChanged).toBe(false);
    expect(changedIdentityDocuments.termsChanged).toBe(true);

    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({
      data: offerForRefresh({ private_fares: [{ type: "corporate", corporate_code: "NEWCODE" }] }),
    }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/empty offer private-fares list/i);

    const substituted = offerForRefresh();
    substituted.slices[0]!.segments[0]!.marketing_carrier_flight_number = "999";
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: substituted }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);
    const changedRefreshSliceId = offerForRefresh();
    changedRefreshSliceId.slices[0]!.id = "sli_0000000000000002";
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: changedRefreshSliceId }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);
    const changedRefreshSegmentId = offerForRefresh();
    changedRefreshSegmentId.slices[0]!.segments[0]!.id = "seg_0000000000000002";
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: changedRefreshSegmentId }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: offerForRefresh() }), new Proxy({
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    }, {}))).toThrow(/non-proxy|plain data/i);

    const operatingFlightDrift = offerForRefresh();
    operatingFlightDrift.slices[0]!.segments[0]!.operating_carrier_flight_number = "202";
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: operatingFlightDrift }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);

    const stopDrift = offerForRefresh();
    stopDrift.slices[0]!.segments[0]!.stops = [{
      id: "sto_0000000000000001",
      duration: "PT30M",
      arriving_at: "2027-02-10T10:00:00",
      departing_at: "2027-02-10T10:30:00",
      airport: { iata_code: "ATL", time_zone: "America/New_York", latitude: 33.6407, longitude: -84.4277 },
    }];
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: stopDrift }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);
    const duplicateStops = offer();
    const stop = {
      id: "sto_0000000000000001",
      duration: "PT30M",
      arriving_at: "2027-02-10T10:00:00",
      departing_at: "2027-02-10T10:30:00",
      airport: { iata_code: "ATL", time_zone: "America/New_York", latitude: 33.6407, longitude: -84.4277 },
    };
    duplicateStops.slices[0]!.segments[0]!.stops = [stop, structuredClone(stop)];
    expect(() => sanitizeDuffelSandboxOfferResponse(searchResponse({ slices: duplicateStops.slices }), { search: adultSearch, retrievedAt })).toThrow(/duplicate stops/i);

    const fareDrift = offerForRefresh();
    fareDrift.slices[0]!.segments[0]!.passengers[0]!.fare_basis_code = "YCHANGED";
    const repricedFare = sanitizeDuffelSandboxRepriceResponse(bytes({ data: fareDrift }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(repricedFare).toMatchObject({ termsChanged: true, result: { priceChanged: false } });
    const baggageDrift = offerForRefresh();
    baggageDrift.slices[0]!.segments[0]!.passengers[0]!.baggages[0]!.quantity = 0;
    const repricedBaggage = sanitizeDuffelSandboxRepriceResponse(bytes({ data: baggageDrift }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    });
    expect(repricedBaggage).toMatchObject({ termsChanged: true, result: { priceChanged: false } });
    const missingFare = offerForRefresh();
    delete (missingFare.slices[0]!.segments[0]!.passengers[0]! as Record<string, unknown>).fare_basis_code;
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: missingFare }), {
      search: adultSearch,
      original: snapshot,
      originalEvidence: evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/fare-basis evidence is missing/i);

    const initialWithStop = offer();
    initialWithStop.slices[0]!.segments[0]!.stops = [{
      id: "sto_0000000000000001",
      duration: "PT30M",
      arriving_at: "2027-02-10T11:00:00",
      departing_at: "2027-02-10T11:30:00",
      airport: { iata_code: "ATL", time_zone: "America/New_York", latitude: 33.6407, longitude: -84.4277 },
    }];
    const stoppedInitial = sanitizeDuffelSandboxOfferResponse(
      searchResponse({ slices: initialWithStop.slices }),
      { search: adultSearch, retrievedAt },
    );
    const stoppedRefreshBody = offerForRefresh({ slices: structuredClone(initialWithStop.slices) });
    stoppedRefreshBody.slices[0]!.segments[0]!.stops[0]!.id = "sto_0000000000000002";
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: stoppedRefreshBody }), {
      search: adultSearch,
      original: stoppedInitial.result.offers[0]!,
      originalEvidence: stoppedInitial.evidence[0]!,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).toThrow(/immutable itinerary/i);

    const durableRepository = new OfflineAuthenticatedOfferEvidenceRepository();
    const persistedInitial = await persistDuffelSandboxInitialOfferEvidence(
      durableRepository,
      searchResponse(),
      {
        search: adultSearch,
        retrievedAt,
        offerId: snapshot.offerId,
        scope: evidenceScope,
        retentionExpiresAt: evidenceRetentionExpiresAt,
      },
    );
    expect(persistedInitial).toMatchObject({
      stage: "initial",
      scope: evidenceScope,
      retentionExpiresAt: evidenceRetentionExpiresAt,
      snapshot,
      evidence,
    });
    expect(persistedInitial.receiptDigest).toMatch(/^[0-9a-f]{64}$/);

    const restoredInitialRepository = OfflineAuthenticatedOfferEvidenceRepository.restore(durableRepository.serialize());
    const rehydratedInitial = await rehydrateDuffelSandboxOfferEvidence(
      restoredInitialRepository,
      persistedInitial.receiptDigest,
      evidenceScope,
    );
    expect(rehydratedInitial).toEqual(persistedInitial);
    await expect(rehydrateDuffelSandboxOfferEvidence(
      restoredInitialRepository,
      persistedInitial.receiptDigest,
      { ...evidenceScope, actorId: "actor:fixture:0002" },
    )).rejects.toThrow(/not verified/i);
    expect(() => sanitizeDuffelSandboxRepriceResponse(bytes({ data: offerForRefresh() }), {
      search: rehydratedInitial.search,
      original: rehydratedInitial.snapshot,
      originalEvidence: rehydratedInitial.evidence,
      repricedAt: "2027-01-01T00:05:00.000Z",
    })).not.toThrow();

    const persistedRefresh = await persistDuffelSandboxRefreshedOfferEvidence(
      restoredInitialRepository,
      bytes({ data: offerForRefresh() }),
      {
        predecessorReceiptDigest: persistedInitial.receiptDigest,
        repricedAt: "2027-01-01T00:05:00.000Z",
        scope: evidenceScope,
      },
    );
    expect(persistedRefresh).toMatchObject({
      stage: "refreshed",
      snapshot,
      evidence: {
        version: "duffel-refreshed-offer-v1",
        previousTermsDigest: evidence.termsDigest,
      },
    });

    const restoredRefreshRepository = OfflineAuthenticatedOfferEvidenceRepository.restore(restoredInitialRepository.serialize());
    const rehydratedRefresh = await rehydrateDuffelSandboxOfferEvidence(
      restoredRefreshRepository,
      persistedRefresh.receiptDigest,
      evidenceScope,
    );
    expect(rehydratedRefresh).toEqual(persistedRefresh);
    expect(Object.isFrozen(rehydratedRefresh)).toBe(true);

    const refreshedEvidence = rehydratedRefresh.evidence;
    if (refreshedEvidence.version !== "duffel-refreshed-offer-v1") {
      throw new Error("Expected a refreshed durable Duffel offer fixture.");
    }
    const syntheticTravelerPii = {
      travelerRef: "traveler:fixture:0001",
      providerPassengerId: "pas_0000000000000001",
      title: "ms" as const,
      gender: "f" as const,
      givenName: "Synthetic",
      familyName: "Traveler",
      bornOn: "1990-01-01",
      email: "synthetic.traveler@example.test",
      phoneNumber: "+13125550123",
    };
    const syntheticTraveler = {
      ...syntheticTravelerPii,
      piiRecordDigest: digestDuffelSandboxOrderTravelerPii({
        scope: evidenceScope,
        departureDate: adultSearch.departureDate,
        traveler: syntheticTravelerPii,
      }),
    };
    const termsAcceptanceReceiptDigest = "a".repeat(64);
    const settlementAuthorityReceiptDigest = "b".repeat(64);
    const piiAuthorityReceiptDigest = "e".repeat(64);
    const authorityClaims: DuffelSandboxOrderCreateAuthorityClaims = {
      version: "duffel-sandbox-order-create-authority-claims-v1",
      scope: evidenceScope,
      offerEvidenceReceiptDigest: rehydratedRefresh.receiptDigest,
      localOfferId: rehydratedRefresh.snapshot.offerId,
      acceptedTermsDigest: refreshedEvidence.termsDigest,
      termsAcceptanceReceiptDigest,
      settlementBindingDigest: "c".repeat(64),
      settlementAuthorityReceiptDigest,
      travelerAuthorities: [{
        travelerRef: syntheticTraveler.travelerRef,
        piiRecordDigest: syntheticTraveler.piiRecordDigest,
        providerPassengerIdDigest: refreshedEvidence.providerPassengerIdDigests[0]!,
        piiAuthorityReceiptDigest,
      }],
    };
    const authorityVerifier = new OfflineAuthenticatedOrderAuthorityVerifier([
      termsAcceptanceReceiptDigest,
      settlementAuthorityReceiptDigest,
      piiAuthorityReceiptDigest,
    ]);
    const verifiedAuthority = await verifyDuffelSandboxOrderCreateAuthority(authorityClaims, authorityVerifier);
    const orderCreatePlan = buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    });
    expect(orderCreatePlan).toMatchObject({
      version: "duffel-sandbox-order-create-plan-v1",
      scope: evidenceScope,
      offerEvidenceReceiptDigest: rehydratedRefresh.receiptDigest,
      acceptedTermsDigest: refreshedEvidence.termsDigest,
      termsAcceptanceReceiptDigest,
      offerRefreshReceiptDigest: refreshedEvidence.refreshReceiptDigest,
      settlementAuthorityReceiptDigest,
      authorityReceiptDigest: verifiedAuthority.authorityReceiptDigest,
      verifiedAt: trustedOfflineTime,
      dispatchNotAfter: refreshedEvidence.expiresAt,
      providerTrafficAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      externalRequestMade: false,
      plan: {
        operation: "create_order",
        method: "POST",
        path: "/air/orders",
        query: {},
        minimumTimeoutMs: DUFFEL_ORDER_MINIMUM_TIMEOUT_MS,
        providerIdempotencyKeyIncluded: false,
      },
    });
    expect(orderCreatePlan.plan.body).toEqual({
      data: {
        type: "instant",
        selected_offers: [refreshedEvidence.providerOfferId],
        payments: [{ type: "balance", currency: "USD", amount: "249.50" }],
        passengers: [{
          id: syntheticTraveler.providerPassengerId,
          title: syntheticTraveler.title,
          gender: syntheticTraveler.gender,
          given_name: syntheticTraveler.givenName,
          family_name: syntheticTraveler.familyName,
          born_on: syntheticTraveler.bornOn,
          email: syntheticTraveler.email,
          phone_number: syntheticTraveler.phoneNumber,
        }],
      },
    });
    expect(isDuffelSandboxRequestPlan(orderCreatePlan.plan)).toBe(false);
    expect(isDuffelSandboxRequestPlan({ ...orderCreatePlan.plan })).toBe(false);
    expect(isDuffelSandboxOrderCreatePlan(orderCreatePlan)).toBe(true);
    expect(isDuffelSandboxOrderCreatePlan({ ...orderCreatePlan })).toBe(false);
    expect(isDuffelSandboxOrderCreatePlan(JSON.parse(JSON.stringify(orderCreatePlan)))).toBe(false);
    expect(orderCreatePlan.bridgeReceiptDigest).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyDuffelSandboxOrderCreateAuthority(
      authorityClaims,
      new OfflineAuthenticatedOrderAuthorityVerifier([]),
    )).rejects.toThrow(/not authenticated/i);
    const wrongTermsAuthority = await verifyDuffelSandboxOrderCreateAuthority({
      ...authorityClaims,
      acceptedTermsDigest: "f".repeat(64),
    }, authorityVerifier);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: wrongTermsAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    })).toThrow(/another scope, offer, or accepted terms/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: { ...rehydratedRefresh.snapshot.total, amountMinor: rehydratedRefresh.snapshot.total.amountMinor + 1 },
      travelers: [syntheticTraveler],
    })).toThrow(/total does not match/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [{ ...syntheticTraveler, providerPassengerId: "pas_0000000000009999" }],
    })).toThrow(/PII record digest|another offer request/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [{ ...syntheticTraveler, bornOn: "2015-01-01" }],
    })).toThrow(/adult-only|PII record digest/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [{ ...syntheticTraveler, givenName: "Alternate" }],
    })).toThrow(/PII record digest/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [{ ...syntheticTraveler, givenName: "Traveler123" }],
    })).toThrow(/given name is malformed/i);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: verifiedAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [{ ...syntheticTraveler, givenName: "Ægir" }],
    })).toThrow(/given name is malformed/i);
    const expiredAuthority = await verifyDuffelSandboxOrderCreateAuthority(
      authorityClaims,
      new OfflineAuthenticatedOrderAuthorityVerifier([
        termsAcceptanceReceiptDigest,
        settlementAuthorityReceiptDigest,
        piiAuthorityReceiptDigest,
      ], "2027-01-01T00:31:00.000Z"),
    );
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: expiredAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    })).toThrow(/validity window/i);
    const expiryBoundaryAuthority = await verifyDuffelSandboxOrderCreateAuthority(
      authorityClaims,
      new OfflineAuthenticatedOrderAuthorityVerifier([
        termsAcceptanceReceiptDigest,
        settlementAuthorityReceiptDigest,
        piiAuthorityReceiptDigest,
      ], refreshedEvidence.expiresAt),
    );
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: expiryBoundaryAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    })).toThrow(/validity window/i);
    const wrongScopeAuthority = await verifyDuffelSandboxOrderCreateAuthority({
      ...authorityClaims,
      scope: { ...evidenceScope, tenantId: "tenant:fixture:0002" },
    }, authorityVerifier);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: rehydratedRefresh,
      authority: wrongScopeAuthority,
      total: rehydratedRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    })).toThrow(/another scope/i);

    const documentRepository = new OfflineAuthenticatedOfferEvidenceRepository();
    const documentInitial = await persistDuffelSandboxInitialOfferEvidence(
      documentRepository,
      searchResponse({ passenger_identity_documents_required: true }),
      {
        search: adultSearch,
        retrievedAt,
        offerId: snapshot.offerId,
        scope: evidenceScope,
        retentionExpiresAt: evidenceRetentionExpiresAt,
      },
    );
    const documentRefresh = await persistDuffelSandboxRefreshedOfferEvidence(
      documentRepository,
      bytes({ data: offerForRefresh({ passenger_identity_documents_required: true }) }),
      { predecessorReceiptDigest: documentInitial.receiptDigest, repricedAt: "2027-01-01T00:05:00.000Z", scope: evidenceScope },
    );
    if (documentRefresh.evidence.version !== "duffel-refreshed-offer-v1") {
      throw new Error("Expected a refreshed identity-document offer fixture.");
    }
    const documentAuthority = await verifyDuffelSandboxOrderCreateAuthority({
      ...authorityClaims,
      offerEvidenceReceiptDigest: documentRefresh.receiptDigest,
      localOfferId: documentRefresh.snapshot.offerId,
      acceptedTermsDigest: documentRefresh.evidence.termsDigest,
      travelerAuthorities: [{
        ...authorityClaims.travelerAuthorities[0]!,
        providerPassengerIdDigest: documentRefresh.evidence.providerPassengerIdDigests[0]!,
      }],
    }, authorityVerifier);
    expect(() => buildDuffelSandboxOrderCreatePlan({
      offer: documentRefresh,
      authority: documentAuthority,
      total: documentRefresh.snapshot.total,
      travelers: [syntheticTraveler],
    })).toThrow(/identity documents/i);

    const tamperedRepository = OfflineAuthenticatedOfferEvidenceRepository.restore(restoredInitialRepository.serialize());
    tamperedRepository.tamper(persistedRefresh.receiptDigest, (record) => ({
      ...record,
      rawBodyBase64: `${record.rawBodyBase64.slice(0, -4)}AAAA`,
    }));
    await expect(rehydrateDuffelSandboxOfferEvidence(
      tamperedRepository,
      persistedRefresh.receiptDigest,
      evidenceScope,
    )).rejects.toThrow(/body digest|record digest|encoding/i);
    const oversizedRepository = OfflineAuthenticatedOfferEvidenceRepository.restore(restoredInitialRepository.serialize());
    oversizedRepository.tamper(persistedRefresh.receiptDigest, (record) => ({
      ...record,
      rawBodyBase64: "A".repeat(Math.ceil(DUFFEL_MAX_RAW_BODY_BYTES / 3) * 4 + 4),
    }));
    await expect(rehydrateDuffelSandboxOfferEvidence(
      oversizedRepository,
      persistedRefresh.receiptDigest,
      evidenceScope,
    )).rejects.toThrow(/pre-snapshot limit/i);
    await expect(rehydrateDuffelSandboxOfferEvidence(
      restoredRefreshRepository,
      "f".repeat(64),
      evidenceScope,
    )).rejects.toThrow(/not verified/i);
  });

  it("classifies money-moving order outcomes without blind retries", () => {
    expect(classifyDuffelOrderCreateOutcome({ status: null, timedOut: true })).toMatchObject({ decision: "manual_review", retrySameRequest: false, reconciliationRequired: true });
    expect(classifyDuffelOrderCreateOutcome({ status: 500, timedOut: false })).toMatchObject({ decision: "manual_review", retrySameRequest: false });
    expect(classifyDuffelOrderCreateOutcome({ status: 500, timedOut: false, errorCode: "offer_expired" })).toMatchObject({ decision: "manual_review", reconciliationRequired: true });
    expect(classifyDuffelOrderCreateOutcome({ status: 202, timedOut: false })).toMatchObject({ decision: "manual_review", retrySameRequest: false });
    expect(classifyDuffelOrderCreateOutcome({ status: 503, timedOut: false })).toMatchObject({ decision: "order_absent", retrySameRequest: false });
    expect(classifyDuffelOrderCreateOutcome({ status: 422, timedOut: false, errorCode: "offer_expired" })).toMatchObject({ decision: "search_again", retrySameRequest: false });
    expect(classifyDuffelOrderCreateOutcome({ status: 201, timedOut: false })).toMatchObject({ decision: "validate_created_order", retrySameRequest: false });
    expect(() => classifyDuffelOrderCreateOutcome({ status: 201, timedOut: false, errorCode: "offer_expired" })).toThrow(/contradictory/i);
    expect(() => classifyDuffelOrderCreateOutcome({ status: 202, timedOut: false, errorCode: "offer_expired" })).toThrow(/contradictory/i);
    expect(() => classifyDuffelOrderCreateOutcome({ status: 500, timedOut: true })).toThrow(/contradictory/i);
    const changingOutcome = { timedOut: false } as Record<string, unknown>;
    let statusRead = 0;
    Object.defineProperty(changingOutcome, "status", { enumerable: true, get: () => (statusRead++ === 0 ? 201 : 500) });
    expect(() => classifyDuffelOrderCreateOutcome(changingOutcome as never)).toThrow(/plain data|data properties/i);
    const pollutedOutcome = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(pollutedOutcome, {
      status: { value: 422, enumerable: true },
      timedOut: { value: false, enumerable: true },
    });
    Object.defineProperty(pollutedOutcome, "__proto__", { value: { errorCode: "offer_expired" }, enumerable: true });
    expect(() => classifyDuffelOrderCreateOutcome(pollutedOutcome as never)).toThrow(/prohibited property/i);
    expect(DUFFEL_ORDER_MINIMUM_TIMEOUT_MS).toBe(130_000);
  });

  it("requires paid electronic-ticket documents covering every exact passenger before claiming ticketing", () => {
    const { evidence, initial } = refreshedOffer();
    const orderRetrievedAt = "2027-01-01T00:12:00.000Z";
    const orderProjectionInput = {
      expectedOffer: evidence,
      acceptedTermsDigest: evidence.termsDigest,
      expectedProviderPassengerIds: ["pas_0000000000000001"],
      retrievedAt: orderRetrievedAt,
    };
    const order = {
      data: {
        id: "ord_0000000000000001",
        offer_id: evidence.providerOfferId,
        live_mode: false,
        cancelled_at: null,
        cancellation: null,
        created_at: "2027-01-01T00:06:00.000Z",
        synced_at: "2027-01-01T00:11:59.123+00:00",
        total_amount: "249.50",
        total_currency: "USD",
        base_amount: "200.00",
        base_currency: "USD",
        tax_amount: "49.50",
        tax_currency: "USD",
        owner: { name: "Duffel Airways", iata_code: "ZZ" },
        conditions: {
          refund_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "50.00" },
          change_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "75.00" },
        },
        slices: orderSlices(),
        booking_reference: "ABCDEFGHIJKLM",
        payment_status: { paid_at: "2027-01-01T00:10:00.000Z", awaiting_payment: false },
        services: [],
        passengers: [{ id: "pas_0000000000000001" }],
        documents: [{ type: "electronic_ticket", unique_identifier: "1252106312810", passenger_ids: ["pas_0000000000000001"] }],
      },
    };
    const certified = sanitizeDuffelSandboxOrderResponse(bytes(order), orderProjectionInput);
    expect(certified).toMatchObject({ liveMode: false, awaitingPayment: false, everyPassengerCoveredByElectronicTicket: true, ticketingEstablished: true, uncancelled: true });
    expect(certified.createdAt).toBe("2027-01-01T00:06:00.000Z");
    expect(certified.syncedAt).toBe("2027-01-01T00:11:59.123Z");
    expect(certified.bookingReferencePresent).toBe(true);
    expect(certified.acceptedTermsDigest).toBe(evidence.termsDigest);
    expect(certified.offerRefreshReceiptDigest).toBe(evidence.refreshReceiptDigest);
    expect(certified).not.toHaveProperty("bookingReferenceDigest");
    expect(certified.ticketDocumentDigests).toHaveLength(1);
    expect(order.data.slices[0]!.segments[0]!.id).not.toBe(evidence.segments[0]!.segmentId);
    expect(order.data.slices[0]!.id).toBe("sli_0000000000000003");
    expect(order.data.slices[0]!.segments[0]).not.toHaveProperty("operating_carrier_flight_number");
    expect(order.data.slices[0]!.segments[0]!.passengers[0]).not.toHaveProperty("fare_basis_code");
    const missingOrderSliceId = structuredClone(order);
    delete (missingOrderSliceId.data.slices[0]! as unknown as Record<string, unknown>).id;
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(missingOrderSliceId), orderProjectionInput)).toThrow(/order slice 1 ID/i);
    const duplicateOrderSliceIds = structuredClone(order);
    duplicateOrderSliceIds.data.slices.push(structuredClone(duplicateOrderSliceIds.data.slices[0]!));
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(duplicateOrderSliceIds), orderProjectionInput)).toThrow(/order slice IDs are duplicated/i);
    const duplicateOrderSegmentIds = structuredClone(order);
    duplicateOrderSegmentIds.data.slices[0]!.segments.push(structuredClone(duplicateOrderSegmentIds.data.slices[0]!.segments[0]!));
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(duplicateOrderSegmentIds), orderProjectionInput)).toThrow(/order segment IDs are duplicated/i);
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(order), {
      ...orderProjectionInput,
      expectedOffer: initial.evidence as never,
    })).toThrow(/post-reprice/i);
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(order), {
      ...orderProjectionInput,
      expectedOffer: { ...evidence },
    })).toThrow(/post-reprice/i);
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(order), {
      ...orderProjectionInput,
      acceptedTermsDigest: "f".repeat(64),
    })).toThrow(/accepted refreshed terms digest/i);
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(order), {
      ...orderProjectionInput,
      retrievedAt: "2027-01-01T00:04:59.000Z",
    })).toThrow(/precede.*refresh/i);

    const missingCreatedAt = structuredClone(order);
    delete (missingCreatedAt.data as unknown as Record<string, unknown>).created_at;
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(missingCreatedAt), orderProjectionInput)).toThrow(/created-at.*missing/i);
    const preRefreshCreation = structuredClone(order);
    preRefreshCreation.data.created_at = "2027-01-01T00:04:59.999Z";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(preRefreshCreation), orderProjectionInput)).toThrow(/creation must follow.*refresh/i);
    const futureCreation = structuredClone(order);
    futureCreation.data.created_at = "2027-01-01T00:12:00.001Z";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(futureCreation), orderProjectionInput)).toThrow(/cannot follow synchronization/i);
    const preCreationPayment = structuredClone(order);
    preCreationPayment.data.created_at = "2027-01-01T00:10:30.000Z";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(preCreationPayment), orderProjectionInput)).toThrow(/payment evidence must follow order creation/i);
    const subMillisecondReversedCreation = structuredClone(order);
    subMillisecondReversedCreation.data.created_at = "2027-01-01T00:04:59.999999Z";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(subMillisecondReversedCreation), orderProjectionInput)).toThrow(/millisecond precision/i);

    const noDocuments = structuredClone(order);
    noDocuments.data.documents = [];
    expect(sanitizeDuffelSandboxOrderResponse(bytes(noDocuments), orderProjectionInput)).toMatchObject({ ticketingEstablished: false, everyPassengerCoveredByElectronicTicket: false });

    const omittedOptionalOrderFields = structuredClone(order);
    delete (omittedOptionalOrderFields.data as unknown as Record<string, unknown>).cancelled_at;
    delete (omittedOptionalOrderFields.data as unknown as Record<string, unknown>).cancellation;
    delete (omittedOptionalOrderFields.data as unknown as Record<string, unknown>).documents;
    expect(sanitizeDuffelSandboxOrderResponse(bytes(omittedOptionalOrderFields), orderProjectionInput)).toMatchObject({
      uncancelled: true,
      ticketDocumentDigests: [],
      everyPassengerCoveredByElectronicTicket: false,
      ticketingEstablished: false,
    });
    const malformedDocuments = structuredClone(order);
    (malformedDocuments.data as unknown as Record<string, unknown>).documents = null;
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(malformedDocuments), orderProjectionInput)).toThrow(/order documents.*missing or malformed/i);

    const unknownPassenger = structuredClone(order);
    unknownPassenger.data.documents[0]!.passenger_ids = ["pas_0000000000009999"];
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(unknownPassenger), orderProjectionInput)).toThrow(/unknown passenger/i);

    for (const changed of [
      { cancelled_at: "2027-01-01T00:11:00.000Z" },
      { cancellation: { id: "orc_0000000000000001" } },
      { total_amount: "250.00" },
      { owner: { name: "Another Airline", iata_code: "AA" } },
      { synced_at: "2027-01-01T00:10:58.999Z" },
    ]) {
      const drifted = structuredClone(order);
      Object.assign(drifted.data, changed);
      expect(() => sanitizeDuffelSandboxOrderResponse(bytes(drifted), orderProjectionInput)).toThrow();
    }
    const ancillaryOrder = structuredClone(order);
    (ancillaryOrder.data as unknown as { services: unknown[] }).services = [{ id: "ase_0000000000000001", quantity: 1 }];
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(ancillaryOrder), orderProjectionInput)).toThrow(/refuses orders containing ancillary services/i);
    const baseDrift = structuredClone(order);
    baseDrift.data.base_amount = "199.00";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(baseDrift), orderProjectionInput)).toThrow(/base-plus-tax|money breakdown/i);
    const sliceTermsDrift = structuredClone(order);
    sliceTermsDrift.data.slices[0]!.fare_brand_name = "Flexible";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(sliceTermsDrift), orderProjectionInput)).toThrow(/itinerary or carrier disclosure changed/i);
    const topConditionDrift = structuredClone(order);
    topConditionDrift.data.conditions.change_before_departure.penalty_amount = "80.00";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(topConditionDrift), orderProjectionInput)).toThrow(/itinerary or carrier disclosure changed/i);
    const offerOnlySliceConditions = structuredClone(order);
    Object.assign(offerOnlySliceConditions.data.slices[0]!.conditions, {
      refund_before_departure: { allowed: true, penalty_currency: "USD", penalty_amount: "50.00" },
    });
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(offerOnlySliceConditions), orderProjectionInput)).toThrow(/missing or unexpected fields/i);
    const futureOrderSliceCondition = structuredClone(order);
    Object.assign(futureOrderSliceCondition.data.slices[0]!.conditions, { future_material_term: false });
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(futureOrderSliceCondition), orderProjectionInput)).toThrow(/missing or unexpected fields/i);
    const regrouped = structuredClone(order);
    regrouped.data.slices.push(structuredClone(regrouped.data.slices[0]!));
    regrouped.data.slices[1]!.id = "sli_0000000000000004";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(regrouped), orderProjectionInput)).toThrow(/slice count changed/i);

    const itineraryDrift = structuredClone(order);
    itineraryDrift.data.slices[0]!.segments[0]!.marketing_carrier_flight_number = "999";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(itineraryDrift), orderProjectionInput)).toThrow(/itinerary or carrier disclosure changed/i);

    const carrierDrift = structuredClone(order);
    carrierDrift.data.slices[0]!.segments[0]!.operating_carrier.name = "Changed Carrier";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(carrierDrift), orderProjectionInput)).toThrow(/carrier disclosure changed/i);
    const marketingUrlDrift = structuredClone(order);
    (marketingUrlDrift.data.slices[0]!.segments[0]!.marketing_carrier as { conditions_of_carriage_url: string | null }).conditions_of_carriage_url = "https://example.test/changed";
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(marketingUrlDrift), orderProjectionInput)).toThrow(/carrier disclosure changed/i);

    const baggageDrift = structuredClone(order);
    baggageDrift.data.slices[0]!.segments[0]!.passengers[0]!.baggages[0]!.quantity = 0;
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(baggageDrift), orderProjectionInput)).toThrow(/itinerary or carrier disclosure changed/i);
    const missingOrderBaggage = structuredClone(order);
    delete (missingOrderBaggage.data.slices[0]!.segments[0]!.passengers[0] as Record<string, unknown>).baggages;
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(missingOrderBaggage), orderProjectionInput)).toThrow(/baggage entitlement evidence is missing/i);

    const duplicateTicket = structuredClone(order);
    duplicateTicket.data.documents.push({
      type: "electronic_ticket",
      unique_identifier: duplicateTicket.data.documents[0]!.unique_identifier,
      passenger_ids: ["pas_0000000000000001"],
    });
    expect(() => sanitizeDuffelSandboxOrderResponse(bytes(duplicateTicket), orderProjectionInput)).toThrow(/identifier is duplicated/i);
  });

  it("implements Duffel's exact timestamp-dot-raw-body HMAC rather than the generic flight framing", () => {
    const rawBody = webhookBody();
    const signed = signedWebhook(rawBody);
    const parsed = parseDuffelWebhookSignatureHeader(signed.header);
    expect(parsed).toEqual({ timestampSeconds: signed.timestamp, signatureHex: signed.header.split("v1=")[1] });
    expect(buildDuffelWebhookSigningPayload(signed.timestamp, rawBody)).toEqual(
      Buffer.concat([Buffer.from(String(signed.timestamp)), Buffer.from("."), Buffer.from(rawBody)]),
    );
    expect(verifyDuffelWebhookSignature({
      rawBody,
      signatureHeader: signed.header,
      secret: signed.secret,
      nowSeconds: signed.timestamp,
    })).toMatchObject({ verified: true, reason: "verified" });
    expect(verifyDuffelWebhookSignature({
      rawBody: bytes({ changed: true }),
      signatureHeader: signed.header,
      secret: signed.secret,
      nowSeconds: signed.timestamp,
    })).toMatchObject({ verified: false, reason: "invalid_signature" });
    expect(verifyDuffelWebhookSignature({
      rawBody,
      signatureHeader: signed.header,
      secret: signed.secret,
      nowSeconds: signed.timestamp + 300,
    })).toMatchObject({ verified: true, reason: "verified" });
    expect(verifyDuffelWebhookSignature({
      rawBody,
      signatureHeader: signed.header,
      secret: signed.secret,
      nowSeconds: signed.timestamp + 301,
    })).toMatchObject({ verified: false, reason: "timestamp_outside_local_policy" });
    expect(verifyDuffelWebhookSignature({
      rawBody,
      signatureHeader: signed.header,
      secret: signed.secret,
      nowSeconds: signed.timestamp + 600,
      toleranceSeconds: 900,
    })).toMatchObject({ verified: false, reason: "invalid_timestamp" });
    expect(() => parseDuffelWebhookSignatureHeader(`v1=${"a".repeat(64)},t=${signed.timestamp}`)).toThrow(/malformed/i);
    expect(() => parseDuffelWebhookSignatureHeader(`t=${signed.timestamp},v1=${"A".repeat(64)}`)).toThrow(/malformed/i);
  });

  it("sanitizes verified test events, quarantines unknown types, and deduplicates by Duffel idempotency semantics", () => {
    const rawBody = webhookBody();
    const signed = signedWebhook(rawBody);
    const verification = verifyDuffelWebhookSignature({ rawBody, signatureHeader: signed.header, secret: signed.secret, nowSeconds: signed.timestamp });
    const event = sanitizeVerifiedDuffelSandboxWebhook(rawBody, verification);
    expect(event).toMatchObject({ eventType: "order.created", liveMode: false, apiVersion: "v2", quarantined: false, reconciliationRequired: true, directMutationAuthorized: false });
    const receipt = {
      providerId: event.providerId,
      eventId: event.eventId,
      eventType: event.providerEventType,
      idempotencyKey: event.idempotencyKey,
      bodyDigest: event.bodyDigest,
      semanticDigest: event.semanticDigest,
      status: "processed" as const,
    };
    expect(evaluateDuffelWebhookReplay(event, receipt)).toMatchObject({ decision: "duplicate" });
    expect(evaluateDuffelWebhookReplay(event, { ...receipt, bodyDigest: "f".repeat(64) })).toMatchObject({ decision: "conflict" });

    const unknownRaw = webhookBody({ type: "future.event.type" });
    const unknownSigned = signedWebhook(unknownRaw);
    const unknownVerification = verifyDuffelWebhookSignature({ rawBody: unknownRaw, signatureHeader: unknownSigned.header, secret: unknownSigned.secret, nowSeconds: unknownSigned.timestamp });
    expect(sanitizeVerifiedDuffelSandboxWebhook(unknownRaw, unknownVerification)).toMatchObject({ eventType: "unknown_quarantined", quarantined: true, directMutationAuthorized: false });

    const offsetRaw = webhookBody({ created_at: "2027-01-01 00:00:00.123+00:00" });
    const offsetSigned = signedWebhook(offsetRaw);
    const offsetVerification = verifyDuffelWebhookSignature({
      rawBody: offsetRaw,
      signatureHeader: offsetSigned.header,
      secret: offsetSigned.secret,
      nowSeconds: offsetSigned.timestamp,
    });
    expect(sanitizeVerifiedDuffelSandboxWebhook(offsetRaw, offsetVerification).createdAt).toBe("2027-01-01T00:00:00.123Z");
  });

  it("rejects live or unverified webhooks and never trusts changed bytes", () => {
    const liveBody = webhookBody({ live_mode: true });
    const liveSigned = signedWebhook(liveBody);
    const liveVerification = verifyDuffelWebhookSignature({ rawBody: liveBody, signatureHeader: liveSigned.header, secret: liveSigned.secret, nowSeconds: liveSigned.timestamp });
    expect(() => sanitizeVerifiedDuffelSandboxWebhook(liveBody, liveVerification)).toThrow(/live_mode false/i);
    expect(() => sanitizeVerifiedDuffelSandboxWebhook(webhookBody(), { ...liveVerification, verified: false })).toThrow(/successful signature/i);
    const unsignedBody = webhookBody();
    expect(() => sanitizeVerifiedDuffelSandboxWebhook(unsignedBody, {
      verified: true,
      reason: "verified",
      bodyDigest: createHmac("sha256", "not-a-real-provider-secret").update(unsignedBody).digest("hex"),
      timestampSeconds: 1_798_761_600,
      freshnessPolicy: "local_300_second_policy_not_a_duffel_guarantee",
    })).toThrow(/successful signature/i);

    const signed = signedWebhook(unsignedBody);
    const verified = verifyDuffelWebhookSignature({ rawBody: unsignedBody, signatureHeader: signed.header, secret: signed.secret, nowSeconds: signed.timestamp });
    const event = sanitizeVerifiedDuffelSandboxWebhook(unsignedBody, verified);
    expect(() => evaluateDuffelWebhookReplay({ ...event }, null)).toThrow(/authenticated raw bytes/i);
    expect(() => evaluateDuffelWebhookReplay(event, {
      providerId: event.providerId,
      eventId: event.eventId,
      eventType: event.providerEventType,
      idempotencyKey: event.idempotencyKey,
      bodyDigest: event.bodyDigest,
      semanticDigest: event.semanticDigest,
      status: "processed",
      extra: true,
    } as never)).toThrow(/unexpected.*shape/i);
    const validReceipt = {
      providerId: event.providerId,
      eventId: event.eventId,
      eventType: event.providerEventType,
      idempotencyKey: event.idempotencyKey,
      bodyDigest: event.bodyDigest,
      semanticDigest: event.semanticDigest,
      status: "processed" as const,
    };
    const getterReceipt = { ...validReceipt } as Record<string, unknown>;
    Object.defineProperty(getterReceipt, "status", { enumerable: true, get: () => "processed" });
    expect(() => evaluateDuffelWebhookReplay(event, getterReceipt as never)).toThrow(/data-only shape/i);
    expect(() => evaluateDuffelWebhookReplay(event, new Proxy(validReceipt, {}) as never)).toThrow(/non-proxy/i);
  });

  it("contains no transport, environment, SDK, credential value, or guarded-adapter construction path and has no client import", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/flights/duffel-sandbox-contract.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/duffel_(?:test|live)_/);
    expect(source).not.toMatch(/createGuardedFlightProviderAdapter/);
    expect(source).not.toMatch(/Authorization:\s*Bearer/i);
    expect(source).not.toMatch(/from\s+["']@duffel/);
    const clientImports = ["app", "components"].flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
      .filter((path) => {
        const candidate = readFileSync(path, "utf8");
        return /^\s*["']use client["'];/m.test(candidate) && candidate.includes("duffel-sandbox-contract");
      });
    expect(clientImports).toEqual([]);
  });
});
