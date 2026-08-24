import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorizeFlightCommercePayment,
  beginFlightCommercePayment,
  beginFlightCommercePaymentCapture,
  completeFlightCommercePaymentCapture,
  createFlightCommerceLifecycle,
  digestFlightProviderOrderCompletionCanonicalEvidence,
  submitFlightCommerceOrder,
  transitionFlightOrder,
  type FlightCommerceLifecycle,
  type FlightTransitionEvidence,
} from "../lib/flights/commerce-domain";
import {
  DUFFEL_SANDBOX_BRIDGE_MODE,
  buildDuffelSandboxOrderCompletionCanonicalEvidence,
  duffelSandboxBridgeCapabilities,
  isDuffelSandboxCreateOrderBridgePackage,
  prepareDuffelSandboxCreateOrderBridge,
  projectDuffelSandboxCreateOrderResult,
  projectDuffelSandboxTimedOutCreateOrderReconciliation,
  type DuffelSandboxTrustedTravelerResolver,
} from "../lib/flights/duffel-sandbox-bridge";
import {
  DUFFEL_SANDBOX_PROVIDER_ID,
  digestDuffelSandboxOrderTravelerPii,
  persistDuffelSandboxInitialOfferEvidence,
  persistDuffelSandboxRefreshedOfferEvidence,
  sanitizeDuffelSandboxOfferResponse,
  type DuffelAuthenticatedOfferEvidenceRepository,
  type DuffelDurableOfferEvidenceRecord,
  type DuffelSandboxOrderCreateAuthorityVerifier,
} from "../lib/flights/duffel-sandbox-contract";
import type { FlightCommerceSearchRequest } from "../lib/flights/commerce-domain";
import type { FlightProviderCreateOrderInput } from "../lib/flights/provider-adapter";
import {
  buildFlightIdempotencyIntent,
  canonicalFlightJson,
  digestFlightRuntimeSettlementBinding,
  sha256FlightEvidence,
  type FlightRuntimeSettlementBinding,
} from "../lib/flights/runtime-safety";

const encoder = new TextEncoder();
const retrievedAt = "2027-01-01T00:00:00.000Z";
const refreshedAt = "2027-01-01T00:05:00.000Z";
const scope = {
  tenantId: "tenant_duffel_bridge_0001",
  commerceId: "commerce_duffel_bridge_0001",
  actorId: "actor_duffel_bridge_0001",
};
const adultSearch: FlightCommerceSearchRequest = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2027-02-10",
  returnDate: null,
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
};
const settlementBinding: FlightRuntimeSettlementBinding = {
  providerId: DUFFEL_SANDBOX_PROVIDER_ID,
  method: "provider_balance",
  accountScopeReceiptDigest: "a".repeat(64),
  environmentScopeReceiptDigest: "b".repeat(64),
  currency: "USD",
};

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
    owner: { name: "Duffel Airways", iata_code: "ZZ" },
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

function searchResponse() {
  return bytes({
    meta: null,
    data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [offer()],
    },
  });
}

