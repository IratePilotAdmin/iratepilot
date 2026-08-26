"use client";

import { useState, type FormEvent } from "react";

const endpoint = "/api/admin/flights/consumer-production/order-plan" as const;
const confirmation =
  "PLAN_ONE_DUFFEL_LIVE_OFFER_WITH_FICTIONAL_TRAVELER_WITHOUT_ORDER_OR_PAYMENT" as const;

const cabinValues = [
  "economy",
  "premium_economy",
  "business",
  "first",
] as const;

type Cabin = (typeof cabinValues)[number];

export type ProductionDuffelOrderPlanSearch = Readonly<{
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  cabin: Cabin;
}>;

export type ProductionDuffelOrderPlanReceipt = Readonly<{
  version: "flight-consumer-production-duffel-order-plan-rehearsal-result-v1";
  attemptId: string;
  state: "succeeded";
  replay: false;
  liveMode: true;
  offerCount: number;
  eligibleOfferCount: number;
  responseSha256: string;
  selectionPolicySha256: string;
  fictionalTravelerFixtureSha256: string;
  orderRequestBodySha256: string;
  orderRequestEnvelopeSha256: string;
  providerOfferRequestCount: 1;
  providerOrderDispatchCount: 0;
  stripeRequestCount: 0;
  rawProviderReferencesExposed: false;
  consumerReleaseEnabled: false;
  orderEndpointAuthorized: false;
  stripeAuthorized: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
}>;

type SubmissionResult =
  | Readonly<{ ok: true; receipt: ProductionDuffelOrderPlanReceipt }>
  | Readonly<{ ok: false; status: string }>;

export type ProductionDuffelOrderPlanClientDependencies = Readonly<{
  fetcher: typeof fetch;
}>;

const defaultDependencies: ProductionDuffelOrderPlanClientDependencies = {
  fetcher: (input, init) => globalThis.fetch(input, init),
};

const receiptKeys = [
  "version",
  "attemptId",
  "state",
  "replay",
  "liveMode",
  "offerCount",
  "eligibleOfferCount",
  "responseSha256",
  "selectionPolicySha256",
  "fictionalTravelerFixtureSha256",
  "orderRequestBodySha256",
  "orderRequestEnvelopeSha256",
  "providerOfferRequestCount",
  "providerOrderDispatchCount",
  "stripeRequestCount",
  "rawProviderReferencesExposed",
  "orderEndpointAuthorized",
  "stripeAuthorized",
  "bookingAuthorized",
  "paymentAuthorized",
  "settlementAuthorized",
  "ticketingAuthorized",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  return observed.length === expected.length
    && observed.every((key, index) => key === expected[index]);
}

function isLocalAttemptId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sanitizeReceipt(value: unknown): ProductionDuffelOrderPlanReceipt | null {
  if (
    !isRecord(value)
    || value.mode !== "duffel_live_order_plan_rehearsal"
    || value.consumerReleaseEnabled !== false
    || !isRecord(value.result)
    || !hasExactKeys(value.result, receiptKeys)
  ) {
    return null;
  }
  const result = value.result;
  if (
    result.version !== "flight-consumer-production-duffel-order-plan-rehearsal-result-v1"
    || !isLocalAttemptId(result.attemptId)
    || result.state !== "succeeded"
    || result.replay !== false
    || result.liveMode !== true
    || !Number.isInteger(result.offerCount)
    || Number(result.offerCount) < 1
    || Number(result.offerCount) > 1_000
    || !Number.isInteger(result.eligibleOfferCount)
    || Number(result.eligibleOfferCount) < 1
    || Number(result.eligibleOfferCount) > Number(result.offerCount)
    || !isSha256(result.responseSha256)
    || !isSha256(result.selectionPolicySha256)
    || !isSha256(result.fictionalTravelerFixtureSha256)
    || !isSha256(result.orderRequestBodySha256)
    || !isSha256(result.orderRequestEnvelopeSha256)
    || result.providerOfferRequestCount !== 1
    || result.providerOrderDispatchCount !== 0
    || result.stripeRequestCount !== 0
    || result.rawProviderReferencesExposed !== false
    || result.orderEndpointAuthorized !== false
    || result.stripeAuthorized !== false
    || result.bookingAuthorized !== false
    || result.paymentAuthorized !== false
    || result.settlementAuthorized !== false
    || result.ticketingAuthorized !== false
  ) {
    return null;
  }

  return Object.freeze({
    version: result.version,
    attemptId: result.attemptId,
    state: result.state,
    replay: result.replay,
    liveMode: result.liveMode,
    offerCount: Number(result.offerCount),
    eligibleOfferCount: Number(result.eligibleOfferCount),
    responseSha256: result.responseSha256,
    selectionPolicySha256: result.selectionPolicySha256,
    fictionalTravelerFixtureSha256: result.fictionalTravelerFixtureSha256,
    orderRequestBodySha256: result.orderRequestBodySha256,
    orderRequestEnvelopeSha256: result.orderRequestEnvelopeSha256,
    providerOfferRequestCount: result.providerOfferRequestCount,
    providerOrderDispatchCount: result.providerOrderDispatchCount,
    stripeRequestCount: result.stripeRequestCount,
    rawProviderReferencesExposed: result.rawProviderReferencesExposed,
    consumerReleaseEnabled: value.consumerReleaseEnabled,
    orderEndpointAuthorized: result.orderEndpointAuthorized,
    stripeAuthorized: result.stripeAuthorized,
    bookingAuthorized: result.bookingAuthorized,
    paymentAuthorized: result.paymentAuthorized,
    settlementAuthorized: result.settlementAuthorized,
    ticketingAuthorized: result.ticketingAuthorized,
  });
}

