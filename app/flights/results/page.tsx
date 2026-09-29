import Link from "next/link";
import { ArrowRight, Clock3, Plane, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { formatFlightCabin, parseFlightSearch } from "@/lib/flights/search";
import {
  buildSyntheticFlightOffers,
  flightSearchQueryString,
  formatSyntheticFlightMoney,
} from "@/lib/flights/synthetic-marketplace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FlightResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const search = parseFlightSearch(await searchParams);
  const offers = search.query ? await buildSyntheticFlightOffers(search.query) : [];
  const queryString = search.query ? flightSearchQueryString(search.query) : "";
  return (
    <>
      <SiteHeader />
      <main className="container-page py-12">
        <div className="flex flex-col justify-between gap-6 border-b border-neutral-300 pb-8 lg:flex-row lg:items-end">
          <div>
            <span className="section-kicker">Synthetic flight marketplace</span>
            <h1 className="mt-3 text-4xl">Test the shopping journey without contacting an airline.</h1>
            <p className="mt-3 max-w-3xl text-neutral-600">These options are deterministic product fixtures—not schedules, fares, availability, or offers from Duffel or an airline.</p>
          </div>
          <div className="inline-flex items-center gap-3 border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950"><ShieldCheck className="h-5 w-5" /><span><strong className="block">Preview only</strong>No booking, payment, hold, or ticket</span></div>
        </div>

        {search.errors.length > 0 ? (
          <section className="mt-8 border border-red-300 bg-red-50 p-6" role="alert">
            <h2 className="text-2xl">Check the flight request</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-red-900">{search.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            <Link href="/flights" className="btn-secondary mt-6 inline-flex">Return to flight planning</Link>
          </section>
        ) : search.query ? (
          <>
            <section className="mt-8 border border-black bg-neutral-950 p-6 text-white">
              <strong className="text-2xl">{search.query.origin} → {search.query.destination}</strong>
              <p className="mt-2 text-sm text-neutral-300">{search.query.tripType === "roundtrip" ? "Round trip" : "One way"} · {search.query.travelers} traveler{search.query.travelers === 1 ? "" : "s"} · {formatFlightCabin(search.query.cabin)}</p>
            </section>
            <section className="mt-7 grid gap-5" aria-label="Synthetic flight options">
              {offers.map((offer) => {
                const outbound = offer.slices[0];
                return <article key={offer.id} className="grid gap-6 border border-neutral-300 bg-white p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-3"><Plane className="h-5 w-5" /><strong>{offer.carrierName}</strong><span className="badge">Synthetic fixture</span></div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <div><span className="text-xs uppercase tracking-wider text-neutral-500">Depart</span><strong className="mt-1 block">{new Date(outbound.departureAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</strong><span className="text-sm text-neutral-500">{outbound.origin}</span></div>
                      <div><span className="text-xs uppercase tracking-wider text-neutral-500">Journey</span><strong className="mt-1 flex items-center gap-2"><Clock3 className="h-4 w-4" />{Math.floor(outbound.durationMinutes / 60)}h {outbound.durationMinutes % 60}m</strong><span className="text-sm text-neutral-500">{offer.stopCount ? `${offer.stopCount} test stop` : "Nonstop fixture"}</span></div>
                      <div><span className="text-xs uppercase tracking-wider text-neutral-500">Arrive</span><strong className="mt-1 block">{new Date(outbound.arrivalAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</strong><span className="text-sm text-neutral-500">{outbound.destination}</span></div>
                    </div>
                  </div>
                  <div className="min-w-48 border-t pt-5 text-left lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 lg:text-right">
                    <span className="text-sm text-neutral-500">Synthetic total</span><strong className="mt-1 block text-3xl">{formatSyntheticFlightMoney(offer.totalAmount)}</strong><span className="text-xs text-neutral-500">all travelers · not chargeable</span><Link href={`/flights/offers/${encodeURIComponent(offer.id)}?${queryString}`} className="btn-primary mt-5 inline-flex items-center gap-2">Review fixture <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </article>;
              })}
            </section>
          </>
        ) : (
          <section className="mt-8 border border-neutral-300 p-7"><h2 className="text-2xl">Start with a flight request</h2><Link href="/flights" className="btn-primary mt-5 inline-flex">Open flight planner</Link></section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
