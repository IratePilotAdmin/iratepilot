"use client";

import { useEffect, useState } from "react";

type Row = { id: string; gross_room_revenue: number | string; partner_commission: number | string; partner_net: number | string; status: string; partners: { business_name: string } | null; bookings: { confirmation_code: string } | null };
type Summary = { gross: number; commission: number; partnerNet: number };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function AdminFinance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ gross: 0, commission: 0, partnerNet: 0 });
  const [message, setMessage] = useState("Loading financial report…");
  useEffect(() => { fetch("/api/admin/finance").then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setRows(body.data || []); setSummary(body.summary); setMessage(""); }).catch((error: Error) => setMessage(error.message)); }, []);
  return <div className="mt-8 grid gap-8">
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Internal reconciliation. Eligible records represent successful Stripe test payments; they do not represent collected live funds.</p>
    <section className="grid gap-4 md:grid-cols-3">{[["Gross booking value", summary.gross], ["Marketplace revenue (10%)", summary.commission], ["Partner liability", summary.partnerNet]].map(([label, value]) => <article className="card p-6" key={String(label)}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{money(Number(value))}</strong></article>)}</section>
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Booking", "Partner", "Gross", "Commission", "Partner net", "Status"].map(item => <th className="px-5 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="px-5 py-4">{row.bookings?.confirmation_code || "—"}</td><td className="px-5 py-4">{row.partners?.business_name || "—"}</td><td className="px-5 py-4">{money(Number(row.gross_room_revenue))}</td><td className="px-5 py-4">{money(Number(row.partner_commission))}</td><td className="px-5 py-4">{money(Number(row.partner_net))}</td><td className="px-5 py-4 capitalize">{row.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>{!rows.length && <p className="p-6 text-sm text-slate-500">No finance records yet.</p>}</section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
  </div>;
}
