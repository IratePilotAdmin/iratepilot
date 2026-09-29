import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256 } from
  "../lib/flights/consumer-production/duffel-live-public-offer-projection.server";
import { createFlightConsumerProductionDuffelOfferReferenceEncryption } from
  "../lib/flights/consumer-production/duffel-live-public-offer-reference-encryption.server";
import { createFlightConsumerProductionPublicShoppingDispatchRuntime,
  dispatchFlightConsumerProductionPublicShopping } from
  "../lib/flights/consumer-production/public-shopping-dispatch.server";
import { deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256 } from
  "../lib/flights/consumer-production/shopping-runtime.server";

const d = (value: string) => value.repeat(64);
const search = { adults: 1, cabin: "economy" as const,
  departureDate: "2026-09-10", destination: "LHR", origin: "ORD",
  returnDate: null };
const accessToken = `duffel_live_${"x".repeat(20)}`;
const accountId = "acc_0000B9iZ8kto4H8uYhKSzO";
const sourceCommitSha = "b".repeat(40);
const runtimeEnv = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  VERCEL_GIT_COMMIT_SHA: sourceCommitSha,
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false", FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: d("2"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256: d("4"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA: sourceCommitSha,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
  FLIGHT_RUNTIME_MODE: "production", FLIGHT_RUNTIME_ENVIRONMENT: "production",
  FLIGHT_RUNTIME_ENABLED: "false", FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "false", FLIGHT_BOOKING_ENABLED: "false",
  FLIGHT_PAYMENT_ENABLED: "false", FLIGHT_SETTLEMENT_ENABLED: "false",
  FLIGHT_TICKETING_ENABLED: "false", FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "false", FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "engaged", DUFFEL_LIVE_ACCESS_TOKEN: accessToken,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID: accountId,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256:
    deriveFlightConsumerProductionDuffelAccountSha256(accountId),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(accessToken),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: "duffel-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef" };
const runtime = createFlightConsumerProductionPublicShoppingDispatchRuntime(runtimeEnv);
const binding = { admissionId: "00000000-0000-4000-8000-000000000001",
  admissionReceiptSha256: d("a"),
  admissionExecutionScopeSha256: runtime.admissionExecutionScopeSha256,
  policySha256: runtime.policySha256,
  admissionPolicySha256: runtime.admissionPolicySha256,
  cohortSha256: runtime.cohortSha256,
  subjectSha256: d("5"), admissionIdempotencySha256: d("6"),
  shoppingExecutionScopeSha256: runtime.shoppingExecutionScopeSha256 };
const publicRequestSha256 =
  deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256({
    executionScopeSha256: binding.admissionExecutionScopeSha256,
    policySha256: binding.policySha256,
    admissionPolicySha256: binding.admissionPolicySha256,
    cohortSha256: binding.cohortSha256, subjectSha256: binding.subjectSha256,
    search,
  });
const encryption = { version: "flight-consumer-live-duffel-offer-reference-encryption-v1" as const,
  algorithm: "AES-256-GCM" as const, ivBytes: 12 as const, authTagBytes: 16 as const,
  keyVersion: "kms-v1", logsPlaintext: false as const, persistsPlaintext: false as const,
  decryptImplemented: false as const, async encryptOfferReference(): Promise<never> {
    throw new Error("zero offers must not encrypt");
  } };

