import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow,
} from "../lib/flights/consumer-production/duffel-order-plan-rehearsal.server";
import {
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
  type FlightConsumerProductionDuffelShoppingJournalPort,
} from "../lib/flights/consumer-production/duffel-shopping.server";
import {
  deriveFlightConsumerProductionDuffelCredentialSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"R".repeat(32)}`;
const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "true",
  FLIGHT_RUNTIME_MODE: "production",
  FLIGHT_RUNTIME_ENVIRONMENT: "production",
  FLIGHT_RUNTIME_ENABLED: "false",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "false",
  FLIGHT_BOOKING_ENABLED: "false",
  FLIGHT_PAYMENT_ENABLED: "false",
  FLIGHT_SETTLEMENT_ENABLED: "false",
  FLIGHT_TICKETING_ENABLED: "false",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "false",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "engaged",
  DUFFEL_LIVE_ACCESS_TOKEN: token,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "b".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(token),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "dedicated-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY:
    "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

const attemptId = "31111111-1111-4111-8111-111111111111";
const passengerId = "pas_0000000000000001";
const now = new Date("2026-08-26T18:00:00.000Z");
const request = Object.freeze({
  confirmation:
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
  search: {
    origin: "ORD",
    destination: "MIA",
    departureDate: "2026-10-10",
    returnDate: null,
    cabin: "economy" as const,
    adults: 1 as const,
  },
});

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "off_0000000000000001",
    live_mode: true,
    partial: false,
    total_amount: "249.50",
    total_currency: "USD",
    expires_at: "2026-08-26T18:30:00.000Z",
    passenger_identity_documents_required: false,
    payment_requirements: { requires_instant_payment: true },
    passengers: [{ id: passengerId, type: "adult" }],
    ...overrides,
  };
}

function providerBody(input: Readonly<{
  liveMode?: boolean;
  offers?: readonly unknown[];
}> = {}) {
  return JSON.stringify({
    data: {
      id: "orq_0000000000000001",
      live_mode: input.liveMode ?? true,
      passengers: [{ id: passengerId, type: "adult" }],
      offers: input.offers ?? [offer()],
    },
  });
}

function providerResponse(body = providerBody(), status = 201) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function journal(input: Readonly<{
  decision?: "created" | "replay";
  state?: "prepared" | "dispatching" | "succeeded" | "failed" | "ambiguous";
}> = {}) {
  const state = input.state ?? "prepared";
  const port: FlightConsumerProductionDuffelShoppingJournalPort = {
    begin: vi.fn(async () => [{
      decision: input.decision ?? "created",
      attempt_id: attemptId,
      attempt_state: state,
      attempt_revision: state === "prepared" ? 0 : state === "dispatching" ? 1 : 2,
      terminal_http_status: state === "succeeded" ? 201 : null,
      terminal_response_sha256: state === "succeeded" ? "a".repeat(64) : null,
      terminal_response_bytes: state === "succeeded" ? 512 : null,
      offer_count: state === "succeeded" ? 1 : null,
    }]),
    claim: vi.fn(async () => [{
      attempt_id: attemptId,
      attempt_state: "dispatching",
      attempt_revision: 1,
    }]),
    complete: vi.fn(async (parameters) => [{
      attempt_id: attemptId,
      attempt_state: parameters.p_terminal_state,
      attempt_revision: 2,
    }]),
  };
  return port;
}

describe("Flight Consumer Production Duffel zero-dispatch order-plan rehearsal", () => {
  it("makes exactly one offer-request call and returns only aggregate zero-dispatch evidence", async () => {
    const port = journal();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(input).toBe(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL);
      return providerResponse();
    });

    const result = await createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
      env,
      { journal: port, fetcher, now: () => now },
    ).execute(request);

    expect(result).toMatchObject({
      version: "flight-consumer-production-duffel-order-plan-rehearsal-result-v1",
      attemptId,
      state: "succeeded",
      replay: false,
      liveMode: true,
      offerCount: 1,
      eligibleOfferCount: 1,
      responseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      selectionPolicySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      fictionalTravelerFixtureSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      orderRequestBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      orderRequestEnvelopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      providerOfferRequestCount: 1,
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
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /(?:off|orq|pas)_[A-Za-z0-9]|Synthetic Traveler|flight-order-plan@example\.test|13125550121|duffel_live_/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
    });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('"type":"adult"');
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toMatch(/Synthetic|email|phone|off_|pas_/);
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "succeeded",
      p_terminal_http_status: 201,
      p_offer_count: 1,
    }));
  });

  it("refuses terminal replay without a supplier call or plan rebuild", async () => {
    const port = journal({ decision: "replay", state: "succeeded" });
    const fetcher = vi.fn();

    await expect(createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 409,
      diagnostic: "prior_attempt_not_replayable",
    });
    expect(port.claim).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects caller-controlled authority before journal preparation", async () => {
    const unsafeInputs = [
      { ...request, idempotencyKey: "caller-controlled" },
      { ...request, offerId: "off_0000000000009999" },
      { ...request, passengers: [{ givenName: "Real" }] },
      { ...request, payment: { amount: "1.00" } },
      { ...request, search: { ...request.search, adults: 2 } },
    ];

    for (const input of unsafeInputs) {
      const port = journal();
      const fetcher = vi.fn();
      await expect(createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
        env,
        { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
      ).execute(input)).rejects.toMatchObject({
        status: 409,
        diagnostic: "request_contract_refused",
      });
      expect(port.begin).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("terminalizes a valid response with no eligible offer and never retries", async () => {
    const port = journal();
    const fetcher = vi.fn<typeof fetch>(async () => providerResponse(providerBody({
      offers: [offer({ passenger_identity_documents_required: true })],
    })));

    await expect(createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
      env,
      { journal: port, fetcher, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 409,
      diagnostic: "no_eligible_offer",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "failed",
      p_terminal_http_status: 201,
      p_offer_count: null,
    }));
  });

  it("marks a transport failure ambiguous once and never retries", async () => {
    const port = journal();
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("network failure");
    });

    await expect(createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
      env,
      { journal: port, fetcher, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 504,
      diagnostic: "provider_dispatch_ambiguous",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "ambiguous",
      p_terminal_http_status: null,
    }));
  });

  it("rejects test-mode provider data as a bounded terminal failure", async () => {
    const port = journal();
    const fetcher = vi.fn<typeof fetch>(async () => providerResponse(providerBody({
      liveMode: false,
    })));

    await expect(createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
      env,
      { journal: port, fetcher, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 502,
      diagnostic: "provider_contract_refused",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "failed",
      p_terminal_http_status: 201,
    }));
  });

  it("contains no order, Stripe, Preview, or generic dispatch dependency", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/duffel-order-plan-rehearsal.server.ts",
      import.meta.url,
    ), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
      .map((match) => match[1]);

    expect(imports).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/stripe|preview|complete-order|order-transport|http-transport/i),
    ]));
    expect(source).not.toMatch(/api\.stripe\.com|createPaymentIntent|capturePayment|createOrder\s*\(/i);
    expect(source.match(/await fetcher\s*\(/g)).toHaveLength(1);
    expect(source).toContain("FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL");
  });
});
