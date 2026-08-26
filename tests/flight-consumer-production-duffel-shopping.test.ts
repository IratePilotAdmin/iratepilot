import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDarkDuffelShoppingWorkflow,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
  type FlightConsumerProductionDuffelShoppingJournalPort,
} from "../lib/flights/consumer-production/duffel-shopping.server";
import {
  deriveFlightConsumerProductionDuffelCredentialSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_CONFIRMATION,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"D".repeat(32)}`;
const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
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
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "a".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(token),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

const attemptId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-26T17:00:00.000Z");
const request = Object.freeze({
  confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_CONFIRMATION,
  search: {
    origin: "ORD",
    destination: "MIA",
    departureDate: "2026-10-10",
    returnDate: null,
    cabin: "economy" as const,
    adults: 1,
  },
});

function body(liveMode = true) {
  return JSON.stringify({
    data: {
      id: "orq_0000000000000001",
      live_mode: liveMode,
      offers: [{
        id: "off_0000000000000001",
        live_mode: liveMode,
        total_amount: "249.50",
        total_currency: "USD",
        expires_at: "2026-08-26T17:30:00.000Z",
      }],
    },
  });
}

function journal(input: Readonly<{
  decision?: "created" | "replay";
  state?: "prepared" | "succeeded" | "failed" | "ambiguous" | "dispatching";
  responseSha256?: string | null;
  offerCount?: number | null;
}> = {}) {
  const state = input.state ?? "prepared";
  const port: FlightConsumerProductionDuffelShoppingJournalPort = {
    begin: vi.fn(async () => [{
      decision: input.decision ?? "created",
      attempt_id: attemptId,
      attempt_state: state,
      attempt_revision: state === "prepared" ? 0 : state === "dispatching" ? 1 : 2,
      terminal_http_status: state === "succeeded" ? 200 : null,
      terminal_response_sha256: input.responseSha256 ?? null,
      terminal_response_bytes: state === "succeeded" ? 256 : null,
      offer_count: input.offerCount ?? null,
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

function response(payload = body(), status = 200) {
  return new Response(payload, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Flight Consumer Production Duffel shopping dark workflow", () => {
  it("performs one journaled live offer request and exposes no provider reference", async () => {
    const port = journal();
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const result = await createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request);

    expect(result).toMatchObject({
      attemptId,
      state: "succeeded",
      replay: false,
      liveMode: true,
      offerCount: 1,
      rawProviderReferencesExposed: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/off_|orq_|duffel_live_|Authorization/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("accept-encoding")).toBe("identity");
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain('"type":"adult"');
    expect(port.begin).toHaveBeenCalledWith(expect.objectContaining({
      p_execution_scope_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_idempotency_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    const journalEnvelope = JSON.stringify(
      (port.begin as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    );
    expect(journalEnvelope).not.toContain(token);
    expect(journalEnvelope).not.toContain(env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256);
    expect(journalEnvelope).not.toContain(env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256);
    expect(port.claim).toHaveBeenCalledBefore(port.complete as ReturnType<typeof vi.fn>);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "succeeded",
      p_terminal_http_status: 200,
      p_offer_count: 1,
    }));
  });

  it("bounds a decoded compressed response without comparing wire and decoded lengths", async () => {
    const port = journal();
    const payload = body();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(payload, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "47",
      },
    }));

    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher, now: () => now },
    ).execute(request)).resolves.toMatchObject({
      state: "succeeded",
      liveMode: true,
      offerCount: 1,
    });
    expect(new TextEncoder().encode(payload).byteLength).not.toBe(47);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "succeeded",
      p_terminal_response_bytes: new TextEncoder().encode(payload).byteLength,
    }));
  });

  it("replays a terminal digest receipt without contacting Duffel", async () => {
    const responseSha256 = createHash("sha256").update("terminal").digest("hex");
    const port = journal({
      decision: "replay",
      state: "succeeded",
      responseSha256,
      offerCount: 7,
    });
    const fetcher = vi.fn();
    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request)).resolves.toMatchObject({
      replay: true,
      offerCount: 7,
      responseSha256,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(port.claim).not.toHaveBeenCalled();
  });

  it("derives one stable server-owned journal key for the credential-bound scope", async () => {
    const responseSha256 = createHash("sha256").update("terminal").digest("hex");
    const first = journal({
      decision: "replay",
      state: "succeeded",
      responseSha256,
      offerCount: 7,
    });
    const second = journal({
      decision: "replay",
      state: "succeeded",
      responseSha256,
      offerCount: 7,
    });
    const fetcher = vi.fn();

    await createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: first, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request);
    await createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: second, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request);

    const firstEnvelope = (first.begin as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const secondEnvelope = (second.begin as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(firstEnvelope.p_idempotency_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(secondEnvelope.p_idempotency_sha256)
      .toBe(firstEnvelope.p_idempotency_sha256);
    expect(firstEnvelope.p_idempotency_sha256)
      .not.toBe(firstEnvelope.p_execution_scope_sha256);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects test-mode responses and records an ambiguity without leaking data", async () => {
    const port = journal();
    const fetcher = vi.fn(async () => response(body(false)));
    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 502,
      diagnostic: "provider_contract_refused",
    });
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "ambiguous",
      p_terminal_http_status: null,
      p_offer_count: null,
    }));
  });

  it("records a bounded provider rejection and never retries", async () => {
    const port = journal();
    const fetcher = vi.fn(async () => response('{"errors":[]}', 422));
    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute(request)).rejects.toMatchObject({
      status: 502,
      diagnostic: "provider_rejected",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.complete).toHaveBeenCalledWith(expect.objectContaining({
      p_terminal_state: "failed",
      p_terminal_http_status: 422,
      p_offer_count: null,
    }));
  });

  it("fails closed before dispatch when the shopping gate or confirmation is absent", async () => {
    expect(() => createFlightConsumerProductionDarkDuffelShoppingWorkflow({
      ...env,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
    })).toThrow(/could not be completed/i);
    const port = journal();
    const fetcher = vi.fn();
    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute({ ...request, confirmation: "BOOK_ONE_LIVE_FLIGHT" })).rejects.toMatchObject({
      status: 409,
      diagnostic: "request_contract_refused",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses client-controlled idempotency before journal preparation or dispatch", async () => {
    const port = journal();
    const fetcher = vi.fn();
    await expect(createFlightConsumerProductionDarkDuffelShoppingWorkflow(
      env,
      { journal: port, fetcher: fetcher as typeof fetch, now: () => now },
    ).execute({ ...request, idempotencyKey: "live-search:client-must-not-control" }))
      .rejects.toMatchObject({
        status: 409,
        diagnostic: "request_contract_refused",
      });
    expect(port.begin).not.toHaveBeenCalled();
    expect(port.claim).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
