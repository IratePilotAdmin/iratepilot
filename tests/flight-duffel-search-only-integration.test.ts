import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { FlightCommerceSearchRequest } from "../lib/flights/commerce-domain";
import {
  sanitizeDuffelSandboxOfferResponse,
  sanitizeDuffelSandboxRepriceResponse,
} from "../lib/flights/duffel-sandbox-contract";
import type { DuffelSandboxCredentialProvider } from "../lib/flights/duffel/credentials.server";
import type {
  DuffelHttpDispatchRequest,
  DuffelInjectedHttpDispatcher,
} from "../lib/flights/duffel/http-transport.server";
import {
  createDisabledDuffelSandboxSearchOnlyIntegration,
  createInjectedDuffelSandboxSearchOnlyIntegration,
} from "../lib/flights/duffel/search-only-integration.server";
import type {
  DuffelAuthenticatedRequestJournal,
  DuffelJournalCompletionInput,
  DuffelSandboxTrafficGate,
} from "../lib/flights/duffel/telemetry.server";

const search: FlightCommerceSearchRequest = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2027-02-10",
  returnDate: null,
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
};

const authorizationReceiptDigest = "a".repeat(64);
const journalReceiptDigest = "b".repeat(64);
const dispatchReceiptDigest = "c".repeat(64);
const completionReceiptDigest = "d".repeat(64);
const fictionalTestToken = "duffel_test_fictional_redacted_0001";

function offer(includeAvailableServices = false) {
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
    ...(includeAvailableServices ? { available_services: [] } : {}),
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
        marketing_carrier: {
          name: "Duffel Airways",
          iata_code: "ZZ",
          conditions_of_carriage_url: null,
        },
        operating_carrier: {
          name: "Duffel Airways",
          iata_code: "ZZ",
          conditions_of_carriage_url: "https://example.test/conditions",
        },
        marketing_carrier_flight_number: "101",
        operating_carrier_flight_number: "101",
        duration: "PT3H",
        stops: [],
        origin: {
          iata_code: "ORD",
          time_zone: "America/Chicago",
          latitude: 41.974162,
          longitude: -87.907321,
        },
        destination: {
          iata_code: "MIA",
          time_zone: "America/New_York",
          latitude: 25.795865,
          longitude: -80.287046,
        },
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
  };
}

function offerEvidence() {
  const initial = sanitizeDuffelSandboxOfferResponse(new TextEncoder().encode(JSON.stringify({
    meta: null,
    data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [offer()],
    },
  })), { search, retrievedAt: "2027-01-01T00:00:00.000Z" });
  const refreshed = sanitizeDuffelSandboxRepriceResponse(
    new TextEncoder().encode(JSON.stringify({ data: offer(true) })),
    {
      search,
      original: initial.result.offers[0]!,
      originalEvidence: initial.evidence[0]!,
      repricedAt: "2027-01-01T00:05:00.000Z",
    },
  );
  return { initial: initial.evidence[0]!, refreshed: refreshed.evidence };
}

async function* responseBody(): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode('{"data":{}}');
}

type Ports = Readonly<{
  events: string[];
  operations: string[];
  requests: DuffelHttpDispatchRequest[];
  trafficGate: DuffelSandboxTrafficGate;
  journal: DuffelAuthenticatedRequestJournal;
  credentials: DuffelSandboxCredentialProvider;
  dispatcher: DuffelInjectedHttpDispatcher;
}>;

function injectedPorts(): Ports {
  const events: string[] = [];
  const operations: string[] = [];
  const requests: DuffelHttpDispatchRequest[] = [];
  let attempt = 0;
  const trafficGate: DuffelSandboxTrafficGate = {
    async authorize(metadata) {
      events.push("gate");
      operations.push(metadata.operation);
      return {
        version: "duffel-traffic-gate-decision-v1",
        decision: "authorized",
        authorizationReceiptDigest,
      };
    },
  };
  const journal: DuffelAuthenticatedRequestJournal = {
    async begin() {
      events.push("prepare");
      attempt += 1;
      return {
        version: "duffel-journal-begin-result-v1",
        state: "prepared",
        attemptId: `11111111-1111-4111-8111-${String(attempt).padStart(12, "0")}`,
        revision: 0,
        journalReceiptDigest,
      };
    },
    async markDispatching(input) {
      events.push("claim");
      return {
        version: "duffel-journal-mark-dispatching-result-v1",
        decision: "claimed",
        state: "dispatching",
        attemptId: input.attemptId,
        revision: 1,
        dispatchReceiptDigest,
      };
    },
    async complete(input: DuffelJournalCompletionInput) {
      events.push("complete");
      return {
        version: "duffel-journal-completion-result-v1",
        state: input.terminalState,
        attemptId: input.attemptId,
        revision: input.expectedRevision === 0 ? 1 : 2,
        completionReceiptDigest,
      };
    },
  };
  const credentials: DuffelSandboxCredentialProvider = {
    async readSandboxAccessToken() {
      events.push("credential");
      return fictionalTestToken;
    },
  };
  const dispatcher: DuffelInjectedHttpDispatcher = {
    async dispatch(request) {
      events.push("dispatch");
      requests.push(request);
      return {
        status: 200,
        url: request.url,
        redirected: false,
        headers: {
          get(name) {
            return name === "content-type" ? "application/json" : null;
          },
        },
        body: responseBody(),
      };
    },
  };
  return { events, operations, requests, trafficGate, journal, credentials, dispatcher };
}

