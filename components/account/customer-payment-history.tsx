"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CustomerPaymentEntry, PaymentState } from "@/lib/account/payment-history";

type PaymentHistory = {
  entries: CustomerPaymentEntry[];
  summary: { testPayments: number; collected: number; refunded: number; net: number; unpaidRequests: number };
  truncated: boolean;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const labels: Record<PaymentState, string> = {
  paid: "Paid in test mode",
  refund_pending: "Refund under review",
  refunded: "Refunded in test mode",
  not_collected: "No payment collected",
};

export function CustomerPaymentHistory() {
  const [data, setData] = useState<PaymentHistory | null>(null);
  const [message, setMessage] = useState("Loading payment history…");
  const [filter, setFilter] = useState<"all" | PaymentState>("all");

  useEffect(() => {
    fetch("/api/account/payments", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  if (message) return <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>;
  if (!data) return null;
  const visible = filter === "all" ? data.entries : data.entries.filter((entry) => entry.state === filter);

  return <>
    <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
      This private pilot uses Stripe test mode. These records are not live card charges, and iRatePilot does not store card numbers.
    </div>
    {data.truncated && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Showing your 200 most recent booking payment records.</p>}

    <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Test payments", data.summary.testPayments.toLocaleString()],
        ["Collected in test mode", money(data.summary.collected)],
        ["Refunded in test mode", money(data.summary.refunded)],
        ["Net test payments", money(data.summary.net)],
      ].map(([label, value]) => <article className="card p-6" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></article>)}
    </section>

    <section className="card mt-8 overflow-hidden">
      <div className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Booking payments</h2><p className="mt-1 text-sm text-slate-500">Paid tests, refund progress, and requests with no payment collected</p></div>
        <label className="text-sm font-medium">Show <select className="ml-2 rounded-lg border px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">All records</option><option value="paid">Paid</option><option value="refund_pending">Refund under review</option><option value="refunded">Refunded</option><option value="not_collected">No payment collected</option>
        </select></label>
      </div>
      <div className="divide-y">{visible.map((entry) => <article className="grid gap-5 p-6 lg:grid-cols-[1fr_auto]" key={entry.bookingId}>
        <div><div className="flex flex-wrap items-center gap-2"><strong>{entry.propertyName}</strong><span className="badge">{labels[entry.state]}</span></div>
          <p className="mt-1 text-sm text-slate-500">{entry.roomName} · {entry.checkIn} to {entry.checkOut}</p>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{entry.confirmationCode}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-brand-700" href={`/booking-confirmation?code=${encodeURIComponent(entry.confirmationCode)}`}>View booking confirmation →</Link>
        </div>
        <dl className="min-w-56 space-y-2 text-sm lg:text-right"><div><dt className="inline text-slate-500">Stay </dt><dd className="inline">{money(entry.subtotal)}</dd></div><div><dt className="inline text-slate-500">Taxes and fees </dt><dd className="inline">{money(entry.taxes + entry.fees)}</dd></div><div className="text-base"><dt className="inline font-semibold">Total </dt><dd className="inline font-semibold">{money(entry.total)}</dd></div>{entry.refundedAmount > 0 && <div className="text-emerald-700"><dt className="inline font-semibold">Refunded </dt><dd className="inline font-semibold">{money(entry.refundedAmount)}</dd></div>}</dl>
      </article>)}</div>
      {!visible.length && <p className="p-6 text-sm text-slate-500">No payment records match this filter.</p>}
      {data.summary.unpaidRequests > 0 && <p className="border-t bg-slate-50 p-4 text-xs text-slate-500">{data.summary.unpaidRequests} booking request{data.summary.unpaidRequests === 1 ? " has" : "s have"} no collected payment.</p>}
    </section>
  </>;
}
