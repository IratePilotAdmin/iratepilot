import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildDuffelSandboxOfferRequestPlan,
  buildDuffelSandboxOfferRetrievalPlan,
  buildDuffelSandboxOrderListByOfferPlan,
  sanitizeDuffelSandboxOfferResponse,
  sanitizeDuffelSandboxRepriceResponse,
} from "../lib/flights/duffel-sandbox-contract";
import type { FlightCommerceSearchRequest } from "../lib/flights/commerce-domain";
import {
  DUFFEL_MAX_INBOUND_BODY_BYTES,
  DUFFEL_MAX_INBOUND_CHUNKS,
  DUFFEL_MAX_OUTBOUND_BODY_BYTES,
  copyDuffelHttpTransportRawBody,
  createDisabledDuffelHttpTransport,
  createDuffelTestHttpTransport,
  type DuffelHttpDispatchRequest,
  type DuffelHttpDispatchResponse,
  type DuffelInjectedHttpDispatcher,
} from "../lib/flights/duffel/http-transport.server";
import {
  validateDuffelSandboxAccessToken,
  type DuffelSandboxCredentialProvider,
} from "../lib/flights/duffel/credentials.server";
import type {
  DuffelAuthenticatedRequestJournal,
  DuffelJournalCompletionInput,
  DuffelJournalCompletionResult,
  DuffelSandboxTrafficGate,
} from "../lib/flights/duffel/telemetry.server";

const authorizationReceiptDigest = "a".repeat(64);
const journalReceiptDigest = "b".repeat(64);
const dispatchReceiptDigest = "c".repeat(64);
const completionReceiptDigest = "d".repeat(64);
const attemptId = "11111111-1111-4111-8111-111111111111";
const fictionalTestToken = "duffel_test_fictional_redacted_0001";
const rawProviderOfferId = "off_1234567890fixture";

const searchPlan = buildDuffelSandboxOfferRequestPlan({
  origin: "JFK",
  destination: "LHR",
  departureDate: "2027-02-10",
  returnDate: "2027-02-17",
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
});

const readPlanSearch: FlightCommerceSearchRequest = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2027-02-10",
  returnDate: null,
  cabin: "economy",
  passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
};

function readPlanOffer(includeAvailableServices = false) {
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
        marketing_carrier: { name: "Duffel Airways", iata_code: "ZZ", conditions_of_carriage_url: null },
        operating_carrier: {
          name: "Duffel Airways",
          iata_code: "ZZ",
          conditions_of_carriage_url: "https://example.test/conditions",
        },
        marketing_carrier_flight_number: "101",
        operating_carrier_flight_number: "101",
        duration: "PT3H",
        stops: [],
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
  };
}

function exactReadPlans() {
  const initial = sanitizeDuffelSandboxOfferResponse(new TextEncoder().encode(JSON.stringify({
    meta: null,
    data: {
      id: "orq_0000000000000001",
      live_mode: false,
      cabin_class: "economy",
      passengers: [{ id: "pas_0000000000000001", type: "adult" }],
      slices: [{ origin: "ORD", destination: "MIA", departure_date: "2027-02-10" }],
      offers: [readPlanOffer()],
    },
  })), { search: readPlanSearch, retrievedAt: "2027-01-01T00:00:00.000Z" });
  const refreshed = sanitizeDuffelSandboxRepriceResponse(
    new TextEncoder().encode(JSON.stringify({ data: readPlanOffer(true) })),
    {
      search: readPlanSearch,
      original: initial.result.offers[0]!,
      originalEvidence: initial.evidence[0]!,
      repricedAt: "2027-01-01T00:05:00.000Z",
    },
  );
  return {
    retrieve: buildDuffelSandboxOfferRetrievalPlan(initial.evidence[0]!),
    list: buildDuffelSandboxOrderListByOfferPlan(refreshed.evidence),
  };
}

async function* bodyChunks(value: string | Uint8Array): AsyncIterable<Uint8Array> {
  yield typeof value === "string" ? new TextEncoder().encode(value) : value;
}

function jsonResponse(
  url: string,
  payload: string,
  overrides: Partial<DuffelHttpDispatchResponse> = {},
): DuffelHttpDispatchResponse {
  const bytes = new TextEncoder().encode(payload);
  return {
    status: 200,
    url,
    redirected: false,
    headers: {
      get(name: string) {
        if (name === "content-type") return "application/json; charset=utf-8";
        if (name === "content-length") return String(bytes.byteLength);
        return null;
      },
    },
    body: bodyChunks(bytes),
    ...overrides,
  };
}

