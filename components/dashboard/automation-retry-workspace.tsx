"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  approveAutomationRetryRequestAction,
  cancelAutomationRetryRequestAction,
  createAutomationRetryRequestAction,
  recordAutomationRetryDryRunAction,
  type AutomationRetryActionResult,
} from "@/app/admin/operations/retry-actions";
import type { AutomationRetryRequest, AutomationRetrySnapshot } from "@/lib/admin/automation-retry";
import type { AutomationWorkflowSnapshot } from "@/lib/admin/automation-workflow";

type Props = {
  retryWorkflow: AutomationRetrySnapshot;
  incidentWorkflow: AutomationWorkflowSnapshot;
  onRefresh: () => Promise<void>;
};

const statusClass: Record<AutomationRetryRequest["status"], string> = {
  pending_approval: "border-amber-200 bg-amber-50 text-amber-900",
  approved: "border-sky-200 bg-sky-50 text-sky-900",
  dry_run_completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export function AutomationRetryWorkspace({ retryWorkflow, incidentWorkflow, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const eligibleIncidents = incidentWorkflow.incidents.filter((incident) => incident.status === "acknowledged");
  const incidentTitles = new Map(incidentWorkflow.incidents.map((incident) => [incident.id, incident.title]));
  const definitions = new Map(retryWorkflow.definitions.map((definition) => [definition.id, definition]));

  const runAction = (action: () => Promise<AutomationRetryActionResult>, form?: HTMLFormElement) => {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) {
          form?.reset();
          await onRefresh();
        }
      } catch {
        setMessage("The dry-run authorization ledger could not be updated.");
      }
    });
  };

  const createRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    runAction(() => createAutomationRetryRequestAction({
      incidentId: fields.get("incidentId"),
      retryKind: fields.get("retryKind"),
      targetReference: fields.get("targetReference"),
      reason: fields.get("reason"),
    }), form);
  };

  return <section className="mt-10" aria-labelledby="phase-three-title">
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-700">Automation Operations Center · Phase 3</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="phase-three-title">Controlled retry authorization rehearsal</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
        Create an idempotent dry-run request from an acknowledged incident. The requester cannot approve it, two distinct administrators must approve it, and the final receipt validates controls without invoking an executor.
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-800">
        Dry-run only: no email, payment, refund, transfer, payout, booking mutation, supplier request, or Production action can run here.
      </p>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {retryWorkflow.definitions.map((definition) => <article className="card p-5" key={definition.id}>
        <h3 className="font-semibold text-slate-950">{definition.label}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{definition.purpose}</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">{definition.dryRunCheck}</p>
        <p className="mt-3 text-xs font-semibold leading-5 text-rose-800">{definition.prohibitedAction}</p>
      </article>)}
    </div>

    {!retryWorkflow.available ? <div className="card mt-6 border-amber-200 bg-amber-50 p-6">
      <h3 className="font-semibold text-amber-950">Dry-run authorization migration pending</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">Phase 1 monitoring and Phase 2 runbooks remain available. Phase 3 stays disabled until migrations 064 and 065 are separately approved and applied to Preview.</p>
    </div> : <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Dry-run authorization summary">
        {[
          ["Pending approval", retryWorkflow.summary.pendingApproval],
          ["Approved", retryWorkflow.summary.approved],
          ["Dry runs recorded", retryWorkflow.summary.dryRunCompleted],
          ["Cancelled", retryWorkflow.summary.cancelled],
        ].map(([label, value]) => <article className="card p-5" key={label}>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
          <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
        </article>)}
      </section>

      <form className="card mt-6 p-6" onSubmit={createRequest}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Request a dry-run rehearsal</h3>
            <p className="mt-1 text-sm text-slate-500">Only acknowledged, unresolved incidents are eligible. References must be sanitized and non-secret.</p>
          </div>
          <button className="btn-primary" disabled={isPending || !eligibleIncidents.length} type="submit">{isPending ? "Saving…" : "Record request"}</button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">Acknowledged incident
            <select className="input mt-2" name="incidentId" required>
              <option value="">Choose an incident</option>
              {eligibleIncidents.map((incident) => <option key={incident.id} value={incident.id}>{incident.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Rehearsal type
            <select className="input mt-2" name="retryKind" required>
              {retryWorkflow.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium lg:col-span-2">Sanitized target reference
            <input className="input mt-2" maxLength={200} minLength={2} name="targetReference" placeholder="Non-secret internal receipt or ledger reference" required />
          </label>
          <label className="text-sm font-medium lg:col-span-2">Reason for rehearsal
            <textarea className="input mt-2 min-h-24" maxLength={1000} minLength={8} name="reason" placeholder="Describe the operator decision to validate without including personal or provider data" required />
          </label>
        </div>
        {!eligibleIncidents.length ? <p className="mt-4 text-sm text-amber-800">Acknowledge an unresolved Phase 2 incident before creating a dry-run request.</p> : null}
      </form>

      <p aria-live="polite" className="mt-4 min-h-5 text-sm font-medium text-slate-700">{message}</p>

      <section className="mt-4 space-y-5" aria-labelledby="dry-run-request-list-title">
        <div>
          <h3 className="text-xl font-semibold" id="dry-run-request-list-title">Authorization requests</h3>
          <p className="mt-1 text-sm text-slate-500">Approval and validation receipts are immutable. Idempotency fingerprints prevent duplicate logical requests.</p>
        </div>
        {retryWorkflow.requests.map((request) => {
          const definition = definitions.get(request.kind);
          const currentOperatorApproved = request.approvals.some((approval) => approval.approverId === retryWorkflow.currentOperatorId);
          const canApprove = request.status === "pending_approval"
            && request.requestedById !== retryWorkflow.currentOperatorId
            && !currentOperatorApproved;
          return <article className="card overflow-hidden" key={request.id}>
            <div className="border-b p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass[request.status]}`}>{request.status.replaceAll("_", " ")}</span>
                    <span className="badge">{request.approvals.length}/{retryWorkflow.requiredApprovals} approvals</span>
                    <span className="badge">dry run only</span>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-slate-950">{definition?.label || request.kind}</h4>
                  <p className="mt-1 text-sm text-slate-600">Incident: {incidentTitles.get(request.incidentId) || request.incidentId}</p>
                  <p className="mt-1 text-xs text-slate-500">Requested by {request.requestedByName} · {formatDate(request.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove ? <button className="btn-secondary" disabled={isPending} onClick={() => runAction(() => approveAutomationRetryRequestAction(request.id))} type="button">Record independent approval</button> : null}
                  {request.status === "approved" ? <button className="btn-primary" disabled={isPending} onClick={() => runAction(() => recordAutomationRetryDryRunAction(request.id))} type="button">Record dry-run validation</button> : null}
                  {["pending_approval", "approved"].includes(request.status) ? <button className="btn-secondary" disabled={isPending} onClick={() => runAction(() => cancelAutomationRetryRequestAction(request.id))} type="button">Cancel request</button> : null}
                </div>
              </div>
              <dl className="mt-5 grid gap-3 text-sm lg:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Target reference</dt><dd className="mt-1 break-all font-semibold">{request.targetReference}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Idempotency fingerprint</dt><dd className="mt-1 font-mono text-xs font-semibold">{request.idempotencyKey.slice(0, 16)}…</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Execution boundary</dt><dd className="mt-1 font-semibold">No executor configured</dd></div>
              </dl>
              <p className="mt-4 text-sm leading-6 text-slate-700">{request.reason}</p>
              {request.requestedById === retryWorkflow.currentOperatorId && request.status === "pending_approval" ? <p className="mt-3 text-xs font-semibold text-amber-800">You created this request, so two other administrators must approve it.</p> : null}
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-2">
              <div>
                <h5 className="text-sm font-semibold">Independent approvals</h5>
                <div className="mt-3 space-y-3">
                  {request.approvals.map((approval) => <div className="rounded-xl bg-slate-50 p-3" key={approval.id}><p className="text-sm font-semibold">{approval.approverName}</p><p className="mt-1 text-xs text-slate-500">{formatDate(approval.createdAt)}</p></div>)}
                  {!request.approvals.length ? <p className="text-sm text-slate-500">No approvals recorded.</p> : null}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-semibold">Immutable receipts</h5>
                <div className="mt-3 space-y-3">
                  {request.receipts.slice(0, 8).map((receipt) => <div className="rounded-xl border p-3" key={receipt.id}><p className="text-sm text-slate-700">{receipt.summary}</p><p className="mt-2 text-xs text-slate-500">{receipt.actorName} · {formatDate(receipt.createdAt)}</p></div>)}
                </div>
              </div>
            </div>
          </article>;
        })}
        {!retryWorkflow.requests.length ? <div className="card p-6 text-sm text-slate-500">No dry-run authorization requests are recorded.</div> : null}
      </section>
    </>}
  </section>;
}
