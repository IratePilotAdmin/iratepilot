import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDuffelLiveOfferRepriceAdapter,
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  FlightConsumerProductionDuffelLiveOfferRepriceError,
  issueFlightConsumerProductionDuffelLiveOfferRepriceAuthority,
  type FlightConsumerProductionDuffelLiveOfferRepriceRequest,
  type FlightConsumerProductionDuffelLiveOfferRepriceResponse,
  type FlightConsumerProductionDuffelLiveOfferRepriceTransport,
} from "../lib/flights/consumer-production/duffel-live-offer-reprice.server";
import {
  deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256,
} from "../lib/flights/consumer-production/shopping-runtime.server";

const token = `duffel_live_${"L".repeat(32)}`;
const accountId = "acc_0000B9iZ8kto4H8uYhKSzO";
const offerId = "off_0000000000000001";
const issuedAt = new Date("2026-08-26T20:00:00.000Z");
const sourceOfferEvidenceSha256 = "a".repeat(64);
const sourceShoppingExecutionScopeSha256 = "b".repeat(64);

const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
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
    "dedicated-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

const authorityInput: Readonly<{
  confirmation: typeof FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION;
  offerId: string;
  sourceOfferEvidenceSha256: string;
  sourceShoppingExecutionScopeSha256: string;
}> = Object.freeze({
  confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  offerId,
  sourceOfferEvidenceSha256,
  sourceShoppingExecutionScopeSha256,
});

function providerBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: {
      id: offerId,
      live_mode: true,
      partial: false,
      total_amount: "249.50",
      total_currency: "USD",
      expires_at: "2026-08-26T20:30:00.123456Z",
      passenger_identity_documents_required: false,
      payment_requirements: { requires_instant_payment: true },
      owner: {
        id: "arl_0000000000000001",
        name: "Example Air",
        iata_code: "EA",
      },
      ...overrides,
    },
  });
}

function response(
  body = providerBody(),
  overrides: Partial<FlightConsumerProductionDuffelLiveOfferRepriceResponse> = {},
): FlightConsumerProductionDuffelLiveOfferRepriceResponse {
  const bytes = new TextEncoder().encode(body);
  return {
    status: 200,
    url: `https://api.duffel.com/air/offers/${offerId}?return_available_services=false`,
    redirected: false,
    headers: new Headers({
      "content-type": "application/json; charset=utf-8",
      "content-length": String(bytes.byteLength),
    }),
    body: bytes,
    ...overrides,
  };
}

function issued(
  overrides: Partial<typeof authorityInput> = {},
  environment: Readonly<Record<string, string | undefined>> = env,
) {
  return issueFlightConsumerProductionDuffelLiveOfferRepriceAuthority(
    { ...authorityInput, ...overrides },
    environment,
    () => issuedAt,
  );
}

function transport(
  result: FlightConsumerProductionDuffelLiveOfferRepriceResponse = response(),
) {
  return {
    retrieveBoundOffer: vi.fn(async (
      request: FlightConsumerProductionDuffelLiveOfferRepriceRequest,
    ) => {
      void request;
      return result;
    }),
  } satisfies FlightConsumerProductionDuffelLiveOfferRepriceTransport;
}

