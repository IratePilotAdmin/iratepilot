"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReadinessItem } from "@/lib/admin/platform-readiness";
import type { PmsProviderReadiness, PriorityPmsLaunchStatus } from "@/services/hotel-suppliers";

type Response = {
  items: ReadinessItem[];
  summary: { ready: number; attention: number; off: number };
  requiredReady: boolean;
};

type PmsConnection = {
  id: string;
  provider_id: string;
  property_name: string;
  external_property_code: string;
  connection_status: string;
  credential_keys: string[];
  credentials_configured: boolean;
  credentials_updated_at: string | null;
};

type PriorityPmsProductionReadiness = {
  id: string;
  name: string;
  status: PriorityPmsLaunchStatus;
  configuredEnvironmentKeys: string[];
  missingEnvironmentKeys: string[];
  invalidEnvironmentKeys: string[];
  readyForRealPropertyActivation: boolean;
  activationChecklist: Record<string, boolean>;
  evidence: {
    vendorApproved: boolean;
    propertyMapped: boolean;
    sandboxValidated: boolean;
    webhookValidated: boolean;
    productionSmokeValidated: boolean;
    liveEnabled: boolean;
    vendorApprovalReference: string;
    approvedEnvironment: string;
    propertyCode: string;
    supportContact: string;
    verificationNotes: string;
  };
};

const categories: Array<[ReadinessItem["category"], string]> = [
  ["core", "Core platform"],
  ["communications", "Communications"],
  ["payments", "Payments and pricing"],
  ["features", "Feature flags"],
];
const statusStyle = { ready: "text-emerald-700", attention: "text-amber-700", off: "text-slate-500" };
const priorityStatusStyle: Record<PriorityPmsLaunchStatus, string> = {
  configuration_required: "text-amber-700",
  configuration_invalid: "text-red-700",
  vendor_approval_required: "text-amber-700",
  activation_details_required: "text-amber-700",
  property_mapping_required: "text-amber-700",
  sandbox_validation_required: "text-amber-700",
  webhook_validation_required: "text-amber-700",
  production_smoke_required: "text-amber-700",
  activation_required: "text-blue-700",
  live: "text-emerald-700",
};

