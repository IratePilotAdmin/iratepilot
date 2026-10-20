"use client";

import { useEffect, useState } from "react";

type State = "queued" | "retry" | "processing" | "sent" | "review";
type AriStatus = {
  available: boolean;
  checkedAt?: string;
  workerEnabled?: boolean;
  totals?: Record<State, number>;
  due?: number;
  expiredLeases?: number;
  connections?: Array<{
    connectionId: string;
    environment: string;
    enabled: boolean;
    partnerApproved: boolean;
    endpointApproved: boolean;
    certificationComplete: boolean;
  }>;
  recent?: Array<{
    jobId: string;
    connectionId: string;
    syncId: string;
    requestIndex: number;
    kind: string;
    state: State;
    attempts: number;
    createdAt: string;
    availableAt: string;
    leaseExpiresAt: string | null;
    httpStatus: number | null;
  }>;
};

const labels: Record<State, string> = {
  queued: "Queued", retry: "Retrying", processing: "Processing", sent: "Sent", review: "Needs review",
};

async function loadStatus(): Promise<AriStatus> {
  const response = await fetch("/api/admin/integrations/booking-com/ari", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Booking.com test ARI status is unavailable.");
  return body;
}

export function AdminBookingComAri() {
  const [data, setData] = useState<AriStatus | null>(null);
  const [message, setMessage] = useState("Loading Booking.com test ARI status…");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      setData(await loadStatus());
      setMessage("");
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : "Booking.com test ARI status is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadStatus().then((body) => { setData(body); setMessage(""); })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  return <section className="mt-10" aria-labelledby="booking-com-ari-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="booking-com-ari-heading" className="text-xl font-semibold">Booking.com test availability and rates</h2>
        <p className="mt-1 text-sm text-slate-600">Read-only queue status. Refreshing this view does not send rates or availability.</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={busy}>Refresh ARI status</button>
    </div>
    {message && <p role="status" className="card mt-4 p-5 text-sm text-slate-600">{message}</p>}
    {data && !data.available && <p role="status" className="card mt-4 p-5 text-sm text-amber-900">
      Booking.com ARI monitoring is waiting for its hosted database migration.
    </p>}
    {data?.available && data.totals && <>
      <p className="mt-4 text-xs text-slate-500">Checked {new Date(data.checkedAt || "").toLocaleString()}</p>
      <p className="mt-2 text-sm font-medium text-slate-700">Scheduled delivery worker: {data.workerEnabled ? "On" : "Off"}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(labels) as State[]).map((state) => <article className="card p-5" key={state}>
          <span className="text-sm text-slate-500">{labels[state]}</span>
          <strong className="mt-2 block text-3xl">{data.totals?.[state]?.toLocaleString() ?? "0"}</strong>
        </article>)}
        <article className="card p-5"><span className="text-sm text-slate-500">Due now</span>
          <strong className="mt-2 block text-3xl">{data.due?.toLocaleString() ?? "0"}</strong></article>
        <article className="card p-5"><span className="text-sm text-slate-500">Expired processing leases</span>
          <strong className="mt-2 block text-3xl">{data.expiredLeases?.toLocaleString() ?? "0"}</strong></article>
      </div>
      <div className="card mt-5 overflow-x-auto">
        <h3 className="border-b p-5 font-semibold">Test connections</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Connection", "Mode", "Enabled", "Partner", "ARI endpoint", "Certification"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{(data.connections || []).map((connection) => <tr className="border-t" key={connection.connectionId}>
            <td className="px-5 py-4 font-mono text-xs">{connection.connectionId}</td>
            <td className="px-5 py-4">{connection.environment}</td>
            <td className="px-5 py-4">{connection.enabled ? "On" : "Off"}</td>
            <td className="px-5 py-4">{connection.partnerApproved ? "Approved" : "Waiting"}</td>
            <td className="px-5 py-4">{connection.endpointApproved ? "Approved" : "Waiting"}</td>
            <td className="px-5 py-4">{connection.certificationComplete ? "Complete" : "Waiting"}</td>
          </tr>)}</tbody>
        </table>
        {!data.connections?.length && <p className="p-5 text-sm text-slate-500">No Booking.com test connections are configured.</p>}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <div className="border-b p-5"><h3 className="font-semibold">Recent ARI jobs</h3>
          <p className="mt-1 text-sm text-slate-500">Payloads, provider messages, and credentials are excluded. Only the latest 100 jobs appear here.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Created", "Connection", "Sync", "Request", "State", "Attempts", "HTTP"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{(data.recent || []).map((job) => <tr className="border-t" key={job.jobId}>
            <td className="px-5 py-4">{new Date(job.createdAt).toLocaleString()}</td>
            <td className="px-5 py-4 font-mono text-xs">{job.connectionId}</td>
            <td className="px-5 py-4 font-mono text-xs">{job.syncId}</td>
            <td className="px-5 py-4">{job.kind} #{job.requestIndex + 1}</td>
            <td className="px-5 py-4">{labels[job.state] || "Unknown"}</td>
            <td className="px-5 py-4">{job.attempts}</td>
            <td className="px-5 py-4">{job.httpStatus ?? "—"}</td>
          </tr>)}</tbody>
        </table>
        {!data.recent?.length && <p className="p-5 text-sm text-slate-500">No Booking.com ARI jobs have been recorded.</p>}
      </div>
    </>}
  </section>;
}
