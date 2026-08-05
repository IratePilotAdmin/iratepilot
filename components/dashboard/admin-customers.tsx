"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  membership_tier: string;
  membership_status: string;
  reward_points: number;
  created_at: string;
  booking_count: number;
  pending_booking_count: number;
  confirmed_value: number;
  last_booking_at: string | null;
};

type Summary = { totalCustomers: number; activeMembers: number; pendingBookings: number; confirmedValue: number };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));

export function AdminCustomers() {
  const [items, setItems] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalCustomers: 0, activeMembers: 0, pendingBookings: 0, confirmedValue: 0 });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Loading customer directory…");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    fetch("/api/admin/customers")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setItems(body.data || []);
        setSummary(body.summary);
        setTruncated(Boolean(body.truncated));
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((customer) => [customer.full_name, customer.email, customer.phone]
      .some((value) => value?.toLowerCase().includes(term)));
  }, [items, query]);

  return <>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Customer accounts", summary.totalCustomers.toLocaleString()],
        ["Active members", summary.activeMembers.toLocaleString()],
        ["Pending requests", summary.pendingBookings.toLocaleString()],
        ["Confirmed value", money(summary.confirmedValue)],
      ].map(([label, value]) => <article className="card p-5" key={label}>
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <strong className="mt-2 block text-2xl">{value}</strong>
      </article>)}
    </section>

    <section className="card mt-6 overflow-hidden">
      <div className="border-b p-6">
        <label className="block max-w-xl text-sm font-medium">Search customers
          <input className="input mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or phone" />
        </label>
        {truncated && <p className="mt-3 text-xs text-amber-700">Showing the 200 most recent customer accounts.</p>}
        {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
      </div>
      <div className="divide-y">{filtered.map((customer) => <article className="grid gap-5 p-6 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center" key={customer.id}>
        <div>
          <strong>{customer.full_name || "Unnamed customer"}</strong>
          <p className="mt-1 text-sm text-slate-500">{customer.email || "Email unavailable"}{customer.phone ? ` · ${customer.phone}` : ""}</p>
          <p className="mt-2 text-xs text-slate-500">Joined {date(customer.created_at)}{customer.last_booking_at ? ` · Last booking ${date(customer.last_booking_at)}` : " · No bookings yet"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">Bookings</span><strong className="block">{customer.booking_count} ({customer.pending_booking_count} pending)</strong></div>
          <div><span className="text-slate-500">Confirmed value</span><strong className="block">{money(customer.confirmed_value)}</strong></div>
          <div><span className="text-slate-500">Membership</span><strong className="block capitalize">{customer.membership_tier} · {customer.membership_status}</strong></div>
          <div><span className="text-slate-500">Rewards</span><strong className="block">{customer.reward_points.toLocaleString()} points</strong></div>
        </div>
        <span className="badge">{customer.membership_status === "active" ? "Active member" : "Customer"}</span>
      </article>)}</div>
      {!message && !filtered.length && <p className="p-6 text-sm text-slate-500">{query ? "No customers match this search." : "No customer accounts yet."}</p>}
    </section>
  </>;
}
