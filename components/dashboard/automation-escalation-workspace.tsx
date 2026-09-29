"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  acknowledgeAutomationEscalationAction,
  type AutomationEscalationActionResult,
} from "@/app/admin/operations/escalation-actions";
import type {
  AutomationEscalation,
  AutomationEscalationSnapshot,
  AutomationSloState,
} from "@/lib/admin/automation-escalation";
import type { AutomationWorkflowSnapshot } from "@/lib/admin/automation-workflow";

type Props = {
  escalationWorkflow: AutomationEscalationSnapshot;
  incidentWorkflow: AutomationWorkflowSnapshot;
  onRefresh: () => Promise<void>;
};

const sloStateClass: Record<AutomationSloState, string> = {
  within_target: "border-emerald-200 bg-emerald-50 text-emerald-800",
  at_risk: "border-amber-200 bg-amber-50 text-amber-900",
  breached: "border-rose-200 bg-rose-50 text-rose-900",
};

const escalationStateClass: Record<AutomationEscalation["status"], string> = {
  open: "border-rose-200 bg-rose-50 text-rose-900",
  acknowledged: "border-sky-200 bg-sky-50 text-sky-900",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
};

export function AutomationEscalationWorkspace({ escalationWorkflow, incidentWorkflow, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const incidentTitles = new Map(incidentWorkflow.incidents.map((incident) => [incident.id, incident.title]));
  const policyLabels = new Map(escalationWorkflow.policies.map((policy) => [policy.code, policy.label]));

  const runAction = (action: () => Promise<AutomationEscalationActionResult>, form?: HTMLFormElement) => {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) {
          form?.reset();
          await onRefresh();
        }
      } catch {
        setMessage("The escalation workspace could not be updated.");
      }
    });
  };

  const acknowledge = (event: FormEvent<HTMLFormElement>, escalationId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const note = new FormData(form).get("note");
    runAction(
      () => acknowledgeAutomationEscalationAction(escalationId, typeof note === "string" ? note : ""),
      form,
    );
  };

  return <section className="mt-10" aria-labelledby="phase-four-title">
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-800">Automation Operations Center · Phase 4</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="phase-four-title">SLO scheduling and escalation policy</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
        Measure acknowledgment and resolution targets, create internal escalation receipts, and summarize provider health from existing iRatePilot ledgers. The daily scanner is observation-only and idempotent.
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-800">
        No notification, message, retry, payment, booking mutation, provider request, or supplier traffic is performed by this phase.
      </p>
    </div>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="SLO summary">
      {[
        ["Within target", escalationWorkflow.summary.withinTarget],
        ["At risk", escalationWorkflow.summary.atRisk],
        ["Breached", escalationWorkflow.summary.breached],
        ["Active escalations", escalationWorkflow.summary.activeEscalations],
      ].map(([label, value]) => <article className="card p-5" key={label}>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
      </article>)}
    </section>

    <section className={`mt-6 rounded-2xl border p-5 ${escalationWorkflow.scannerEnabled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-950">Scheduled policy scanner</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Daily at 08:15 UTC · observation-only · one idempotent scan per UTC date. Vercel Cron runs only on Production deployments.
          </p>
        </div>
        <span className="badge">{escalationWorkflow.scannerEnabled ? "Enabled by environment" : "Disabled by default"}</span>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {escalationWorkflow.latestScan
          ? `Latest recorded scan: ${formatDate(escalationWorkflow.latestScan.observedAt)}`
          : "No scheduled scan has been recorded."}
      </p>
    </section>

    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {escalationWorkflow.policies.map((policy) => <article className="card p-5" key={policy.code}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-950">{policy.label}</h3>
          <span className="badge capitalize">{policy.severity}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-amber-50 p-3"><dt className="text-amber-800">At risk</dt><dd className="mt-1 font-semibold">{formatDuration(policy.warningMinutes)}</dd></div>
          <div className="rounded-xl bg-rose-50 p-3"><dt className="text-rose-800">Breach</dt><dd className="mt-1 font-semibold">{formatDuration(policy.targetMinutes)}</dd></div>
        </dl>
      </article>)}
    </div>

    {!escalationWorkflow.available ? <div className="card mt-6 border-amber-200 bg-amber-50 p-6">
      <h3 className="font-semibold text-amber-950">SLO and escalation migration pending</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">Phases 1–3 remain available. Phase 4 scan history and acknowledgment stay disabled until migrations 064–066 are separately approved and applied to Preview.</p>
    </div> : <>
      <p aria-live="polite" className="mt-4 min-h-5 text-sm font-medium text-slate-700">{message}</p>

      <section className="mt-4 grid gap-6 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="border-b p-6">
            <h3 className="text-lg font-semibold">Provider health snapshot</h3>
            <p className="mt-1 text-sm text-slate-500">Derived only from internal email, Stripe, PMS, and SynXis receipts from the latest scan.</p>
          </div>
          <div className="divide-y">
            {escalationWorkflow.providerHealth.map((provider) => <div className="flex items-center justify-between gap-4 p-5" key={provider.id}>
              <div><strong className="text-sm capitalize">{provider.lane}</strong><p className="mt-1 text-xs text-slate-500">{provider.failureCount} failures · {provider.stalledCount} stalled</p></div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${provider.state === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{provider.state}</span>
            </div>)}
            {!escalationWorkflow.providerHealth.length ? <p className="p-6 text-sm text-slate-500">No provider-health scan is recorded.</p> : null}
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b p-6">
            <h3 className="text-lg font-semibold">Latest SLO evaluation</h3>
            <p className="mt-1 text-sm text-slate-500">Current findings from the most recently recorded daily scan.</p>
          </div>
          <div className="divide-y">
            {escalationWorkflow.evaluations.map((evaluation) => <div className="p-5" key={evaluation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><strong className="text-sm">{incidentTitles.get(evaluation.incidentId) || evaluation.incidentId}</strong><p className="mt-1 text-xs text-slate-500">{policyLabels.get(evaluation.policyCode) || evaluation.policyCode}</p></div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sloStateClass[evaluation.state]}`}>{evaluation.state.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">Elapsed {formatDuration(evaluation.elapsedMinutes)} · target {formatDuration(evaluation.targetMinutes)}</p>
            </div>)}
            {!escalationWorkflow.evaluations.length ? <p className="p-6 text-sm text-slate-500">No SLO evaluations are recorded.</p> : null}
          </div>
        </article>
      </section>

      <section className="mt-6 space-y-5" aria-labelledby="escalation-list-title">
        <div><h3 className="text-xl font-semibold" id="escalation-list-title">Internal escalations</h3><p className="mt-1 text-sm text-slate-500">Acknowledgment records operator ownership only; it does not send a notification or authorize external action.</p></div>
        {escalationWorkflow.escalations.map((escalation) => <article className="card overflow-hidden" key={escalation.id}>
          <div className="border-b p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${escalationStateClass[escalation.status]}`}>{escalation.status}</span>
                <h4 className="mt-3 text-lg font-semibold text-slate-950">{incidentTitles.get(escalation.incidentId) || escalation.incidentId}</h4>
                <p className="mt-1 text-sm text-slate-600">{policyLabels.get(escalation.policyCode) || escalation.policyCode}</p>
                <p className="mt-2 text-xs text-slate-500">First detected {formatDate(escalation.firstDetectedAt)} · latest {formatDate(escalation.latestDetectedAt)}</p>
              </div>
              {escalation.acknowledgedByName ? <p className="text-xs text-slate-500">Acknowledged by {escalation.acknowledgedByName}</p> : null}
            </div>
          </div>
          {escalation.status === "open" ? <form className="border-b bg-sky-50 p-6" onSubmit={(event) => acknowledge(event, escalation.id)}>
            <label className="text-sm font-medium text-sky-950">Sanitized acknowledgment note
              <textarea className="input mt-2 min-h-20" maxLength={500} minLength={2} name="note" placeholder="Record ownership or the internal review underway" required />
            </label>
            <button className="btn-primary mt-3" disabled={isPending} type="submit">Acknowledge escalation</button>
          </form> : null}
          <div className="p-6">
            <h5 className="text-sm font-semibold">Immutable escalation receipts</h5>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {escalation.events.slice(0, 8).map((event) => <div className="rounded-xl border p-3" key={event.id}><p className="text-sm leading-6 text-slate-700">{event.summary}</p><p className="mt-2 text-xs text-slate-500">{event.actorName} · {formatDate(event.createdAt)}</p></div>)}
            </div>
          </div>
        </article>)}
        {!escalationWorkflow.escalations.length ? <div className="card p-6 text-sm text-slate-500">No internal escalations are recorded.</div> : null}
      </section>
    </>}
  </section>;
}
