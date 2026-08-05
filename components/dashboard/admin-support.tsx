"use client";

import { useEffect, useMemo, useState } from "react";

type SupportStatus = "new" | "in_progress" | "resolved";
type SupportCase = { id: string; name: string; email: string; message: string; status: SupportStatus; created_at: string };
type Summary = { total: number; new: number; inProgress: number; resolved: number };
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusLabel = (status: SupportStatus) => status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1);

export function AdminSupport() {
  const [items, setItems] = useState<SupportCase[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, new: 0, inProgress: 0, resolved: 0 });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SupportStatus>("all");
  const [message, setMessage] = useState("Loading support cases…");
  const [busy, setBusy] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  async function load(clearMessage = true) {
    const response = await fetch("/api/admin/support");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setItems(body.data || []);
    setSummary(body.summary);
    setTruncated(Boolean(body.truncated));
    if (clearMessage) setMessage("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => (status === "all" || item.status === status)
      && (!term || [item.name, item.email, item.message].some((value) => value.toLowerCase().includes(term))));
  }, [items, query, status]);

  async function updateStatus(id: string, nextStatus: SupportStatus) {
    setBusy(id);
    setMessage("Saving support case…");
    try {
      const response = await fetch(`/api/admin/support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      await load(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Support case could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["All cases", summary.total], ["New", summary.new], ["In progress", summary.inProgress], ["Resolved", summary.resolved]]
        .map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-2xl">{value}</strong>
        </article>)}
    </section>

    <section className="card mt-6 overflow-hidden">
      <div className="grid gap-4 border-b p-6 md:grid-cols-[1fr_220px]">
        <label className="text-sm font-medium">Search cases
          <input className="input mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or message" />
        </label>
        <label className="text-sm font-medium">Status
          <select className="input mt-2" value={status} onChange={(event) => setStatus(event.target.value as "all" | SupportStatus)}>
            <option value="all">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
          </select>
        </label>
        <div className="md:col-span-2">
          {truncated && <p className="text-xs text-amber-700">Showing the 200 most recent support cases.</p>}
          {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
        </div>
      </div>

      <div className="divide-y">{filtered.map((item) => <article className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-start" key={item.id}>
        <div>
          <div className="flex flex-wrap items-center gap-3"><strong>{item.name}</strong><span className="badge">{statusLabel(item.status)}</span></div>
          <p className="mt-1 text-sm"><a className="text-brand-700 underline" href={`mailto:${item.email}`}>{item.email}</a> · {date(item.created_at)}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status !== "in_progress" && item.status !== "resolved" && <button disabled={busy === item.id} className="btn-secondary" onClick={() => updateStatus(item.id, "in_progress")}>Start case</button>}
          {item.status !== "resolved" && <button disabled={busy === item.id} className="btn-primary" onClick={() => updateStatus(item.id, "resolved")}>Resolve</button>}
          {item.status === "resolved" && <button disabled={busy === item.id} className="btn-secondary" onClick={() => updateStatus(item.id, "new")}>Reopen</button>}
        </div>
      </article>)}</div>
      {!message && !filtered.length && <p className="p-6 text-sm text-slate-500">No support cases match these filters.</p>}
    </section>
  </>;
}
