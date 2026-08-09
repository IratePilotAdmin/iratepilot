"use client";

import { useEffect, useMemo, useState } from "react";

type Financial = {
  id: string; gross_room_revenue: number | string; partner_commission: number | string; partner_net: number | string;
  status: string; created_at: string; stripe_transfer_id: string | null; stripe_transfer_status: string;
  stripe_transfer_error: string | null; stripe_transferred_at: string | null; stripe_reversed_at: string | null;
  bookings: { confirmation_code: string; check_in: string; check_out: string; status: string } | null;
};
type Payout = { id: string; period_start: string; period_end: string; amount: number | string; status: string; created_at: string };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function PartnerFinance() {
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [message, setMessage] = useState("Loading finance records…");
  useEffect(() => { fetch("/api/partner/finance", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setFinancials(body.financials || []); setPayouts(body.payouts || []); setMessage(""); }).catch((error: Error) => setMessage(error.message)); }, []);
  const totals = useMemo(() => financials.reduce((sum, row) => ({ gross: sum.gross + Number(row.gross_room_revenue), commission: sum.commission + Number(row.partner_commission), net: sum.net + Number(row.partner_net) }), { gross: 0, commission: 0, net: 0 }), [financials]);

  return <div className="mt-8 grid gap-8">
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Stripe test-mode payout tracking. “Paid” means the partner transfer was created; “reversed” means it was returned during a refund; “cancelled” means no transfer was created for a refunded booking.</p>
    <section className="grid gap-4 md:grid-cols-3">{[["Gross booking value", totals.gross], ["iRatePilot commission (14%)", totals.commission], ["Partner net", totals.net]].map(([label, value]) => <article className="card p-6" key={String(label)}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{money(Number(value))}</strong></article>)}</section>
    <section className="card overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Booking accounting</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Booking", "Stay", "Gross", "Commission", "Net", "Transfer", "Processed"].map(item => <th className="px-5 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{financials.map(row => <tr className="border-t align-top" key={row.id}>
      <td className="px-5 py-4">{row.bookings?.confirmation_code || "—"}</td>
      <td className="px-5 py-4">{row.bookings ? `${row.bookings.check_in} – ${row.bookings.check_out}` : "—"}</td>
      <td className="px-5 py-4">{money(Number(row.gross_room_revenue))}</td>
      <td className="px-5 py-4">{money(Number(row.partner_commission))}</td>
      <td className="px-5 py-4">{money(Number(row.partner_net))}</td>
      <td className="px-5 py-4"><strong className="capitalize">{row.stripe_transfer_status.replaceAll("_", " ")}</strong>{row.stripe_transfer_status === "failed" && row.stripe_transfer_error && <p className="mt-1 max-w-xs text-xs text-amber-700">iRatePilot is reviewing this transfer.</p>}</td>
      <td className="px-5 py-4 text-xs text-slate-500">{row.stripe_reversed_at ? new Date(row.stripe_reversed_at).toLocaleString() : row.stripe_transferred_at ? new Date(row.stripe_transferred_at).toLocaleString() : "—"}</td>
    </tr>)}</tbody></table></div>{!financials.length && <p className="p-6 text-sm text-slate-500">No confirmed booking accounting records yet.</p>}</section>
    <section className="card overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Payout records</h2></div>{payouts.map(row => <article className="flex flex-wrap justify-between gap-3 border-t p-6" key={row.id}><div><strong>{row.period_start} – {row.period_end}</strong><p className="text-sm capitalize text-slate-500">{row.status}</p></div><strong>{money(Number(row.amount))}</strong></article>)}{!payouts.length && <p className="p-6 text-sm text-slate-500">No payout drafts have been created.</p>}</section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
  </div>;
}
