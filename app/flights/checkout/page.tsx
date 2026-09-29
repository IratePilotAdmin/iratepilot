import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SyntheticFlightCheckout } from "@/components/flights/synthetic-flight-checkout";
import { parseFlightSearch } from "@/lib/flights/search";
import {
  flightSearchQueryString,
  formatSyntheticFlightMoney,
  getSyntheticFlightOffer,
  syntheticPreviewReference,
} from "@/lib/flights/synthetic-marketplace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SyntheticFlightCheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const offerId = typeof raw.offer === "string" ? raw.offer : "";
  const search = parseFlightSearch(raw);
  if (!search.query) notFound();
  const offer = await getSyntheticFlightOffer(search.query, offerId);
  if (!offer) notFound();
  const queryString = flightSearchQueryString(search.query);
  const reference = syntheticPreviewReference(offer.id);
  const confirmationHref = `/flights/confirmation/${encodeURIComponent(reference)}?offer=${encodeURIComponent(offer.id)}&${queryString}`;
  return <><SiteHeader /><main className="container-page py-12"><span className="section-kicker">Synthetic checkout</span><h1 className="mt-3 text-4xl">Exercise the traveler review boundary.</h1><p className="mt-3 max-w-3xl text-neutral-600">This page validates the product flow using fictional browser-local values. It has no persistence, payment SDK, provider SDK, or network action.</p><div className="mt-8 grid gap-7 lg:grid-cols-[1fr_320px]"><SyntheticFlightCheckout offer={offer} confirmationHref={confirmationHref} /><aside className="h-fit border border-black bg-neutral-950 p-6 text-white"><span className="text-xs uppercase tracking-wider text-neutral-400">Fixture</span><strong className="mt-2 block">{offer.carrierName}</strong><p className="mt-2 text-sm text-neutral-300">{offer.slices[0].origin} → {offer.slices[0].destination} · {offer.travelerCount} traveler{offer.travelerCount === 1 ? "" : "s"}</p><strong className="mt-6 block text-3xl">{formatSyntheticFlightMoney(offer.totalAmount)}</strong><p className="mt-1 text-xs text-neutral-400">Synthetic total · not chargeable</p></aside></div></main><SiteFooter /></>;
}
