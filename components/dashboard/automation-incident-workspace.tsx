"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  acknowledgeAutomationIncidentAction,
  addAutomationIncidentNoteAction,
  assignAutomationIncidentAction,
  createAutomationIncidentAction,
  resolveAutomationIncidentAction,
  type AutomationIncidentActionResult,
} from "@/app/admin/operations/actions";
import type {
  AutomationIncident,
  AutomationIncidentSeverity,
  AutomationWorkflowSnapshot,
} from "@/lib/admin/automation-workflow";

type Props = {
  workflow: AutomationWorkflowSnapshot;
  onRefresh: () => Promise<void>;
};

const incidentStatusClass: Record<AutomationIncident["status"], string> = {
  open: "border-amber-200 bg-amber-50 text-amber-900",
  acknowledged: "border-sky-200 bg-sky-50 text-sky-900",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const severityClass: Record<AutomationIncidentSeverity, string> = {
  review: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-900",
  critical: "bg-rose-100 text-rose-900",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export function AutomationIncidentWorkspace({ workflow, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const runAction = (
    action: () => Promise<AutomationIncidentActionResult>,
    form?: HTMLFormElement,
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) {
          form?.reset();
          await onRefresh();
        }
      } catch {
        setMessage("The incident workflow could not be updated.");
      }
    });
  };

  const createIncident = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    runAction(() => createAutomationIncidentAction({
      title: fields.get("title"),
      lane: fields.get("lane"),
      severity: fields.get("severity"),
      sourceReference: fields.get("sourceReference"),
    }), form);
  };

  return <section className="mt-10" aria-labelledby="phase-two-title">
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-700">Automation Operations Center · Phase 2</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="phase-two-title">Operator runbooks and incident ownership</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
        Coordinate review with acknowledgment, assignment, and immutable notes. This workspace records operator decisions only—it cannot execute automation or authorize an external action.
      </p>
      <p className="mt-3 text-xs font-semibold text-rose-800">
        Never enter credentials, tokens, card or bank data, guest details, message bodies, or supplier payloads.
      </p>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {workflow.runbooks.map((runbook) => <details className="card p-5" key={runbook.id}>
        <summary className="cursor-pointer font-semibold text-slate-950">{runbook.label}</summary>
        <p className="mt-3 text-sm leading-6 text-slate-600">{runbook.purpose}</p>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Response steps</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
          {runbook.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Completion checks</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {runbook.completionChecks.map((check) => <li key={check}>{check}</li>)}
        </ul>
        <p className="mt-4 text-xs leading-5 text-rose-800">{runbook.prohibitedActions[1]}</p>
      </details>)}
    </div>

    {!workflow.available ? <div className="card mt-6 border-amber-200 bg-amber-50 p-6">
      <h3 className="font-semibold text-amber-950">Incident workspace migration pending</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">The runbooks remain available, but acknowledgment, assignment, and notes stay disabled until migration 064 is separately approved and applied to Preview.</p>
    </div> : <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Incident summary">
        {[
          ["Open", workflow.summary.open],
          ["Acknowledged", workflow.summary.acknowledged],
          ["Resolved", workflow.summary.resolved],
          ["Unassigned", workflow.summary.unassigned],
        ].map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
        </article>)}
      </section>

      <form className="card mt-6 p-6" onSubmit={createIncident}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-semibold">Create operator incident</h3><p className="mt-1 text-sm text-slate-500">Use a sanitized title and optional non-secret source reference.</p></div>
          <button className="btn-primary" disabled={isPending} type="submit">{isPending ? "Saving…" : "Create incident"}</button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <label className="text-sm font-medium lg:col-span-2">Title
            <input className="input mt-2" maxLength={160} minLength={8} name="title" placeholder="Describe the operator review needed" required />
          </label>
          <label className="text-sm font-medium">Runbook
            <select className="input mt-2" name="lane" required>
              {workflow.runbooks.map((runbook) => <option key={runbook.id} value={runbook.id}>{runbook.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Severity
            <select className="input mt-2" defaultValue="review" name="severity" required>
              <option value="review">Review</option><option value="warning">Warning</option><option value="critical">Critical</option>
            </select>
          </label>
          <label className="text-sm font-medium lg:col-span-4">Source reference (optional)
            <input className="input mt-2" maxLength={200} name="sourceReference" placeholder="Sanitized internal reference only" />
          </label>
        </div>
      </form>

      <p aria-live="polite" className="mt-4 min-h-5 text-sm font-medium text-slate-700">{message}</p>

      <section className="mt-4 space-y-5" aria-labelledby="incident-list-title">
        <div><h3 className="text-xl font-semibold" id="incident-list-title">Operator incidents</h3><p className="mt-1 text-sm text-slate-500">Newest activity first. Notes and event receipts are immutable.</p></div>
        {workflow.incidents.map((incident) => <article className="card overflow-hidden" key={incident.id}>
          <div className="border-b p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${severityClass[incident.severity]}`}>{incident.severity}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${incidentStatusClass[incident.status]}`}>{incident.status}</span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-slate-950">{incident.title}</h4>
                <p className="mt-1 text-xs text-slate-500">{incident.lane} runbook · Created by {incident.createdByName} · {formatDate(incident.createdAt)}</p>
                {incident.sourceReference ? <p className="mt-2 text-xs text-slate-600">Source: {incident.sourceReference}</p> : null}
              </div>
              {incident.status === "open" ? <button className="btn-secondary" disabled={isPending} onClick={() => runAction(() => acknowledgeAutomationIncidentAction(incident.id))} type="button">Acknowledge</button> : null}
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Assigned to</dt><dd className="mt-1 font-semibold">{incident.assigneeName || "Unassigned"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Acknowledged by</dt><dd className="mt-1 font-semibold">{incident.acknowledgedByName || "Pending"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Last updated</dt><dd className="mt-1 font-semibold">{formatDate(incident.updatedAt)}</dd></div>
            </dl>
          </div>

          {incident.status !== "resolved" ? <div className="grid gap-5 border-b p-6 lg:grid-cols-2">
            <form onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const assignee = new FormData(form).get("assignee");
              runAction(() => assignAutomationIncidentAction(incident.id, typeof assignee === "string" && assignee ? assignee : null), form);
            }}>
              <label className="text-sm font-medium">Assignment
                <select className="input mt-2" defaultValue={incident.assigneeId || ""} key={incident.assigneeId || "unassigned"} name="assignee">
                  <option value="">Unassigned</option>
                  {workflow.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
                </select>
              </label>
              <button className="btn-secondary mt-3" disabled={isPending} type="submit">Save assignment</button>
            </form>
            <form onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const note = new FormData(form).get("note");
              runAction(() => addAutomationIncidentNoteAction(incident.id, typeof note === "string" ? note : ""), form);
            }}>
              <label className="text-sm font-medium">Add immutable note
                <textarea className="input mt-2 min-h-24" maxLength={2000} minLength={2} name="note" placeholder="Sanitized finding or handoff note" required />
              </label>
              <button className="btn-secondary mt-3" disabled={isPending} type="submit">Add note</button>
            </form>
          </div> : null}

          {incident.status === "acknowledged" ? <form className="border-b bg-emerald-50 p-6" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const note = new FormData(form).get("resolutionNote");
            runAction(() => resolveAutomationIncidentAction(incident.id, typeof note === "string" ? note : ""), form);
          }}>
            <label className="text-sm font-medium text-emerald-950">Resolution note
              <textarea className="input mt-2 min-h-24" maxLength={2000} minLength={2} name="resolutionNote" placeholder="Sanitized outcome and verification performed" required />
            </label>
            <button className="btn-primary mt-3" disabled={isPending} type="submit">Resolve incident</button>
          </form> : null}

          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <div><h5 className="text-sm font-semibold">Notes</h5><div className="mt-3 space-y-3">
              {incident.notes.slice(0, 5).map((note) => <div className="rounded-xl bg-slate-50 p-3" key={note.id}><p className="text-sm leading-6 text-slate-700">{note.body}</p><p className="mt-2 text-xs text-slate-500">{note.authorName} · {formatDate(note.createdAt)}</p></div>)}
              {!incident.notes.length ? <p className="text-sm text-slate-500">No notes recorded.</p> : null}
            </div></div>
            <div><h5 className="text-sm font-semibold">Audit receipts</h5><div className="mt-3 space-y-3">
              {incident.events.slice(0, 5).map((event) => <div className="rounded-xl border p-3" key={event.id}><p className="text-sm text-slate-700">{event.summary}</p><p className="mt-2 text-xs text-slate-500">{event.actorName} · {formatDate(event.createdAt)}</p></div>)}
            </div></div>
          </div>
        </article>)}
        {!workflow.incidents.length ? <div className="card p-6 text-sm text-slate-500">No operator incidents are recorded.</div> : null}
      </section>
    </>}
  </section>;
}
