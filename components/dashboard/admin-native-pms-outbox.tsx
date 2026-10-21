"use client";

import { useEffect, useState } from "react";

type State = "pending" | "leased" | "retry" | "delivered" | "review";
type DeliveryEvent = {
  eventId: string;
  connectionId: string;
  propertyId: string;
  state: State;
  attempts: number;
  dueAt: string;
  createdAt: string;
  resultCode: string | null;
};
type DeliveryStatus = {
  available: boolean;
  checkedAt?: string;
  totals?: Record<State, number>;
  due?: number;
  health?: {
    level: "paused" | "clear" | "attention";
    reviewEvents: number;
    expiredLeases: number;
    overdueEvents: number;
    deliveryEnabledConnections: number;
    checkedAt: string;
  };
  connections?: Array<{
    connectionId: string;
    propertyId: string;
    environment: string;
    captureEnabled: boolean;
    deliveryEnabled: boolean;
  }>;
  recent?: DeliveryEvent[];
  review?: DeliveryEvent[];
};

const labels: Record<State, string> = {
  pending: "Queued", leased: "Processing", retry: "Retrying", delivered: "Delivered", review: "Needs review",
};

async function loadStatus(): Promise<DeliveryStatus> {
  const response = await fetch("/api/admin/integrations/native-pms/outbox", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "PMS delivery status is unavailable.");
  return body;
}

export function AdminNativePmsOutbox() {
  const [data, setData] = useState<DeliveryStatus | null>(null);
  const [message, setMessage] = useState("Loading PMS delivery status…");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      setData(await loadStatus());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PMS delivery status is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadStatus().then((body) => { setData(body); setMessage(""); })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  return <section className="mt-10" aria-labelledby="native-pms-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="native-pms-heading" className="text-xl font-semibold">iRatePilot PMS reservation delivery</h2>
        <p className="mt-1 text-sm text-slate-600">Read-only queue and connection status. This view does not start delivery.</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={busy}>Refresh status</button>
    </div>
    {message && <p role="status" className="card mt-4 p-5 text-sm text-slate-600">{message}</p>}
    {data && !data.available && <p role="status" className="card mt-4 p-5 text-sm text-amber-900">
      PMS delivery monitoring is waiting for the hosted connector migrations.
    </p>}
    {data?.available && data.totals && <>
      <p className="mt-4 text-xs text-slate-500">Checked {new Date(data.checkedAt || "").toLocaleString()}</p>
      {data.health && <div className={`card mt-4 p-5 text-sm ${data.health.level === "attention" ? "border-amber-300 bg-amber-50 text-amber-950" : "text-slate-700"}`} role="status">
        <h3 className="font-semibold">{data.health.level === "attention" ? "PMS delivery needs investigation" : data.health.level === "paused" ? "PMS delivery is paused" : "PMS delivery has no aged alerts"}</h3>
        <p className="mt-2">
          {data.health.reviewEvents} needing review · {data.health.expiredLeases} expired processing leases · {data.health.overdueEvents} events due for more than 15 minutes.
        </p>
        {data.health.level === "attention" && <p className="mt-2">Inspect the recent event result codes and matching PMS receipts before resuming or retrying delivery. This page cannot change delivery state.</p>}
        {data.health.level === "paused" && <p className="mt-2">All connector delivery switches are off. Queued events will stay queued until a separately supervised activation.</p>}
      </div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(labels) as State[]).map((state) => <article className="card p-5" key={state}>
          <span className="text-sm text-slate-500">{labels[state]}</span>
          <strong className="mt-2 block text-3xl">{data.totals?.[state]?.toLocaleString() ?? "0"}</strong>
        </article>)}
        <article className="card p-5">
          <span className="text-sm text-slate-500">Due in queue</span>
          <strong className="mt-2 block text-3xl">{data.due?.toLocaleString() ?? "0"}</strong>
        </article>
      </div>
      <div className="card mt-5 overflow-x-auto">
        <h3 className="border-b p-5 font-semibold">Connections</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Connection", "Environment", "Capture", "Delivery"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{(data.connections || []).map((connection) => <tr className="border-t" key={connection.connectionId}>
            <td className="px-5 py-4 font-mono text-xs">{connection.connectionId}</td>
            <td className="px-5 py-4">{connection.environment}</td>
            <td className="px-5 py-4">{connection.captureEnabled ? "On" : "Off"}</td>
            <td className="px-5 py-4">{connection.deliveryEnabled ? "On" : "Off"}</td>
          </tr>)}</tbody>
        </table>
        {!data.connections?.length && <p className="p-5 text-sm text-slate-500">No PMS delivery connections are configured.</p>}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <div className="border-b p-5"><h3 className="font-semibold">Events needing review</h3>
          <p className="mt-1 text-sm text-slate-500">Up to 100 unresolved events, including older events outside recent activity. Compare each event ID with the PMS receipt before deciding on recovery. No action is taken here.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Created", "Event ID", "Connection", "Attempts", "Result"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{(data.review || []).map((event) => <tr className="border-t" key={event.eventId}>
            <td className="px-5 py-4">{new Date(event.createdAt).toLocaleString()}</td>
            <td className="px-5 py-4 font-mono text-xs">{event.eventId}</td>
            <td className="px-5 py-4 font-mono text-xs">{event.connectionId}</td>
            <td className="px-5 py-4">{event.attempts}</td>
            <td className="px-5 py-4 font-mono text-xs">{event.resultCode || "—"}</td>
          </tr>)}</tbody>
        </table>
        {!data.review?.length && <p className="p-5 text-sm text-slate-500">No PMS delivery events currently need review.</p>}
        {(data.totals?.review ?? 0) > (data.review?.length ?? 0) && <p className="border-t p-5 text-sm text-amber-900">Showing the newest {data.review?.length ?? 0} of {data.totals?.review} review events. Older events require a database audit.</p>}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <div className="border-b p-5"><h3 className="font-semibold">Recent delivery events</h3>
          <p className="mt-1 text-sm text-slate-500">Guest details, booking references, payloads and signing credentials are excluded.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Created", "Connection", "State", "Attempts", "Result"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{(data.recent || []).map((event) => <tr className="border-t" key={event.eventId}>
            <td className="px-5 py-4">{new Date(event.createdAt).toLocaleString()}</td>
            <td className="px-5 py-4 font-mono text-xs">{event.connectionId}</td>
            <td className="px-5 py-4">{labels[event.state] || "Unknown"}</td>
            <td className="px-5 py-4">{event.attempts}</td>
            <td className="px-5 py-4 font-mono text-xs">{event.resultCode || "—"}</td>
          </tr>)}</tbody>
        </table>
        {!data.recent?.length && <p className="p-5 text-sm text-slate-500">No PMS delivery events have been recorded.</p>}
      </div>
    </>}
  </section>;
}
