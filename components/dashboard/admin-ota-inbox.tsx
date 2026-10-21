"use client";

import { useEffect, useState } from "react";

type InboxState = "received" | "leased" | "imported" | "review";
type InboxEvent = {
  id: string;
  connectionId: string;
  propertyId: string;
  provider: string;
  eventKind: "new" | "modified" | "cancelled";
  status: InboxState;
  receivedAt: string;
  attempts: number;
  resultCode: string | null;
};
type InboxResponse = {
  available: boolean;
  reason?: string;
  scope?: string;
  totals?: Record<InboxState, number>;
  recent?: InboxEvent[];
  review?: InboxEvent[];
};

const stateLabels: Record<InboxState, string> = {
  received: "Queued",
  leased: "Processing",
  imported: "Imported",
  review: "Needs review",
};
const providerLabels: Record<string, string> = {
  booking_com: "Booking.com",
  expedia: "Expedia",
  agoda: "Agoda",
  airbnb: "Airbnb",
  iratepilot: "iRatePilot",
};

function EventTable({ events, includeStatus }: { events: InboxEvent[]; includeStatus: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50 text-slate-500"><tr>
      {["Event ID", "Received", "Source", "Property", "Event", ...(includeStatus ? ["Status"] : []), "Attempts", "Result"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}
    </tr></thead>
    <tbody>{events.map((item) => <tr className="border-t" key={item.id}>
      <td className="px-5 py-4 font-mono text-xs" title={item.id}>{item.id.slice(0, 8)}…</td>
      <td className="px-5 py-4">{new Date(item.receivedAt).toLocaleString()}</td>
      <td className="px-5 py-4">{providerLabels[item.provider] || "External OTA"}</td>
      <td className="px-5 py-4 font-mono text-xs" title={item.propertyId}>{item.propertyId.slice(0, 8)}…</td>
      <td className="px-5 py-4 capitalize">{item.eventKind}</td>
      {includeStatus && <td className="px-5 py-4">{stateLabels[item.status]}</td>}
      <td className="px-5 py-4">{item.attempts}</td>
      <td className="px-5 py-4 font-mono text-xs">{item.resultCode || "—"}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function AdminOtaInbox() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [message, setMessage] = useState("Loading OTA inbox status…");

  useEffect(() => {
    fetch("/api/admin/integrations/ota/inbox", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "OTA inbox status is unavailable.");
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  if (data && !data.available) return <p role="status" className="card mt-8 p-6 text-sm text-amber-900">
    OTA inbox monitoring is waiting for the hosted reservation-inbox migrations. No guest data was requested.
  </p>;

  return <>
    {message && <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>}
    {data?.available && data.totals && <>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(stateLabels) as InboxState[]).map((status) => <article className="card p-5" key={status}>
          <span className="text-sm text-slate-500">{stateLabels[status]}</span>
          <strong className="mt-2 block text-3xl">{data.totals?.[status]?.toLocaleString() || "0"}</strong>
        </article>)}
      </section>
      <section className="card mt-8 overflow-hidden">
        <div className="border-b p-6"><h2 className="font-semibold">External OTA events needing review</h2>
          <p className="mt-1 text-sm text-slate-500">Held events stay visible here even when newer events fill the recent list. This view does not retry or import them.</p>
        </div>
        {data.review?.length ? <EventTable events={data.review} includeStatus={false} />
          : <p className="p-6 text-sm text-slate-500">No OTA reservation events need review.</p>}
        {(data.totals.review > (data.review?.length || 0)) && <p role="status" className="border-t p-6 text-sm text-amber-900">
          Showing the newest {data.review?.length || 0} of {data.totals.review.toLocaleString()} held events. Older events require database-side investigation; this page does not resolve them.
        </p>}
      </section>
      <section className="card mt-8 overflow-hidden">
        <div className="border-b p-6"><h2 className="font-semibold">Recent external OTA reservation events</h2>
          <p className="mt-1 text-sm text-slate-500">Guest names, contact details, reservation numbers, and encrypted payloads are excluded.</p>
        </div>
        <EventTable events={data.recent || []} includeStatus />
        {!data.recent?.length && <p className="p-6 text-sm text-slate-500">No OTA reservation events have been staged.</p>}
      </section>
    </>}
  </>;
}
