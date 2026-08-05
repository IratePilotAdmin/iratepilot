"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "booking" | "revenue";
type AuditEvent = { id: string; category: Category; action: string; title: string; context: string; actor: string; detail: string | null; created_at: string };
type Summary = { total: number; booking: number; revenue: number; displayed: number };
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));

export function AdminAudit() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, booking: 0, revenue: 0, displayed: 0 });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [message, setMessage] = useState("Loading audit history…");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit")
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
    return items.filter((item) => (category === "all" || item.category === category)
      && (!term || [item.title, item.context, item.actor, item.detail]
        .some((value) => value?.toLowerCase().includes(term))));
  }, [category, items, query]);

  return <>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Recorded events", summary.total], ["Booking changes", summary.booking], ["Revenue actions", summary.revenue], ["Showing", summary.displayed]]
        .map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-2xl">{value}</strong>
        </article>)}
    </section>

    <section className="card mt-6 overflow-hidden">
      <div className="grid gap-4 border-b p-6 md:grid-cols-[1fr_220px]">
        <label className="text-sm font-medium">Search audit history
          <input className="input mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Action, property, actor, or detail" />
        </label>
        <label className="text-sm font-medium">Category
          <select className="input mt-2" value={category} onChange={(event) => setCategory(event.target.value as "all" | Category)}>
            <option value="all">All categories</option><option value="booking">Booking</option><option value="revenue">Revenue</option>
          </select>
        </label>
        <div className="md:col-span-2">
          {truncated && <p className="text-xs text-amber-700">Showing the 200 most recent recorded events.</p>}
          {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
        </div>
      </div>

      <div className="divide-y">{filtered.map((item) => <article className="grid gap-4 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-start" key={item.id}>
        <span className="badge capitalize">{item.category}</span>
        <div>
          <strong className="capitalize">{item.title}</strong>
          <p className="mt-1 text-sm text-slate-500">{item.context} · Actor: {item.actor}</p>
          {item.detail && <p className="mt-3 text-sm leading-6 text-slate-700">{item.detail}</p>}
        </div>
        <time className="text-xs text-slate-500" dateTime={item.created_at}>{date(item.created_at)}</time>
      </article>)}</div>
      {!message && !filtered.length && <p className="p-6 text-sm text-slate-500">No audit events match these filters.</p>}
    </section>
  </>;
}
