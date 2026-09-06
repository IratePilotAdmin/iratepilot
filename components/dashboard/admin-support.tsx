"use client";

import { useEffect, useRef, useState } from "react";
import { SUPPORT_STATUS_UNCONFIRMED, updateSupportCaseStatus, type SupportStatus } from "@/lib/support/status-update";
import { loadSupportInbox, SUPPORT_LOAD_ERROR, type SupportCase, type SupportSummary, type SupportQueue } from "@/lib/support/load-inbox";

const HOTEL_MANAGER_INTEREST_PREFIX = "[HOTEL_MANAGER_INTEREST_V1]";
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusLabel = (status: SupportStatus) => status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1);
const isHotelManagerInterest = (item: SupportCase) => item.message.startsWith(HOTEL_MANAGER_INTEREST_PREFIX);
const visibleMessage = (item: SupportCase) => isHotelManagerInterest(item)
  ? item.message.slice(HOTEL_MANAGER_INTEREST_PREFIX.length).trimStart()
  : item.message;

function hotelInterestReplyHref(item: SupportCase) {
  const subject = "iRatePilot private hotel interest follow-up";
  const body = [
    `Hello ${item.name},`,
    "",
    "Thank you for your interest in iRatePilot's private hotel onboarding process. I would like to schedule a short qualification conversation about the property, your role, approved business information, and the hotel's operating workflow.",
    "",
    "This interest message is not a hotel application, listing approval, or booking activation. Publication, bookings, payments, payouts, manager access, and supplier connections require separate verification and approval.",
    "",
    "Please do not email passwords, PMS/API credentials, bank or card information, tax IDs, identity documents, or guest data.",
    "",
    "Please reply with a convenient time for a 20-minute conversation.",
    "",
    "Thank you,",
    "iRatePilot hotel onboarding",
  ].join("\n");
  return `mailto:${item.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function AdminSupport() {
  const [items, setItems] = useState<SupportCase[]>([]);
  const [summary, setSummary] = useState<SupportSummary>({ total: 0, new: 0, inProgress: 0, resolved: 0 });
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<"all" | SupportStatus>("all");
  const [queueType, setQueueType] = useState<SupportQueue>("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pageLimit, setPageLimit] = useState(200);
  const [totalMatches, setTotalMatches] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const updatingStatus = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      setItems([]);
      try {
        const body = await loadSupportInbox({ status, queue: queueType, q: appliedQuery, offset }, controller.signal);
        if (cancelled) return;
        if (!body.data.length && offset > 0 && offset >= body.totalMatches) {
          setMessage("The queue changed. Showing an available page.");
          setOffset(Math.max(0, Math.floor((body.totalMatches - 1) / body.limit) * body.limit));
          return;
        }
        setItems(body.data);
        setSummary(body.summary);
        setPageLimit(body.limit);
        setTotalMatches(body.totalMatches);
        setHasMore(body.hasMore);
      } catch (error) {
        if (cancelled) return;
        setLoadError(true);
        setHasMore(false);
        setMessage(error instanceof Error ? error.message : SUPPORT_LOAD_ERROR);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, queueType, appliedQuery, offset, reloadVersion]);

  const visibleHotelInterestCount = items.filter(isHotelManagerInterest).length;

  async function updateStatus(id: string, nextStatus: SupportStatus) {
    if (updatingStatus.current) return;
    updatingStatus.current = true;
    setBusy(id);
    setMessage("Saving support case…");
    try {
      const result = await updateSupportCaseStatus(id, nextStatus);
      setMessage(result.message);
      if (result.confirmed) {
        setOffset(0);
        setReloadVersion((version) => version + 1);
      }
    } catch {
      setMessage(SUPPORT_STATUS_UNCONFIRMED);
    } finally {
      updatingStatus.current = false;
      setBusy(null);
    }
  }

  return <>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["All cases", summary.total], ["New", summary.new], ["In progress", summary.inProgress], ["Resolved", summary.resolved]]
        .map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-2xl">{loading || loadError ? "—" : value}</strong>
        </article>)}
    </section>

    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-sky-200 bg-sky-50 p-6 text-sky-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Hotel-manager interest lane</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6">
              A case tagged Hotel manager interest is a lead only. Start qualification,
              verify the person and property path, and record the next step. Do not call it
              an application, approve a partner, create a property, publish a listing, or
              enable bookings from this queue.
            </p>
            <p className="mt-2 text-xs">Opening the draft sends nothing automatically.</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 text-right shadow-sm">
            <strong className="block text-2xl">{loading || loadError ? "—" : visibleHotelInterestCount}</strong>
            <span className="text-xs">Hotel-interest leads on this page</span>
          </div>
        </div>
      </div>
      <form className="grid gap-4 border-b p-6 md:grid-cols-[1fr_220px_240px]" onSubmit={(event) => {
        event.preventDefault();
        setMessage("");
        setOffset(0);
        setAppliedQuery(query.trim());
        setReloadVersion((version) => version + 1);
      }}>
        <label className="text-sm font-medium">Search cases
          <input className="input mt-2" type="search" value={query} maxLength={200} disabled={busy !== null} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or message" />
        </label>
        <label className="text-sm font-medium">Status
          <select className="input mt-2" value={status} disabled={busy !== null} onChange={(event) => {
            setMessage("");
            setOffset(0);
            setStatus(event.target.value as "all" | SupportStatus);
          }}>
            <option value="all">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="text-sm font-medium">Queue type
          <select className="input mt-2" value={queueType} disabled={busy !== null} onChange={(event) => {
            setMessage("");
            setOffset(0);
            setQueueType(event.target.value as SupportQueue);
          }}>
            <option value="all">All cases</option>
            <option value="hotel_manager_interest">Hotel manager interest</option>
            <option value="general_support">General support</option>
          </select>
        </label>
        <div className="md:col-span-3">
          <button className="btn-secondary" disabled={loading || busy !== null} type="submit">Search all cases</button>
          {(loading || message) && <p role="status" className="mt-2 text-sm text-slate-600">{loading ? "Loading support cases…" : message}</p>}
        </div>
      </form>

      <nav aria-label="Support case pages" className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <p className="text-sm text-slate-600" aria-live="polite">
          {loading ? "Loading page…" : loadError ? "Page unavailable." : items.length
            ? `Showing ${offset + 1}–${offset + items.length} of ${totalMatches} matching cases`
            : "No matching cases on this page."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={loading || busy !== null || offset === 0} onClick={() => {
            setMessage("");
            setOffset(Math.max(0, offset - pageLimit));
          }} type="button">Previous page</button>
          <button className="btn-secondary" disabled={loading || busy !== null || !hasMore} onClick={() => {
            setMessage("");
            setOffset(offset + pageLimit);
          }} type="button">Next page</button>
          <button className="btn-secondary" disabled={loading || busy !== null} onClick={() => {
            setMessage("");
            setOffset(0);
            setReloadVersion((version) => version + 1);
          }} type="button">Refresh cases</button>
        </div>
      </nav>

      <div className="divide-y" aria-busy={loading}>{items.map((item) => {
        const hotelInterest = isHotelManagerInterest(item);
        return <article className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-start" key={item.id}>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <strong>{item.name}</strong>
            <span className="badge">{statusLabel(item.status)}</span>
            {hotelInterest ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">Hotel manager interest · lead only</span> : null}
          </div>
          <p className="mt-1 text-sm"><a className="text-brand-700 underline" href={`mailto:${item.email}`}>{item.email}</a> · {date(item.created_at)}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{visibleMessage(item)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hotelInterest ? <a className="btn-secondary" href={hotelInterestReplyHref(item)}>Draft qualification email</a> : null}
          {item.status !== "in_progress" && item.status !== "resolved" && <button disabled={loading || busy !== null} className="btn-secondary" onClick={() => updateStatus(item.id, "in_progress")} type="button">{hotelInterest ? "Start qualification" : "Start case"}</button>}
          {item.status !== "resolved" && <button disabled={loading || busy !== null} className="btn-primary" onClick={() => updateStatus(item.id, "resolved")} type="button">{hotelInterest ? "Close lead" : "Resolve"}</button>}
          {item.status === "resolved" && <button disabled={loading || busy !== null} className="btn-secondary" onClick={() => updateStatus(item.id, "new")} type="button">{hotelInterest ? "Reopen lead" : "Reopen"}</button>}
        </div>
      </article>})}</div>
      {!loading && !loadError && !items.length && <p className="p-6 text-sm text-slate-500">No support cases match these filters. Adjust the filters or refresh to check for changes.</p>}
    </section>
  </>;
}
