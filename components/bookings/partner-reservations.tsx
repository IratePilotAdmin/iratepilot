"use client";

import { useEffect, useMemo, useState } from "react";
import { TripStatusTimeline } from "@/components/bookings/trip-status-timeline";
import { getBookingStatusLabel, type BookingStatusHistoryEntry } from "@/lib/bookings/status-history";
import { buildPartnerReservationQueue } from "@/lib/partner/reservation-queue";

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
  cancellation_reason?: string | null;
  created_at: string;
  booking_status_history?: BookingStatusHistoryEntry[];
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
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "closed">("all");
  const [limited, setLimited] = useState(false);
  const queue = useMemo(() => buildPartnerReservationQueue(items), [items]);
  const visibleItems = useMemo(() => queue.ordered.filter((item) => filter === "all"
    || (filter === "closed" ? item.status !== "pending" && item.status !== "confirmed" : item.status === filter)), [filter, queue.ordered]);

  async function load() {
    const response = await fetch("/api/partner/reservations", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setItems(body.data);
    setLimited(Boolean(body.limited));
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

  return <section className="mt-8 grid gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {([['Pending requests', queue.summary.pending], ['Confirmed stays', queue.summary.confirmed], ['Closed records', queue.summary.closed], ['Loaded records', queue.summary.total]] as const).map(([label, value]) => <article className="card p-5" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-2xl">{value.toLocaleString()}</strong></article>)}
    </div>
    <div className="card overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b p-6 sm:flex-row sm:items-end"><div><h2 className="text-xl font-semibold">Reservation queue</h2><p className="mt-1 text-sm text-slate-500">Pending requests are prioritized by nearest check-in.</p></div><label className="text-sm font-medium">Status<select className="input mt-2 min-w-48" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All records</option><option value="pending">Pending requests</option><option value="confirmed">Confirmed stays</option><option value="closed">Closed records</option></select></label></div>
    {limited && <p className="border-b bg-amber-50 p-4 text-sm text-amber-900">Showing the 500 most recently created reservations. Use status filters to focus the operational queue.</p>}
    {message && <p role="status" className="p-6 text-sm text-slate-500">{message}</p>}
    <div className="divide-y">{visibleItems.map((item) => <article key={item.id} className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-start">
      <div><strong>{item.properties?.name} — {item.rooms?.name}</strong><p className="mt-1 text-sm text-slate-500">{item.profiles?.full_name || "Traveler"} · {item.check_in} to {item.check_out} · {item.guests} guests</p><p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{item.confirmation_code} · {getBookingStatusLabel(item.status)}</p>{item.cancellation_reason && <div className="mt-4 border-l-2 border-red-500 bg-red-50 p-3 text-sm text-red-900"><strong>Cancellation context</strong><p className="mt-1 leading-6">{item.cancellation_reason}</p></div>}{item.financial && <dl className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Room revenue</dt><dd className="font-semibold">{money(item.subtotal)}</dd></div><div><dt className="text-slate-500">iRatePilot commission (10%)</dt><dd className="font-semibold">−{money(item.financial.partner_commission)}</dd></div><div><dt className="text-slate-500">Estimated hotel payout</dt><dd className="font-semibold">{money(item.financial.partner_net)}</dd></div></dl>}<p className="mt-3 text-xs text-slate-500">Traveler service fee: {money(item.fees)} · Traveler total: {money(item.total)}</p><TripStatusTimeline entries={item.booking_status_history || []} /></div>
      {item.status === "pending" ? <div className="flex gap-2"><button disabled={Boolean(reviewingId)} onClick={() => decide(item.id, "approve")} className="btn-primary">{reviewingId === item.id ? "Saving…" : "Approve"}</button><button disabled={Boolean(reviewingId)} onClick={() => decide(item.id, "reject")} className="btn-secondary">Decline</button></div> : <span className="badge">{getBookingStatusLabel(item.financial?.status || item.status)}</span>}
    </article>)}</div>
    {!message && !visibleItems.length && <p className="p-6 text-sm text-slate-500">No reservations match this status.</p>}
    </div>
  </section>;
}
