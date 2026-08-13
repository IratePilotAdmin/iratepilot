"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SynxisActivationEvidence, SynxisReadiness } from "@/services/hotel-suppliers/synxis";

type Evidence = Required<SynxisActivationEvidence> & {
  vendorApprovalReference: string;
  approvedEnvironment: string;
  propertyCode: string;
  supportContact: string;
  verificationNotes: string;
};

type SynxisResponse = {
  evidence: Evidence;
  readiness: SynxisReadiness;
  evidenceTrackingAvailable: boolean;
  activationDetailsComplete: boolean;
  liveActivationAllowed: boolean;
  history: Array<{
    id: string;
    eventType: string;
    changedFields: string[];
    actor: string;
    createdAt: string;
  }>;
  historyAvailable: boolean;
  updatedAt: string | null;
};

const liveConfirmation = "ENABLE SABRE SYNXIS LIVE TRAFFIC";
const statusStyle: Record<SynxisReadiness["status"], string> = {
  configuration_required: "text-amber-700",
  configuration_invalid: "text-red-700",
  vendor_approval_required: "text-amber-700",
  certification_required: "text-amber-700",
  property_mapping_required: "text-amber-700",
  sandbox_validation_required: "text-amber-700",
  production_smoke_required: "text-amber-700",
  activation_required: "text-blue-700",
  live: "text-emerald-700",
};

const gates = [
  { key: "vendorApproved", label: "Sabre vendor approval", requires: [] },
  { key: "certificationEnvironmentApproved", label: "Certification environment", requires: ["vendorApproved"] },
  { key: "propertyMapped", label: "Real property mapping", requires: ["vendorApproved", "certificationEnvironmentApproved"] },
  { key: "sandboxValidated", label: "Sandbox validation", requires: ["propertyMapped"] },
  { key: "productionSmokeValidated", label: "Production smoke test", requires: ["sandboxValidated"] },
] as const;

const auditFieldLabels: Record<string, string> = {
  vendor_approved: "vendor approval",
  certification_environment_approved: "certification environment",
  property_mapped: "property mapping",
  sandbox_validated: "sandbox validation",
  production_smoke_validated: "production smoke test",
  live_enabled: "live traffic",
  vendor_approval_reference: "approval reference",
  approved_environment: "approved environment",
  property_code: "property code",
  support_contact: "support contact",
  verification_notes: "verification notes",
};

