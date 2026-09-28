"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { PmsRevenueSnapshot } from "@/components/dashboard/pms-revenue-snapshot";

type Property = { id: string; name: string; pms_only: boolean };
type Input = { property_id: string; stay_date: string; rooms_available: number; rooms_sold: number; current_rate: number | string };
type Recommendation = { id: string; property_id: string; stay_date: string; current_rate: number | string; recommended_rate: number | string; occupancy_forecast: number | string; estimated_revenue_impact: number | string; reason: string; status: string; rooms: { name: string } | null };
type Audit = { id: string; property_id: string; action: string; details: Record<string, unknown>; created_at: string };
type Report = { id: string; property_id: string; report_date: string; average_occupancy: number | string; average_daily_rate: number | string; forecast_revenue: number | string; pending_actions: number; summary: string };
type Payload = { properties: Property[]; inputs: Input[]; inputCount: number; recommendations: Recommendation[]; audit: Audit[]; reports: Report[]; canGenerateRecommendations: boolean; canCreatePmsPilot: boolean };
const money = (value: number | string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

export function RevenueAiCenter() {
  const [data, setData] = useState<Payload>({ properties: [], inputs: [], inputCount: 0, recommendations: [], audit: [], reports: [], canGenerateRecommendations: false, canCreatePmsPilot: false });
  const [propertyId, setPropertyId] = useState("");
  const [message, setMessage] = useState("Loading Revenue AI…");
  const [busy, setBusy] = useState("");
  const selectedProperty = data.properties.find(property => property.id === propertyId);
  const redRoofDraft = data.properties.find(property => property.pms_only && property.name === "Red Roof Inn Ridgeland");
  const load = useCallback(async () => {
    const response = await fetch("/api/revenue"); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setData(body); setPropertyId(current => current || body.properties[0]?.id || ""); setMessage("");
  }, []);
  useEffect(() => {
    fetch("/api/revenue").then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body); setPropertyId(body.properties[0]?.id || ""); setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, []);
  const scopedInputs = useMemo(() => data.inputs.filter(row => row.property_id === propertyId), [data.inputs, propertyId]);
  const scopedRecommendations = useMemo(() => data.recommendations.filter(row => row.property_id === propertyId), [data.recommendations, propertyId]);
  const scopedAudit = useMemo(() => data.audit.filter(row => row.property_id === propertyId), [data.audit, propertyId]);
  const scopedReports = useMemo(() => data.reports.filter(row => row.property_id === propertyId), [data.reports, propertyId]);
  const forecast = useMemo(() => {
    const rooms = scopedInputs.reduce((sum, row) => sum + row.rooms_available, 0);
    const sold = scopedInputs.reduce((sum, row) => sum + row.rooms_sold, 0);
    return {
      occupancy: rooms ? Math.round(sold / rooms * 100) : 0,
      adr: scopedInputs.length ? scopedInputs.reduce((sum, row) => sum + Number(row.current_rate), 0) / scopedInputs.length : 0,
      revenue: scopedInputs.reduce((sum, row) => sum + row.rooms_sold * Number(row.current_rate), 0),
      dates: new Set(scopedInputs.map(row => row.stay_date)).size
    };
  }, [scopedInputs]);

  async function upload(file: File) {
    setBusy("upload"); const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/revenue/upload", { method: "POST", body: form }); const body = await response.json();
    setMessage(response.ok ? body.message : body.error); setBusy(""); if (response.ok) await load();
  }
  async function action(url: string, body: object, label: string) {
    setBusy(label); const response = await fetch(url, { method: url.includes("/recommendations/") ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setMessage(response.ok ? result.message : result.error); setBusy(""); if (response.ok) await load();
  }
  async function createPmsDraft() {
    setBusy("pms-draft");
    try {
      const response = await fetch("/api/revenue/pms-draft", { method: "POST" });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) { await load(); setPropertyId(body.data.id); }
    } catch { setMessage("PMS-only draft could not be created."); }
    finally { setBusy(""); }
  }
  function downloadTemplate() {
    const today = format(new Date(), "yyyy-MM-dd");
    const csv = `property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate,competitor_rate,last_year_occupancy,event_name\nPROPERTY_UUID,ROOM_UUID,${today},10,8,189,209,72,Local concert\n`;
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "iratepilot-revenue-template.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="mt-8 grid gap-8">
    {data.canCreatePmsPilot && <section className="card p-6"><h2 className="text-xl font-semibold">Red Roof Inn Ridgeland PMS pilot</h2>
      <p className="mt-2 text-sm text-slate-600">Create an inactive PMS-only draft under your authorized hotel organization. It is excluded from public hotel search and cannot be approved for OTA publication. No rooms, reservations, or rates are created by this step.</p>
      {redRoofDraft ? <p className="mt-3 text-sm">PMS-only draft: <strong>{redRoofDraft.name}</strong> · Property ID <code>{redRoofDraft.id}</code></p>
        : <button className="btn-secondary mt-4" type="button" disabled={!!busy} onClick={() => void createPmsDraft()}>{busy === "pms-draft" ? "Creating…" : "Create inactive PMS-only draft"}</button>}
    </section>}
    <section className="card flex flex-wrap items-end justify-between gap-5 p-6">
      <label className="grid min-w-64 gap-2 text-sm font-semibold">Property<select className="rounded-xl border border-slate-300 bg-white px-4 py-3" value={propertyId} onChange={event => setPropertyId(event.target.value)}>{data.properties.map(property => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
      <div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={downloadTemplate}>Download CSV template</button><label className="btn-primary cursor-pointer">{busy === "upload" ? "Importing…" : "Upload CSV"}<input className="sr-only" type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => event.target.files?.[0] && upload(event.target.files[0])} /></label></div>
    </section>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">CSV-first pilot mode. Automatic pricing is disabled. PMS-only drafts allow review and rejection, but approval and rate writes are blocked. For eligible OTA properties, approved recommendations update the selected room/date inventory rate and are logged.</p>
        <PmsRevenueSnapshot key={propertyId} propertyId={propertyId} />
    <section aria-label="Revenue input preview"><p className="mb-3 text-sm text-slate-600">Dashboard preview of up to 500 rows across your properties for the next 90 days. {data.inputCount > data.inputs.length ? `${data.inputCount} total rows are available; generate the report for complete property totals.` : ""}</p><div className="grid gap-4 md:grid-cols-4">{[["Dates in preview", forecast.dates], ["Preview occupancy", `${forecast.occupancy}%`], ["Preview average rate", money(forecast.adr)], ["Preview room revenue", money(forecast.revenue)]].map(([label, value]) => <article className="card p-5" key={String(label)}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></article>)}</div></section>
    <section className="card p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">AI pricing recommendations</h2><p className="mt-1 text-sm text-slate-500">{data.canGenerateRecommendations ? "Generate recommendations from loaded dates within the next 90 days." : "Generation opens after the hotel data and database release are verified."}</p></div><button className="btn-primary" disabled={!propertyId || !!busy || !data.canGenerateRecommendations} onClick={() => action("/api/revenue/recommendation", { propertyId }, "generate")}>{busy === "generate" ? "Analyzing…" : "Generate 90-day recommendations"}</button></div>
      <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Date / room", "Forecast", "Current", "Recommended", "Impact", "Decision"].map(item => <th className="px-4 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{scopedRecommendations.map(row => <tr className="border-t align-top" key={row.id}><td className="px-4 py-4"><strong>{row.stay_date}</strong><small className="block text-slate-500">{row.rooms?.name || "Room type"}</small></td><td className="px-4 py-4">{row.occupancy_forecast}%</td><td className="px-4 py-4">{money(row.current_rate)}</td><td className="px-4 py-4 font-semibold">{money(row.recommended_rate)}<small className="mt-1 block max-w-64 font-normal text-slate-500">{row.reason}</small></td><td className="px-4 py-4">{money(row.estimated_revenue_impact)}</td><td className="px-4 py-4">{row.status === "pending" ? <div className="flex gap-2">{!selectedProperty?.pms_only && <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white" disabled={!!busy} onClick={() => action(`/api/revenue/recommendations/${row.id}`, { decision: "approve" }, row.id)}>Approve</button>}<button className="rounded-lg border px-3 py-2 text-xs font-bold" disabled={!!busy} onClick={() => action(`/api/revenue/recommendations/${row.id}`, { decision: "reject" }, row.id)}>Reject</button></div> : <span className="capitalize">{row.status}</span>}</td></tr>)}</tbody></table></div>{!scopedRecommendations.length && <p className="mt-6 text-sm text-slate-500">No recommendations yet. Upload the CSV template, then generate recommendations.</p>}
    </section>
    <section className="grid gap-8 lg:grid-cols-2">
      <article className="card p-6"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Daily revenue report</h2><button className="btn-secondary" disabled={!propertyId || !!busy} onClick={() => action("/api/revenue/reports", { propertyId }, "report")}>{busy === "report" ? "Preparing…" : "Generate today’s report"}</button></div>{scopedReports.slice(0, 5).map(report => <div className="mt-5 border-t pt-5" key={report.id}><div className="flex justify-between"><strong>{report.report_date}</strong><span>{report.pending_actions} actions</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{report.summary}</p><div className="mt-3 flex gap-5 text-sm"><span>ADR {money(report.average_daily_rate)}</span><span>Revenue {money(report.forecast_revenue)}</span></div></div>)}{!scopedReports.length && <p className="mt-5 text-sm text-slate-500">No daily report generated yet.</p>}</article>
      <article className="card p-6"><h2 className="text-xl font-semibold">Audit history</h2><div className="mt-4 divide-y">{scopedAudit.slice(0, 12).map(entry => <div className="py-4" key={entry.id}><strong className="capitalize">{entry.action.replaceAll("_", " ")}</strong><time className="block text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</time></div>)}</div>{!scopedAudit.length && <p className="mt-5 text-sm text-slate-500">No Revenue AI activity yet.</p>}</article>
    </section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
  </div>;
}
