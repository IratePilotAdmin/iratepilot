"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Deal = { roomId: string; roomName: string; propertySlug: string; propertyName: string; city: string; country: string; imageUrl: string | null; stars: number; stayDate: string; baseRate: number; dealRate: number; savings: number; discountPercent: number; discountedNights: number };
const fallbackImage = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function nextDate(date: string) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result.toISOString().slice(0, 10);
}

export function DealsGrid() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [message, setMessage] = useState("Finding verified future rates…");
  useEffect(() => {
    fetch("/api/deals").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDeals(body.data || []);
      setMessage(body.truncated ? "Showing the strongest offers from the first 1,000 available nights." : "");
    }).catch((error: Error) => setMessage(error.message));
  }, []);
  const topDiscount = Math.max(...deals.map((deal) => deal.discountPercent), 0);
  return <>
    <section className="rounded-3xl bg-brand-700 p-10 text-white"><span className="badge bg-white/15 text-white">Verified rate offers</span><h1 className="mt-4 text-4xl font-bold">{topDiscount ? `Save up to ${topDiscount}% on future stays` : "Premium stays at verified nightly rates"}</h1><p className="mt-4 max-w-2xl text-brand-100">Every offer comes from live, sellable room inventory and is recalculated when you book.</p></section>
    {message && <p role="status" className="card mt-8 p-5 text-sm text-slate-600">{message}</p>}
    <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{deals.map((deal) => {
      const query = new URLSearchParams({ checkIn: deal.stayDate, checkOut: nextDate(deal.stayDate), guests: "2" });
      return <article className="card overflow-hidden" key={deal.roomId}>
        <div className="relative h-52"><Image src={deal.imageUrl || fallbackImage} alt={deal.propertyName} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" /><span className="absolute left-4 top-4 rounded-full bg-emerald-600 px-3 py-1 text-sm font-bold text-white">Save {deal.discountPercent}%</span></div>
        <div className="p-6"><p className="text-xs font-bold uppercase tracking-wider text-brand-700">{deal.stars}-star · {deal.city}, {deal.country}</p><h2 className="mt-2 text-xl font-bold">{deal.propertyName}</h2><p className="mt-1 text-sm text-slate-500">{deal.roomName} · {deal.discountedNights} discounted future {deal.discountedNights === 1 ? "night" : "nights"}</p><div className="mt-5 flex items-end gap-3"><strong className="text-3xl">{money(deal.dealRate)}</strong><span className="pb-1 text-sm text-slate-400 line-through">{money(deal.baseRate)}</span><span className="pb-1 text-xs text-slate-500">/ night</span></div><p className="mt-2 text-xs text-slate-500">Featured date: {deal.stayDate}. Availability may change.</p><Link href={`/hotels/${deal.propertySlug}?${query.toString()}#booking-request`} className="btn-primary mt-5 w-full text-center">Check this rate</Link></div>
      </article>;
    })}</section>
    {!message && !deals.length && <div className="card mt-8 p-8"><h2 className="text-xl font-bold">No verified rate offers right now</h2><p className="mt-2 text-slate-600">Browse all approved properties or check again as partners publish new future rates.</p><Link href="/search" className="btn-primary mt-5">Browse stays</Link></div>}
  </>;
}
