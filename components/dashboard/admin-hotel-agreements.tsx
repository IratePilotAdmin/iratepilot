"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { sha256File } from "@/lib/file-sha256";

type AgreementVersion = {
  agreement_version: string;
  template_document_sha256: string;
  counsel_approval_reference: string;
  counsel_approved_at: string;
  effective_at: string;
  evidence_summary: string;
};

type AgreementReceipt = {
  id: string;
  property_id: string;
  agreement_version: string;
  execution_reference: string;
  hotel_legal_business_name: string;
  hotel_signatory_name: string;
  hotel_signatory_title: string;
  effective_at: string;
  expires_at: string | null;
};

type EligibleApplication = {
  id: string;
  property_id: string;
  property_name: string;
  legal_business_name: string;
  email: string;
};

type AgreementData = {
  versions: AgreementVersion[];
  availableVersions: Array<Pick<AgreementVersion, "agreement_version" | "effective_at">>;
  agreements: AgreementReceipt[];
  eligibleApplications: EligibleApplication[];
};

function isoTimestamp(value: string) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
}

function DocumentFingerprintField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState("");

  async function calculateFingerprint(file: File | undefined) {
    if (!file) return;
    setHashing(true);
    setError("");
    try {
      onChange(await sha256File(file));
    } catch {
      setError("The fingerprint could not be calculated. Enter it manually or choose the file again.");
    } finally {
      setHashing(false);
    }
  }

  return (
    <div className="md:col-span-2">
      <label className="text-sm font-medium">
        {label}
        <input
          className="input mt-2 font-mono text-xs"
          name={name}
          required
          minLength={64}
          maxLength={64}
          pattern="[a-fA-F0-9]{64}"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Calculate from the final document
        <input
          className="mt-2 block w-full text-sm"
          type="file"
          disabled={hashing}
          onChange={(event) => void calculateFingerprint(event.target.files?.[0])}
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">
        {hashing ? "Calculating fingerprint…" : "Calculated locally in this browser; the file is not uploaded."}
      </p>
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export function AdminHotelAgreements() {
  const [data, setData] = useState<AgreementData>({ versions: [], availableVersions: [], agreements: [], eligibleApplications: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [templateDocumentSha256, setTemplateDocumentSha256] = useState("");
  const [agreementDocumentSha256, setAgreementDocumentSha256] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/hotel-agreements", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setData(body);
    else setMessage(body.error || "Hotel agreement records could not be loaded.");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedApplication = data.eligibleApplications.find((application) => application.id === selectedApplicationId);

  async function submit(event: FormEvent<HTMLFormElement>, action: "record_version" | "record_receipt") {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = action === "record_version" ? {
      action,
      agreementVersion: fields.get("agreementVersion"),
      templateDocumentSha256: fields.get("templateDocumentSha256"),
      counselApprovalReference: fields.get("counselApprovalReference"),
      counselApprovedAt: isoTimestamp(String(fields.get("counselApprovedAt") ?? "")),
      effectiveAt: isoTimestamp(String(fields.get("effectiveAt") ?? "")),
      reviewNotes: fields.get("reviewNotes"),
      counselApprovalConfirmed: fields.get("counselApprovalConfirmed") === "on",
    } : {
      action,
      applicationId: selectedApplication?.id,
      propertyId: selectedApplication?.property_id,
      agreementVersion: fields.get("agreementVersion"),
      executionReference: fields.get("executionReference"),
      agreementDocumentSha256: fields.get("agreementDocumentSha256"),
      hotelSignatoryName: fields.get("hotelSignatoryName"),
      hotelSignatoryTitle: fields.get("hotelSignatoryTitle"),
      hotelSignedAt: isoTimestamp(String(fields.get("hotelSignedAt") ?? "")),
      iratepilotSignedAt: isoTimestamp(String(fields.get("iratepilotSignedAt") ?? "")),
      effectiveAt: isoTimestamp(String(fields.get("effectiveAt") ?? "")),
      expiresAt: fields.get("expiresAt") ? isoTimestamp(String(fields.get("expiresAt"))) : null,
      representativeAuthorityVerified: fields.get("representativeAuthorityVerified") === "on",
      executedAgreementVerified: fields.get("executedAgreementVerified") === "on",
      reviewNotes: fields.get("reviewNotes"),
    };

    try {
      const response = await fetch("/api/admin/hotel-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error || "Agreement evidence could not be recorded.");
      if (response.ok) {
        form.reset();
        setSelectedApplicationId("");
        if (action === "record_version") setTemplateDocumentSha256("");
        else setAgreementDocumentSha256("");
        await load();
      }
    } catch {
      setMessage("Agreement evidence could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8">
      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{message}</p>}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-semibold">1. Counsel-approved template</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Record this only after outside counsel has approved the exact final template. Store the document in the approved legal repository; this page records its SHA-256 fingerprint and counsel reference.
          </p>
        </div>
        <form className="grid gap-4 p-6 md:grid-cols-2" onSubmit={(event) => void submit(event, "record_version")}>
          <label className="text-sm font-medium">Agreement version<input className="input mt-2" name="agreementVersion" placeholder="hotel_agreement_2026_v1" required pattern="[a-z0-9][a-z0-9._-]{7,119}" /></label>
          <DocumentFingerprintField label="Template SHA-256" name="templateDocumentSha256" value={templateDocumentSha256} onChange={setTemplateDocumentSha256} />
          <label className="text-sm font-medium">Counsel approval reference<input className="input mt-2" name="counselApprovalReference" required minLength={8} maxLength={160} /></label>
          <label className="text-sm font-medium">Counsel approved at<input className="input mt-2" name="counselApprovedAt" type="datetime-local" required /></label>
          <label className="text-sm font-medium">Effective at<input className="input mt-2" name="effectiveAt" type="datetime-local" required /></label>
          <label className="text-sm font-medium md:col-span-2">Evidence notes<textarea className="input mt-2 min-h-28" name="reviewNotes" required minLength={20} maxLength={2000} /></label>
          <label className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 md:col-span-2">
            <input className="mt-1 h-4 w-4 shrink-0" name="counselApprovalConfirmed" type="checkbox" required />
            <span>I confirm counsel approved this exact template and the fingerprint above matches the approved final document.</span>
          </label>
          <button className="btn-primary justify-self-start disabled:opacity-50" disabled={busy} type="submit">Record approved version</button>
        </form>
        <div className="border-t border-slate-200 p-6">
          <h3 className="font-semibold">Recorded versions</h3>
          {data.versions.length === 0 ? <p className="mt-2 text-sm text-amber-800">No counsel-approved agreement version is recorded. Hotel agreement receipts remain locked.</p> : (
            <div className="mt-3 grid gap-3">{data.versions.map((version) => <div className="rounded-xl bg-slate-50 p-4 text-sm" key={version.agreement_version}><strong>{version.agreement_version}</strong><p className="mt-1 text-slate-600">Effective {new Date(version.effective_at).toLocaleString()} · Counsel reference {version.counsel_approval_reference}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">SHA-256 {version.template_document_sha256}</p></div>)}</div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-semibold">2. Executed hotel agreement</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Record a receipt only after both the authorized hotel representative and iRatePilot have signed the same final document.</p>
        </div>
        {data.availableVersions.length === 0 ? <p className="p-6 text-sm text-amber-800">Locked until a counsel-approved agreement version is effective.</p> : data.eligibleApplications.length === 0 ? <p className="p-6 text-sm text-amber-800">No approved hotel application is eligible for agreement recording yet.</p> : (
          <form className="grid gap-4 p-6 md:grid-cols-2" onSubmit={(event) => void submit(event, "record_receipt")}>
            <label className="text-sm font-medium md:col-span-2">Approved hotel<select className="input mt-2" required value={selectedApplicationId} onChange={(event) => setSelectedApplicationId(event.target.value)}><option value="">Choose an approved hotel</option>{data.eligibleApplications.map((application) => <option key={application.id} value={application.id}>{application.property_name} — {application.legal_business_name} ({application.email})</option>)}</select></label>
            <label className="text-sm font-medium">Agreement version<select className="input mt-2" name="agreementVersion" required><option value="">Choose a version</option>{data.availableVersions.map((version) => <option key={version.agreement_version} value={version.agreement_version}>{version.agreement_version}</option>)}</select></label>
            <label className="text-sm font-medium">Execution reference<input className="input mt-2" name="executionReference" required minLength={8} maxLength={160} pattern="[A-Za-z0-9][A-Za-z0-9._:-]{7,159}" /></label>
            <DocumentFingerprintField label="Signed document SHA-256" name="agreementDocumentSha256" value={agreementDocumentSha256} onChange={setAgreementDocumentSha256} />
            <label className="text-sm font-medium">Hotel signatory name<input className="input mt-2" name="hotelSignatoryName" required minLength={2} maxLength={120} /></label>
            <label className="text-sm font-medium">Hotel signatory title<input className="input mt-2" name="hotelSignatoryTitle" required minLength={2} maxLength={120} /></label>
            <label className="text-sm font-medium">Hotel signed at<input className="input mt-2" name="hotelSignedAt" type="datetime-local" required /></label>
            <label className="text-sm font-medium">iRatePilot signed at<input className="input mt-2" name="iratepilotSignedAt" type="datetime-local" required /></label>
            <label className="text-sm font-medium">Effective at<input className="input mt-2" name="effectiveAt" type="datetime-local" required /></label>
            <label className="text-sm font-medium">Expires at (optional)<input className="input mt-2" name="expiresAt" type="datetime-local" /></label>
            <label className="text-sm font-medium md:col-span-2">Verification notes<textarea className="input mt-2 min-h-28" name="reviewNotes" required minLength={20} maxLength={2000} /></label>
            <fieldset className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950 md:col-span-2">
              <legend className="px-1 font-semibold">Required verification</legend>
              <label className="flex gap-3"><input className="mt-1 h-4 w-4" name="representativeAuthorityVerified" type="checkbox" required />I verified the hotel signatory is authorized to bind the hotel legal entity.</label>
              <label className="flex gap-3"><input className="mt-1 h-4 w-4" name="executedAgreementVerified" type="checkbox" required />I verified both parties signed the exact document identified by this SHA-256 fingerprint.</label>
            </fieldset>
            <button className="btn-primary justify-self-start disabled:opacity-50" disabled={busy || !selectedApplication} type="submit">Record executed agreement</button>
          </form>
        )}
        <div className="border-t border-slate-200 p-6">
          <h3 className="font-semibold">Executed agreement receipts</h3>
          {data.agreements.length === 0 ? <p className="mt-2 text-sm text-slate-500">No executed hotel agreement has been recorded.</p> : <div className="mt-3 grid gap-3">{data.agreements.map((agreement) => <div className="rounded-xl bg-slate-50 p-4 text-sm" key={agreement.id}><strong>{agreement.hotel_legal_business_name}</strong><p className="mt-1 text-slate-600">{agreement.agreement_version} · {agreement.hotel_signatory_name}, {agreement.hotel_signatory_title} · Effective {new Date(agreement.effective_at).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Execution reference {agreement.execution_reference}</p></div>)}</div>}
        </div>
      </section>
    </div>
  );
}
