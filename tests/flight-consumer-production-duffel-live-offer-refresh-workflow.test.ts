import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow,
  createFlightConsumerProductionDuffelOfferRefreshTransport,
  FlightConsumerProductionDuffelOfferRefreshError,
  type FlightConsumerProductionDuffelOfferRefreshJournalPort,
} from "../lib/flights/consumer-production/duffel-live-offer-refresh-workflow.server";
import {
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  type FlightConsumerProductionDuffelLiveOfferRepriceTransport,
} from "../lib/flights/consumer-production/duffel-live-offer-reprice.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";
import {
  FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
} from "../lib/flights/consumer-production/runtime.server";
import {
  deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"R".repeat(32)}`;
const accountId = "acc_0000B9iZ8kto4H8uYhKSzO";
const offerId = "off_0000000000000001";
const attemptId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const sourceShoppingAttemptId = "33333333-3333-4333-8333-333333333333";
const sourceResponseSha256 = "a".repeat(64);
const sourceOfferEvidenceSha256 = "b".repeat(64);
const futureOfferExpiresAt = "2099-09-01T00:00:00.000Z";
const offerIdSha256 =
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256(offerId);
const offerBindingSha256 = sha256FlightEvidence({
  version: "flight-consumer-production-duffel-live-offer-binding-v1",
  providerCode: "duffel",
  providerEnvironment: "live",
  offerIdSha256,
  sourceOfferEvidenceSha256,
  sourceShoppingExecutionScopeSha256:
    FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
});

const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
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
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID: accountId,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256:
    deriveFlightConsumerProductionDuffelAccountSha256(accountId),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(token),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

const request = Object.freeze({
  confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  offerId,
  sourceShoppingAttemptId,
});

function sourcePort(overrides: Record<string, unknown> = {}) {
  return {
    record: vi.fn(),
    resolve: vi.fn(async () => [{
      source_id: sourceId,
      source_shopping_attempt_id: sourceShoppingAttemptId,
      source_shopping_execution_scope_sha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
      source_response_sha256: sourceResponseSha256,
      offer_id_sha256: offerIdSha256,
      source_offer_evidence_sha256: sourceOfferEvidenceSha256,
      expires_at: futureOfferExpiresAt,
      ...overrides,
    }]),
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: attemptId,
    attempt_state: "prepared",
    attempt_revision: 0,
    offer_binding_sha256: offerBindingSha256,
    source_offer_evidence_sha256: sourceOfferEvidenceSha256,
    request_sha256: "c".repeat(64),
    provider_dispatch_count: 0,
    terminal_error_code: null,
    terminal_http_status: null,
    terminal_response_sha256: null,
    normalized_offer_sha256: null,
    price_amount_minor: null,
    price_currency: null,
    offer_expires_at: null,
    observed_at: null,
    owner_name: null,
    owner_iata_code: null,
    owner_identity_sha256: null,
    ...overrides,
  };
}

function journal(
  inspectValue: unknown[] = [],
): FlightConsumerProductionDuffelOfferRefreshJournalPort {
  return {
    inspect: vi.fn(async () => inspectValue),
    begin: vi.fn(async (parameters) => [{
      decision: "created",
      ...attemptRow({
        offer_binding_sha256: parameters.p_offer_binding_sha256,
        source_offer_evidence_sha256:
          parameters.p_source_offer_evidence_sha256,
        request_sha256: parameters.p_request_sha256,
      }),
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
}

function providerBody() {
  return JSON.stringify({
    data: {
      id: offerId,
      live_mode: true,
      partial: false,
      total_amount: "249.50",
      total_currency: "USD",
      expires_at: futureOfferExpiresAt,
      passenger_identity_documents_required: false,
      payment_requirements: { requires_instant_payment: true },
      owner: { name: "Example Air", iata_code: "EA" },
    },
  });
}

function transport() {
  return {
    retrieveBoundOffer: vi.fn(async (providerRequest) => {
      const body = new TextEncoder().encode(providerBody());
      return {
        status: 200,
        url: providerRequest.url,
        redirected: false,
        headers: new Headers({
          "content-type": "application/json",
          "content-length": String(body.byteLength),
        }),
        body,
      };
    }),
  } satisfies FlightConsumerProductionDuffelLiveOfferRepriceTransport;
}

describe("Flight Consumer Production Duffel live-offer refresh workflow", () => {
  it("resolves a digest-bound source, CAS-claims, and performs one GET only", async () => {
    const sources = sourcePort();
    const store = journal();
    const provider = transport();
    const result = await createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
      env,
      { offerSources: sources, journal: store, transport: provider },
    ).execute(request);

    expect(result).toMatchObject({
      state: "observed",
      replay: false,
      providerRetrieveOfferDispatchCount: 1,
      providerRequestsThisInvocation: 1,
      automaticRetryAttempted: false,
      rawProviderReferencesExposed: false,
      finalCheckoutPricingAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(JSON.stringify(result)).not.toContain(offerId);
    expect(sources.resolve).toHaveBeenCalledWith({
      p_source_shopping_attempt_id: sourceShoppingAttemptId,
      p_source_shopping_execution_scope_sha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
      p_offer_id_sha256: offerIdSha256,
    });
    expect(store.inspect).toHaveBeenCalledBefore(
      store.begin as ReturnType<typeof vi.fn>,
    );
    expect(store.begin).toHaveBeenCalledBefore(
      store.claim as ReturnType<typeof vi.fn>,
    );
    expect(store.claim).toHaveBeenCalledBefore(
      provider.retrieveBoundOffer,
    );
    expect(provider.retrieveBoundOffer).toHaveBeenCalledTimes(1);
    expect(store.begin).toHaveBeenCalledWith(expect.objectContaining({
      p_execution_scope_sha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
    }));
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      p_execution_scope_sha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
    }));
    expect(provider.retrieveBoundOffer.mock.calls[0]?.[0]).toMatchObject({
      method: "GET",
      body: null,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
    expect(store.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_execution_scope_sha256:
        FLIGHT_CONSUMER_PRODUCTION_WEBHOOK_EXECUTION_SCOPE_SHA256,
      p_terminal_state: "succeeded",
      p_provider_dispatch_count: 1,
      p_terminal_http_status: 200,
    }));
  });

  it("returns a durable succeeded replay with zero provider requests", async () => {
    const provider = transport();
    const replay = attemptRow({
      attempt_state: "succeeded",
      attempt_revision: 2,
      provider_dispatch_count: 1,
      terminal_http_status: 200,
      terminal_response_sha256: "d".repeat(64),
      normalized_offer_sha256: "e".repeat(64),
      price_amount_minor: "24950",
      price_currency: "USD",
      offer_expires_at: futureOfferExpiresAt,
      observed_at: "2026-08-27T08:00:00.000Z",
      owner_name: "Example Air",
      owner_iata_code: "EA",
      owner_identity_sha256: "f".repeat(64),
    });
    const store = journal([replay]);
    const result = await createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
      env,
      { offerSources: sourcePort(), journal: store, transport: provider },
    ).execute(request);

    expect(result).toMatchObject({
      replay: true,
      providerRequestsThisInvocation: 0,
      providerRetrieveOfferDispatchCount: 1,
    });
    expect(provider.retrieveBoundOffer).not.toHaveBeenCalled();
    expect(store.begin).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it.each(["dispatching", "failed", "ambiguous"] as const)(
    "never redispatches a durable %s attempt",
    async (state) => {
      const provider = transport();
      const store = journal([attemptRow({
        attempt_state: state,
        attempt_revision: state === "dispatching" ? 1 : 2,
        provider_dispatch_count: state === "dispatching" ? 0 : 1,
        terminal_error_code: state === "dispatching" ? null : "prior_failure",
      })]);
      await expect(
        createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
          env,
          { offerSources: sourcePort(), journal: store, transport: provider },
        ).execute(request),
      ).rejects.toMatchObject({
        status: 409,
        diagnostic: "prior_attempt_not_replayable",
      });
      expect(provider.retrieveBoundOffer).not.toHaveBeenCalled();
      expect(store.begin).not.toHaveBeenCalled();
    },
  );

  it("rejects source digest drift before journal or provider access", async () => {
    const provider = transport();
    const store = journal();
    await expect(
      createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
        env,
        {
          offerSources: sourcePort({ offer_id_sha256: "0".repeat(64) }),
          journal: store,
          transport: provider,
        },
      ).execute(request),
    ).rejects.toMatchObject({
      status: 409,
      diagnostic: "source_offer_binding_rejected",
    });
    expect(store.inspect).not.toHaveBeenCalled();
    expect(provider.retrieveBoundOffer).not.toHaveBeenCalled();
  });

  it("terminalizes transport ambiguity and authorizes no automatic retry", async () => {
    const store = journal();
    const provider = {
      retrieveBoundOffer: vi.fn(async () => {
        throw new Error("network uncertainty");
      }),
    };
    await expect(
      createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
        env,
        { offerSources: sourcePort(), journal: store, transport: provider },
      ).execute(request),
    ).rejects.toMatchObject({ status: 504, diagnostic: "transport_ambiguous" });
    expect(provider.retrieveBoundOffer).toHaveBeenCalledTimes(1);
    expect(store.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "ambiguous",
      p_provider_dispatch_count: 1,
      p_terminal_error_code: "transport_ambiguous",
    }));
  });

  it.each([
    "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED",
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED",
    "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED",
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED",
    "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
  ])("is mutually exclusive with %s", (name) => {
    expect(() => createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow({
      ...env,
      [name]: "true",
    })).toThrow(FlightConsumerProductionDuffelOfferRefreshError);
  });

  it("provides a closed one-fetch transport with exact GET semantics", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const response = new Response(providerBody(), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      Object.defineProperty(response, "url", { value: String(url) });
      return response;
    });
    const port = createFlightConsumerProductionDuffelOfferRefreshTransport(fetcher);
    const requestSignal = new AbortController().signal;
    const response = await port.retrieveBoundOffer({
      version: "flight-consumer-production-duffel-live-offer-reprice-request-v1",
      url: `https://api.duffel.com/air/offers/${offerId}?return_available_services=false`,
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Authorization: "Bearer redacted",
        "Duffel-Version": "v2",
      },
      body: null,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: requestSignal,
      executionScopeSha256: "1".repeat(64),
      authoritySha256: "2".repeat(64),
      offerBindingSha256: "3".repeat(64),
      requestSha256: "4".repeat(64),
    });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      body: null,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: requestSignal,
    });
  });

  it("contains no provider POST, order, Stripe, ticket, or servicing dependency", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/duffel-live-offer-refresh-workflow.server.ts",
      import.meta.url,
    ), "utf8");
    expect(source).not.toMatch(/method:\s*["']POST["']/);
    expect(source).not.toMatch(/\/air\/orders|api\.stripe\.com|createPaymentIntent/);
    expect(source).not.toMatch(/ticket(?:ing)?-adapter|servicing-adapter/i);
    expect(source).toContain('method: "GET"');
  });
});
