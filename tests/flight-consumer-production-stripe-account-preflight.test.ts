import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionStripeAccountPreflightWorkflow,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_TIMEOUT_MS,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_URL,
} from "../lib/flights/consumer-production/stripe-account-preflight.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";
import { deriveFlightConsumerProductionDuffelCredentialSha256 } from "../lib/flights/consumer-production/shopping-runtime.server";
import {
  deriveFlightConsumerProductionStripeAccountSha256,
  deriveFlightConsumerProductionStripeCredentialSha256,
  deriveFlightConsumerProductionStripePublishableKeySha256,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
} from "../lib/flights/consumer-production/stripe-runtime.server";

const duffelToken = `duffel_live_${"D".repeat(32)}`;
const stripeCredential = `rk_live_${"R".repeat(32)}`;
const stripePublishableKey = `pk_live_${"P".repeat(32)}`;
const accountId = "acct_1234567890abcdef";
const request = Object.freeze({
  confirmation:
    FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
});
const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "true",
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
  DUFFEL_LIVE_ACCESS_TOKEN: duffelToken,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "a".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(duffelToken),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "dedicated-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY: stripeCredential,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256:
    deriveFlightConsumerProductionStripeAccountSha256(accountId),
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionStripeCredentialSha256(stripeCredential),
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PUBLISHABLE_KEY_SHA256:
    deriveFlightConsumerProductionStripePublishableKeySha256(
      stripePublishableKey,
    ),
}) satisfies Record<string, string>;

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: accountId,
    object: "account",
    charges_enabled: true,
    details_submitted: true,
    default_currency: "usd",
    business_profile: {
      name: "Private business name",
      support_email: "private@example.test",
    },
    external_accounts: {
      object: "list",
      data: [{ id: "ba_private_reference" }],
    },
    ...overrides,
  };
}

