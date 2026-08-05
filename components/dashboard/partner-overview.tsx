"use client";

import { useEffect, useState } from "react";

type Overview = {
  profileName: string | null;
  businessName: string | null;
  financialsTruncated: boolean;
  summary: { properties: number; publishedProperties: number; pendingBookings: number; confirmedBookings: number; grossRoomRevenue: number; partnerNet: number };
  monthlyNet: Array<{ key: string; label: string; value: number }>;
  recentBookings: Array<{ id: string; confirmation_code: string; check_in: string; check_out: string; total: number | string; status: string; partner_net: number; properties: { name?: string } | null; profiles: { full_name?: string | null } | null }>;
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function PartnerOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("Loading your portfolio…");
  useEffect(() => {
    fetch("/api/partner/overview", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  if (message) return <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>;
  if (!data) return null;
  const maxMonthlyNet = Math.max(...data.monthlyNet.map((month) => month.value), 0);

  return <>
    <h1 className="text-3xl font-bold">Welcome, {data.profileName || data.businessName || "Partner"}</h1>
    <p className="mt-2 text-slate-500">{data.businessName ? `${data.businessName} portfolio performance` : "No partner portfolio is connected to this administrator account."}</p>
    {data.financialsTruncated && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Financial totals and trend use the 500 most recent accounting records. Use Finance for the detailed ledger.</p>}
    <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Published properties", `${data.summary.publishedProperties} of ${data.summary.properties}`],
        ["Pending requests", data.summary.pendingBookings.toLocaleString()],
        ["Confirmed bookings", data.summary.confirmedBookings.toLocaleString()],
        ["Estimated partner net", money(data.summary.partnerNet)],
      ].map(([label, value]) => <article className="card p-6" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{value}</strong></article>)}
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <article className="card p-6">
        <div><h2 className="font-semibold">Estimated partner net trend</h2><p className="mt-1 text-sm text-slate-500">Non-void booking accounting · last six months</p></div>
        <div className="mt-6 flex h-56 items-end gap-3">{data.monthlyNet.map((month) => <div className="flex h-full flex-1 flex-col justify-end gap-2 text-center" key={month.key}>
          <span className="text-[10px] text-slate-500">{money(month.value)}</span>
          <div className="min-h-1 rounded-t-lg bg-brand-500" style={{ height: `${maxMonthlyNet ? Math.max(4, month.value / maxMonthlyNet * 100) : 4}%` }} aria-label={`${month.label}: ${money(month.value)}`} />
          <span className="text-xs text-slate-500">{month.label}</span>
        </div>)}</div>
        <p className="mt-5 text-sm text-slate-600">Gross room revenue recorded: <strong>{money(data.summary.grossRoomRevenue)}</strong></p>
      </article>

      <article className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="font-semibold">Recent bookings</h2><p className="mt-1 text-sm text-slate-500">Latest partner-scoped reservation activity</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Booking", "Property / guest", "Stay", "Partner net", "Status"].map((heading) => <th className="px-5 py-3" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{data.recentBookings.map((booking) => <tr className="border-t" key={booking.id}>
            <td className="px-5 py-4 font-medium">{booking.confirmation_code}</td>
            <td className="px-5 py-4">{booking.properties?.name || "Property"}<small className="block text-slate-500">{booking.profiles?.full_name || "Traveler"}</small></td>
            <td className="px-5 py-4">{booking.check_in} – {booking.check_out}</td>
            <td className="px-5 py-4">{booking.partner_net ? money(booking.partner_net) : "—"}</td>
            <td className="px-5 py-4 capitalize">{booking.status}</td>
          </tr>)}</tbody></table></div>
        {!data.recentBookings.length && <p className="p-6 text-sm text-slate-500">No reservation activity yet.</p>}
      </article>
    </section>
  </>;
}