describe("Gate 119 public shopping dispatch orchestrator", () => {
  it("projects a zero-offer identity response and wipes the request/raw buffers", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ data: {
      id: "orq_12345678", live_mode: true, offers: [],
    } }));
    let sent: Uint8Array | undefined;
    let completed: Readonly<Record<string, unknown>> | undefined;
    const result = await dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime,
        now: () => new Date("2026-08-27T12:00:00.000Z"), encryption,
        fetch: vi.fn(async (_url, init) => {
          sent = init?.body as Uint8Array;
          expect(new Headers(init?.headers).get("accept-encoding")).toBe("identity");
          return new Response(bytes, { status: 200,
            headers: { "content-type": "application/json",
              "content-length": String(bytes.length) } });
        }) as typeof fetch,
        claim: async () => ({ decision: "created", shopping_attempt_id:
          "00000000-0000-4000-8000-000000000002",
          attempt_state: "dispatching", attempt_revision: 1,
          create_offer_request_dispatch_authorized: true }),
        terminalize: vi.fn(), recordSources: vi.fn(),
        listPendingSources: async () => [],
        completeProjection: async (value) => { completed = value; },
        readSafe: async () => [],
      },
    );
    expect(result).toMatchObject({ replay: false, offers: [],
      providerReferenceExposed: false, orderAuthorized: false,
      paymentAuthorized: false });
    expect(completed?.terminalResponseBytes).toBe(bytes.length);
    expect(sent && [...sent].every((value) => value === 0)).toBe(true);
  });

  it("records, encrypts, projects, completes, and returns one safe offer", async () => {
    const offer = { id: "off_12345678", live_mode: true, partial: false,
      total_amount: "120.00", total_currency: "USD", base_amount: "100.00",
      base_currency: "USD", tax_amount: "20.00", tax_currency: "USD",
      expires_at: "2026-08-27T14:00:00.000Z",
      passenger_identity_documents_required: false,
      payment_requirements: { requires_instant_payment: true },
      owner: { name: "Example Air", iata_code: "EA" },
      passengers: [{ type: "adult" }], conditions: {
        change_before_departure: { allowed: true, penalty_amount: "50.00",
          penalty_currency: "USD" },
        refund_before_departure: { allowed: true, penalty_amount: "70.00",
          penalty_currency: "USD" },
      }, slices: [{ origin: { iata_code: "ORD" },
        destination: { iata_code: "LHR" }, segments: [{
          marketing_carrier: { name: "Example Air", iata_code: "EA" },
          operating_carrier: { name: "Example Air", iata_code: "EA" },
          marketing_carrier_flight_number: "123",
          origin: { iata_code: "ORD", time_zone: "America/Chicago" },
          destination: { iata_code: "LHR", time_zone: "Europe/London" },
          departing_at: "2026-09-10T10:00:00",
          arriving_at: "2026-09-10T22:00:00", duration: "PT08H00M",
          passengers: [{ cabin_class: "economy" }],
        }] }],
    };
    const bytes = new TextEncoder().encode(JSON.stringify({ data: {
      id: "orq_12345678", live_mode: true, offers: [offer],
    } }));
    const offerIdSha256 = await import(
      "../lib/flights/consumer-production/duffel-live-offer-reprice.server"
    ).then(({ deriveFlightConsumerProductionDuffelLiveOfferIdSha256 }) =>
      deriveFlightConsumerProductionDuffelLiveOfferIdSha256(offer.id));
    const concreteEncryption =
      createFlightConsumerProductionDuffelOfferReferenceEncryption({
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_ENABLED: "true",
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_ENCRYPTION_KEY_BASE64URL:
          Buffer.alloc(32, 1).toString("base64url"),
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_HMAC_KEY_BASE64URL:
          Buffer.alloc(32, 2).toString("base64url"),
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_KEY_VERSION: "kms-v1",
      });
    let completed: Readonly<Record<string, unknown>> | undefined;
    const result = await dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime,
        now: () => new Date("2026-08-27T12:00:00.000Z"),
        encryption: concreteEncryption,
        fetch: vi.fn(async () => new Response(bytes, { status: 200,
          headers: { "content-type": "application/json",
            "content-length": String(bytes.length) } })) as typeof fetch,
        claim: async () => ({ decision: "created", shopping_attempt_id:
          "00000000-0000-4000-8000-000000000002",
          attempt_state: "dispatching", attempt_revision: 1,
          create_offer_request_dispatch_authorized: true }),
        terminalize: vi.fn(), recordSources: vi.fn(),
        listPendingSources: async () => [{
          source_id: "00000000-0000-4000-8000-000000000003", offer_id_sha256: offerIdSha256,
          source_offer_evidence_sha256: d("9"), expires_at: offer.expires_at,
        }],
        completeProjection: async (value) => { completed = value; },
        readSafe: async () => [{ local_offer_id: "safe-offer" }],
      },
    );
    expect(result).toMatchObject({ replay: false,
      offers: [{ local_offer_id: "safe-offer" }] });
    expect(completed?.projected).toHaveLength(1);
    expect(JSON.stringify(completed)).not.toContain(offer.id);
  });

  it("uses an exact replay only for safe reads and never fetches", async () => {
    const provider = vi.fn();
    const result = await dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime,
        fetch: provider as typeof fetch, encryption,
        claim: async () => ({ decision: "replay", shopping_attempt_id:
          "00000000-0000-4000-8000-000000000002",
          attempt_state: "succeeded", attempt_revision: 2,
          create_offer_request_dispatch_authorized: false }),
        terminalize: vi.fn(), recordSources: vi.fn(), listPendingSources: vi.fn(),
        completeProjection: vi.fn(), readSafe: async () => [{ local_offer_id: "safe" }],
      },
    );
    expect(result).toMatchObject({ replay: true, offers: [{ local_offer_id: "safe" }] });
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not misreport an in-flight replay as a valid zero-offer result", async () => {
    const readSafe = vi.fn();
    await expect(dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime, fetch: vi.fn() as typeof fetch, encryption,
        claim: async () => ({ decision: "replay", shopping_attempt_id:
          "00000000-0000-4000-8000-000000000002", attempt_state: "dispatching",
          attempt_revision: 1, create_offer_request_dispatch_authorized: false }),
        terminalize: vi.fn(), recordSources: vi.fn(), listPendingSources: vi.fn(),
        completeProjection: vi.fn(), readSafe },
    )).rejects.toMatchObject({ reason: "replay_dispatching" });
    expect(readSafe).not.toHaveBeenCalled();
  });

  it("terminalizes an uncertain transport failure without blind retry", async () => {
    let request: Uint8Array | undefined;
    const terminalize = vi.fn();
    await expect(dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime,
        encryption, fetch: vi.fn(async (_url, init) => {
          request = init?.body as Uint8Array;
          throw new TypeError("network");
        }) as typeof fetch,
        claim: async () => ({ decision: "created", shopping_attempt_id:
          "00000000-0000-4000-8000-000000000002",
          attempt_state: "dispatching", attempt_revision: 1,
          create_offer_request_dispatch_authorized: true }),
        terminalize, recordSources: vi.fn(), listPendingSources: vi.fn(),
        completeProjection: vi.fn(), readSafe: vi.fn(),
      },
    )).rejects.toMatchObject({ reason: "dispatch_failed" });
    expect(terminalize).toHaveBeenCalledWith(expect.objectContaining({ state: "ambiguous" }));
    expect(request && [...request].every((value) => value === 0)).toBe(true);
  });

  it("aborts a provider transport at the fixed timeout and terminalizes ambiguity", async () => {
    vi.useFakeTimers();
    const terminalize = vi.fn(async () => undefined);
    try {
      const run = dispatchFlightConsumerProductionPublicShopping(
        { ...binding, publicRequestSha256, search },
        { runtime,
          encryption, fetch: vi.fn((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException(
              "aborted", "AbortError",
            )), { once: true });
          })) as typeof fetch,
          claim: async () => ({ decision: "created", shopping_attempt_id:
            "00000000-0000-4000-8000-000000000002",
            attempt_state: "dispatching", attempt_revision: 1,
            create_offer_request_dispatch_authorized: true }),
          terminalize, recordSources: vi.fn(), listPendingSources: vi.fn(),
          completeProjection: vi.fn(), readSafe: vi.fn(),
        },
      );
      const rejection = expect(run).rejects.toMatchObject({
        reason: "dispatch_failed",
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(terminalize).toHaveBeenCalledWith(expect.objectContaining({
        state: "ambiguous", httpStatus: null, responseSha256: null,
      }));
    } finally { vi.useRealTimers(); }
  });

  it("is default-off before making a claim", async () => {
    const claim = vi.fn();
    await expect(dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search },
      { runtime: null,
        fetch: vi.fn() as typeof fetch,
        encryption, claim, terminalize: vi.fn(), recordSources: vi.fn(),
        listPendingSources: vi.fn(), completeProjection: vi.fn(), readSafe: vi.fn() },
    )).rejects.toMatchObject({ reason: "runtime_disabled" });
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects a substituted live token even with the approved shopping scope", async () => {
    expect(() => createFlightConsumerProductionPublicShoppingDispatchRuntime({
      ...runtimeEnv, DUFFEL_LIVE_ACCESS_TOKEN: `duffel_live_${"y".repeat(20)}`,
    })).toThrow();
  });

  it("rejects the mutually exclusive admin dark-shopping flag", () => {
    expect(() => createFlightConsumerProductionPublicShoppingDispatchRuntime({
      ...runtimeEnv, FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
    })).toThrow();
  });

  it("rejects changed search under the same admitted receipt before claim", async () => {
    const claim = vi.fn();
    await expect(dispatchFlightConsumerProductionPublicShopping(
      { ...binding, publicRequestSha256, search: { ...search, adults: 2 } },
      { runtime, fetch: vi.fn() as typeof fetch, encryption, claim,
        terminalize: vi.fn(), recordSources: vi.fn(), listPendingSources: vi.fn(),
        completeProjection: vi.fn(), readSafe: vi.fn() },
    )).rejects.toMatchObject({ reason: "admission_request_binding_refused" });
    expect(claim).not.toHaveBeenCalled();
  });
});