describe("Duffel sandbox search-only integration", () => {
  it("defaults to one frozen no-capability singleton and exposes no generic or mutating operation", async () => {
    const first = createDisabledDuffelSandboxSearchOnlyIntegration();
    const second = createDisabledDuffelSandboxSearchOnlyIntegration();
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(first))).toBe(true);
    expect(first).not.toHaveProperty("execute");
    for (const operation of [
      "createOrder",
      "authorizePayment",
      "capturePayment",
      "issueTickets",
      "serviceOrder",
      "processWebhook",
    ]) expect(first).not.toHaveProperty(operation);
    await expect(first.createOfferRequest(search)).rejects.toMatchObject({
      name: "DuffelSearchOnlyIntegrationDisabledError",
    });
  });

  it("maps exactly three named operations through the injected safety chain", async () => {
    const ports = injectedPorts();
    const evidence = offerEvidence();
    const integration = createInjectedDuffelSandboxSearchOnlyIntegration({
      enabled: true,
      trafficGate: ports.trafficGate,
      journal: ports.journal,
      credentials: ports.credentials,
      dispatcher: ports.dispatcher,
    });
    expect(Object.isFrozen(integration)).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(integration))).toBe(true);

    const results = [
      await integration.createOfferRequest(search),
      await integration.retrieveOffer(evidence.initial),
      await integration.listOrdersByOffer(evidence.refreshed),
    ];

    expect(results.map((result) => result.operation)).toEqual([
      "create_offer_request",
      "retrieve_offer",
      "list_orders_by_offer",
    ]);
    expect(ports.operations).toEqual([
      "create_offer_request",
      "retrieve_offer",
      "list_orders_by_offer",
    ]);
    expect(ports.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      {
        method: "POST",
        url: "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000&view=offers",
      },
      {
        method: "GET",
        url: "https://api.duffel.com/air/offers/off_0000000000000001?return_available_services=false",
      },
      {
        method: "GET",
        url: "https://api.duffel.com/air/orders?offer_id=off_0000000000000001&limit=50",
      },
    ]);
    expect(ports.events).toEqual(Array.from({ length: 3 }, () => [
      "gate",
      "prepare",
      "credential",
      "claim",
      "dispatch",
      "complete",
    ]).flat());
    for (const operation of ports.operations) expect(operation).not.toBe("create_order");
    expect(ports.events.filter((event) => event === "dispatch")).toHaveLength(3);
  });

  it("refuses widened dependency records and invalid evidence before any port call", async () => {
    const widened = injectedPorts();
    expect(() => createInjectedDuffelSandboxSearchOnlyIntegration({
      enabled: true,
      trafficGate: widened.trafficGate,
      journal: widened.journal,
      credentials: widened.credentials,
      dispatcher: widened.dispatcher,
      createOrder: vi.fn(),
    } as never)).toThrow(/invalid shape/i);
    expect(widened.events).toEqual([]);

    const ports = injectedPorts();
    const integration = createInjectedDuffelSandboxSearchOnlyIntegration({
      enabled: true,
      trafficGate: ports.trafficGate,
      journal: ports.journal,
      credentials: ports.credentials,
      dispatcher: ports.dispatcher,
    });
    await expect(integration.retrieveOffer({ providerOfferId: "off_0000000000000001" } as never))
      .rejects.toThrow(/offer evidence/i);
    await expect(integration.listOrdersByOffer({ providerOfferId: "off_0000000000000001" } as never))
      .rejects.toThrow(/post-reprice offer evidence/i);
    expect(ports.events).toEqual([]);
  });

  it("keeps the composition module server-only and free of ambient capabilities", () => {
    const source = readFileSync(
      new URL("../lib/flights/duffel/search-only-integration.server.ts", import.meta.url),
      "utf8",
    );
    expect(source.split(/\r?\n/, 1)[0]).toBe('import "server-only";');
    expect(source).not.toMatch(/process\s*\.\s*env|NEXT_PUBLIC|globalThis\s*\.\s*fetch|\bfetch\s*\(/);
    expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/);
    expect(source).not.toMatch(/from\s+["'](?:@\/)?(?:app|components)\//);
  });
});