function completionResult(input: DuffelJournalCompletionInput): DuffelJournalCompletionResult {
  return {
    version: "duffel-journal-completion-result-v1",
    state: input.terminalState,
    attemptId: input.attemptId,
    revision: input.expectedRevision === 0 ? 1 : 2,
    completionReceiptDigest,
  };
}

type TestPorts = Readonly<{
  order: string[];
  trafficGate: DuffelSandboxTrafficGate;
  journal: DuffelAuthenticatedRequestJournal;
  credentials: DuffelSandboxCredentialProvider;
  dispatcher: DuffelInjectedHttpDispatcher;
}>;

function authorizedPorts(input: Readonly<{
  order?: string[];
  dispatcher?: DuffelInjectedHttpDispatcher;
  credentials?: DuffelSandboxCredentialProvider;
  journal?: DuffelAuthenticatedRequestJournal;
  trafficGate?: DuffelSandboxTrafficGate;
}> = {}): TestPorts {
  const order = input.order ?? [];
  const trafficGate = input.trafficGate ?? {
    async authorize() {
      order.push("gate");
      return {
        version: "duffel-traffic-gate-decision-v1" as const,
        decision: "authorized" as const,
        authorizationReceiptDigest,
      };
    },
  };
  const journal = input.journal ?? {
    async begin() {
      order.push("journal");
      return {
        version: "duffel-journal-begin-result-v1" as const,
        state: "prepared" as const,
        attemptId,
        revision: 0 as const,
        journalReceiptDigest,
      };
    },
    async markDispatching() {
      order.push("claim");
      return {
        version: "duffel-journal-mark-dispatching-result-v1" as const,
        decision: "claimed" as const,
        state: "dispatching" as const,
        attemptId,
        revision: 1 as const,
        dispatchReceiptDigest,
      };
    },
    async complete(completion) {
      order.push("complete");
      return completionResult(completion);
    },
  };
  const credentials = input.credentials ?? {
    async readSandboxAccessToken() {
      order.push("token");
      return fictionalTestToken;
    },
  };
  const dispatcher = input.dispatcher ?? {
    async dispatch(request: DuffelHttpDispatchRequest) {
      order.push("dispatch");
      return jsonResponse(request.url, '{"data":{"kind":"fixture"}}');
    },
  };
  return { order, trafficGate, journal, credentials, dispatcher };
}

function testTransport(ports: TestPorts) {
  return createDuffelTestHttpTransport({
    enabled: true,
    trafficGate: ports.trafficGate,
    journal: ports.journal,
    credentials: ports.credentials,
    dispatcher: ports.dispatcher,
  });
}

