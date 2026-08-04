"use client";
import { useEffect, useState } from "react";

type Request = {
  id: string;
  reason: string;
  status: string;
  refund_amount: number | string | null;
  stripe_refund_id: string | null;
  updated_at: string;
  retryable: boolean;
  bookings: {
    confirmation_code: string;
    check_in: string;
    check_out: string;
    total: number | string;
    status: string;
    properties: { name?: string } | null;
    rooms: { name?: string } | null;
    profiles: { full_name?: string } | null;
  } | null;
};

const money = (value: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

export function AdminCancellations() {
  const [items, setItems] = useState<Request[]>([]);
  const [message, setMessage] = useState("Loading cancellation requests…");
  async function load() {
    const response = await fetch("/api/admin/cancellations");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setItems(body.data || []);
    setMessage("");
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error: Error) => setMessage(error.message));
  }, []);
  async function decide(id: string, decision: "approve" | "reject") {
    const prompt = decision === "approve"
      ? "Approve this cancellation and issue a full Stripe test refund?"
      : "Reject this cancellation request?";
    if (!window.confirm(prompt)) return;
    setMessage(decision === "approve" ? "Processing Stripe test refund…" : "Saving decision…");
    const response = await fetch(`/api/admin/cancellations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error);
    if (response.ok) await load();
  }
  return <section className="card mt-8 overflow-hidden">
    {message && <p role="status" className="p-6 text-sm text-slate-600">{message}</p>}
    <div className="divide-y">{items.map((item) => {
      const booking = item.bookings;
      return <article className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center" key={item.id}>
        <div>
          <strong>{booking?.properties?.name} — {booking?.rooms?.name}</strong>
          <p className="mt-1 text-sm text-slate-500">{booking?.profiles?.full_name || "Traveler"} · {booking?.check_in} to {booking?.check_out}</p>
          <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{booking?.confirmation_code} · {item.status}</p>
          <p className="mt-3 text-sm"><span className="text-slate-500">Reason:</span> {item.reason}</p>
          {item.stripe_refund_id && <p className="mt-2 text-xs text-slate-500">Stripe refund: {item.stripe_refund_id}</p>}
        </div>
        <div className="text-right">
          <strong>{money(item.refund_amount ?? booking?.total ?? 0)}</strong>
          {item.status === "pending"
            ? <div className="mt-3 flex gap-2"><button className="btn-primary" onClick={() => decide(item.id, "approve")}>Approve refund</button><button className="btn-secondary" onClick={() => decide(item.id, "reject")}>Reject</button></div>
            : item.status === "processing" && item.retryable
              ? <button className="btn-primary mt-3" onClick={() => decide(item.id, "approve")}>Retry refund</button>
            : <span className="badge mt-3 block">{item.status}</span>}
        </div>
      </article>;
    })}</div>
    {!message && !items.length && <p className="p-6 text-sm text-slate-500">No cancellation requests.</p>}
  </section>;
}
