"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { HotelLaunchGate, HotelLaunchGateStatus } from "@/lib/admin/hotel-launch-readiness";

type Readiness = {
  checkedAt: string;
  complete: number;
  total: number;
  percent: number;
  launchReady: boolean;
  readOnly: true;
  gates: HotelLaunchGate[];
  releaseAuthorization: {
    id: string;
    approvalReference: string;
    approvedAt: string;
    expiresAt: string;
  } | null;
  releaseAuthorizationEvidenceAvailable: boolean;
};

const statusPresentation: Record<HotelLaunchGateStatus, { label: string; classes: string }> = {
  ready: { label: "Complete", classes: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  blocked: { label: "Action needed", classes: "border-amber-200 bg-amber-50 text-amber-900" },
  waiting_external: { label: "Waiting on outside approval", classes: "border-sky-200 bg-sky-50 text-sky-900" },
  unavailable: { label: "Verification unavailable", classes: "border-rose-200 bg-rose-50 text-rose-900" },
};

async function fetchReadiness(signal?: AbortSignal): Promise<Readiness> {
  const response = await fetch("/api/admin/hotel-launch-readiness", { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Hotel launch readiness could not be loaded.");
  return body;
}

export function AdminHotelLaunchReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [authorizationMessage, setAuthorizationMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchReadiness(controller.signal)
      .then(setData)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Hotel launch readiness could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  async function recordAuthorization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setAuthorizationBusy(true);
    setAuthorizationMessage("");
    try {
      const response = await fetch("/api/admin/hotel-launch-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record",
          approvalReference: form.get("approvalReference"),
          approvedAt: new Date(String(form.get("approvedAt"))).toISOString(),
          expiresAt: new Date(String(form.get("expiresAt"))).toISOString(),
          rollbackPlanVerified: form.get("rollbackPlanVerified") === "on",
          reviewNotes: form.get("reviewNotes"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Release authorization could not be recorded.");
      setAuthorizationMessage(body.message);
      formElement.reset();
      setData(await fetchReadiness());
    } catch (submitError) {
      setAuthorizationMessage(submitError instanceof Error ? submitError.message : "Release authorization could not be recorded.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function revokeAuthorization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.releaseAuthorization) return;
    const form = new FormData(event.currentTarget);
    setAuthorizationBusy(true);
    setAuthorizationMessage("");
    try {
      const response = await fetch("/api/admin/hotel-launch-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          authorizationId: data.releaseAuthorization.id,
          revocationReference: form.get("revocationReference"),
          reasonSummary: form.get("reasonSummary"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Release authorization could not be revoked.");
      setAuthorizationMessage(body.message);
      setData(await fetchReadiness());
    } catch (submitError) {
      setAuthorizationMessage(submitError instanceof Error ? submitError.message : "Release authorization could not be revoked.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  if (error) return <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900" role="alert">{error}</p>;
  if (!data) return <p className="mt-8 text-sm text-slate-500">Checking live launch evidence…</p>;
  const prerequisiteGates = data.gates.filter(({ id }) => id !== "production_release");

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
        <p className="mt-4 text-xs leading-5 text-slate-600">This page cannot publish a hotel, enable supplier traffic, or turn on live payments. The controlled authorization form records or revokes evidence only.</p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b p-6">
          <h2 className="text-xl font-semibold">Eight production gates</h2>
          <p className="mt-1 text-sm text-slate-500">Each result comes from the combined external approval path, current applications, property records, immutable agreement evidence, provider checks, configuration, and operating queues.</p>
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
                  {item.checks && <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {item.checks.map((check) => <div className="rounded-lg border bg-white p-3" key={check.label}>
                      <dt className="text-xs text-slate-500">{check.label}</dt>
                      <dd className={`mt-1 text-sm font-semibold ${check.ready ? "text-emerald-700" : "text-amber-800"}`}>{check.value}</dd>
                    </div>)}
                  </dl>}
                </div>
                <Link className="btn-secondary whitespace-nowrap" href={item.actionHref}>{item.actionLabel}</Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card overflow-hidden p-6">
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">Final release control</span>
        <h2 className="mt-2 text-xl font-semibold">Marketplace release authorization</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          A current, revocable receipt is required in addition to all seven production prerequisites and the server publication switch. Recording this evidence never changes a runtime switch.
        </p>
        {!data.releaseAuthorizationEvidenceAvailable ? (
          <p className="mt-4 text-sm text-amber-800">The release authorization ledger is unavailable. Publication remains blocked.</p>
        ) : data.releaseAuthorization ? (
          <>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="font-semibold">Approval reference</dt><dd>{data.releaseAuthorization.approvalReference}</dd></div>
              <div><dt className="font-semibold">Approved</dt><dd>{data.releaseAuthorization.approvedAt}</dd></div>
              <div><dt className="font-semibold">Expires</dt><dd>{data.releaseAuthorization.expiresAt}</dd></div>
            </dl>
            <form className="mt-5 grid max-w-3xl gap-3 border-t pt-5" onSubmit={revokeAuthorization}>
              <h3 className="font-semibold">Revoke current authorization</h3>
              <label className="text-sm font-medium">Revocation reference<input className="input mt-1" name="revocationReference" required minLength={8} maxLength={160} /></label>
              <label className="text-sm font-medium">Reason<textarea className="input mt-1 min-h-20" name="reasonSummary" required minLength={20} maxLength={2000} /></label>
              <button className="btn-secondary w-fit" disabled={authorizationBusy} type="submit">{authorizationBusy ? "Revoking…" : "Revoke authorization"}</button>
            </form>
          </>
        ) : (
          <form className="mt-5 grid max-w-3xl gap-4" onSubmit={recordAuthorization}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Approval reference<input className="input mt-1" name="approvalReference" required minLength={8} maxLength={160} /></label>
              <span className="self-end rounded-lg border bg-slate-50 p-3 text-sm">
                Prerequisites: <strong>{prerequisiteGates.filter((gate) => gate.status === "ready").length}/7 complete</strong>
              </span>
              <label className="text-sm font-medium">Approved at<input className="input mt-1" name="approvedAt" type="datetime-local" required /></label>
              <label className="text-sm font-medium">Expires at<input className="input mt-1" name="expiresAt" type="datetime-local" required /></label>
            </div>
            <label className="flex gap-2 text-sm"><input name="rollbackPlanVerified" type="checkbox" required />The rollback plan and accountable release owner have been verified.</label>
            <label className="text-sm font-medium">Release review notes<textarea className="input mt-1 min-h-24" name="reviewNotes" required minLength={20} maxLength={2000} /></label>
            <button className="btn-primary w-fit" disabled={authorizationBusy || !prerequisiteGates.every((gate) => gate.status === "ready")} type="submit">
              {authorizationBusy ? "Recording…" : "Record release authorization"}
            </button>
            {!prerequisiteGates.every((gate) => gate.status === "ready") && <p className="text-xs text-amber-800">This control unlocks only after all seven production prerequisites pass.</p>}
          </form>
        )}
        {authorizationMessage && <p className="mt-4 text-sm" role="status">{authorizationMessage}</p>}
      </section>

      <p className="text-xs text-slate-500">Last verified {new Date(data.checkedAt).toLocaleString()} · Refresh this page after evidence or configuration changes.</p>
    </div>
  );
}
