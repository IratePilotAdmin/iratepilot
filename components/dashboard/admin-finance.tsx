"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  gross_room_revenue: number | string;
  partner_commission: number | string;
  partner_net: number | string;
  status: string;
  stripe_transfer_id: string | null;
  stripe_transfer_status: string;
  stripe_transfer_error: string | null;
  stripe_transferred_at: string | null;
  stripe_reversed_at: string | null;
  partners: { business_name: string } | null;
  bookings: { confirmation_code: string; status: string; stripe_refund_id: string | null } | null;
};
type Summary = { gross: number; commission: number; partnerNet: number; paidTransfers: number; reversedTransfers: number; failedTransfers: number };
type FinanceResponse = { data?: Row[]; summary: Summary; error?: string };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const shortId = (value: string | null) => value ? `${value.slice(0, 10)}…` : "—";
const pendingRetryDelayMs = 10 * 60 * 1000;
const isStalePending = (row: Row) => row.stripe_transfer_status === "pending"
  && Boolean(row.stripe_transferred_at)
  && Date.now() - new Date(row.stripe_transferred_at!).getTime() >= pendingRetryDelayMs;

async function fetchFinance() {
  const response = await fetch("/api/admin/finance", { cache: "no-store" });
  const body = await response.json() as FinanceResponse;
  if (!response.ok) throw new Error(body.error || "Financial report could not be loaded.");
  return body;
}

export function AdminFinance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ gross: 0, commission: 0, partnerNet: 0, paidTransfers: 0, reversedTransfers: 0, failedTransfers: 0 });
  const [message, setMessage] = useState("Loading financial report…");
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const body = await fetchFinance();
    setRows(body.data || []);
    setSummary(body.summary);
    setMessage("");
  }, []);
  useEffect(() => {
    fetchFinance()
      .then((body) => {
        setRows(body.data || []);
        setSummary(body.summary);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const retry = async (id: string) => {
    setRetrying(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/finance/transfers/${id}/retry`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transfer retry failed.");
    } finally {
      setRetrying(null);
    }
  };

  const attention = useMemo(() => rows.filter(row => row.stripe_transfer_status === "failed" || isStalePending(row)), [rows]);
  return <div className="mt-8 grid gap-8">
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Stripe payout reconciliation. Transfer and reversal references are retained for audit review. “Cancelled” means a refunded booking never created a partner transfer.</p>
    {attention.length > 0 && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{attention.length} transfer{attention.length === 1 ? "" : "s"} need attention.</strong> Review the error and retry only after the partner payout account is ready.</p>}
    <section className="grid gap-4 md:grid-cols-3">{[["Gross booking value", summary.gross], ["Marketplace revenue (10%)", summary.commission], ["Partner liability", summary.partnerNet]].map(([label, value]) => <article className="card p-6" key={String(label)}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{money(Number(value))}</strong></article>)}</section>
    <section className="grid gap-4 md:grid-cols-3">{[["Transfers paid", summary.paidTransfers], ["Transfers reversed", summary.reversedTransfers], ["Transfers failed", summary.failedTransfers]].map(([label, value]) => <article className="card p-5" key={String(label)}><span className="text-sm text-slate-500">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></article>)}</section>
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Booking", "Partner", "Gross", "Partner net", "Booking", "Transfer", "Stripe reference", "Action"].map(item => <th className="px-5 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t align-top" key={row.id}>
      <td className="px-5 py-4">{row.bookings?.confirmation_code || "—"}</td>
      <td className="px-5 py-4">{row.partners?.business_name || "—"}</td>
      <td className="px-5 py-4">{money(Number(row.gross_room_revenue))}</td>
      <td className="px-5 py-4">{money(Number(row.partner_net))}</td>
      <td className="px-5 py-4 capitalize">{row.bookings?.status?.replaceAll("_", " ") || row.status.replaceAll("_", " ")}</td>
      <td className="px-5 py-4"><strong className="capitalize">{row.stripe_transfer_status.replaceAll("_", " ")}</strong>{row.stripe_transfer_error && <p className="mt-1 max-w-xs text-xs text-red-700">{row.stripe_transfer_error}</p>}</td>
      <td className="px-5 py-4 font-mono text-xs" title={row.stripe_transfer_id || undefined}>{shortId(row.stripe_transfer_id)}</td>
      <td className="px-5 py-4">{(["failed", "not_started"].includes(row.stripe_transfer_status) || isStalePending(row)) && row.bookings?.status === "confirmed" ? <button className="btn-secondary whitespace-nowrap" disabled={retrying === row.id} onClick={() => retry(row.id)}>{retrying === row.id ? "Retrying…" : "Retry transfer"}</button> : "—"}</td>
    </tr>)}</tbody></table></div>{!rows.length && <p className="p-6 text-sm text-slate-500">No finance records yet.</p>}</section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
  </div>;
}