function isValidSearch(search: ProductionDuffelOrderPlanSearch) {
  return /^[A-Z]{3}$/.test(search.origin)
    && /^[A-Z]{3}$/.test(search.destination)
    && search.origin !== search.destination
    && /^\d{4}-\d{2}-\d{2}$/.test(search.departureDate)
    && (search.returnDate === ""
      || (/^\d{4}-\d{2}-\d{2}$/.test(search.returnDate)
        && search.returnDate > search.departureDate))
    && cabinValues.includes(search.cabin);
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Disposal cannot grant authority or cause an automatic retry.
  }
}

export async function submitProductionDuffelOrderPlanRehearsal(
  search: ProductionDuffelOrderPlanSearch,
  dependencies: ProductionDuffelOrderPlanClientDependencies = defaultDependencies,
): Promise<SubmissionResult> {
  if (!isValidSearch(search)) {
    return { ok: false, status: "Enter a valid bounded flight search." };
  }

  let response: Response;
  try {
    response = await dependencies.fetcher(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmation,
        search: {
          origin: search.origin,
          destination: search.destination,
          departureDate: search.departureDate,
          returnDate: search.returnDate === "" ? null : search.returnDate,
          cabin: search.cabin,
          adults: 1,
        },
      }),
    });
  } catch {
    return { ok: false, status: "The Production order-plan rehearsal is unavailable." };
  }

  if (!response.ok) {
    await discardResponseBody(response);
    return {
      ok: false,
      status: response.status === 409
        ? "The inert rehearsal gate refused this plan. No order, payment, charge, or ticket was attempted."
        : "The Production order-plan rehearsal is unavailable.",
    };
  }
  if (
    response.status !== 200
    || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    await discardResponseBody(response);
    return { ok: false, status: "The Production order-plan rehearsal is unavailable." };
  }

  try {
    const receipt = sanitizeReceipt(await response.json());
    return receipt
      ? { ok: true, receipt }
      : { ok: false, status: "The inert order-plan receipt could not be verified." };
  } catch {
    return { ok: false, status: "The inert order-plan receipt could not be verified." };
  }
}

