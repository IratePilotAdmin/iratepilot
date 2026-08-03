"use client";

import { useEffect, useState } from "react";

type Reservation = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  guests: number;
  subtotal: number;
  fees: number;
  total: number;
  status: string;
  properties?: { name?: string } | null;
  rooms?: { name?: string } | null;
  profiles?: { full_name?: string } | null;
  financial?: { partner_commission: number | string; partner_net: number | string; status: string } | null;
};

const money = (value: number | string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

export function PartnerReservations() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [message, setMessage] = useState("Loading reservations…");
  const [reviewingId, setReviewingId] = useState("");

  async function load() {
    const response = await fetch("/api/partner/reservations", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setItems(body.data);
    setMessage("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    let reason = "";
    if (decision === "approve" && !window.confirm("Approve this request and hold its inventory?")) return;
    if (decision === "reject") {
      const entered = window.prompt("Why are you declining this booking request? This reason is required.");
      if (entered === null) return;
      reason = entered.trim();
      if (reason.length < 3) {
        setMessage("Enter a decline reason of at least 3 characters.");
        return;
      }
    }

    setReviewingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/partner/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) await load();
    } catch {
      setMessage("The booking decision could not be saved. Please try again.");
    } finally {
      setReviewingId("");
    }
  }

  return <section className="card mt-8 overflow-hidden">
    {message && <p role="status" className="p-6 text-sm text-slate-500">{message}</p>}
    <div className="divide-y">{items.map((item) => <article key={item.id} className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-start">
      <div><strong>{item.properties?.name} — {item.rooms?.name}</strong><p className="mt-1 text-sm text-slate-500">{item.profiles?.full_name || "Traveler"} · {item.check_in} to {item.check_out} · {item.guests} guests</p><p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{item.confirmation_code} · {item.status}</p>{item.financial && <dl className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Room revenue</dt><dd className="font-semibold">{money(item.subtotal)}</dd></div><div><dt className="text-slate-500">iRatePilot commission (10%)</dt><dd className="font-semibold">−{money(item.financial.partner_commission)}</dd></div><div><dt className="text-slate-500">Estimated hotel payout</dt><dd className="font-semibold">{money(item.financial.partner_net)}</dd></div></dl>}<p className="mt-3 text-xs text-slate-500">Traveler service fee: {money(item.fees)} · Traveler total: {money(item.total)}</p></div>
      {item.status === "pending" ? <div className="flex gap-2"><button disabled={Boolean(reviewingId)} onClick={() => decide(item.id, "approve")} className="btn-primary">{reviewingId === item.id ? "Saving…" : "Approve"}</button><button disabled={Boolean(reviewingId)} onClick={() => decide(item.id, "reject")} className="btn-secondary">Decline</button></div> : <span className="badge">{item.financial?.status || item.status}</span>}
    </article>)}</div>
    {!message && !items.length && <p className="p-6 text-sm text-slate-500">No private booking requests yet.</p>}
  </section>;
}
