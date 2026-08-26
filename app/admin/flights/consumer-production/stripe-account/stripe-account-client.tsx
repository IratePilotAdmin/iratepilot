"use client";

import { useState } from "react";

const endpoint = "/api/admin/flights/consumer-production/stripe-account";
const expectedMode = "flight_consumer_production_stripe_account_preflight" as const;
const expectedVersion =
  "flight-consumer-production-stripe-account-preflight-result-v1" as const;
const sha256Pattern = /^[0-9a-f]{64}$/;

const outerReceiptKeys = [
  "consumerReleaseEnabled",
  "mode",
  "result",
] as const;
const resultReceiptKeys = [
  "accountBindingMatched",
  "accountObjectVerified",
  "accountProjectionSha256",
  "accountSha256",
  "chargeCount",
  "chargesEnabled",
  "consumerReleaseEnabled",
  "credentialBindingMatched",
  "defaultCurrencyUsd",
  "detailsSubmitted",
  "executionScopeSha256",
  "liveMode",
  "orderEndpointAuthorized",
  "paymentAuthorized",
  "paymentIntentCount",
  "providerOrderDispatchCount",
  "providerReadCount",
  "publishableKeyBindingMatched",
  "rawProviderReferencesExposed",
  "rawProviderResponseStored",
  "ready",
  "refundCount",
  "settlementAuthorized",
  "stripeMutationCount",
  "stripeRequestCount",
  "ticketDispatchCount",
  "ticketingAuthorized",
  "version",
] as const;

export type ProductionStripeAccountReceipt = Readonly<{
  version: typeof expectedVersion;
  ready: true;
  liveMode: true;
  executionScopeSha256: string;
  accountSha256: string;
  accountProjectionSha256: string;
  accountObjectVerified: true;
  accountBindingMatched: true;
  credentialBindingMatched: true;
  publishableKeyBindingMatched: true;
  chargesEnabled: true;
  detailsSubmitted: true;
  defaultCurrencyUsd: true;
  providerReadCount: 1;
  stripeRequestCount: 1;
  stripeMutationCount: 0;
  paymentIntentCount: 0;
  chargeCount: 0;
  refundCount: 0;
  providerOrderDispatchCount: 0;
  ticketDispatchCount: 0;
  rawProviderReferencesExposed: false;
  rawProviderResponseStored: false;
  orderEndpointAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  consumerReleaseEnabled: false;
}>;

export type ProductionStripeAccountClientDependencies = Readonly<{
  fetcher: typeof fetch;
}>;

type SubmissionResult =
  | Readonly<{ ok: true; receipt: ProductionStripeAccountReceipt }>
  | Readonly<{ ok: false; status: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  return observed.length === expected.length
    && observed.every((key, index) => key === expected[index]);
}

function parseReceipt(value: unknown): ProductionStripeAccountReceipt | null {
  if (!isRecord(value) || !hasExactKeys(value, outerReceiptKeys)) return null;
  if (
    value.mode !== expectedMode
    || value.consumerReleaseEnabled !== false
    || !isRecord(value.result)
    || !hasExactKeys(value.result, resultReceiptKeys)
  ) {
    return null;
  }

  const result = value.result;
  if (
    result.version !== expectedVersion
    || result.ready !== true
    || result.liveMode !== true
    || typeof result.executionScopeSha256 !== "string"
    || !sha256Pattern.test(result.executionScopeSha256)
    || typeof result.accountSha256 !== "string"
    || !sha256Pattern.test(result.accountSha256)
    || typeof result.accountProjectionSha256 !== "string"
    || !sha256Pattern.test(result.accountProjectionSha256)
    || result.accountObjectVerified !== true
    || result.accountBindingMatched !== true
    || result.credentialBindingMatched !== true
    || result.publishableKeyBindingMatched !== true
    || result.chargesEnabled !== true
    || result.detailsSubmitted !== true
    || result.defaultCurrencyUsd !== true
    || result.providerReadCount !== 1
    || result.stripeRequestCount !== 1
    || result.stripeMutationCount !== 0
    || result.paymentIntentCount !== 0
    || result.chargeCount !== 0
    || result.refundCount !== 0
    || result.providerOrderDispatchCount !== 0
    || result.ticketDispatchCount !== 0
    || result.rawProviderReferencesExposed !== false
    || result.rawProviderResponseStored !== false
    || result.orderEndpointAuthorized !== false
    || result.paymentAuthorized !== false
    || result.settlementAuthorized !== false
    || result.ticketingAuthorized !== false
    || result.consumerReleaseEnabled !== false
  ) {
    return null;
  }

  return Object.freeze({
    version: expectedVersion,
    ready: true,
    liveMode: true,
    executionScopeSha256: result.executionScopeSha256,
    accountSha256: result.accountSha256,
    accountProjectionSha256: result.accountProjectionSha256,
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
}

export async function submitProductionStripeAccountPreflight(
  confirmation: string,
  dependencies: ProductionStripeAccountClientDependencies = {
    fetcher: (input, init) => globalThis.fetch(input, init),
  },
): Promise<SubmissionResult> {
  try {
    const response = await dependencies.fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify({ confirmation }),
    });
    if (
      !response.ok
      || response.status !== 200
      || response.headers.get("content-type")
        ?.toLowerCase().startsWith("application/json") !== true
    ) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        status: "The Production Stripe account preflight is unavailable.",
      };
    }
    const receipt = parseReceipt(await response.json());
    if (receipt === null) {
      return {
        ok: false,
        status: "The read-only Stripe account receipt could not be verified.",
      };
    }
    return { ok: true, receipt };
  } catch {
    return {
      ok: false,
      status: "The Production Stripe account preflight is unavailable.",
    };
  }
}