function refreshedOfferBody() {
  return bytes({ data: offer({ available_services: [] }) });
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

function orderResponse(
  refreshedProviderOfferId: string,
  ticket: "issued" | "pending" | "not_started",
) {
  const paid = ticket !== "not_started";
  return bytes({
    data: {
      id: "ord_0000000000000001",
      offer_id: refreshedProviderOfferId,
      live_mode: false,
      cancelled_at: null,
      cancellation: null,
      created_at: "2027-01-01T00:06:00.000Z",
      synced_at: "2027-01-01T00:11:59.123Z",
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
      payment_status: { paid_at: paid ? "2027-01-01T00:10:00.000Z" : null, awaiting_payment: !paid },
      services: [],
      passengers: [{ id: "pas_0000000000000001" }],
      documents: ticket === "issued"
        ? [{ type: "electronic_ticket", unique_identifier: "1252106312810", passenger_ids: ["pas_0000000000000001"] }]
        : [],
    },
  });
}

function orderListResponse(refreshedProviderOfferId: string, count: number) {
  return bytes({
    meta: { before: null, after: null, limit: 50 },
    data: Array.from({ length: count }, (_, index) => ({
      id: `ord_000000000000000${index + 1}`,
      offer_id: refreshedProviderOfferId,
      live_mode: false,
    })),
  });
}

class OfflineEvidenceRepository implements DuffelAuthenticatedOfferEvidenceRepository {
  readonly #records = new Map<string, DuffelDurableOfferEvidenceRecord>();
  readonly #secret = "offline-duffel-bridge-evidence-secret";

  static restore(serialized: string) {
    const repository = new OfflineEvidenceRepository();
    const entries = JSON.parse(serialized) as [string, DuffelDurableOfferEvidenceRecord][];
    entries.forEach(([receipt, record]) => repository.#records.set(receipt, structuredClone(record)));
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
      trustedTime: "2027-01-01T00:06:00.000Z",
    };
  }

  async storeOfferEvidence(record: DuffelDurableOfferEvidenceRecord, expectedScope: typeof scope) {
    if (canonicalFlightJson(record.scope as never) !== canonicalFlightJson(expectedScope as never)) {
      throw new Error("Cross-scope fixture store refused.");
    }
    const receiptDigest = this.#receipt(record.recordDigest);
    const existing = this.#records.has(receiptDigest);
    this.#records.set(receiptDigest, structuredClone(record));
    return { decision: existing ? "already_stored" as const : "stored" as const, receiptDigest, recordDigest: record.recordDigest };
  }

  async verifyAndLoadOfferEvidence(receiptDigest: string, expectedScope: typeof scope) {
    const record = this.#records.get(receiptDigest);
    if (!record) return { decision: "not_found" as const };
    if (canonicalFlightJson(record.scope as never) !== canonicalFlightJson(expectedScope as never)) {
      return { decision: "invalid" as const };
    }
    if (this.#receipt(record.recordDigest) !== receiptDigest) return { decision: "invalid" as const };
    return { decision: "verified" as const, receiptDigest, record: structuredClone(record) };
  }

  serialize() {
    return JSON.stringify([...this.#records.entries()]);
  }
}

class OfflineAuthorityVerifier implements DuffelSandboxOrderCreateAuthorityVerifier {
  readonly #secret = "offline-duffel-bridge-authority-secret";

  readTrustedTime() {
    return "2027-01-01T00:06:00.000Z";
  }

  async verifyOrderCreateAuthority(input: Parameters<DuffelSandboxOrderCreateAuthorityVerifier["verifyOrderCreateAuthority"]>[0]) {
    expect(input.evaluatedAt).toBe(this.readTrustedTime());
    expect(new TextDecoder().decode(input.canonicalClaimsPayload)).toBe(canonicalFlightJson(input.claims as never));
    const claimsDigest = sha256FlightEvidence(input.claims as never);
    return {
      decision: "verified" as const,
      claimsDigest,
      authorityReceiptDigest: createHmac("sha256", this.#secret).update(claimsDigest).digest("hex"),
    };
  }
}

const exactTravelerPii = {
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
const exactTraveler = {
  ...exactTravelerPii,
  piiRecordDigest: digestDuffelSandboxOrderTravelerPii({
    scope,
    departureDate: adultSearch.departureDate,
    traveler: exactTravelerPii,
  }),
};

function travelerResolver(
  overrides: Partial<typeof exactTraveler> = {},
): DuffelSandboxTrustedTravelerResolver {
  return {
    resolveSyntheticAdultTraveler: async () => ({
      decision: "verified_synthetic_adult" as const,
      traveler: { ...exactTraveler, ...overrides },
      piiAuthorityReceiptDigest: "d".repeat(64),
    }),
  };
}

function createOrderInput(
  offerId: string,
  acceptedTermsDigest: string,
  offerRefreshReceiptDigest: string,
  overrides: Partial<Omit<FlightProviderCreateOrderInput, "idempotency">> = {},
): FlightProviderCreateOrderInput {
  const withoutIdempotency = {
    offerId,
    acceptedTermsDigest,
    offerRefreshReceiptDigest,
    total: { currency: "USD", amountMinor: 24_950 },
    travelers: [{ travelerRef: exactTraveler.travelerRef, piiRecordDigest: exactTraveler.piiRecordDigest }],
    settlementIntent: {
      method: "provider_balance" as const,
      amount: { currency: "USD", amountMinor: 24_950 },
      settlementBindingDigest: digestFlightRuntimeSettlementBinding(settlementBinding),
    },
    ...overrides,
  };
  return {
    ...withoutIdempotency,
    idempotency: buildFlightIdempotencyIntent({
      operation: "create_order",
      scopeId: scope.commerceId,
      requestId: "request_duffel_bridge_0001",
      payload: withoutIdempotency,
    }),
  };
}

async function durableFixture() {
  const repository = new OfflineEvidenceRepository();
  const projected = sanitizeDuffelSandboxOfferResponse(searchResponse(), { search: adultSearch, retrievedAt });
  const initial = await persistDuffelSandboxInitialOfferEvidence(repository, searchResponse(), {
    search: adultSearch,
    retrievedAt,
    offerId: projected.result.offers[0]!.offerId,
    scope,
    retentionExpiresAt: "2027-01-02T00:00:00.000Z",
  });
  const restoredInitial = OfflineEvidenceRepository.restore(repository.serialize());
  const refreshed = await persistDuffelSandboxRefreshedOfferEvidence(restoredInitial, refreshedOfferBody(), {
    predecessorReceiptDigest: initial.receiptDigest,
    repricedAt: refreshedAt,
    scope,
  });
  const restoredRefresh = OfflineEvidenceRepository.restore(restoredInitial.serialize());
  if (refreshed.evidence.version !== "duffel-refreshed-offer-v1") throw new Error("Expected refreshed fixture.");
  return { repository: restoredRefresh, refreshed };
}

async function preparedFixture(input?: {
  providerInput?: FlightProviderCreateOrderInput;
  settlement?: FlightRuntimeSettlementBinding;
  resolver?: DuffelSandboxTrustedTravelerResolver;
  receipt?: string;
}) {
  const durable = await durableFixture();
  const providerInput = input?.providerInput ?? createOrderInput(
    durable.refreshed.snapshot.offerId,
    durable.refreshed.evidence.termsDigest,
    durable.refreshed.receiptDigest,
  );
  const bridgePackage = await prepareDuffelSandboxCreateOrderBridge({
    repository: durable.repository,
    refreshedOfferReceiptDigest: input?.receipt ?? durable.refreshed.receiptDigest,
    scope,
    providerInput,
    settlementBinding: input?.settlement ?? settlementBinding,
    travelerResolver: input?.resolver ?? travelerResolver(),
    authorityVerifier: new OfflineAuthorityVerifier(),
    termsAcceptanceReceiptDigest: "e".repeat(64),
    settlementAuthorityReceiptDigest: "f".repeat(64),
  });
  return { ...durable, providerInput, bridgePackage };
}

function transitionEvidence(kind: "order" | "payment", minute: number, revision: number): FlightTransitionEvidence {
  return {
    eventId: `${kind}_duffel_bridge_${String(minute).padStart(4, "0")}`,
    occurredAt: `2027-01-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
    idempotencyDigest: minute.toString(16).padStart(64, "0"),
    expectedRevision: revision,
  };
}

function capturedOrderPendingLifecycle(): FlightCommerceLifecycle {
  let lifecycle = createFlightCommerceLifecycle(scope.commerceId);
  lifecycle = {
    ...lifecycle,
    order: transitionFlightOrder(lifecycle.order, { type: "select_offer", ...transitionEvidence("order", 0, 0) }),
  };
  lifecycle = {
    ...lifecycle,
    order: transitionFlightOrder(lifecycle.order, { type: "start_reprice", ...transitionEvidence("order", 1, 1) }),
  };
  lifecycle = {
    ...lifecycle,
    order: transitionFlightOrder(lifecycle.order, { type: "accept_reprice", ...transitionEvidence("order", 2, 2) }),
  };
  lifecycle = beginFlightCommercePayment(lifecycle, {
    order: transitionEvidence("order", 3, 3),
    payment: transitionEvidence("payment", 3, 0),
  });
  lifecycle = authorizeFlightCommercePayment(lifecycle, {
    order: transitionEvidence("order", 4, 4),
    payment: transitionEvidence("payment", 4, 1),
  });
  lifecycle = beginFlightCommercePaymentCapture(lifecycle, transitionEvidence("payment", 5, 2));
  lifecycle = completeFlightCommercePaymentCapture(lifecycle, transitionEvidence("payment", 6, 3));
  return submitFlightCommerceOrder(lifecycle, transitionEvidence("order", 7, 5));
}

describe("offline durable Duffel create-order bridge", () => {
  it("rehydrates in a new repository instance and prepares one branded default-off package", async () => {
    const { bridgePackage, refreshed } = await preparedFixture();
    expect(DUFFEL_SANDBOX_BRIDGE_MODE).toBe("offline_hold_only");
    expect(Object.values(duffelSandboxBridgeCapabilities)).toEqual(Array(8).fill(false));
    expect(bridgePackage).toMatchObject({
      durableOfferReceiptDigest: refreshed.receiptDigest,
      mode: "offline_hold_only",
      providerTrafficAuthorized: false,
      bookingAuthorized: false,
      settlementAuthorized: false,
      separateTicketIssueAuthorized: false,
      externalRequestMade: false,
      orderCreatePlan: {
        providerTrafficAuthorized: false,
        bookingAuthorized: false,
        paymentAuthorized: false,
        externalRequestMade: false,
        plan: { operation: "create_order", providerTrafficAuthorized: false, externalRequestMade: false },
      },
    });
    expect(bridgePackage.providerRequestBinding.settlementBindingDigest).toBe(
      digestFlightRuntimeSettlementBinding(settlementBinding),
    );
    expect(bridgePackage.canonicalBridgeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(isDuffelSandboxCreateOrderBridgePackage(bridgePackage)).toBe(true);
    expect(isDuffelSandboxCreateOrderBridgePackage(structuredClone(bridgePackage))).toBe(false);
    expect(Object.isFrozen(bridgePackage)).toBe(true);
  });

  it("rejects terms, total, traveler/PII, settlement, and repository-receipt mismatches", async () => {
    const durable = await durableFixture();
    const base = createOrderInput(
      durable.refreshed.snapshot.offerId,
      durable.refreshed.evidence.termsDigest,
      durable.refreshed.receiptDigest,
    );
    const prepare = (providerInput: FlightProviderCreateOrderInput, options: {
      settlement?: FlightRuntimeSettlementBinding;
      resolver?: DuffelSandboxTrustedTravelerResolver;
      receipt?: string;
    } = {}) => prepareDuffelSandboxCreateOrderBridge({
      repository: durable.repository,
      refreshedOfferReceiptDigest: options.receipt ?? durable.refreshed.receiptDigest,
      scope,
      providerInput,
      settlementBinding: options.settlement ?? settlementBinding,
      travelerResolver: options.resolver ?? travelerResolver(),
      authorityVerifier: new OfflineAuthorityVerifier(),
      termsAcceptanceReceiptDigest: "e".repeat(64),
      settlementAuthorityReceiptDigest: "f".repeat(64),
    });

    await expect(prepare(createOrderInput(base.offerId, "0".repeat(64), base.offerRefreshReceiptDigest)))
      .rejects.toThrow(/accepted|exact authenticated refreshed offer/i);
    await expect(prepare(createOrderInput(base.offerId, base.acceptedTermsDigest, base.offerRefreshReceiptDigest, {
      total: { currency: "USD", amountMinor: 24_951 },
      settlementIntent: { ...base.settlementIntent, amount: { currency: "USD", amountMinor: 24_951 } },
    }))).rejects.toThrow(/exact authenticated refreshed offer|total/i);
    await expect(prepare(base, { resolver: travelerResolver({ travelerRef: "traveler:fixture:9999" }) }))
      .rejects.toThrow(/another traveler or PII record/i);
    await expect(prepare(base, { resolver: travelerResolver({ piiRecordDigest: "8".repeat(64) }) }))
      .rejects.toThrow(/another traveler or PII record/i);
    const otherSettlement = { ...settlementBinding, environmentScopeReceiptDigest: "9".repeat(64) };
    await expect(prepare(base, { settlement: otherSettlement })).rejects.toThrow(/settlement/i);
    await expect(prepare(base, { receipt: "9".repeat(64) })).rejects.toThrow(/not verified/i);

    let nestedProxyDescriptorReads = 0;
    const changingNestedTotal = new Proxy({ currency: "USD", amountMinor: 24_950 }, {
      getOwnPropertyDescriptor: (target, key) => {
        nestedProxyDescriptorReads += 1;
        if (key === "amountMinor") {
          return { value: nestedProxyDescriptorReads % 2 === 0 ? 24_950 : 24_951, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    await expect(prepare({ ...base, total: changingNestedTotal })).rejects.toThrow(/canonical data only/i);
    expect(nestedProxyDescriptorReads).toBe(0);

    const accessorTotal = { currency: "USD" } as { currency: string; amountMinor: number };
    Object.defineProperty(accessorTotal, "amountMinor", { enumerable: true, get: () => 24_950 });
    await expect(prepare({ ...base, total: accessorTotal })).rejects.toThrow(/canonical data only/i);
  });

  it("projects not-started, issuance-pending, and atomic issued documents without a separate ticket operation", async () => {
    const { bridgePackage, refreshed } = await preparedFixture();
    const providerOfferId = refreshed.evidence.version === "duffel-refreshed-offer-v1"
      ? refreshed.evidence.providerOfferId
      : "";
    const notStarted = projectDuffelSandboxCreateOrderResult(orderResponse(providerOfferId, "not_started"), {
      bridgePackage,
      retrievedAt: "2027-01-01T00:12:00.000Z",
      providerOperationRequestReceiptDigest: "1".repeat(64),
      providerOperationReceiptDigest: "2".repeat(64),
    });
    const pending = projectDuffelSandboxCreateOrderResult(orderResponse(providerOfferId, "pending"), {
      bridgePackage,
      retrievedAt: "2027-01-01T00:12:00.000Z",
      providerOperationRequestReceiptDigest: "1".repeat(64),
      providerOperationReceiptDigest: "2".repeat(64),
    });
    const issued = projectDuffelSandboxCreateOrderResult(orderResponse(providerOfferId, "issued"), {
      bridgePackage,
      retrievedAt: "2027-01-01T00:12:00.000Z",
      providerOperationRequestReceiptDigest: "1".repeat(64),
      providerOperationReceiptDigest: "2".repeat(64),
    });
    expect(notStarted).toMatchObject({ orderState: "order_confirmed", ticketState: "not_started", ticketReferenceDigests: [] });
    expect(pending).toMatchObject({ orderState: "order_confirmed", ticketState: "issuance_pending", ticketReferenceDigests: [] });
    expect(issued).toMatchObject({ orderState: "order_confirmed", ticketState: "issued", externalSideEffect: true });
    expect(issued.ticketReferenceDigests).toHaveLength(1);
    expect(bridgePackage.orderCreatePlan.plan.operation).toBe("create_order");
    expect(duffelSandboxBridgeCapabilities.separateTicketIssueAuthorized).toBe(false);

    const canonical = buildDuffelSandboxOrderCompletionCanonicalEvidence({
      bridgePackage,
      result: issued,
      lifecycle: capturedOrderPendingLifecycle(),
    });
    expect(canonical).toMatchObject({
      providerOrderState: "order_confirmed",
      providerTicketState: "issued",
      providerOperationRequestReceiptDigest: "1".repeat(64),
      providerOperationReceiptDigest: "2".repeat(64),
      outcome: "ticketed",
    });
    expect(canonical).not.toHaveProperty("canonicalEvidenceDigest");
    expect(canonical).not.toHaveProperty("trustedReceiptId");
    expect(canonical).not.toHaveProperty("trustedReceiptDigest");
    expect(digestFlightProviderOrderCompletionCanonicalEvidence(canonical)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps timed-out order-list cardinality to absent, validate-one, or manual review without retry", async () => {
    const { bridgePackage, refreshed } = await preparedFixture();
    const providerOfferId = refreshed.evidence.version === "duffel-refreshed-offer-v1"
      ? refreshed.evidence.providerOfferId
      : "";
    const common = {
      bridgePackage,
      retrievedAt: "2027-01-01T00:12:00.000Z",
      originalOperationReceiptDigest: "1".repeat(64),
      providerOperationRequestReceiptDigest: "2".repeat(64),
      providerStatusReceiptDigest: "3".repeat(64),
    };
    const absent = projectDuffelSandboxTimedOutCreateOrderReconciliation(orderListResponse(providerOfferId, 0), common);
    const one = projectDuffelSandboxTimedOutCreateOrderReconciliation(orderListResponse(providerOfferId, 1), common);
    const many = projectDuffelSandboxTimedOutCreateOrderReconciliation(orderListResponse(providerOfferId, 2), common);
    expect(absent).toMatchObject({ decision: "order_absent", retryCreateOrder: false, result: { outcome: "order_absent", orderId: null, ticketOutcome: "no_active_ticket_documents" } });
    expect(one).toMatchObject({ decision: "requires_full_order_validation", retryCreateOrder: false, result: { outcome: "ambiguous", orderId: "ord_0000000000000001" } });
    expect(many).toMatchObject({ decision: "manual_review", retryCreateOrder: false, result: { outcome: "ambiguous", orderId: null } });
    expect(many.result.resourceReceiptDigests).toEqual([]);
    expect([absent, one, many].every((item) => !item.directMutationAuthorized)).toBe(true);
  });

  it("contains no transport, runtime-setting, secret-reading, persistence client, or adapter-construction path", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/flights/duffel-sandbox-bridge.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:https|node:http/);
    expect(source).not.toMatch(/process\s*\.\s*env|Deno\s*\.\s*env|Bun\s*\.\s*env/);
    expect(source).not.toMatch(/Authorization\s*:|Bearer\s+|api[_-]?key|secret[_-]?key/i);
    expect(source).not.toMatch(/@supabase|prisma|drizzle|node-postgres|\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i);
    expect(source).not.toMatch(/createClient\s*\(|new\s+FlightProvider|createFlightProviderAdapter/);
  });
});