describe("Flight Consumer Production Duffel live offer reprice adapter", () => {
  it("normalizes one exact bound live offer and returns only safe evidence", async () => {
    const authority = issued();
    const port = transport();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority,
      transport: port,
      now: () => issuedAt,
    }).execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    });

    expect(result).toEqual({
      version: "flight-consumer-production-duffel-live-offer-reprice-result-v1",
      state: "repriced",
      providerCode: "duffel",
      providerEnvironment: "live",
      price: { currency: "USD", amountMinor: 24_950 },
      owner: {
        name: "Example Air",
        iataCode: "EA",
        identitySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      expiresAt: "2026-08-26T20:30:00.123Z",
      observedAt: issuedAt.toISOString(),
      evidence: {
        executionScopeSha256: authority.executionScopeSha256,
        authoritySha256: authority.authoritySha256,
        offerBindingSha256: authority.offerBindingSha256,
        offerIdSha256: deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
          offerId,
        ),
        sourceOfferEvidenceSha256,
        requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        normalizedOfferSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      providerRetrieveOfferDispatchCount: 1,
      automaticRetryAttempted: false,
      rawProviderReferencesExposed: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      refundAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/off_|duffel_live_|Authorization|arl_/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(port.retrieveBoundOffer).toHaveBeenCalledTimes(1);
    const request = port.retrieveBoundOffer.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      method: "GET",
      body: null,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      offerBindingSha256: authority.offerBindingSha256,
    });
    expect(request?.url).toBe(
      `https://api.duffel.com/air/offers/${offerId}?return_available_services=false`,
    );
    expect(request?.headers.Authorization).toBe(`Bearer ${token}`);
    expect(request?.headers["Duffel-Version"]).toBe("v2");
    fetchSpy.mockRestore();
  });

  it("is disabled by default and rejects forged authority without transport", async () => {
    await expect(
      createFlightConsumerProductionDuffelLiveOfferRepriceAdapter().execute({}),
    ).rejects.toMatchObject({
      code: "workflow_unavailable",
      providerOutcome: "not_dispatched",
    });

    const authority = issued();
    expect(() => createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority: { ...authority },
      transport: transport(),
    })).toThrow(FlightConsumerProductionDuffelLiveOfferRepriceError);
  });

  it.each([
    ["test token", { DUFFEL_LIVE_ACCESS_TOKEN: `duffel_test_${"T".repeat(32)}` }],
    ["credential mismatch", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256: "0".repeat(64),
    }],
    ["account mismatch", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "0".repeat(64),
    }],
    ["reprice gate disabled", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
    }],
    ["shopping gate still enabled", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
    }],
    ["order-plan gate still enabled", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "true",
    }],
    ["order capability enabled", {
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "true",
    }],
    ["public-shopping prerequisite lane enabled", {
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
    }],
    ["Stripe account-preflight lane enabled", {
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "true",
    }],
    ["Stripe payment-plan lane enabled", {
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "true",
    }],
  ])("fails closed before authority issuance for %s", (_label, override) => {
    expect(() => issued({}, { ...env, ...override })).toThrow(expect.objectContaining({
      code: "workflow_unavailable",
      providerOutcome: "not_dispatched",
    }));
  });

  it("binds authority to exact source scope, evidence, and offer without exposing raw IDs", () => {
    const first = issued();
    const otherOffer = issued({ offerId: "off_0000000000000002" });
    const otherEvidence = issued({ sourceOfferEvidenceSha256: "c".repeat(64) });
    const otherScope = issued({
      sourceShoppingExecutionScopeSha256: "d".repeat(64),
    });

    expect(first.offerBindingSha256).not.toBe(otherOffer.offerBindingSha256);
    expect(first.offerBindingSha256).not.toBe(otherEvidence.offerBindingSha256);
    expect(first.offerBindingSha256).not.toBe(otherScope.offerBindingSha256);
    expect(first.executionScopeSha256).not.toBe(otherOffer.executionScopeSha256);
    expect(JSON.stringify(first)).not.toContain(offerId);
    expect(JSON.stringify(first)).not.toContain(token);
    expect(first).toMatchObject({
      accountBindingVerified: true,
      credentialBindingVerified: true,
      allowedOperations: ["retrieve_offer"],
      maximumProviderDispatchCount: 1,
      orderAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      transactionKillSwitchEngaged: true,
    });
  });

  it("changes execution scope for a separately approved account or live credential", () => {
    const approved = issued();
    const rotatedToken = `duffel_live_${"R".repeat(32)}`;
    const rotatedCredential = issued({}, {
      ...env,
      DUFFEL_LIVE_ACCESS_TOKEN: rotatedToken,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
        deriveFlightConsumerProductionDuffelCredentialSha256(rotatedToken),
    });
    const otherAccountId = "acc_0000B9iZ8kto4H8uYhKSzP";
    const otherAccount = issued({}, {
      ...env,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID: otherAccountId,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256:
        deriveFlightConsumerProductionDuffelAccountSha256(otherAccountId),
    });

    expect(rotatedCredential.executionScopeSha256)
      .not.toBe(approved.executionScopeSha256);
    expect(otherAccount.executionScopeSha256)
      .not.toBe(approved.executionScopeSha256);
    expect(JSON.stringify(rotatedCredential)).not.toContain(rotatedToken);
    expect(JSON.stringify(otherAccount)).not.toContain(otherAccountId);
  });

  it("refuses mismatched request binding and consumes authority at most once", async () => {
    const authority = issued();
    const port = transport();
    const adapter = createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority,
      transport: port,
      now: () => issuedAt,
    });
    await expect(adapter.execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: "0".repeat(64),
    })).rejects.toMatchObject({ code: "request_refused" });
    expect(port.retrieveBoundOffer).not.toHaveBeenCalled();

    await adapter.execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    });
    await expect(adapter.execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    })).rejects.toMatchObject({
      code: "authority_consumed",
      providerOutcome: "not_dispatched",
    });
    expect(port.retrieveBoundOffer).toHaveBeenCalledTimes(1);
  });

  it("captures the issued authority even if a caller later mutates its dependency envelope", async () => {
    const authority = issued();
    const replacementAuthority = issued({ offerId: "off_0000000000000002" });
    const port = transport();
    const dependencies = {
      authority,
      transport: port,
      now: () => issuedAt,
    };
    const adapter = createFlightConsumerProductionDuffelLiveOfferRepriceAdapter(
      dependencies,
    );
    dependencies.authority = replacementAuthority;

    await adapter.execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    });
    await expect(adapter.execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    })).rejects.toMatchObject({ code: "authority_consumed" });
    expect(port.retrieveBoundOffer).toHaveBeenCalledTimes(1);
  });

  it("refuses expired authority before dispatch", async () => {
    const authority = issued();
    const port = transport();
    await expect(createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority,
      transport: port,
      now: () => new Date("2026-08-26T20:01:00.001Z"),
    }).execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    })).rejects.toMatchObject({
      code: "authority_expired",
      providerOutcome: "not_dispatched",
    });
    expect(port.retrieveBoundOffer).not.toHaveBeenCalled();
  });

  it.each([
    ["test mode", { live_mode: false }, "provider_contract_refused"],
    ["mismatched offer", { id: "off_0000000000000002" }, "offer_mismatch"],
    ["expired offer", { expires_at: issuedAt.toISOString() }, "offer_expired"],
    ["offset expiry", {
      expires_at: "2026-08-26T15:30:00.000-05:00",
    }, "provider_contract_refused"],
    ["impossible expiry", {
      expires_at: "2026-02-31T20:30:00.000Z",
    }, "provider_contract_refused"],
    ["malformed amount", { total_amount: "249.5" }, "provider_contract_refused"],
    ["wrong currency", { total_currency: "CAD" }, "provider_contract_refused"],
    ["partial offer", { partial: true }, "provider_contract_refused"],
    ["non-instant payment", {
      payment_requirements: { requires_instant_payment: false },
    }, "provider_contract_refused"],
    ["identity documents", {
      passenger_identity_documents_required: true,
    }, "provider_contract_refused"],
    ["malformed owner", {
      owner: { name: " Example Air", iata_code: "EA" },
    }, "provider_contract_refused"],
  ])("refuses %s response evidence", async (_label, override, code) => {
    const authority = issued();
    const port = transport(response(providerBody(override)));
    await expect(createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority,
      transport: port,
      now: () => issuedAt,
    }).execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: authority.offerBindingSha256,
    })).rejects.toMatchObject({ code, blindRetryAuthorized: false });
    expect(port.retrieveBoundOffer).toHaveBeenCalledTimes(1);
  });

  it("classifies transport ambiguity and provider rejection without retry", async () => {
    const ambiguousAuthority = issued();
    const ambiguous = {
      retrieveBoundOffer: vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    };
    await expect(createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority: ambiguousAuthority,
      transport: ambiguous,
      now: () => issuedAt,
    }).execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: ambiguousAuthority.offerBindingSha256,
    })).rejects.toMatchObject({
      code: "transport_ambiguous",
      providerOutcome: "ambiguous",
      blindRetryAuthorized: false,
    });
    expect(ambiguous.retrieveBoundOffer).toHaveBeenCalledTimes(1);

    const rejectedAuthority = issued();
    const rejected = transport(response("{}", { status: 404 }));
    await expect(createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
      authority: rejectedAuthority,
      transport: rejected,
      now: () => issuedAt,
    }).execute({
      confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
      offerBindingSha256: rejectedAuthority.offerBindingSha256,
    })).rejects.toMatchObject({
      code: "provider_rejected",
      providerOutcome: "definitive_failure",
      blindRetryAuthorized: false,
    });
    expect(rejected.retrieveBoundOffer).toHaveBeenCalledTimes(1);
  });

  it("bounds a transport that ignores cancellation and aborts the exact request", async () => {
    vi.useFakeTimers();
    try {
      const authority = issued();
      const stalled = {
        retrieveBoundOffer: vi.fn((
          request: FlightConsumerProductionDuffelLiveOfferRepriceRequest,
        ) => {
          void request;
          return new Promise<FlightConsumerProductionDuffelLiveOfferRepriceResponse>(
            () => undefined,
          );
        }),
      };
      const refusal = expect(
        createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
          authority,
          transport: stalled,
          now: () => issuedAt,
        }).execute({
          confirmation:
            FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
          offerBindingSha256: authority.offerBindingSha256,
        }),
      ).rejects.toMatchObject({
        code: "transport_ambiguous",
        providerOutcome: "ambiguous",
        blindRetryAuthorized: false,
      });

      await vi.advanceTimersByTimeAsync(30_001);
      await refusal;
      expect(stalled.retrieveBoundOffer).toHaveBeenCalledTimes(1);
      expect(stalled.retrieveBoundOffer.mock.calls[0]?.[0].signal.aborted)
        .toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("contains no route, persistence, order, payment, Stripe, or global provider transport", () => {
    const source = readFileSync(new URL(
      "../lib/flights/consumer-production/duffel-live-offer-reprice.server.ts",
      import.meta.url,
    ), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
      .map((match) => match[1]);

    expect(imports).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/supabase|stripe|route|order-transport|payment/i),
    ]));
    expect(source).not.toMatch(/\bfetch\s*\(|createAdminClient|api\.stripe\.com/);
    expect(source).not.toMatch(/createOrder|createPaymentIntent|capturePayment|refundPayment/);
    expect(source).toContain("retrieveBoundOffer(request)");
  });
});
