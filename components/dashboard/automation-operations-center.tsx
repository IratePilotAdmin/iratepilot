"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AutomationIncidentWorkspace } from "@/components/dashboard/automation-incident-workspace";
import { AutomationRetryWorkspace } from "@/components/dashboard/automation-retry-workspace";
import { AutomationEscalationWorkspace } from "@/components/dashboard/automation-escalation-workspace";
import { AutomationExecutorWorkspace } from "@/components/dashboard/automation-executor-workspace";
import type {
  AutomationActivity,
  AutomationAttentionItem,
  AutomationLane,
  AutomationLaneStatus,
  AutomationSafetyLock,
} from "@/lib/admin/automation-operations";
import type { AutomationWorkflowSnapshot } from "@/lib/admin/automation-workflow";
import type { AutomationRetrySnapshot } from "@/lib/admin/automation-retry";
import type { AutomationEscalationSnapshot } from "@/lib/admin/automation-escalation";
import type { AutomationExecutorSnapshot } from "@/lib/admin/automation-executor";

type Snapshot = {
  phase: string;
  mode: "private_pilot" | "commercial_configuration";
  readOnly: true;
  checkedAt: string;
  summary: {
    automationLanes: number;
    healthyCount: number;
    safeguardedCount: number;
    attentionCount: number;
    totalQueue: number;
    failureCount: number;
    safetyLocksEngaged: number;
    safetyLockTotal: number;
  };
  safetyReady: boolean;
  lanes: AutomationLane[];
  safetyLocks: AutomationSafetyLock[];
  attention: AutomationAttentionItem[];
  activity: AutomationActivity[];
  workflow: AutomationWorkflowSnapshot;
  retryWorkflow: AutomationRetrySnapshot;
  escalationWorkflow: AutomationEscalationSnapshot;
  executorWorkflow: AutomationExecutorSnapshot;
};

const statusClass: Record<AutomationLaneStatus, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  attention: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-rose-200 bg-rose-50 text-rose-900",
  safeguarded: "border-sky-200 bg-sky-50 text-sky-900",
};

const activityClass: Record<AutomationActivity["state"], string> = {
  completed: "bg-emerald-100 text-emerald-800",
  processing: "bg-sky-100 text-sky-800",
  attention: "bg-amber-100 text-amber-900",
  failed: "bg-rose-100 text-rose-900",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

async function requestSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/admin/operations", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Automation operations could not be loaded.");
  return body;
}

export function AutomationOperationsCenter() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("Loading automation operations…");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await requestSnapshot());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automation operations could not be loaded.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void requestSnapshot()
      .then((snapshot) => { if (active) { setData(snapshot); setMessage(""); } })
      .catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);

  if (!data) return <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>;

  return <>
    <section className={`mt-6 rounded-2xl border p-5 ${data.safetyReady ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-600">Phase 1 safety boundary</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{data.safetyReady ? "Private-pilot locks are engaged" : "One or more safety locks need review"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Read-only monitoring only. This page cannot run jobs, retry payments, send email, publish hotels, move money, or activate supplier traffic.</p>
        </div>
        <button className="btn-secondary" disabled={refreshing} onClick={() => void refresh()} type="button">{refreshing ? "Refreshing…" : "Refresh status"}</button>
      </div>
      <p aria-live="polite" className="mt-3 text-xs text-slate-600">Last checked {formatDate(data.checkedAt)} · {data.mode === "private_pilot" ? "Private pilot" : "Commercial configuration"}</p>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Automation lanes", data.summary.automationLanes],
        ["Queued for review", data.summary.totalQueue],
        ["Recorded failures", data.summary.failureCount],
        ["Safety locks", `${data.summary.safetyLocksEngaged}/${data.summary.safetyLockTotal}`],
      ].map(([label, value]) => <article className="card p-5" key={label}>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
      </article>)}
    </section>

    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Operational lanes</h2><p className="mt-1 text-sm text-slate-500">Live counts from existing iRatePilot ledgers; no credentials or guest details are returned.</p></div>
        <p className="text-xs text-slate-500">{data.summary.healthyCount} healthy · {data.summary.safeguardedCount} safeguarded · {data.summary.attentionCount} attention</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {data.lanes.map((lane) => <article className="card p-6" key={lane.id}>
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-semibold text-slate-950">{lane.label}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{lane.description}</p></div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClass[lane.status]}`}>{lane.status}</span>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Queue</dt><dd className="mt-1 text-xl font-semibold">{lane.queueDepth}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Failures</dt><dd className="mt-1 text-xl font-semibold">{lane.failures}</dd></div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-slate-600">{lane.detail}</p>
          <Link className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" href={lane.href}>Open source workspace →</Link>
        </article>)}
      </div>
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <article className="card p-6">
        <h2 className="text-lg font-semibold">Safety locks</h2>
        <p className="mt-1 text-sm text-slate-500">A disengaged lock is a review signal, never automatic authorization.</p>
        <div className="mt-5 divide-y">
          {data.safetyLocks.map((lock) => <div className="flex gap-3 py-4" key={lock.id}>
            <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${lock.engaged ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-900"}`}>{lock.engaged ? "✓" : "!"}</span>
            <div><strong className="text-sm">{lock.label}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{lock.detail}</p></div>
          </div>)}
        </div>
      </article>

      <article className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-lg font-semibold">Attention queue</h2><p className="mt-1 text-sm text-slate-500">Review signals only; Phase 1 exposes no execute or retry buttons.</p></div>
        <div className="divide-y">
          {data.attention.map((item) => <div className="p-5" key={item.id}>
            <div className="flex items-start justify-between gap-3"><strong className="text-sm">{item.label}</strong><span className="badge capitalize">{item.severity}</span></div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
            <Link className="mt-3 inline-flex text-xs font-semibold text-brand-700" href={item.href}>Review ledger →</Link>
          </div>)}
          {!data.attention.length && <p className="p-6 text-sm text-slate-500">No queue or safety item currently needs attention.</p>}
        </div>
      </article>
    </section>

    <section className="card mt-8 overflow-hidden">
      <div className="border-b p-6"><h2 className="text-lg font-semibold">Recent automation receipts</h2><p className="mt-1 text-sm text-slate-500">Sanitized email, Stripe, PMS, and SynXis ledger activity.</p></div>
      <div className="divide-y">
        {data.activity.map((item) => <article className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-start" key={item.id}>
          <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.label}</strong><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${activityClass[item.state]}`}>{item.state}</span></div><p className="mt-2 text-sm text-slate-500">{item.detail}</p></div>
          <time className="text-xs text-slate-500" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
        </article>)}
        {!data.activity.length && <p className="p-6 text-sm text-slate-500">No automation receipts are recorded yet.</p>}
      </div>
    </section>

    <AutomationIncidentWorkspace onRefresh={refresh} workflow={data.workflow} />
    <AutomationRetryWorkspace incidentWorkflow={data.workflow} onRefresh={refresh} retryWorkflow={data.retryWorkflow} />
    <AutomationEscalationWorkspace escalationWorkflow={data.escalationWorkflow} incidentWorkflow={data.workflow} onRefresh={refresh} />
    <AutomationExecutorWorkspace executorWorkflow={data.executorWorkflow} onRefresh={refresh} retryWorkflow={data.retryWorkflow} />
  </>;
}