function jsonResponse(
  value: unknown = account(),
  init: ResponseInit = {},
) {
  return new Response(JSON.stringify(value), {
    status: 200,
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

describe("Flight Consumer Production Stripe account preflight", () => {
  it("makes exactly one bounded GET and returns only safe zero-mutation evidence", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe(FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_URL);
      expect(init).toMatchObject({
        method: "GET",
        redirect: "error",
        cache: "no-store",
      });
      expect(init).not.toHaveProperty("body");
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("accept-encoding")).toBe("identity");
      expect(headers.get("authorization")).toBe(`Bearer ${stripeCredential}`);
      expect(headers.has("idempotency-key")).toBe(false);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse();
    });

    const result = await createFlightConsumerProductionStripeAccountPreflightWorkflow(
      env,
      { fetcher },
    ).execute(request);

    expect(result).toEqual({
      version: "flight-consumer-production-stripe-account-preflight-result-v1",
      ready: true,
      liveMode: true,
      executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      accountSha256: deriveFlightConsumerProductionStripeAccountSha256(accountId),
      accountProjectionSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      accountObjectVerified: true,
      accountBindingMatched: true,
      credentialBindingMatched: true,
      publishableKeyBindingMatched: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      defaultCurrencyUsd: true,
      providerReadCount: 1,
      stripeRequestCount: 1,
      stripeMutationCount: 0,
      paymentIntentCount: 0,
      chargeCount: 0,
      refundCount: 0,
      providerOrderDispatchCount: 0,
      ticketDispatchCount: 0,
      rawProviderReferencesExposed: false,
      rawProviderResponseStored: false,
      orderEndpointAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.accountProjectionSha256).toBe(sha256FlightEvidence({
      version: "flight-consumer-production-stripe-account-projection-v1",
      executionScopeSha256: result.executionScopeSha256,
      accountSha256: result.accountSha256,
      accountObjectVerified: true,
      publishableKeyBindingMatched: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      defaultCurrencyUsd: true,
    }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(accountId);
    expect(serialized).not.toContain(stripeCredential);
    expect(serialized).not.toContain(stripePublishableKey);
    expect(serialized).not.toContain("Private business name");
    expect(serialized).not.toContain("private@example.test");
    expect(serialized).not.toContain("ba_private_reference");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_TIMEOUT_MS).toBe(15_000);
  });

  it("zeros every provider response chunk after projection", async () => {
    const raw = new TextEncoder().encode(JSON.stringify(account()));
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(raw);
        controller.close();
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await createFlightConsumerProductionStripeAccountPreflightWorkflow(env, {
      fetcher: vi.fn(async () => response),
    }).execute(request);

    expect([...raw]).toEqual(new Array(raw.byteLength).fill(0));
  });

  it.each([
    ["wrong object", account({ object: "customer" }), "provider_contract_refused"],
    ["missing account id", account({ id: undefined }), "provider_contract_refused"],
    ["malformed account id", account({ id: "acct_bad!" }), "provider_contract_refused"],
    ["charges disabled", account({ charges_enabled: false }), "provider_contract_refused"],
    ["details incomplete", account({ details_submitted: false }), "provider_contract_refused"],
    ["non-USD default", account({ default_currency: "eur" }), "provider_contract_refused"],
    [
      "wrong approved account",
      account({ id: "acct_fedcba0987654321" }),
      "account_binding_mismatch",
    ],
  ])("rejects %s without a retry", async (_label, body, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(body));
    await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
      env,
      { fetcher },
    ).execute(request)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects, non-200 responses, and non-JSON media types", async () => {
    const redirected = jsonResponse();
    Object.defineProperty(redirected, "redirected", { value: true });
    const cases: readonly [Response, string][] = [
      [redirected, "provider_redirect_refused"],
      [jsonResponse({ error: "denied" }, { status: 401 }), "provider_status_refused"],
      [new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }), "provider_media_type_refused"],
    ];

    for (const [response, code] of cases) {
      const fetcher = vi.fn<typeof fetch>(async () => response);
      await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
        env,
        { fetcher },
      ).execute(request)).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["invalid declared length", "invalid"],
    ["negative declared length", "-1"],
    [
      "oversized declared length",
      String(FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES + 1),
    ],
  ])("rejects %s before parsing", async (_label, contentLength) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(account(), {
      headers: {
        "content-type": "application/json",
        "content-length": contentLength,
      },
    }));
    await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
      env,
      { fetcher },
    ).execute(request)).rejects.toMatchObject({ code: "provider_response_refused" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized streamed body without retrying", async () => {
    const body = new Uint8Array(
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES + 1,
    );
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
      env,
      { fetcher },
    ).execute(request)).rejects.toMatchObject({ code: "provider_response_refused" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
    ["malformed JSON", new TextEncoder().encode("{not-json")],
  ])("rejects %s strictly", async (_label, body) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
      env,
      { fetcher },
    ).execute(request)).rejects.toMatchObject({ code: "provider_contract_refused" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never calls Stripe when runtime authority is incomplete", () => {
    const fetcher = vi.fn();
    expect(() => createFlightConsumerProductionStripeAccountPreflightWorkflow({
      ...env,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
    }, { fetcher: fetcher as typeof fetch })).toThrow(
      expect.objectContaining({ code: "runtime_unavailable" }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects caller-controlled fields and wrong confirmation before fetch", async () => {
    const unsafeInputs = [
      {},
      { confirmation: "VERIFY_AND_CHARGE" },
      { ...request, paymentIntentId: "pi_caller_controlled" },
      { ...request, accountId },
      { ...request, amount: 1 },
    ];

    for (const input of unsafeInputs) {
      const fetcher = vi.fn();
      await expect(createFlightConsumerProductionStripeAccountPreflightWorkflow(
        env,
        { fetcher: fetcher as typeof fetch },
      ).execute(input)).rejects.toMatchObject({
        status: 409,
        diagnostic: "request_contract_refused",
      });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("maps a transport exception to one safe failure and never retries", async () => {
    const privateMessage = `${stripeCredential}: socket lost`;
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error(privateMessage);
    });
    let thrown: unknown;
    try {
      await createFlightConsumerProductionStripeAccountPreflightWorkflow(
        env,
        { fetcher },
      ).execute(request);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "provider_unavailable" });
    expect(String(thrown)).not.toContain(privateMessage);
    expect(String(thrown)).not.toContain(stripeCredential);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the implementation server-only and excludes every Stripe mutation transport", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/stripe-account-preflight.server.ts",
      import.meta.url,
    ), "utf8");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toContain("STRIPE_SECRET_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(source.match(/await fetcher\s*\(/g)).toHaveLength(1);
    expect(source).toContain('method: "GET"');
    expect(source).toContain('redirect: "error"');
    expect(source).not.toMatch(/method:\s*["']POST["']/);
    expect(source).not.toMatch(/\bbody\s*:/);
    expect(source).not.toMatch(/Idempotency-Key/i);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/\.paymentIntents\.|\.charges\.|\.refunds\./);
    expect(source).not.toMatch(/\/v1\/(?:payment_intents|charges|refunds|orders)/);
    expect(source).not.toMatch(/createAdminClient|supabase\/migrations/);
    expect(source).toContain("rawBody?.fill(0)");
    expect(source).toContain(
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES",
    );
  });
});
