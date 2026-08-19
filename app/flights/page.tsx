import type { Metadata } from "next";
import { ArrowRight, CalendarDays, CircleDollarSign, Plane, Route, ShieldCheck, TicketCheck, Users } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { flightCabins, formatFlightCabin, formatFlightDate, parseFlightSearch } from "@/lib/flights/search";

export const metadata: Metadata = {
  title: "Flight planning preview",
  description: "Prepare a flight search request while live airline inventory, fares, ticketing, and payments remain disabled.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FlightsPage({ searchParams }: { searchParams: SearchParams }) {
  const search = parseFlightSearch(await searchParams);
  const { values } = search;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-neutral-200 bg-[#f4f1eb]">
          <div className="container-page grid gap-12 py-14 lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:py-20">
            <div>
              <span className="section-kicker">Flights · Phase 1</span>
              <h1 className="mt-4 text-5xl text-neutral-950 sm:text-6xl">Plan the route. Keep every fare claim grounded.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                Prepare a flight request by airport, date, cabin, and party size. Airline inventory is not connected yet, so iRatePilot does not display live schedules, prices, availability, or tickets in this phase.
              </p>
              <div className="mt-7 inline-flex items-center gap-3 border border-neutral-400 bg-white px-4 py-3 text-sm">
                <ShieldCheck className="h-5 w-5" />
                <span><strong className="block">Supplier-offline planning preview</strong><small className="text-neutral-500">No airline API request or payment is made</small></span>
              </div>
            </div>

            <form action="/flights" method="get" className="border border-black bg-white p-5 sm:p-7">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Trip type
                  <select name="tripType" defaultValue={values.tripType} className="input mt-2">
                    <option value="roundtrip">Round trip</option>
                    <option value="oneway">One way</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Travelers
                  <select name="travelers" defaultValue={values.travelers} className="input mt-2">
                    {Array.from({ length: 9 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  From
                  <input name="origin" defaultValue={values.origin} className="input mt-2 uppercase" placeholder="ORD" maxLength={3} pattern="[A-Za-z]{3}" autoComplete="off" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  To
                  <input name="destination" defaultValue={values.destination} className="input mt-2 uppercase" placeholder="MIA" maxLength={3} pattern="[A-Za-z]{3}" autoComplete="off" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Depart
                  <input name="departureDate" defaultValue={values.departureDate} className="input mt-2" type="date" min={today} required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Return {values.tripType === "oneway" && <span className="normal-case tracking-normal text-neutral-400">(ignored for one way)</span>}
                  <input name="returnDate" defaultValue={values.returnDate} className="input mt-2" type="date" min={values.departureDate || today} required={values.tripType === "roundtrip"} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600 sm:col-span-2">
                  Cabin
                  <select name="cabin" defaultValue={values.cabin} className="input mt-2">
                    {flightCabins.map((cabin) => <option key={cabin} value={cabin}>{formatFlightCabin(cabin)}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn-primary mt-6 w-full gap-2">Prepare flight request <ArrowRight className="h-4 w-4" /></button>
              <p className="mt-3 text-xs leading-5 text-neutral-500">This validates planning details only. It does not reserve a seat, quote a fare, contact an airline, or create a charge.</p>
            </form>
          </div>
        </section>

        <section aria-live="polite" className="container-page py-12">
          {search.errors.length > 0 && (
            <div role="alert" className="border border-red-300 bg-red-50 p-6">
              <h2 className="text-2xl">Check the flight request</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-red-900">
                {search.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}

          {search.query && (
            <div className="grid gap-7 border border-black p-7 lg:grid-cols-[1.2fr_.8fr] lg:p-9">
              <div>
                <span className="section-kicker">Validated planning request</span>
                <h2 className="mt-3 text-4xl">{search.query.origin} <span aria-hidden="true">→</span> {search.query.destination}</h2>
                <div className="mt-7 grid gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-2">
                  <div className="bg-white p-5"><CalendarDays className="h-5 w-5" /><strong className="mt-4 block">{formatFlightDate(search.query.departureDate)}</strong><span className="mt-1 block text-sm text-neutral-500">{search.query.returnDate ? `Return ${formatFlightDate(search.query.returnDate)}` : "One-way trip"}</span></div>
                  <div className="bg-white p-5"><Users className="h-5 w-5" /><strong className="mt-4 block">{search.query.travelers} {search.query.travelers === 1 ? "traveler" : "travelers"}</strong><span className="mt-1 block text-sm text-neutral-500">{formatFlightCabin(search.query.cabin)}</span></div>
                </div>
              </div>
              <aside className="bg-neutral-950 p-6 text-white">
                <Plane className="h-6 w-6" />
                <h3 className="mt-5 text-xl font-semibold">Live fares are unavailable</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-300">The request is valid, but no approved airline, NDC, GDS, consolidator, or ticketing provider is connected. Nothing was searched externally or booked.</p>
              </aside>
            </div>
          )}
        </section>

        <section className="bg-neutral-950 py-16 text-white">
          <div className="container-page">
            <div className="max-w-3xl"><span className="section-kicker text-neutral-400">Activation boundary</span><h2 className="mt-4 text-4xl text-white">What must happen before live flight shopping.</h2><p className="mt-5 leading-7 text-neutral-300">A later phase must name the authorized content and ticketing provider, complete sandbox certification, define servicing ownership, and separately approve Production traffic.</p></div>
            <div className="mt-10 grid gap-px bg-white/20 md:grid-cols-3">
              <article className="bg-neutral-950 p-6"><Route className="h-6 w-6" /><strong className="mt-6 block">Approved content source</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Airline, NDC, GDS, or consolidator contracts and endpoint scope.</p></article>
              <article className="bg-neutral-950 p-6"><TicketCheck className="h-6 w-6" /><strong className="mt-6 block">Ticketing and servicing</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Fare rules, exchanges, cancellations, schedule changes, baggage, and support ownership.</p></article>
              <article className="bg-neutral-950 p-6"><CircleDollarSign className="h-6 w-6" /><strong className="mt-6 block">Payment authorization</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Separate flight-payment, fraud, refund, chargeback, legal, and Production approvals.</p></article>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
