"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountBooking, AccountNotification } from "@/lib/account/overview";
import { getBookingStatusLabel } from "@/lib/bookings/status-history";

type Overview = {
  profileName: string | null;
  membership: { tier: string; status: string; active: boolean; rewardPoints: number };
  summary: { upcomingTrips: number; pendingRequests: number; unreadUpdates: number };
  nextTrip: AccountBooking | null;
  recentBookings: AccountBooking[];
  notifications: AccountNotification[];
  truncated: boolean;
};

const money = (value: number | string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const actions = [
  ["Find a stay", "/search", "Search approved hotel and vacation-home inventory."],
  ["Manage trips", "/account/trips", "Review requests, confirmations, cancellations, and calendars."],
  ["My flights", "/account/flights", "Review durable flight Preview orders, payment states, and test tickets."],
  ["Payment history", "/account/payments", "See test payments, refunds, and unpaid requests."],
  ["Membership", "/account/rewards", "Manage test billing, benefits, and reward activity."],
  ["Booking messages", "/account/support", "Contact the property team about a reservation."],
  ["Profile", "/account/profile", "Keep your name and contact information current."],
] as const;

export function CustomerAccountOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("Loading your account…");
  const [reading, setReading] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/account/overview", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function markRead(id?: string) {
    setReading(id || "all");
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error);
      setReading("");
      return;
    }
    setData((current) => current ? {
      ...current,
      summary: {
        ...current.summary,
        unreadUpdates: id ? Math.max(0, current.summary.unreadUpdates - body.updated) : 0,
      },
      notifications: current.notifications.map((notification) => !id || notification.id === id
        ? { ...notification, read_at: body.readAt }
        : notification),
    } : current);
    setNotice(id ? "Notification marked as read." : "All notifications marked as read.");
    setReading("");
  }
  if (message) return <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>;
  if (!data) return null;

  return <>
    <p className="mt-2 text-slate-500">Welcome, {data.profileName || "traveler"}. Your trips, membership, payments, and updates are together here.</p>
    {notice && <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{notice}</p>}
    {data.truncated && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Overview counts use your 200 most recent bookings and 100 most recent notifications. Open the detailed pages for the latest records.</p>}
    <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Upcoming trips", data.summary.upcomingTrips.toLocaleString()],
        ["Pending requests", data.summary.pendingRequests.toLocaleString()],
        ["Unread updates", data.summary.unreadUpdates.toLocaleString()],
        ["Reward points", data.membership.rewardPoints.toLocaleString()],
      ].map(([label, value]) => <article className="card p-6" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{value}</strong></article>)}
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <article className="card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Next stay</h2><p className="mt-1 text-sm text-slate-500">Your nearest confirmed upcoming reservation</p></div><Link href="/account/trips" className="text-sm font-semibold text-brand-700">All trips →</Link></div>
        {data.nextTrip ? <div className="mt-6 rounded-xl bg-slate-50 p-5"><strong className="text-lg">{Array.isArray(data.nextTrip.properties) ? data.nextTrip.properties[0]?.name : data.nextTrip.properties?.name || "Property"}</strong><p className="mt-2 text-sm text-slate-600">{data.nextTrip.check_in} to {data.nextTrip.check_out}</p><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{data.nextTrip.confirmation_code} · {money(data.nextTrip.total)}</p></div> : <p className="mt-6 text-sm text-slate-500">No upcoming confirmed stay. Search approved inventory when you are ready.</p>}
      </article>
      <article className="card p-6"><h2 className="font-semibold">Membership</h2><p className="mt-1 text-sm text-slate-500">Benefits require an active test subscription</p><div className="mt-6 flex items-end justify-between"><div><span className="text-xs uppercase tracking-wider text-slate-500">Plan</span><strong className="mt-1 block text-2xl capitalize">{data.membership.tier}</strong></div><span className="badge capitalize">{data.membership.status.replace("_", " ")}</span></div><Link href="/account/rewards" className="btn-secondary mt-6 w-full text-center">Manage membership</Link></article>
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <article className="card overflow-hidden"><div className="flex items-start justify-between gap-4 border-b p-6"><div><h2 className="font-semibold">Recent updates</h2><p className="mt-1 text-sm text-slate-500">Property and iRatePilot notifications</p></div>{data.summary.unreadUpdates > 0 && <button className="text-xs font-semibold text-brand-700" disabled={!!reading} onClick={() => markRead()}>{reading === "all" ? "Updating…" : "Mark all read"}</button>}</div><div className="divide-y">{data.notifications.map((item) => <div className="p-5" key={item.id}><div className="flex items-start justify-between gap-3"><strong className="text-sm">{item.title}</strong>{!item.read_at && <button aria-label={`Mark ${item.title} as read`} className="badge" disabled={!!reading} onClick={() => markRead(item.id)}>{reading === item.id ? "Updating…" : "Mark read"}</button>}</div><p className="mt-2 text-sm text-slate-600">{item.body}</p><time className="mt-2 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div>)}</div>{!data.notifications.length && <p className="p-6 text-sm text-slate-500">No account updates yet.</p>}</article>
      <article className="card overflow-hidden"><div className="border-b p-6"><h2 className="font-semibold">Recent bookings</h2><p className="mt-1 text-sm text-slate-500">Your five most recently created records</p></div><div className="divide-y">{data.recentBookings.map((booking) => <div className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center" key={booking.id}><div><strong>{Array.isArray(booking.properties) ? booking.properties[0]?.name : booking.properties?.name || "Property"}</strong><p className="mt-1 text-xs text-slate-500">{booking.confirmation_code} · {booking.check_in} to {booking.check_out}</p></div><div className="sm:text-right"><strong>{money(booking.total)}</strong><p className="text-xs text-slate-500">{getBookingStatusLabel(booking.status)}</p></div></div>)}</div>{!data.recentBookings.length && <p className="p-6 text-sm text-slate-500">No booking records yet.</p>}</article>
    </section>

    <section className="mt-8"><h2 className="text-xl font-semibold">Account actions</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{actions.map(([label, href, description]) => <Link className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md" href={href} key={href}><strong>{label}</strong><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></Link>)}</div></section>
  </>;
}
