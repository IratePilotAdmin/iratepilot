"use client";

import { useState, type FormEvent } from "react";

const endpoint =
  "/api/admin/flights/consumer-production/live-search" as const;
const confirmation =
  "SEARCH_DUFFEL_LIVE_INVENTORY_WITHOUT_BOOKING" as const;

const cabinValues = [
  "economy",
  "premium_economy",
  "business",
  "first",
] as const;

type Cabin = (typeof cabinValues)[number];

export type ProductionDuffelLiveShoppingSearch = Readonly<{
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  cabin: Cabin;
  adults: number;
}>;

export type ProductionDuffelLiveShoppingReceipt = Readonly<{
  version: "flight-consumer-production-duffel-shopping-result-v1";
  attemptId: string;
  state: "succeeded";
  replay: boolean;
  liveMode: true;
  offerCount: number;
  responseSha256: string;
  rawProviderReferencesExposed: false;
  consumerReleaseEnabled: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
}>;

type SubmissionResult =
  | Readonly<{ ok: true; receipt: ProductionDuffelLiveShoppingReceipt }>
  | Readonly<{ ok: false; status: string }>;

export type ProductionDuffelLiveShoppingClientDependencies = Readonly<{
  fetcher: typeof fetch;
}>;

const defaultDependencies: ProductionDuffelLiveShoppingClientDependencies = {
  // Some embedded Chromium hosts expose fetch with a receiver-sensitive
  // wrapper. Keep the native call bound to globalThis instead of storing the
  // function directly as an object method.
  fetcher: (input, init) => globalThis.fetch(input, init),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLocalAttemptId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sanitizeReceipt(value: unknown): ProductionDuffelLiveShoppingReceipt | null {
  if (!isRecord(value)
    || value.mode !== "duffel_live_shopping_dark"
    || value.consumerReleaseEnabled !== false
    || !isRecord(value.result)) {
    return null;
  }
  const result = value.result;
  if (
    result.version !== "flight-consumer-production-duffel-shopping-result-v1"
    || !isLocalAttemptId(result.attemptId)
    || result.state !== "succeeded"
    || typeof result.replay !== "boolean"
    || result.liveMode !== true
    || !Number.isInteger(result.offerCount)
    || Number(result.offerCount) < 0
    || Number(result.offerCount) > 1_000
    || !isSha256(result.responseSha256)
    || result.rawProviderReferencesExposed !== false
    || result.bookingAuthorized !== false
    || result.paymentAuthorized !== false
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
    responseSha256: result.responseSha256,
    rawProviderReferencesExposed: result.rawProviderReferencesExposed,
    consumerReleaseEnabled: value.consumerReleaseEnabled,
    bookingAuthorized: result.bookingAuthorized,
    paymentAuthorized: result.paymentAuthorized,
    ticketingAuthorized: result.ticketingAuthorized,
  });
}

function isValidSearch(search: ProductionDuffelLiveShoppingSearch) {
  return /^[A-Z]{3}$/.test(search.origin)
    && /^[A-Z]{3}$/.test(search.destination)
    && search.origin !== search.destination
    && /^\d{4}-\d{2}-\d{2}$/.test(search.departureDate)
    && (search.returnDate === ""
      || (/^\d{4}-\d{2}-\d{2}$/.test(search.returnDate)
        && search.returnDate > search.departureDate))
    && cabinValues.includes(search.cabin)
    && Number.isInteger(search.adults)
    && search.adults >= 1
    && search.adults <= 9;
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // The response is intentionally discarded; disposal cannot authorize a retry.
  }
}

export async function submitProductionDuffelLiveShoppingDiagnostic(
  search: ProductionDuffelLiveShoppingSearch,
  dependencies: ProductionDuffelLiveShoppingClientDependencies = defaultDependencies,
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmation,
        search: {
          origin: search.origin,
          destination: search.destination,
          departureDate: search.departureDate,
          returnDate: search.returnDate === "" ? null : search.returnDate,
          cabin: search.cabin,
          adults: search.adults,
        },
      }),
    });
  } catch {
    return { ok: false, status: "The Production dark shopping diagnostic is unavailable." };
  }

  if (!response.ok) {
    await discardResponseBody(response);
    return {
      ok: false,
      status: response.status === 409
        ? "The Production dark gate refused this search. No booking or charge was attempted."
        : "The Production dark shopping diagnostic is unavailable.",
    };
  }
  if (
    response.status !== 200
    || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    await discardResponseBody(response);
    return { ok: false, status: "The Production dark shopping diagnostic is unavailable." };
  }

  try {
    const receipt = sanitizeReceipt(await response.json());
    return receipt
      ? { ok: true, receipt }
      : { ok: false, status: "The Production dark receipt could not be verified." };
  } catch {
    return { ok: false, status: "The Production dark receipt could not be verified." };
  }
}

