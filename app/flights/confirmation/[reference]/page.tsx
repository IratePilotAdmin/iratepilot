import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { parseFlightSearch } from "@/lib/flights/search";
import {
  formatSyntheticFlightMoney,
  getSyntheticFlightOffer,
  syntheticPreviewReference,
} from "@/lib/flights/synthetic-marketplace";

type Params = Promise<{ reference: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SyntheticFlightConfirmationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { reference } = await params;
  const raw = await searchParams;
  const offerId = typeof raw.offer === "string" ? raw.offer : "";
  const search = parseFlightSearch(raw);
  if (!search.query) notFound();
  const offer = await getSyntheticFlightOffer(search.query, offerId);
  if (!offer || syntheticPreviewReference(offer.id) !== reference) notFound();
  return <><SiteHeader /><main className="container-page flex min-h-[65vh] items-center justify-center py-12"><section className="w-full max-w-3xl border border-black bg-white p-8 sm:p-10"><CircleCheck className="h-12 w-12 text-emerald-700" /><span className="section-kicker mt-6 block">Synthetic journey receipt</span><h1 className="mt-3 text-4xl">Product simulation complete.</h1><p className="mt-4 text-neutral-600">Reference <strong>{reference}</strong> exists only in this URL. It is not an airline booking reference, provider order, payment receipt, or ticket number.</p><dl className="mt-8 grid gap-5 border-y border-neutral-300 py-6 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-neutral-500">Fixture itinerary</dt><dd className="mt-1 font-semibold">{offer.slices[0].origin} → {offer.slices[0].destination}</dd></div><div><dt className="text-xs uppercase tracking-wider text-neutral-500">Synthetic total</dt><dd className="mt-1 font-semibold">{formatSyntheticFlightMoney(offer.totalAmount)}</dd></div><div><dt className="text-xs uppercase tracking-wider text-neutral-500">Payment</dt><dd className="mt-1 font-semibold">Not created</dd></div><div><dt className="text-xs uppercase tracking-wider text-neutral-500">Ticket</dt><dd className="mt-1 font-semibold">Not issued</dd></div></dl><div className="mt-7 flex items-start gap-3 border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>A launch receipt must eventually reconcile one provider order, booking reference, electronic-ticket document, customer payment, confirmation delivery, and servicing ownership. This preview proves none of those external outcomes.</p></div><div className="mt-7 flex flex-wrap gap-3"><Link href="/flights" className="btn-primary">Plan another test trip</Link><Link href="/contact" className="btn-secondary">Contact support</Link></div></section></main><SiteFooter /></>;
}