export function ProductionStripeAccountClient({ confirmation }: Readonly<{
  confirmation: string;
}>) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "No Stripe request has been made. Consumer release and every payment mutation remain disabled.",
  );
  const [receipt, setReceipt] = useState<ProductionStripeAccountReceipt | null>(null);

  async function runPreflight() {
    if (busy) return;
    setBusy(true);
    setReceipt(null);
    setStatus("Running one read-only Stripe account request…");
    const result = await submitProductionStripeAccountPreflight(confirmation);
    if (result.ok) {
      setReceipt(result.receipt);
      setStatus(
        "The approved live Stripe account and credential binding matched. No payment or booking action was authorized.",
      );
    } else {
      setStatus(result.status);
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Read-only Production gate
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          Verify the exact Stripe account binding
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          This explicit check can retrieve the Stripe platform account once. It cannot
          create, authorize, capture, or refund a PaymentIntent or charge; call a Duffel
          order endpoint; dispatch a ticket; process a webhook; or release consumer booking.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={runPreflight}
            type="button"
          >
            {busy ? "Checking account binding…" : "Verify Stripe account only"}
          </button>
          <p aria-live="polite" className="text-sm text-neutral-600" role="status">
            {status}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <h2 className="font-semibold">Mutation boundary remains closed</h2>
        <p className="mt-2 leading-6">
          Stripe mutations, PaymentIntents, charges, refunds, provider orders, tickets,
          settlement, and consumer release must all remain at zero or disabled. A successful
          account receipt is configuration evidence only and never authorizes launch.
        </p>
      </section>

      {receipt ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-950">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Verified read-only receipt
          </p>
          <h2 className="mt-2 text-xl font-semibold">Exact live account binding matched</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="font-semibold">Charges enabled</dt><dd className="mt-1">Yes</dd></div>
            <div><dt className="font-semibold">Publishable key binding</dt><dd className="mt-1">Matched</dd></div>
            <div><dt className="font-semibold">Account details submitted</dt><dd className="mt-1">Yes</dd></div>
            <div><dt className="font-semibold">Default currency</dt><dd className="mt-1">USD</dd></div>
            <div><dt className="font-semibold">Stripe read requests</dt><dd className="mt-1">{receipt.stripeRequestCount}</dd></div>
            <div><dt className="font-semibold">Stripe mutations</dt><dd className="mt-1">{receipt.stripeMutationCount}</dd></div>
            <div><dt className="font-semibold">PaymentIntents / charges / refunds</dt><dd className="mt-1">{receipt.paymentIntentCount} / {receipt.chargeCount} / {receipt.refundCount}</dd></div>
            <div><dt className="font-semibold">Provider orders / tickets</dt><dd className="mt-1">{receipt.providerOrderDispatchCount} / {receipt.ticketDispatchCount}</dd></div>
            <div><dt className="font-semibold">Payment authorized</dt><dd className="mt-1">No</dd></div>
            <div><dt className="font-semibold">Consumer release</dt><dd className="mt-1">Disabled</dd></div>
          </dl>
          <div className="mt-5 border-t border-emerald-200 pt-4">
            <p className="font-semibold">Account binding digest</p>
            <code className="mt-1 block break-all text-xs">{receipt.accountSha256}</code>
          </div>
        </section>
      ) : null}
    </div>
  );
}