describe("Duffel default-disabled server HTTP transport", () => {
  it("denies through a no-argument singleton that captures no journal, token, gate, or dispatch capability", async () => {
    const transport = createDisabledDuffelHttpTransport();
    expect(transport).toBe(createDisabledDuffelHttpTransport());
    await expect(transport.execute(searchPlan))
      .rejects.toMatchObject({ code: "traffic_disabled", retryDisposition: "do_not_retry" });
  });

  it("uses exact gate -> journal -> token -> dispatch claim -> dispatch -> terminal CAS ordering", async () => {
    const order: string[] = [];
    const dispatch = vi.fn(async (request: DuffelHttpDispatchRequest) => {
      order.push("dispatch");
      expect(request.url).toBe(
        "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000&view=offers",
      );
      expect(request).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store" });
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(Object.keys(request.headers).sort()).toEqual([
        "Accept",
        "Authorization",
        "Content-Type",
        "Duffel-Version",
      ]);
      expect(request.headers).toEqual({
        Accept: "application/json",
        Authorization: `Bearer ${fictionalTestToken}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      });
      expect(JSON.stringify(request.headers).toLowerCase()).not.toContain("idempotency");
      expect(Buffer.byteLength(request.body ?? "", "utf8")).toBeLessThanOrEqual(DUFFEL_MAX_OUTBOUND_BODY_BYTES);
      return jsonResponse(request.url, '{"data":{"kind":"fixture"}}');
    });
    const ports = authorizedPorts({ order, dispatcher: { dispatch } });

    const result = await testTransport(ports).execute(searchPlan);

    expect(order).toEqual(["gate", "journal", "token", "claim", "dispatch", "complete"]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      version: "duffel-http-transport-result-v1",
      operation: "create_offer_request",
      status: 200,
      automaticRetryAttempted: false,
      idempotencyKeyIncluded: false,
    });
    expect(new TextDecoder().decode(copyDuffelHttpTransportRawBody(result))).toBe('{"data":{"kind":"fixture"}}');
  });

  it("executes exact branded retrieve/list GET profiles with 30-second deadlines", async () => {
    const plans = exactReadPlans();
    for (const [plan, expectedUrl] of [
      [
        plans.retrieve,
        "https://api.duffel.com/air/offers/off_0000000000000001?return_available_services=false",
      ],
      [
        plans.list,
        "https://api.duffel.com/air/orders?offer_id=off_0000000000000001&limit=50",
      ],
    ] as const) {
      const authorize = vi.fn(async () => ({
        version: "duffel-traffic-gate-decision-v1" as const,
        decision: "authorized" as const,
        authorizationReceiptDigest,
      }));
      const dispatch = vi.fn(async (request: DuffelHttpDispatchRequest) => {
        expect(request.url).toBe(expectedUrl);
        expect(request.method).toBe("GET");
        expect(request.body).toBeNull();
        expect(request.headers).toEqual({
          Accept: "application/json",
          Authorization: `Bearer ${fictionalTestToken}`,
          "Duffel-Version": "v2",
        });
        return jsonResponse(request.url, '{"data":{}}');
      });
      const ports = authorizedPorts({ trafficGate: { authorize }, dispatcher: { dispatch } });
      await testTransport(ports).execute(plan);
      expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 30_000 }));
      expect(dispatch).toHaveBeenCalledTimes(1);
    }
  });

  it("returns exact owned raw bytes without collapsing duplicate keys or decimal lexemes", async () => {
    const raw = '{"data":{"amount":1.2300,"amount":9.99}}';
    const source = new TextEncoder().encode(raw);
    const ports = authorizedPorts({ dispatcher: {
      dispatch: async (request) => ({
        status: 200,
        url: request.url,
        redirected: false,
        headers: { get: (name) => name === "content-type" ? "application/json" : null },
        body: bodyChunks(source),
      }),
    } });
    const result = await testTransport(ports).execute(searchPlan);
    const firstCopy = copyDuffelHttpTransportRawBody(result);
    expect(firstCopy).not.toBe(source);
    expect(new TextDecoder().decode(firstCopy)).toBe(raw);
    firstCopy.fill(0);
    expect(new TextDecoder().decode(copyDuffelHttpTransportRawBody(result))).toBe(raw);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result, "rawBodyBase64", "Zm9yZ2Vk")).toBe(false);
    expect(() => copyDuffelHttpTransportRawBody({ ...result })).toThrow(/process-local receipt/i);
    expect(() => copyDuffelHttpTransportRawBody(JSON.parse(JSON.stringify(result)))).toThrow(/process-local receipt/i);
    expect(() => copyDuffelHttpTransportRawBody(new Proxy(result, {}))).toThrow(/process-local receipt/i);
    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("rawBody");
  });

  it("journals digest metadata only, never URL values, provider resources, bodies, or tokens", async () => {
    const inputs: unknown[] = [];
    const base = authorizedPorts();
    const journal: DuffelAuthenticatedRequestJournal = {
      begin: async (input) => {
        inputs.push(input);
        return base.journal.begin(input);
      },
      markDispatching: async (input) => {
        inputs.push(input);
        return base.journal.markDispatching(input);
      },
      complete: async (input) => {
        inputs.push(input);
        return completionResult(input);
      },
    };
    await testTransport({ ...base, journal }).execute(searchPlan);
    const text = JSON.stringify(inputs);
    expect(text).not.toContain(fictionalTestToken);
    expect(text).not.toContain(rawProviderOfferId);
    expect(text).not.toContain("JFK");
    expect(text).not.toContain("LHR");
    expect(text).not.toContain("/air/");
    expect(text).not.toContain("Authorization");
    expect(text).toContain(searchPlan.requestDigest);
  });
});

describe("Duffel journal CAS and safe factory boundaries", () => {
  it("fails closed before credentials and dispatch when the gate or prepare receipt is unavailable", async () => {
    const gateFailure = authorizedPorts({
      trafficGate: { authorize: async () => { throw new Error(`${fictionalTestToken} gate detail`); } },
    });
    const gateError = await testTransport(gateFailure).execute(searchPlan).catch((value: unknown) => value);
    expect(gateError).toMatchObject({ code: "traffic_gate_unavailable" });
    expect(JSON.stringify(gateError)).not.toContain(fictionalTestToken);
    expect(gateFailure.order).toEqual([]);

    const token = vi.fn(async () => fictionalTestToken);
    const dispatch = vi.fn();
    const base = authorizedPorts();
    const journalFailure: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      begin: async () => { throw new Error(`${rawProviderOfferId} journal detail`); },
    };
    const ports = authorizedPorts({
      journal: journalFailure,
      credentials: { readSandboxAccessToken: token },
      dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher,
    });
    const error = await testTransport(ports).execute(searchPlan).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "journal_unavailable" });
    expect(JSON.stringify(error)).not.toContain(rawProviderOfferId);
    expect(token).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("allows only prepared -> blocked for credential failure and never claims or dispatches", async () => {
    const completions: DuffelJournalCompletionInput[] = [];
    const markDispatching = vi.fn();
    const dispatch = vi.fn();
    const base = authorizedPorts();
    const ports = authorizedPorts({
      journal: {
        ...base.journal,
        markDispatching,
        complete: async (input) => {
          completions.push(input);
          return completionResult(input);
        },
      },
      credentials: { readSandboxAccessToken: async () => { throw new Error(fictionalTestToken); } },
      dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher,
    });
    const error = await testTransport(ports).execute(searchPlan).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "credential_unavailable", retryDisposition: "do_not_retry" });
    expect(markDispatching).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(completions).toEqual([expect.objectContaining({
      expectedRevision: 0,
      dispatchReceiptDigest: null,
      terminalState: "blocked",
      detailCode: "credential_unavailable",
    })]);
  });

  it("refuses dispatch unless the exact atomic dispatching receipt is returned", async () => {
    const dispatch = vi.fn();
    const completions: DuffelJournalCompletionInput[] = [];
    const base = authorizedPorts();
    const refused: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      markDispatching: async () => ({
        version: "duffel-journal-mark-dispatching-result-v1",
        decision: "refused",
      }),
      complete: async (input) => {
        completions.push(input);
        return completionResult(input);
      },
    };
    const ports = authorizedPorts({ journal: refused, dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher });
    await expect(testTransport(ports).execute(searchPlan)).rejects.toMatchObject({ code: "dispatch_claim_refused" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(completions).toEqual([expect.objectContaining({
      expectedRevision: 0,
      terminalState: "blocked",
      detailCode: "dispatch_claim_refused",
    })]);

    const malformed: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      markDispatching: async () => ({
        version: "duffel-journal-mark-dispatching-result-v1",
        decision: "claimed",
        state: "dispatching",
        attemptId,
        revision: 1,
        dispatchReceiptDigest,
        extra: rawProviderOfferId,
      } as never),
    };
    await expect(testTransport(authorizedPorts({ journal: malformed, dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher })).execute(searchPlan))
      .rejects.toMatchObject({ code: "journal_unavailable" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("uses dispatching -> ambiguous after every claimed transport uncertainty", async () => {
    const completions: DuffelJournalCompletionInput[] = [];
    const base = authorizedPorts();
    const ports = authorizedPorts({
      journal: {
        ...base.journal,
        complete: async (input) => {
          completions.push(input);
          return completionResult(input);
        },
      },
      dispatcher: { dispatch: async () => { throw new Error(`${fictionalTestToken} ${rawProviderOfferId}`); } },
    });
    const error = await testTransport(ports).execute(searchPlan).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "ambiguous_after_dispatch", retryDisposition: "manual_reconciliation_required" });
    expect(JSON.stringify(error)).not.toContain(fictionalTestToken);
    expect(JSON.stringify(error)).not.toContain(rawProviderOfferId);
    expect(completions).toEqual([expect.objectContaining({
      expectedRevision: 1,
      dispatchReceiptDigest,
      terminalState: "ambiguous",
      detailCode: "dispatch_failed",
      httpStatus: null,
      inboundBodyBytes: null,
      responseDigest: null,
    })]);
  });

  it("treats a missing or malformed terminal CAS receipt as manual ambiguity", async () => {
    const base = authorizedPorts();
    const journal: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      complete: async () => undefined as never,
    };
    await expect(testTransport(authorizedPorts({ journal })).execute(searchPlan)).rejects.toMatchObject({
      code: "ambiguous_after_dispatch",
      retryDisposition: "manual_reconciliation_required",
    });
  });

  it("rejects proxy, accessor, extra-field, and mismatched authority receipts", async () => {
    const dispatch = vi.fn();
    const base = authorizedPorts();
    const extraGate: DuffelSandboxTrafficGate = {
      authorize: async () => ({
        version: "duffel-traffic-gate-decision-v1",
        decision: "authorized",
        authorizationReceiptDigest,
        extra: rawProviderOfferId,
      } as never),
    };
    await expect(testTransport(authorizedPorts({ trafficGate: extraGate, dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher })).execute(searchPlan))
      .rejects.toMatchObject({ code: "traffic_gate_unavailable" });

    const accessorReceipt = {
      version: "duffel-journal-begin-result-v1",
      state: "prepared",
      attemptId,
      revision: 0,
    } as Record<string, unknown>;
    Object.defineProperty(accessorReceipt, "journalReceiptDigest", {
      enumerable: true,
      get: () => { throw new Error(fictionalTestToken); },
    });
    const accessorJournal: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      begin: async () => accessorReceipt as never,
    };
    await expect(testTransport(authorizedPorts({ journal: accessorJournal, dispatcher: { dispatch } as unknown as DuffelInjectedHttpDispatcher })).execute(searchPlan))
      .rejects.toMatchObject({ code: "journal_unavailable" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("has no public constructor or non-test opt-in factory", () => {
    const moduleSurface = {
      createDisabledDuffelHttpTransport,
      createDuffelTestHttpTransport,
    };
    expect(moduleSurface).not.toHaveProperty("DuffelSandboxHttpTransport");
    const ports = authorizedPorts();
    expect(() => createDuffelTestHttpTransport({
      enabled: false,
      trafficGate: ports.trafficGate,
      journal: ports.journal,
      credentials: ports.credentials,
      dispatcher: ports.dispatcher,
    } as never)).toThrow(/test-only enablement/i);
  });
});

describe("Duffel HTTP response refusal and exact-byte boundaries", () => {
  it("rejects unknown, serialized, cross-origin, and create-order-shaped plans before every port", async () => {
    const ports = authorizedPorts();
    const transport = testTransport(ports);
    const candidates = [
      null,
      JSON.parse(JSON.stringify(searchPlan)),
      { ...searchPlan, baseUrl: "https://attacker.invalid" },
      { ...searchPlan, path: "https://attacker.invalid/collect" },
      { ...searchPlan, operation: "create_order", path: "/air/orders" },
    ];
    for (const candidate of candidates) {
      await expect(transport.execute(candidate)).rejects.toMatchObject({ code: "invalid_request_plan" });
    }
    expect(ports.order).toEqual([]);
  });

  it("refuses redirects and cross-origin responses after one claimed dispatch", async () => {
    for (const response of [
      (request: DuffelHttpDispatchRequest) => jsonResponse(request.url, "{}", { redirected: true }),
      (request: DuffelHttpDispatchRequest) => jsonResponse(request.url, "{}", { status: 302 }),
      () => jsonResponse("https://attacker.invalid/collect", "{}"),
    ]) {
      const dispatch = vi.fn(async (request: DuffelHttpDispatchRequest) => response(request));
      await expect(testTransport(authorizedPorts({ dispatcher: { dispatch } })).execute(searchPlan)).rejects.toMatchObject({
        code: "ambiguous_after_dispatch",
        retryDisposition: "manual_reconciliation_required",
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
    }
  });

  it("streams with a hard inbound cap checked before copying and never retries", async () => {
    async function* oversized(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(DUFFEL_MAX_INBOUND_BODY_BYTES + 1);
    }
    const dispatch = vi.fn(async (request: DuffelHttpDispatchRequest): Promise<DuffelHttpDispatchResponse> => ({
      status: 200,
      url: request.url,
      redirected: false,
      headers: { get: (name) => name === "content-type" ? "application/json" : null },
      body: oversized(),
    }));
    const completions: DuffelJournalCompletionInput[] = [];
    const base = authorizedPorts();
    const journal: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      complete: async (input) => {
        completions.push(input);
        return completionResult(input);
      },
    };

    await expect(testTransport(authorizedPorts({ dispatcher: { dispatch }, journal })).execute(searchPlan)).rejects.toMatchObject({
      code: "ambiguous_after_dispatch",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(completions).toEqual([expect.objectContaining({
      terminalState: "ambiguous",
      detailCode: "response_too_large",
    })]);
  });

  it("rejects proxies, subclasses, shared backing memory, and shadowed typed-array slots", async () => {
    class ExoticChunk extends Uint8Array {}
    const shadowed = new Uint8Array([123, 125]);
    Object.defineProperty(shadowed, "byteLength", { value: 2, enumerable: false });
    const chunks: unknown[] = [
      new Proxy(new Uint8Array([123, 125]), {}),
      new ExoticChunk([123, 125]),
      shadowed,
    ];
    if (typeof SharedArrayBuffer !== "undefined") chunks.push(new Uint8Array(new SharedArrayBuffer(2)));
    for (const chunk of chunks) {
      async function* hostile(): AsyncIterable<Uint8Array> {
        yield chunk as Uint8Array;
      }
      const ports = authorizedPorts({ dispatcher: {
        dispatch: async (request) => ({
          status: 200,
          url: request.url,
          redirected: false,
          headers: { get: (name) => name === "content-type" ? "application/json" : null },
          body: hostile(),
        }),
      } });
      await expect(testTransport(ports).execute(searchPlan)).rejects.toMatchObject({ code: "ambiguous_after_dispatch" });
    }
  });

  it("uses fatal JSON media-type, UTF-8, and syntax validation", async () => {
    const cases: Array<{ response: (url: string) => DuffelHttpDispatchResponse; detail: string }> = [
      {
        response: (url) => jsonResponse(url, "{}", { headers: { get: () => "text/plain" } }),
        detail: "response_media_type_refused",
      },
      {
        response: (url) => ({
          ...jsonResponse(url, "{}"),
          headers: { get: (name) => name === "content-type" ? "application/json" : null },
          body: bodyChunks(new Uint8Array([0xff])),
        }),
        detail: "response_utf8_refused",
      },
      { response: (url) => jsonResponse(url, "not-json"), detail: "response_json_refused" },
    ];
    for (const testCase of cases) {
      const completions: DuffelJournalCompletionInput[] = [];
      const base = authorizedPorts();
      const journal: DuffelAuthenticatedRequestJournal = {
        ...base.journal,
        complete: async (input) => {
          completions.push(input);
          return completionResult(input);
        },
      };
      await expect(testTransport(authorizedPorts({
        dispatcher: { dispatch: async (request) => testCase.response(request.url) },
        journal,
      })).execute(searchPlan)).rejects.toMatchObject({ code: "ambiguous_after_dispatch" });
      expect(completions).toEqual([expect.objectContaining({ detailCode: testCase.detail })]);
    }
  });

  it("times out by operation after dispatch claim and records ambiguity", async () => {
    vi.useFakeTimers();
    try {
      const dispatch = vi.fn(async () => new Promise<DuffelHttpDispatchResponse>(() => undefined));
      const completions: DuffelJournalCompletionInput[] = [];
      const base = authorizedPorts();
      const journal: DuffelAuthenticatedRequestJournal = {
        ...base.journal,
        complete: async (input) => {
          completions.push(input);
          return completionResult(input);
        },
      };
      const execution = testTransport(authorizedPorts({ dispatcher: { dispatch }, journal })).execute(searchPlan);
      const rejection = expect(execution).rejects.toMatchObject({
        code: "ambiguous_after_dispatch",
        retryDisposition: "manual_reconciliation_required",
      });
      for (let count = 0; count < 10 && dispatch.mock.calls.length === 0; count += 1) await Promise.resolve();
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(70_000);
      await rejection;
      expect(completions).toEqual([expect.objectContaining({
        expectedRevision: 1,
        terminalState: "ambiguous",
        detailCode: "dispatch_timed_out",
        httpStatus: null,
        inboundBodyBytes: null,
        responseDigest: null,
      })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one deadline through stalled response-body iteration even when the body ignores abort", async () => {
    vi.useFakeTimers();
    try {
      let bodyStarted = false;
      let dispatchSignal: AbortSignal | undefined;
      async function* stalledBody(): AsyncIterable<Uint8Array> {
        bodyStarted = true;
        await new Promise<void>(() => undefined);
        yield new Uint8Array([123, 125]);
      }
      const completions: DuffelJournalCompletionInput[] = [];
      const base = authorizedPorts();
      const journal: DuffelAuthenticatedRequestJournal = {
        ...base.journal,
        complete: async (input) => {
          completions.push(input);
          return completionResult(input);
        },
      };
      const execution = testTransport(authorizedPorts({
        journal,
        dispatcher: {
          dispatch: async (request) => {
            dispatchSignal = request.signal;
            return {
              status: 200,
              url: request.url,
              redirected: false,
              headers: { get: (name) => name === "content-type" ? "application/json" : null },
              body: stalledBody(),
            };
          },
        },
      })).execute(searchPlan);
      const rejection = expect(execution).rejects.toMatchObject({
        code: "ambiguous_after_dispatch",
        retryDisposition: "manual_reconciliation_required",
      });
      for (let count = 0; count < 12 && !bodyStarted; count += 1) await Promise.resolve();
      expect(bodyStarted).toBe(true);
      expect(dispatchSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(70_000);
      await rejection;
      expect(dispatchSignal?.aborted).toBe(true);
      expect(completions).toEqual([expect.objectContaining({
        expectedRevision: 1,
        terminalState: "ambiguous",
        detailCode: "dispatch_timed_out",
        httpStatus: null,
        inboundBodyBytes: null,
        responseDigest: null,
      })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects zero-length churn and caps nonzero chunk-object count below the byte cap", async () => {
    let zeroYields = 0;
    async function* zeroChunks(): AsyncIterable<Uint8Array> {
      for (let index = 0; index < DUFFEL_MAX_INBOUND_CHUNKS + 10; index += 1) {
        zeroYields += 1;
        yield new Uint8Array(0);
      }
    }
    let oneByteYields = 0;
    async function* oneByteChunks(): AsyncIterable<Uint8Array> {
      for (let index = 0; index < DUFFEL_MAX_INBOUND_CHUNKS + 1; index += 1) {
        oneByteYields += 1;
        yield new Uint8Array([0x20]);
      }
    }
    for (const body of [zeroChunks(), oneByteChunks()]) {
      const ports = authorizedPorts({ dispatcher: {
        dispatch: async (request) => ({
          status: 200,
          url: request.url,
          redirected: false,
          headers: { get: (name) => name === "content-type" ? "application/json" : null },
          body,
        }),
      } });
      await expect(testTransport(ports).execute(searchPlan)).rejects.toMatchObject({
        code: "ambiguous_after_dispatch",
      });
    }
    expect(zeroYields).toBe(1);
    expect(oneByteYields).toBe(DUFFEL_MAX_INBOUND_CHUNKS + 1);
    expect(oneByteYields).toBeLessThan(DUFFEL_MAX_INBOUND_BODY_BYTES);
  });

  it("returns safe provider rejection metadata and records a failed terminal state", async () => {
    const rawBody = `{"errors":[{"message":"${rawProviderOfferId}"}]}`;
    const completions: DuffelJournalCompletionInput[] = [];
    const base = authorizedPorts();
    const journal: DuffelAuthenticatedRequestJournal = {
      ...base.journal,
      complete: async (input) => {
        completions.push(input);
        return completionResult(input);
      },
    };
    const ports = authorizedPorts({
      dispatcher: { dispatch: async (request) => jsonResponse(request.url, rawBody, { status: 422 }) },
      journal,
    });
    const error = await testTransport(ports).execute(searchPlan).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "provider_rejected", httpStatus: 422 });
    expect(JSON.stringify(error)).not.toContain(rawProviderOfferId);
    expect(JSON.stringify(completions)).not.toContain(rawProviderOfferId);
    expect(completions).toEqual([expect.objectContaining({
      expectedRevision: 1,
      terminalState: "failed",
      detailCode: "provider_http_status",
    })]);
  });
});

describe("Duffel sandbox credential profile", () => {
  it("accepts only fictional test-prefixed shapes and refuses live or generic printable values", () => {
    expect(validateDuffelSandboxAccessToken(fictionalTestToken)).toBe(fictionalTestToken);
    for (const value of [
      "duffel_live_fictional_redacted_0001",
      "generic_fictional_redacted_token_0001",
      "duffel_test_short",
      "duffel_test_fictional redacted 0001",
    ]) expect(() => validateDuffelSandboxAccessToken(value)).toThrow("credential is unavailable");
  });
});