export function SynxisCrsReadiness() {
  const [data, setData] = useState<SynxisResponse | null>(null);
  const [message, setMessage] = useState("Checking SynXis certification readiness...");
  const [busy, setBusy] = useState(false);
  const [livePhrase, setLivePhrase] = useState("");

  useEffect(() => {
    fetch("/api/admin/integrations/crs/synxis", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "SynXis readiness could not be loaded.");
        setData(body);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/crs/synxis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "SynXis evidence could not be updated.");
      setData(result);
      setMessage(successMessage);
      setLivePhrase("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SynXis evidence could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries([
      "vendorApprovalReference",
      "approvedEnvironment",
      "propertyCode",
      "supportContact",
      "verificationNotes",
    ].map((key) => [key, form.get(key) ?? ""]));
    await patch({ details }, "SynXis evidence details were saved.");
  }

  return <section className="card mt-6 overflow-hidden">
    <div className="border-b p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider text-slate-500">CRS and distribution</span>
          <h2 className="mt-2 text-xl font-semibold">Sabre SynXis certification</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Record non-secret approval evidence and advance each certification gate in order. This is separate from the PMS provider list.</p>
        </div>
        {data && <span className={`text-sm font-semibold ${statusStyle[data.readiness.status]}`}>
          {data.readiness.status.replaceAll("_", " ")}
        </span>}
      </div>
      {data && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
        <span>Evidence ledger: {data.evidenceTrackingAvailable ? "available" : "migration required"}</span>
        <span>Activation details: {data.activationDetailsComplete ? "verified" : "incomplete"}</span>
        <span>Traffic: {data.readiness.liveTrafficAllowed ? "live" : "disabled"}</span>
      </div>}
    </div>

    {data && <div className="p-6">
      {(data.readiness.missingEnvironmentKeys.length > 0 || data.readiness.invalidEnvironmentKeys.length > 0) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <strong className="text-amber-900">Production configuration is not ready.</strong>
        {data.readiness.missingEnvironmentKeys.length > 0 && <p className="mt-2 break-words text-xs text-amber-800">Missing keys: {data.readiness.missingEnvironmentKeys.join(", ")}</p>}
        {data.readiness.invalidEnvironmentKeys.length > 0 && <p className="mt-2 break-words text-xs text-red-700">Invalid keys: {data.readiness.invalidEnvironmentKeys.join(", ")}</p>}
      </div>}

      <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {gates.map((gate, index) => {
          const complete = data.evidence[gate.key];
          const prerequisiteComplete = gate.requires.every((key) => data.evidence[key]);
          return <li className={`rounded-lg border p-4 ${complete ? "border-emerald-200 bg-emerald-50" : "bg-slate-50"}`} key={gate.key}>
            <span className="text-xs uppercase tracking-wider text-slate-500">Gate {index + 1}</span>
            <strong className="mt-2 block text-sm">{gate.label}</strong>
            <p className={`mt-2 text-xs ${complete ? "text-emerald-700" : "text-amber-700"}`}>{complete ? "Complete" : "Pending"}</p>
            <button
              className="btn-secondary mt-3 text-xs"
              disabled={busy || !data.evidenceTrackingAvailable || (!complete && !prerequisiteComplete)}
              onClick={() => void patch({ evidence: { [gate.key]: !complete } }, `${gate.label} was ${complete ? "reset" : "confirmed"}.`)}
              type="button"
            >{complete ? "Reset gate" : "Confirm gate"}</button>
          </li>;
        })}
      </ol>

      <details className="mt-5 rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Non-secret certification evidence</summary>
        <form className="mt-4 grid gap-3" key={data.updatedAt ?? "new"} onSubmit={saveDetails}>
          <p className="text-xs text-slate-500">Do not enter usernames, passwords, API keys, access tokens, or webhook secrets.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium">Sabre approval reference<input className="input mt-1" defaultValue={data.evidence.vendorApprovalReference} maxLength={500} name="vendorApprovalReference" /></label>
            <label className="text-xs font-medium">Approved certification environment<input className="input mt-1" defaultValue={data.evidence.approvedEnvironment} maxLength={200} name="approvedEnvironment" /></label>
            <label className="text-xs font-medium">Real SynXis property code<input className="input mt-1" defaultValue={data.evidence.propertyCode} maxLength={200} name="propertyCode" /></label>
            <label className="text-xs font-medium">Sabre support or escalation contact<input className="input mt-1" defaultValue={data.evidence.supportContact} maxLength={500} name="supportContact" /></label>
          </div>
          <label className="text-xs font-medium">Verification notes<textarea className="input mt-1 min-h-24" defaultValue={data.evidence.verificationNotes} maxLength={4000} name="verificationNotes" /></label>
          <button className="btn-secondary w-fit text-xs" disabled={busy || !data.evidenceTrackingAvailable} type="submit">Save evidence details</button>
        </form>
      </details>

      <details className="mt-5 rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Certification activity</summary>
        {!data.historyAvailable ? <p className="mt-3 text-sm text-amber-700">Apply migration 041 to begin the immutable audit history.</p>
          : data.history.length === 0 ? <p className="mt-3 text-sm text-slate-500">No certification evidence changes have been recorded yet.</p>
            : <ol className="mt-4 divide-y">
              {data.history.map((event) => <li className="py-3 first:pt-0 last:pb-0" key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <strong>{event.eventType === "evidence_created" ? "Evidence record created" : "Evidence updated"}</strong>
                  <time className="text-xs text-slate-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-1 text-xs text-slate-500">By {event.actor}</p>
                <p className="mt-1 text-xs text-slate-600">Changed: {event.changedFields.map((field) => auditFieldLabels[field] ?? field.replaceAll("_", " ")).join(", ")}</p>
              </li>)}
            </ol>}
      </details>

      <div className={`mt-5 rounded-lg border p-4 ${data.readiness.liveTrafficAllowed ? "border-emerald-300 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <strong className={data.readiness.liveTrafficAllowed ? "text-emerald-900" : "text-red-900"}>Production traffic control</strong>
        <p className="mt-2 text-sm text-slate-700">{data.readiness.liveTrafficAllowed
          ? "SynXis live traffic is enabled. Disable it immediately if an approval, mapping, or validation becomes invalid."
          : data.liveActivationAllowed
            ? "All prerequisites are complete. Type the exact confirmation phrase to unlock the final switch."
            : "Live activation is locked until configuration, evidence details, and all five certification gates are complete."}</p>
        {!data.evidence.liveEnabled && data.liveActivationAllowed && <label className="mt-3 block text-xs font-medium">Type {liveConfirmation}
          <input className="input mt-2" autoComplete="off" value={livePhrase} onChange={(event) => setLivePhrase(event.target.value)} />
        </label>}
        <button
          className={data.evidence.liveEnabled ? "btn-secondary mt-3 text-xs" : "btn-primary mt-3 text-xs"}
          disabled={busy || !data.evidenceTrackingAvailable || (!data.evidence.liveEnabled && (!data.liveActivationAllowed || livePhrase !== liveConfirmation))}
          onClick={() => void patch({
            evidence: { liveEnabled: !data.evidence.liveEnabled },
            confirmation: data.evidence.liveEnabled ? undefined : livePhrase,
          }, `SynXis live traffic was ${data.evidence.liveEnabled ? "disabled" : "enabled"}.`)}
          type="button"
        >{data.evidence.liveEnabled ? "Disable live traffic" : "Enable live traffic"}</button>
      </div>
    </div>}
    {message && <p className="border-t p-4 text-sm text-slate-600" role="status">{message}</p>}
  </section>;
}
