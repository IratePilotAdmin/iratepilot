"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HotelLaunchGate, HotelLaunchGateStatus } from "@/lib/admin/hotel-launch-readiness";

type Readiness = {
  checkedAt: string;
  complete: number;
  total: number;
  percent: number;
  launchReady: boolean;
  readOnly: true;
  gates: HotelLaunchGate[];
};

const statusPresentation: Record<HotelLaunchGateStatus, { label: string; classes: string }> = {
  ready: { label: "Complete", classes: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  blocked: { label: "Action needed", classes: "border-amber-200 bg-amber-50 text-amber-900" },
  waiting_external: { label: "Waiting on outside approval", classes: "border-sky-200 bg-sky-50 text-sky-900" },
  unavailable: { label: "Verification unavailable", classes: "border-rose-200 bg-rose-50 text-rose-900" },
};

export function AdminHotelLaunchReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/hotel-launch-readiness", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Hotel launch readiness could not be loaded.");
        setData(body);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Hotel launch readiness could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  if (error) return <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900" role="alert">{error}</p>;
  if (!data) return <p className="mt-8 text-sm text-slate-500">Checking live launch evidence…</p>;

  return (
    <div className="mt-8 grid gap-6">
      <section className={`rounded-2xl border p-6 ${data.launchReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-600">Live evidence countdown</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{data.complete} of {data.total} gates complete</h2>
            <p className="mt-2 text-sm text-slate-700">{data.percent}% launch readiness based on current system records.</p>
          </div>
          <strong className="text-sm">{data.launchReady ? "All launch gates pass" : "Live hotel publication remains blocked"}</strong>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white" aria-label={`${data.percent}% launch readiness`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.percent}>
          <div className="h-full rounded-full bg-slate-950" style={{ width: `${data.percent}%` }} />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-600">This page is read-only. It cannot publish a hotel, enable supplier traffic, or turn on live payments.</p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b p-6">
          <h2 className="text-xl font-semibold">Seven production gates</h2>
          <p className="mt-1 text-sm text-slate-500">Each result comes from current applications, property records, immutable agreement evidence, provider checks, configuration, and operating queues.</p>
        </div>
        <div className="divide-y">
          {data.gates.map((item, index) => {
            const presentation = statusPresentation[item.status];
            return (
              <article className="grid gap-4 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={item.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
                    <h3 className="font-semibold">{item.label}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.classes}`}>{presentation.label}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
                <Link className="btn-secondary whitespace-nowrap" href={item.actionHref}>{item.actionLabel}</Link>
              </article>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-slate-500">Last verified {new Date(data.checkedAt).toLocaleString()} · Refresh this page after evidence or configuration changes.</p>
    </div>
  );
}