export function ProductionDuffelOrderPlanClient() {
  const [origin, setOrigin] = useState("ORD");
  const [destination, setDestination] = useState("MIA");
  const [departureDate, setDepartureDate] = useState("2026-10-10");
  const [returnDate, setReturnDate] = useState("");
  const [cabin, setCabin] = useState<Cabin>("economy");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProductionDuffelOrderPlanReceipt | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setReceipt(null);
    const result = await submitProductionDuffelOrderPlanRehearsal({
      origin,
      destination,
      departureDate,
      returnDate,
      cabin,
    });
    if (result.ok) {
      setReceipt(result.receipt);
      setStatus("The inert order plan was hashed. Nothing was ordered, charged, or ticketed.");
    } else {
      setStatus(result.status);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="border border-amber-400 bg-amber-50 p-6" aria-labelledby="production-order-plan-title">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-900">
          Production inert rehearsal · administrator only
        </p>
        <h1 id="production-order-plan-title" className="mt-2 text-3xl text-neutral-950">
          Build a Duffel order plan without ordering or charging
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-950">
          This operator may make one live offer request, select an eligible offer only
          in server memory, and hash an order-request plan for one fictional adult.
          It cannot call the Duffel order endpoint, create a payment or charge, book
          or ticket a flight, release anything to consumers, or expose provider IDs.
        </p>
      </section>

      <form className="border border-neutral-300 bg-white p-6" onSubmit={submit} autoComplete="off">
        <fieldset disabled={busy}>
          <legend className="text-xl font-semibold text-neutral-950">One-adult inert order-plan search</legend>
          <p className="mt-2 text-sm text-neutral-600">Traveler count is fixed to one fictional adult.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="order-plan-origin">
              Origin IATA
              <input
                id="order-plan-origin"
                className="border border-neutral-300 px-3 py-2 font-normal uppercase"
                value={origin}
                onChange={(event) => setOrigin(event.target.value.toUpperCase())}
                inputMode="text"
                maxLength={3}
                pattern="[A-Z]{3}"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="order-plan-destination">
              Destination IATA
              <input
                id="order-plan-destination"
                className="border border-neutral-300 px-3 py-2 font-normal uppercase"
                value={destination}
                onChange={(event) => setDestination(event.target.value.toUpperCase())}
                inputMode="text"
                maxLength={3}
                pattern="[A-Z]{3}"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="order-plan-departure">
              Departure date
              <input
                id="order-plan-departure"
                className="border border-neutral-300 px-3 py-2 font-normal"
                type="date"
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="order-plan-return">
              Return date (optional)
              <input
                id="order-plan-return"
                className="border border-neutral-300 px-3 py-2 font-normal"
                type="date"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                min={departureDate}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="order-plan-cabin">
              Cabin
              <select
                id="order-plan-cabin"
                className="border border-neutral-300 px-3 py-2 font-normal"
                value={cabin}
                onChange={(event) => setCabin(event.target.value as Cabin)}
              >
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </label>
          </div>
          <button className="btn-primary mt-6" type="submit">
            {busy ? "Building inert plan…" : "Build hashed order plan only"}
          </button>
        </fieldset>
      </form>

      {status ? (
        <p className={`border p-4 text-sm ${receipt
          ? "border-emerald-300 bg-emerald-50 text-emerald-950"
          : "border-red-300 bg-red-50 text-red-950"}`} role="status">
          {status}
        </p>
      ) : null}

      {receipt ? (
        <section className="border border-emerald-300 bg-white p-6" aria-labelledby="order-plan-receipt-title">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-emerald-800">Sanitized digest receipt</p>
          <h2 id="order-plan-receipt-title" className="mt-2 text-2xl text-neutral-950">Inert order-plan rehearsal succeeded</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-neutral-600">Live offer requests</dt><dd className="mt-1 text-neutral-950">{receipt.providerOfferRequestCount}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Offers observed / eligible</dt><dd className="mt-1 text-neutral-950">{receipt.offerCount} / {receipt.eligibleOfferCount}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Duffel order dispatches</dt><dd className="mt-1 text-neutral-950">{receipt.providerOrderDispatchCount}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Stripe requests</dt><dd className="mt-1 text-neutral-950">{receipt.stripeRequestCount}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Order body SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.orderRequestBodySha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Order envelope SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.orderRequestEnvelopeSha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Selection policy SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.selectionPolicySha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Fictional traveler SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.fictionalTravelerFixtureSha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Response evidence SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.responseSha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Provider IDs exposed</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Order endpoint authorized</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Stripe authorized</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Booking / payment / settlement / ticketing</dt><dd className="mt-1 text-neutral-950">All disabled</dd></div>
            <div><dt className="font-semibold text-neutral-600">Consumer release</dt><dd className="mt-1 text-neutral-950">Disabled</dd></div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
