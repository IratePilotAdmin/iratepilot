import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  submitProductionStripeAccountPreflight,
  type ProductionStripeAccountClientDependencies,
} from "../app/admin/flights/consumer-production/stripe-account/stripe-account-client";

const pageSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/stripe-account/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/admin/flights/consumer-production/stripe-account/stripe-account-client.tsx", import.meta.url),
  "utf8",
);
const endpoint = "/api/admin/flights/consumer-production/stripe-account";
const confirmation =
  "VERIFY_STRIPE_LIVE_ACCOUNT_WITHOUT_PAYMENT_OR_CHARGE";

function dependencies(
  fetcher: ReturnType<typeof vi.fn>,
): ProductionStripeAccountClientDependencies {
  return { fetcher: fetcher as unknown as typeof fetch };
}

function safeResult(extras: Record<string, unknown> = {}) {
  return {
    version: "flight-consumer-production-stripe-account-preflight-result-v1",
    ready: true,
    liveMode: true,
    executionScopeSha256: "a".repeat(64),
    accountSha256: "b".repeat(64),
    accountProjectionSha256: "c".repeat(64),
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
    ...extras,
  };
}

function safeResponse(
  resultExtras: Record<string, unknown> = {},
  outerExtras: Record<string, unknown> = {},
) {
  return Response.json({
    mode: "flight_consumer_production_stripe_account_preflight",
    result: safeResult(resultExtras),
    consumerReleaseEnabled: false,
    ...outerExtras,
  });
}

describe("Production Stripe read-only account preflight admin page", () => {
  it("is a Production-only uncached admin page with no indexing", () => {
    expect(pageSource).toContain('process.env.VERCEL_ENV !== "production"');
    expect(pageSource).toContain("notFound()");
    expect(pageSource).toContain('requireRole(["admin"])');
    expect(pageSource).toContain("/login?next=");
    expect(pageSource).toContain('export const dynamic = "force-dynamic"');
    expect(pageSource).toContain("export const revalidate = 0");
    expect(pageSource).toContain('export const fetchCache = "force-no-store"');
    expect(pageSource).toContain("robots: { index: false, follow: false }");
    expect(pageSource).toContain(
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION",
    );
    expect(pageSource).toContain("ProductionStripeAccountClient");
  });

  it("makes no automatic request and exposes one explicit button", () => {
    expect(clientSource).not.toMatch(/useEffect|useLayoutEffect/);
    expect(clientSource.match(/<button\b/g)).toHaveLength(1);
    expect(clientSource).toContain("Verify Stripe account only");
    expect(clientSource).toContain("onClick={runPreflight}");
  });

  it("submits only the server-provided confirmation in a same-origin POST", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionStripeAccountPreflight(
      confirmation,
      dependencies(fetcher),
    );

    expect(result).toMatchObject({
      ok: true,
      receipt: {
        accountBindingMatched: true,
        credentialBindingMatched: true,
        publishableKeyBindingMatched: true,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(new Headers(init.headers).has("idempotency-key")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ confirmation });
  });

  it("returns only the exact allowlisted hashes, booleans, and zero mutations", async () => {
    const fetcher = vi.fn().mockResolvedValue(safeResponse());
    const result = await submitProductionStripeAccountPreflight(
      confirmation,
      dependencies(fetcher),
    );

    expect(result).toEqual({ ok: true, receipt: safeResult() });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/acct_[A-Za-z0-9]+/);
    expect(serialized).not.toMatch(/(?:sk|rk|pk)_(?:live|test)_|whsec_/);
  });

  it("rejects unknown provider data, nonzero mutations, or any true authority", async () => {
    const unsafeReceipts = [
      [
        { rawAccountId: "acct_must_never_escape" },
        {},
      ],
      [{ stripeSecretKey: "sk_live_must_never_escape" }, {}],
      [{ stripeMutationCount: 1 }, {}],
      [{ paymentIntentCount: 1 }, {}],
      [{ chargeCount: 1 }, {}],
      [{ refundCount: 1 }, {}],
      [{ providerOrderDispatchCount: 1 }, {}],
      [{ ticketDispatchCount: 1 }, {}],
      [{ rawProviderReferencesExposed: true }, {}],
      [{ rawProviderResponseStored: true }, {}],
      [{ orderEndpointAuthorized: true }, {}],
      [{ paymentAuthorized: true }, {}],
      [{ settlementAuthorized: true }, {}],
      [{ ticketingAuthorized: true }, {}],
      [{ consumerReleaseEnabled: true }, {}],
      [{ publishableKeyBindingMatched: false }, {}],
      [{ accountSha256: "acct_not_a_hash" }, {}],
      [{}, { ignoredOuterProviderData: "must-not-pass" }],
    ] as const;

    for (const [resultExtras, outerExtras] of unsafeReceipts) {
      const fetcher = vi.fn().mockResolvedValue(
        safeResponse(resultExtras, outerExtras),
      );
      const result = await submitProductionStripeAccountPreflight(
        confirmation,
        dependencies(fetcher),
      );
      expect(result).toEqual({
        ok: false,
        status: "The read-only Stripe account receipt could not be verified.",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /acct_must_never_escape|sk_live_must_never_escape|ignoredOuterProviderData/,
      );
    }
  });

  it("discards error bodies and returns only generic failure text", async () => {
    const leaked = "acct_private sk_live_private provider-response-private";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ error: leaked }, { status: 503 }),
    );
    const result = await submitProductionStripeAccountPreflight(
      confirmation,
      dependencies(fetcher),
    );
    expect(result).toEqual({
      ok: false,
      status: "The Production Stripe account preflight is unavailable.",
    });
    expect(JSON.stringify(result)).not.toContain(leaked);
  });

  it("states every closed boundary and persists or logs nothing", () => {
    expect(clientSource).toContain("cannot");
    expect(clientSource).toContain("PaymentIntent");
    expect(clientSource).toContain("charge");
    expect(clientSource).toContain("refund");
    expect(clientSource).toContain("Duffel");
    expect(clientSource).toContain("ticket");
    expect(clientSource).toContain("webhook");
    expect(clientSource).toContain("consumer release");
    expect(clientSource).toContain("never authorizes launch");
    expect(clientSource).toContain("Stripe mutations");
    expect(clientSource).toContain("globalThis.fetch(input, init)");
    expect(clientSource).not.toMatch(
      /localStorage|sessionStorage|navigator\.clipboard|console\./,
    );
    expect(clientSource).not.toMatch(
      /fetch\(["'`]https:\/\/api\.stripe\.com|\/v1\/(?:payment_intents|charges|refunds)|paymentIntents?\.create|charges?\.create|refunds?\.create/i,
    );
  });
});