export function AdminSettings() {
  const [data, setData] = useState<Response | null>(null);
  const [message, setMessage] = useState("Checking platform readinessâ€¦");
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestMessage, setEmailTestMessage] = useState("");
  const [pmsProviders, setPmsProviders] = useState<PmsProviderReadiness[]>([]);
  const [priorityPmsReadiness, setPriorityPmsReadiness] = useState<PriorityPmsProductionReadiness[]>([]);
  const [evidenceTrackingAvailable, setEvidenceTrackingAvailable] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [pmsConnections, setPmsConnections] = useState<PmsConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [pmsMessage, setPmsMessage] = useState("Checking PMS connectionsâ€¦");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState("");
  const selectedConnection = useMemo(
    () => pmsConnections.find((connection) => connection.id === selectedConnectionId),
    [pmsConnections, selectedConnectionId],
  );

  async function sendEmailTest() {
    setEmailTestBusy(true);
    setEmailTestMessage("");
    try {
      const response = await fetch("/api/admin/email-test", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The test email could not be sent.");
      setEmailTestMessage(body.message);
    } catch (error) {
      setEmailTestMessage(error instanceof Error ? error.message : "The test email could not be sent.");
    } finally {
      setEmailTestBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));

    fetch("/api/admin/integrations/pms", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setPmsProviders(body.providers);
        setPriorityPmsReadiness(body.priorityProductionReadiness ?? []);
        setEvidenceTrackingAvailable(body.evidenceTrackingAvailable === true);
        setPmsConnections(body.connections ?? []);
        setSelectedConnectionId((current) => current || body.connections?.[0]?.id || "");
        setPmsMessage("");
      })
      .catch((error: Error) => setPmsMessage(error.message));
  }, []);

  async function updateLaunchEvidence(
    providerId: string,
    evidence: Partial<PriorityPmsProductionReadiness["evidence"]>,
  ) {
    setEvidenceBusy(providerId);
    setEvidenceMessage("");
    try {
      const response = await fetch("/api/admin/integrations/pms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, evidence }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Launch evidence could not be updated.");
      setPriorityPmsReadiness((items) => items.map((item) => item.id === providerId ? body.readiness : item));
      setEvidenceMessage(`${body.readiness.name} launch evidence was updated.`);
    } catch (error) {
      setEvidenceMessage(error instanceof Error ? error.message : "Launch evidence could not be updated.");
    } finally {
      setEvidenceBusy("");
    }
  }

  async function saveLaunchDetails(event: FormEvent<HTMLFormElement>, providerId: string) {
    event.preventDefault();
    setEvidenceBusy(providerId);
    setEvidenceMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const details = Object.fromEntries(["vendorApprovalReference", "approvedEnvironment", "propertyCode", "supportContact", "verificationNotes"]
        .map((key) => [key, form.get(key) ?? ""]));
      const response = await fetch("/api/admin/integrations/pms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, details }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Activation evidence details could not be saved.");
      setPriorityPmsReadiness((items) => items.map((item) => item.id === providerId ? body.readiness : item));
      setEvidenceMessage(`${body.readiness.name} activation evidence details were saved.`);
    } catch (error) {
      setEvidenceMessage(error instanceof Error ? error.message : "Activation evidence details could not be saved.");
    } finally {
      setEvidenceBusy("");
    }
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConnection) return;
    setCredentialBusy(true);
    setCredentialMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const credentials = Object.fromEntries(selectedConnection.credential_keys.map((key) => [key, form.get(key)]));
      const response = await fetch("/api/admin/integrations/pms/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedConnection.id, credentials }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Credentials could not be stored.");
      setCredentialMessage(body.message);
      event.currentTarget.reset();
      setPmsConnections((items) => items.map((item) => item.id === selectedConnection.id
        ? { ...item, credentials_configured: true, credentials_updated_at: new Date().toISOString() }
        : item));
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : "Credentials could not be stored.");
    } finally {
      setCredentialBusy(false);
    }
  }

  async function testCredentials() {
    if (!selectedConnection) return;
    setCredentialBusy(true);
    setCredentialMessage("");
    try {
      const response = await fetch("/api/admin/integrations/pms/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedConnection.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Configuration test failed.");
      setCredentialMessage(body.passed
        ? "Encrypted configuration passed validation. No live vendor request was sent."
        : "Encrypted configuration did not pass validation.");
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : "Configuration test failed.");
    } finally {
      setCredentialBusy(false);
    }
  }

  return <>
    {message && <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>}
    {data && <>
      <section className={`card mt-8 border-l-4 p-6 ${data.requiredReady ? "border-l-emerald-600" : "border-l-amber-600"}`}>
        <span className="text-xs uppercase tracking-wider text-slate-500">Private pilot configuration</span>
        <h2 className="mt-2 text-2xl font-semibold">{data.requiredReady ? "Required services are configured" : "Required services need attention"}</h2>
        <p className="mt-2 text-sm text-slate-600">This checks configuration and connectivity only. It does not verify database migration state, legal approval, or production payment readiness.</p>
        <div className="mt-5 flex flex-wrap gap-5 text-sm"><span><strong>{data.summary.ready}</strong> ready</span><span><strong>{data.summary.attention}</strong> need attention</span><span><strong>{data.summary.off}</strong> intentionally off</span></div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-xl font-semibold">Transactional email test</h2>
        <p className="mt-2 text-sm text-slate-600">Send one operational test message to the signed-in administrator. This creates no booking, payment, refund, or partner transfer.</p>
        <button className="btn-primary mt-4" disabled={emailTestBusy} onClick={sendEmailTest}>{emailTestBusy ? "Sendingâ€¦" : "Send test email"}</button>
        {emailTestMessage && <p className="mt-3 text-sm" role="status">{emailTestMessage}</p>}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b p-6">
          <span className="text-xs uppercase tracking-wider text-slate-500">Hotel connectivity</span>
          <h2 className="mt-2 text-xl font-semibold">PMS integration readiness</h2>
          <p className="mt-2 text-sm text-slate-600">Credential values remain server-side. Ready for validation means configuration is present; it does not mean vendor certification or live traffic is enabled.</p>
          {pmsProviders.length > 0 && <div className="mt-4 flex flex-wrap gap-5 text-sm">
            <span><strong>{pmsProviders.length}</strong> providers</span>
            <span><strong>{pmsProviders.filter((provider) => provider.status === "ready_for_validation").length}</strong> ready for validation</span>
            <span><strong>{pmsProviders.filter((provider) => provider.status !== "ready_for_validation").length}</strong> need configuration</span>
          </div>}
        </div>
        {priorityPmsReadiness.length > 0 && <div className="border-b bg-slate-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500">Production launch gate</span>
              <h3 className="mt-2 text-lg font-semibold">PMS production readiness</h3>
              <p className="mt-1 text-sm text-slate-600">This strict audit requires valid production configuration, vendor approval, property mapping, sandbox validation, verified webhooks, and a production test-property smoke test. Only configuration key names are shown; secret values never leave the server.</p>
              <p className="mt-2 text-xs text-slate-500">Mark a gate complete only after its approval, mapping record, or sandbox test evidence has been independently verified.</p>
            </div>
            <div className="text-sm text-slate-600">
              <strong>{priorityPmsReadiness.filter((provider) => provider.status === "live").length}</strong> of <strong>{priorityPmsReadiness.length}</strong> live
            </div>
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {priorityPmsReadiness.map((provider) => <article className="rounded-lg border bg-white p-4" key={provider.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <strong>{provider.name}</strong>
                <span className={`text-sm font-semibold ${priorityStatusStyle[provider.status]}`}>{provider.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Configured keys: {provider.configuredEnvironmentKeys.length}</p>
              {provider.missingEnvironmentKeys.length > 0 && <p className="mt-2 break-words text-xs text-amber-700">Missing: {provider.missingEnvironmentKeys.join(", ")}</p>}
              {provider.invalidEnvironmentKeys.length > 0 && <p className="mt-2 break-words text-xs text-red-700">Invalid: {provider.invalidEnvironmentKeys.join(", ")}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Vendor: {provider.evidence.vendorApproved ? "approved" : "pending"}</span>
                <span>Mapping: {provider.evidence.propertyMapped ? "complete" : "pending"}</span>
                <span>Sandbox: {provider.evidence.sandboxValidated ? "passed" : "pending"}</span>
                <span>Webhook: {provider.evidence.webhookValidated ? "passed" : "pending"}</span>
                <span>Production smoke: {provider.evidence.productionSmokeValidated ? "passed" : "pending"}</span>
                <span>Traffic: {provider.evidence.liveEnabled ? "enabled" : "disabled"}</span>
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Real-property activation checklist</p>
                <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  {Object.entries(provider.activationChecklist).map(([key, complete]) => <li className={complete ? "text-emerald-700" : "text-amber-700"} key={key}>
                    {complete ? "✓" : "○"} {key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}
                  </li>)}
                </ul>
                <p className={`mt-3 text-xs font-semibold ${provider.readyForRealPropertyActivation ? "text-emerald-700" : "text-amber-700"}`}>
                  {provider.readyForRealPropertyActivation ? "Ready for controlled live activation" : "Live activation remains blocked"}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id} onClick={() => updateLaunchEvidence(provider.id, { vendorApproved: !provider.evidence.vendorApproved })} type="button">
                  {provider.evidence.vendorApproved ? "Revoke vendor approval" : "Confirm vendor approval"}
                </button>
                <button className="btn-secondary text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id || !provider.evidence.vendorApproved} onClick={() => updateLaunchEvidence(provider.id, { propertyMapped: !provider.evidence.propertyMapped })} type="button">
                  {provider.evidence.propertyMapped ? "Reset property mapping" : "Confirm property mapping"}
                </button>
                <button className="btn-secondary text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id || !provider.evidence.vendorApproved || !provider.evidence.propertyMapped} onClick={() => updateLaunchEvidence(provider.id, { sandboxValidated: !provider.evidence.sandboxValidated })} type="button">
                  {provider.evidence.sandboxValidated ? "Reset sandbox validation" : "Confirm sandbox validation"}
                </button>
                <button className="btn-secondary text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id || !provider.evidence.sandboxValidated} onClick={() => updateLaunchEvidence(provider.id, { webhookValidated: !provider.evidence.webhookValidated })} type="button">
                  {provider.evidence.webhookValidated ? "Reset webhook validation" : "Confirm webhook validation"}
                </button>
                <button className="btn-secondary text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id || !provider.evidence.webhookValidated} onClick={() => updateLaunchEvidence(provider.id, { productionSmokeValidated: !provider.evidence.productionSmokeValidated })} type="button">
                  {provider.evidence.productionSmokeValidated ? "Reset production smoke test" : "Confirm production smoke test"}
                </button>
                <button className={provider.evidence.liveEnabled ? "btn-secondary text-xs" : "btn-primary text-xs"} disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id || !provider.evidence.productionSmokeValidated} onClick={() => updateLaunchEvidence(provider.id, { liveEnabled: !provider.evidence.liveEnabled })} type="button">
                  {provider.evidence.liveEnabled ? "Disable live traffic" : "Enable live traffic"}
                </button>
              </div>
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium">Vendor evidence details</summary>
                <form className="mt-3 grid gap-3" onSubmit={(event) => saveLaunchDetails(event, provider.id)}>
                  <p className="text-xs text-slate-500">Record non-secret references only. Never enter passwords, API keys, tokens, or webhook secrets here.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium">Approval or certification reference<input className="input mt-1" defaultValue={provider.evidence.vendorApprovalReference} maxLength={500} name="vendorApprovalReference" /></label>
                    <label className="text-xs font-medium">Approved environment<input className="input mt-1" defaultValue={provider.evidence.approvedEnvironment} maxLength={200} name="approvedEnvironment" /></label>
                    <label className="text-xs font-medium">Property or portfolio code<input className="input mt-1" defaultValue={provider.evidence.propertyCode} maxLength={200} name="propertyCode" /></label>
                    <label className="text-xs font-medium">Support or escalation contact<input className="input mt-1" defaultValue={provider.evidence.supportContact} maxLength={500} name="supportContact" /></label>
                  </div>
                  <label className="text-xs font-medium">Verification notes<textarea className="input mt-1 min-h-24" defaultValue={provider.evidence.verificationNotes} maxLength={4000} name="verificationNotes" /></label>
                  <button className="btn-secondary w-fit text-xs" disabled={!evidenceTrackingAvailable || evidenceBusy === provider.id} type="submit">Save evidence details</button>
                </form>
              </details>
            </article>)}
          </div>
          {!evidenceTrackingAvailable && <p className="mt-4 text-sm text-amber-700">Launch evidence tracking is unavailable until production migrations 034, 035, 036, and 038 are applied.</p>}
          {evidenceMessage && <p className="mt-4 text-sm" role="status">{evidenceMessage}</p>}
        </div>}
        {pmsMessage && <p className="p-6 text-sm text-slate-600" role="status">{pmsMessage}</p>}
        {pmsProviders.length > 0 && <div className="divide-y">
          {pmsProviders.map((provider) => <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]" key={provider.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{provider.name}</strong>
                <span className="text-xs text-slate-500">{provider.vendor}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{provider.notes}</p>
              <p className="mt-2 text-xs text-slate-400">Capabilities: {provider.capabilities.join(", ")}</p>
            </div>
            <div className="lg:text-right">
              <span className={`text-sm font-semibold ${provider.status === "ready_for_validation" ? "text-emerald-700" : provider.status === "credentials_required" ? "text-amber-700" : "text-slate-500"}`}>
                {provider.status.replaceAll("_", " ")}
              </span>
              {provider.missingConfiguration.length > 0 && <p className="mt-2 max-w-xl break-words text-xs text-slate-400">Missing: {provider.missingConfiguration.join(", ")}</p>}
            </div>
          </article>)}
        </div>}
      </section>

      <section className="card mt-6 p-6">
        <span className="text-xs uppercase tracking-wider text-slate-500">Administrators only</span>
        <h2 className="mt-2 text-xl font-semibold">PMS credential vault</h2>
        <p className="mt-2 text-sm text-slate-600">Store sandbox credentials with server-side encryption. Saved values are never returned to this page or exposed to hotel partners.</p>
        {pmsConnections.length === 0 ? <p className="mt-4 text-sm text-slate-500">A partner must declare a hotel PMS before credentials can be configured.</p> : <form key={selectedConnectionId} className="mt-5 grid gap-4" onSubmit={saveCredentials}>
          <label className="text-sm font-medium">Hotel connection
            <select className="input mt-2" value={selectedConnectionId} onChange={(event) => { setSelectedConnectionId(event.target.value); setCredentialMessage(""); }} required>
              {pmsConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.property_name} â€” {connection.provider_id}</option>)}
            </select>
          </label>
          {selectedConnection && <>
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              <strong className="text-slate-900">{selectedConnection.property_name}</strong>
              <span className="ml-2">Property code: {selectedConnection.external_property_code}</span>
              <p className="mt-1">Vault status: {selectedConnection.credentials_configured ? "configured" : "not configured"}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">{selectedConnection.credential_keys.map((key) => <label className="text-sm font-medium" key={key}>{key.replaceAll("_", " ").toLowerCase()}
              <input className="input mt-2" name={key} type="password" autoComplete="new-password" maxLength={4096} required />
            </label>)}</div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={credentialBusy} type="submit">{credentialBusy ? "Workingâ€¦" : "Encrypt and save"}</button>
              <button className="btn-secondary" disabled={credentialBusy || !selectedConnection.credentials_configured} onClick={testCredentials} type="button">Validate stored configuration</button>
            </div>
          </>}
          {credentialMessage && <p className="text-sm" role="status">{credentialMessage}</p>}
        </form>}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">{categories.map(([category, label]) => <section className="card overflow-hidden" key={category}>
        <div className="border-b p-5"><h2 className="text-xl font-semibold">{label}</h2></div>
        <div className="divide-y">{data.items.filter((item) => item.category === category).map((item) => <article className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-start" key={item.id}>
          <div><strong>{item.label}</strong><p className="mt-1 text-sm text-slate-500">{item.detail}</p>{item.required && <span className="mt-2 block text-xs uppercase tracking-wider text-slate-400">Required for pilot</span>}</div>
          <span className={`text-sm font-semibold capitalize ${statusStyle[item.status]}`}>{item.status}</span>
        </article>)}</div>
      </section>)}</div>
    </>}
  </>;
}

