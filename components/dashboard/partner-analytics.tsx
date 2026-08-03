"use client";

import { useEffect, useState } from "react";

type Analytics = {
  businessName: string | null;
  dataTruncated: boolean;
  summary: { properties: number; requests: number; confirmed: number; partnerNet: number };
  statusMix: Array<{ status: string; count: number }>;
  monthlyPerformance: Array<{ key: string; label: string; requests: number; confirmed: number; partnerNet: number }>;
  propertyPerformance: Array<{ id: string; name: string; active: boolean; requests: number; confirmed: number; pending: number; cancelledOrRefunded: number; bookedValue: number; partnerNet: number }>;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function PartnerAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [message, setMessage] = useState("Loading portfolio analytics…");
  useEffect(() => {
    fetch("/api/partner/analytics", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  if (message) return <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>;
  if (!data) return null;
  const maxRequests = Math.max(...data.monthlyPerformance.map((month) => month.requests), 0);

  return <>
    {data.dataTruncated && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Analytics use the 1,000 most recent booking and accounting records. Exported reporting is recommended for a larger portfolio.</p>}
    <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Properties", data.summary.properties.toLocaleString()],
        ["Booking requests", data.summary.requests.toLocaleString()],
        ["Confirmed", data.summary.confirmed.toLocaleString()],
        ["Estimated partner net", money(data.summary.partnerNet)],
      ].map(([label, value]) => <article className="card p-6" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{value}</strong></article>)}
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <article className="card p-6">
        <h2 className="font-semibold">Booking demand</h2><p className="mt-1 text-sm text-slate-500">Requests created during the last 12 months</p>
        <div className="mt-6 flex h-56 items-end gap-2">{data.monthlyPerformance.map((month) => <div className="flex h-full flex-1 flex-col justify-end gap-2 text-center" key={month.key}>
          <span className="text-[10px] text-slate-500">{month.requests}</span>
          <div className="min-h-1 rounded-t-md bg-brand-500" style={{ height: `${maxRequests ? Math.max(4, month.requests / maxRequests * 100) : 4}%` }} aria-label={`${month.label}: ${month.requests} requests, ${month.confirmed} confirmed`} />
          <span className="text-[10px] text-slate-500">{month.label}</span>
        </div>)}</div>
      </article>
      <article className="card p-6">
        <h2 className="font-semibold">Current booking status</h2><p className="mt-1 text-sm text-slate-500">All loaded partner reservations</p>
        <div className="mt-6 space-y-4">{data.statusMix.map((item) => {
          const width = data.summary.requests ? item.count / data.summary.requests * 100 : 0;
          return <div key={item.status}><div className="flex justify-between text-sm"><span className="capitalize">{item.status}</span><strong>{item.count}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${width}%` }} /></div></div>;
        })}</div>
      </article>
    </section>

    <section className="card mt-8 overflow-hidden">
      <div className="border-b p-6"><h2 className="font-semibold">Property performance</h2><p className="mt-1 text-sm text-slate-500">Ranked by estimated partner net, then booking demand</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Property", "Requests", "Confirmed", "Pending", "Cancelled / refunded", "Booked value", "Partner net"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{data.propertyPerformance.map((property) => <tr className="border-t" key={property.id}>
          <td className="px-5 py-4 font-medium">{property.name}<small className="block text-slate-500">{property.active ? "Published" : "Not published"}</small></td>
          <td className="px-5 py-4">{property.requests}</td><td className="px-5 py-4">{property.confirmed}</td><td className="px-5 py-4">{property.pending}</td><td className="px-5 py-4">{property.cancelledOrRefunded}</td><td className="px-5 py-4">{money(property.bookedValue)}</td><td className="px-5 py-4 font-medium">{money(property.partnerNet)}</td>
        </tr>)}</tbody></table></div>
      {!data.propertyPerformance.length && <p className="p-6 text-sm text-slate-500">Add a property to begin building portfolio analytics.</p>}
    </section>
  </>;
}
