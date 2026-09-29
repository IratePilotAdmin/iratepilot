import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, Luggage, RefreshCcw, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { formatFlightCabin, parseFlightSearch } from "@/lib/flights/search";
import {
  flightSearchQueryString,
  formatSyntheticFlightMoney,
  repriceSyntheticFlightOffer,
} from "@/lib/flights/synthetic-marketplace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ id: string }>;

export default async function SyntheticFlightOfferPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const search = parseFlightSearch(await searchParams);
  if (!search.query) notFound();
  const plan = await repriceSyntheticFlightOffer(search.query, id);
  if (!plan) notFound();
  const { offer, receipt } = plan;
  const queryString = flightSearchQueryString(search.query);
  return <><SiteHeader /><main className="container-page py-12">
    <div className="flex flex-col justify-between gap-6 border-b pb-8 lg:flex-row lg:items-end"><div><span className="section-kicker">Synthetic offer review</span><h1 className="mt-3 text-4xl">{search.query.origin} to {search.query.destination}</h1><p className="mt-3 text-neutral-600">Review a complete fixture before the real provider adapter is connected.</p></div><div className="border border-amber-400 bg-amber-50 p-4 text-sm"><strong className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />No commercial authority</strong><span className="mt-1 block">Repricing passed only against local deterministic data.</span></div></div>
    <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-5">
        {offer.slices.map((slice, index) => <article className="border border-neutral-300 p-6" key={`${slice.origin}-${slice.destination}`}><span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{index === 0 ? "Outbound" : "Return"}</span><div className="mt-4 flex flex-wrap items-center justify-between gap-5"><div><strong className="text-2xl">{slice.origin} → {slice.destination}</strong><p className="mt-1 text-sm text-neutral-500">{new Date(slice.departureAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p></div><div><strong>{slice.carrierName}</strong><p className="text-sm text-neutral-500">Synthetic {slice.flightNumber}</p></div><div><strong className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{Math.floor(slice.durationMinutes / 60)}h {slice.durationMinutes % 60}m</strong><p className="text-sm text-neutral-500">Fixture duration</p></div></div></article>)}
        <article className="grid gap-5 border border-neutral-300 p-6 sm:grid-cols-3"><div><Luggage className="h-5 w-5" /><strong className="mt-3 block">Baggage</strong><p className="mt-2 text-sm text-neutral-600">{offer.baggageSummary}</p></div><div><RefreshCcw className="h-5 w-5" /><strong className="mt-3 block">Changes</strong><p className="mt-2 text-sm text-neutral-600">{offer.changeSummary}</p></div><div><ShieldCheck className="h-5 w-5" /><strong className="mt-3 block">Cancellation</strong><p className="mt-2 text-sm text-neutral-600">{offer.cancellationSummary}</p></div></article>
      </div>
      <aside className="h-fit border border-black bg-neutral-950 p-7 text-white"><span className="text-sm text-neutral-400">Synthetic repriced total</span><strong className="mt-2 block text-4xl">{formatSyntheticFlightMoney(receipt.totalAmount)}</strong><dl className="mt-7 space-y-4 border-t border-white/20 pt-6 text-sm"><div className="flex justify-between"><dt>Travelers</dt><dd>{offer.travelerCount}</dd></div><div className="flex justify-between"><dt>Cabin</dt><dd>{formatFlightCabin(offer.cabin)}</dd></div><div className="flex justify-between"><dt>Currency</dt><dd>{receipt.totalCurrency}</dd></div><div className="flex justify-between"><dt>Reprice state</dt><dd className="capitalize">{receipt.status}</dd></div></dl><Link href={`/flights/checkout?offer=${encodeURIComponent(offer.id)}&${queryString}`} className="btn-primary mt-7 block text-center">Continue synthetic checkout</Link><p className="mt-4 text-xs leading-5 text-neutral-400">This cannot create an airline order, collect money, hold space, issue a booking reference, or produce an electronic ticket.</p></aside>
    </section>
    <Link href={`/flights/results?${queryString}`} className="mt-8 inline-flex text-sm font-semibold underline">← Back to synthetic options</Link>
  </main><SiteFooter /></>;
}