export function ProductionDuffelLiveShoppingClient() {
  const [origin, setOrigin] = useState("ORD");
  const [destination, setDestination] = useState("MIA");
  const [departureDate, setDepartureDate] = useState("2026-10-10");
  const [returnDate, setReturnDate] = useState("");
  const [cabin, setCabin] = useState<Cabin>("economy");
  const [adults, setAdults] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProductionDuffelLiveShoppingReceipt | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setReceipt(null);
    const result = await submitProductionDuffelLiveShoppingDiagnostic({
      origin,
      destination,
      departureDate,
      returnDate,
      cabin,
      adults,
    });
    if (result.ok) {
      setReceipt(result.receipt);
      setStatus("Duffel live inventory responded. The receipt proves shopping only.");
    } else {
      setStatus(result.status);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="border border-amber-400 bg-amber-50 p-6" aria-labelledby="production-dark-shopping-title">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-900">
          Production dark diagnostic · administrator only
        </p>
        <h1 id="production-dark-shopping-title" className="mt-2 text-3xl text-neutral-950">
          Search Duffel live inventory without booking or charging
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-950">
          This operator can create one live offer request and return only a sanitized
          receipt. Consumer release stays disabled. It cannot select an offer, create
          an order, collect or capture payment, issue a ticket, or expose provider IDs.
        </p>
      </section>

      <form className="border border-neutral-300 bg-white p-6" onSubmit={submit} autoComplete="off">
        <fieldset disabled={busy}>
          <legend className="text-xl font-semibold text-neutral-950">Bounded live-inventory search</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-origin">
              Origin IATA
              <input
                id="live-search-origin"
                className="border border-neutral-300 px-3 py-2 font-normal uppercase"
                value={origin}
                onChange={(event) => setOrigin(event.target.value.toUpperCase())}
                inputMode="text"
                maxLength={3}
                pattern="[A-Z]{3}"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-destination">
              Destination IATA
              <input
                id="live-search-destination"
                className="border border-neutral-300 px-3 py-2 font-normal uppercase"
                value={destination}
                onChange={(event) => setDestination(event.target.value.toUpperCase())}
                inputMode="text"
                maxLength={3}
                pattern="[A-Z]{3}"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-departure">
              Departure date
              <input
                id="live-search-departure"
                className="border border-neutral-300 px-3 py-2 font-normal"
                type="date"
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-return">
              Return date (optional)
              <input
                id="live-search-return"
                className="border border-neutral-300 px-3 py-2 font-normal"
                type="date"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                min={departureDate}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-cabin">
              Cabin
              <select
                id="live-search-cabin"
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
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="live-search-adults">
              Adults
              <input
                id="live-search-adults"
                className="border border-neutral-300 px-3 py-2 font-normal"
                type="number"
                value={adults}
                onChange={(event) => setAdults(event.target.valueAsNumber)}
                min={1}
                max={9}
                step={1}
                required
              />
            </label>
          </div>
          <button className="btn-primary mt-6" type="submit">
            {busy ? "Searching live inventory…" : "Run shopping-only live diagnostic"}
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
        <section className="border border-emerald-300 bg-white p-6" aria-labelledby="live-shopping-receipt-title">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-emerald-800">Sanitized receipt</p>
          <h2 id="live-shopping-receipt-title" className="mt-2 text-2xl text-neutral-950">Shopping-only execution succeeded</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-neutral-600">Live offers observed</dt><dd className="mt-1 text-lg text-neutral-950">{receipt.offerCount}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Journal replay</dt><dd className="mt-1 text-neutral-950">{receipt.replay ? "Yes" : "No"}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Local attempt ID</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.attemptId}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Response evidence SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-950">{receipt.responseSha256}</dd></div>
            <div><dt className="font-semibold text-neutral-600">Consumer release</dt><dd className="mt-1 text-neutral-950">Disabled</dd></div>
            <div><dt className="font-semibold text-neutral-600">Provider references exposed</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Booking authorized</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Payment authorized</dt><dd className="mt-1 text-neutral-950">No</dd></div>
            <div><dt className="font-semibold text-neutral-600">Ticketing authorized</dt><dd className="mt-1 text-neutral-950">No</dd></div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
