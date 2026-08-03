"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Deal = { roomId: string; roomName: string; propertyName: string; published: boolean; stayDate: string; baseRate: number; dealRate: number; discountPercent: number; discountedNights: number };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function PartnerPromotions() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [message, setMessage] = useState("Loading future rate offers…");
  useEffect(() => {
    fetch("/api/partner/promotions", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDeals(body.data || []);
      setMessage(body.truncated ? "Showing offers calculated from the first 1,000 available future nights." : "");
    }).catch((error: Error) => setMessage(error.message));
  }, []);
  return <>
    <section className="card mt-8 grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="font-semibold">How rate promotions work</h2><p className="mt-2 max-w-2xl text-sm text-slate-600">Set an inventory rate at least 5% below the room’s base rate. Published, approved listings automatically become eligible for the traveler Deals page, and booking still verifies the exact inventory rate.</p></div><Link href="/partner/rates" className="btn-primary">Manage rates</Link></section>
    {message && <p role="status" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{message}</p>}
    <section className="card mt-6 overflow-hidden"><div className="border-b p-6"><h2 className="font-semibold">Detected future offers</h2><p className="mt-1 text-sm text-slate-500">Ranked by discount from each room’s base rate.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Property / room", "Best future date", "Base rate", "Offer rate", "Savings", "Eligible nights", "Marketplace"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead><tbody>{deals.map((deal) => <tr className="border-t" key={deal.roomId}><td className="px-5 py-4 font-medium">{deal.propertyName}<small className="block text-slate-500">{deal.roomName}</small></td><td className="px-5 py-4">{deal.stayDate}</td><td className="px-5 py-4">{money(deal.baseRate)}</td><td className="px-5 py-4">{money(deal.dealRate)}</td><td className="px-5 py-4 font-semibold text-emerald-700">{deal.discountPercent}%</td><td className="px-5 py-4">{deal.discountedNights}</td><td className="px-5 py-4"><span className="badge">{deal.published ? "Published" : "Listing not published"}</span></td></tr>)}</tbody></table></div>{!message && !deals.length && <p className="p-6 text-sm text-slate-500">No future inventory is currently priced at least 5% below its room base rate.</p>}</section>
  </>;
}
