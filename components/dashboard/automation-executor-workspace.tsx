"use client";

import { useState, useTransition } from "react";
import {
  runEmailOutboxReceiptSandboxAction,
  type AutomationExecutorActionResult,
} from "@/app/admin/operations/executor-actions";
import type { AutomationExecutorSnapshot } from "@/lib/admin/automation-executor";
import type { AutomationRetrySnapshot } from "@/lib/admin/automation-retry";

type Props = {
  executorWorkflow: AutomationExecutorSnapshot;
  retryWorkflow: AutomationRetrySnapshot;
  onRefresh: () => Promise<void>;
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export function AutomationExecutorWorkspace({ executorWorkflow, retryWorkflow, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const completedRequestIds = new Set(executorWorkflow.executions.map((execution) => execution.retryRequestId));
  const eligibleRequests = retryWorkflow.requests.filter((request) => (
    request.kind === executorWorkflow.adapter.sourceRetryKind
    && request.status === "dry_run_completed"
    && !completedRequestIds.has(request.id)
  ));

  const runAction = (action: () => Promise<AutomationExecutorActionResult>) => {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) await onRefresh();
      } catch {
        setMessage("The internal sandbox receipt check could not be completed.");
      }
    });
  };

  return <section className="mt-10" aria-labelledby="phase-five-title">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-800">Automation Operations Center · Phase 5</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="phase-five-title">Single-adapter sandbox execution</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
        Validate one sanitized email-outbox UUID after the Phase 3 request has two independent approvals and a completed dry run. The adapter reads only the receipt status and records an idempotent result.
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-800">
        This adapter cannot send or retry email, reveal recipient data, access the network, call Resend, create an external side effect, or move money.
      </p>
    </div>

    <section className="mt-6 grid gap-4 lg:grid-cols-3" aria-label="Sandbox executor controls">
      <article className="card p-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Application kill switch</span>
        <strong className="mt-2 block text-lg text-slate-950">{executorWorkflow.applicationKillSwitchEnabled ? "Enabled" : "Disabled"}</strong>
        <p className="mt-2 text-xs leading-5 text-slate-500">`AUTOMATION_SANDBOX_EXECUTOR_ENABLED` must be explicitly enabled in the target environment.</p>
      </article>
      <article className="card p-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Database kill switch</span>
        <strong className="mt-2 block text-lg text-slate-950">{executorWorkflow.databaseKillSwitchEnabled ? "Enabled" : "Disabled"}</strong>
        <p className="mt-2 text-xs leading-5 text-slate-500">Migration 067 creates the registry entry disabled. Enabling it requires a separate database decision.</p>
      </article>
      <article className="card p-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Effective state</span>
        <strong className={`mt-2 block text-lg ${executorWorkflow.effectiveEnabled ? "text-emerald-800" : "text-amber-800"}`}>{executorWorkflow.effectiveEnabled ? "Sandbox available" : "Locked"}</strong>
        <p className="mt-2 text-xs leading-5 text-slate-500">Both kill switches must be enabled before the authenticated action can reach the adapter.</p>
      </article>
    </section>

    <article className="card mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{executorWorkflow.adapter.label}</h3>
          <p className="mt-1 text-sm text-slate-500">Internal read-only sandbox · one execution per Phase 3 idempotency fingerprint</p>
        </div>
        <span className="badge">{executorWorkflow.adapter.enabled ? "database enabled" : "database disabled"}</span>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Network access</dt><dd className="mt-1 font-semibold">Prohibited</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">External side effects</dt><dd className="mt-1 font-semibold">Prohibited</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Source authorization</dt><dd className="mt-1 font-semibold">Dual-approved dry run</dd></div>
      </dl>
    </article>

    {!executorWorkflow.available ? <div className="card mt-6 border-amber-200 bg-amber-50 p-6">
      <h3 className="font-semibold text-amber-950">Sandbox executor migration pending</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">Phases 1–4 remain available. Phase 5 history stays disabled until migrations 064–067 are separately approved and applied to Preview.</p>
    </div> : <>
      <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Sandbox execution summary">
        {[
          ["Validated", executorWorkflow.summary.validated],
          ["Blocked", executorWorkflow.summary.blocked],
          ["Total receipts", executorWorkflow.summary.total],
        ].map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
        </article>)}
      </section>

      {executorWorkflow.effectiveEnabled ? <section className="card mt-6 p-6" aria-labelledby="eligible-sandbox-title">
        <h3 className="text-lg font-semibold" id="eligible-sandbox-title">Eligible approved requests</h3>
        <p className="mt-1 text-sm text-slate-500">Only completed email-delivery dry runs with no existing execution receipt appear here.</p>
        <div className="mt-4 divide-y">
          {eligibleRequests.map((request) => <div className="flex flex-wrap items-center justify-between gap-4 py-4" key={request.id}>
            <div><strong className="text-sm">{request.targetReference}</strong><p className="mt-1 text-xs text-slate-500">{request.approvals.length} approvals · fingerprint {request.idempotencyKey.slice(0, 12)}…</p></div>
            <button className="btn-primary" disabled={isPending} onClick={() => runAction(() => runEmailOutboxReceiptSandboxAction(request.id))} type="button">Run internal receipt check</button>
          </div>)}
          {!eligibleRequests.length ? <p className="py-4 text-sm text-slate-500">No approved email receipt request is eligible.</p> : null}
        </div>
      </section> : <div className="card mt-6 border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
        Execution controls remain hidden while either kill switch is disabled.
      </div>}

      <p aria-live="polite" className="mt-4 min-h-5 text-sm font-medium text-slate-700">{message}</p>

      <section className="mt-4 space-y-4" aria-labelledby="sandbox-history-title">
        <div><h3 className="text-xl font-semibold" id="sandbox-history-title">Immutable sandbox receipts</h3><p className="mt-1 text-sm text-slate-500">Only the sanitized status and guardrail outcome are retained.</p></div>
        {executorWorkflow.executions.map((execution) => <article className="card p-6" key={execution.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${execution.status === "validated" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{execution.status}</span>
              <p className="mt-3 text-sm leading-6 text-slate-700">{execution.summary}</p>
              <p className="mt-2 text-xs text-slate-500">{execution.executedByName} · {formatDate(execution.createdAt)}</p>
            </div>
            <span className="badge">{execution.observedStatus || "no receipt"}</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {execution.events.map((event) => <div className="rounded-xl border p-3" key={event.id}><p className="text-sm text-slate-700">{event.summary}</p><p className="mt-2 text-xs text-slate-500">{event.actorName} · {formatDate(event.createdAt)}</p></div>)}
          </div>
        </article>)}
        {!executorWorkflow.executions.length ? <div className="card p-6 text-sm text-slate-500">No sandbox execution receipt is recorded.</div> : null}
      </section>
    </>}
  </section>;
}
