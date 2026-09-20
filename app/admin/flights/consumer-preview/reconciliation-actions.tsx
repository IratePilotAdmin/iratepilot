"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const resolutionCodes = [
  ["duplicate_suppressed", "Provider duplicate suppressed"],
  ["provider_state_confirmed", "Provider state confirmed"],
  ["payment_reversed", "Payment reversed"],
  ["local_state_corrected", "Local state corrected"],
  ["ticket_reissued", "Ticket reissued"],
  ["manual_followup_required", "Manual follow-up required"],
] as const;

export function FlightConsumerPreviewReconciliationActions({
  caseId,
  expectedUpdatedAt,
  status,
  resolutionCode,
}: Readonly<{
  caseId: string;
  expectedUpdatedAt: string;
  status: "open" | "investigating" | "blocked" | "resolved";
  resolutionCode: string | null;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState<"resolve" | "compensate" | null>(null);
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);

  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || status === "resolved") return;
    const form = new FormData(event.currentTarget);
    setBusy("resolve");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/flights/consumer-preview/reconciliation/${encodeURIComponent(caseId)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedUpdatedAt,
            resolutionCode: form.get("resolutionCode"),
            resolutionEvidenceSha256: form.get("resolutionEvidenceSha256"),
          }),
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          referrerPolicy: "no-referrer",
        },
      );
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Resolution was not accepted.");
      setMessage("The durable resolution was recorded. Refreshing the authoritative case…");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resolution was not accepted.");
    } finally {
      setBusy(null);
    }
  }

  async function compensate() {
    if (busy || status !== "resolved" || resolutionCode !== "duplicate_suppressed" || !reviewed) return;
    setBusy("compensate");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/flights/consumer-preview/reconciliation/${encodeURIComponent(caseId)}/compensate`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          referrerPolicy: "no-referrer",
        },
      );
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Compensation was not completed.");
      setMessage("Stripe test compensation converged to a durable result. Refreshing…");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compensation was not completed.");
    } finally {
      setBusy(null);
    }
  }

  if (status !== "resolved") {
    return (
      <form onSubmit={resolve} className="border border-neutral-300 bg-white p-6">
        <h2 className="text-2xl">Record an evidence-bound resolution</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">The evidence digest must be produced from an independently reviewed provider/payment record. Notes and personal data are not accepted here.</p>
        <label className="mt-5 block text-sm font-semibold">
          Resolution
          <select name="resolutionCode" className="input mt-2" defaultValue="manual_followup_required" required>
            {resolutionCodes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="mt-5 block text-sm font-semibold">
          Resolution evidence SHA-256
          <input name="resolutionEvidenceSha256" className="input mt-2 font-mono" minLength={64} maxLength={64} pattern="[0-9a-f]{64}" autoComplete="off" spellCheck={false} required />
        </label>
        <button type="submit" className="btn-primary mt-6" disabled={busy !== null}>{busy === "resolve" ? "Recording…" : "Record durable resolution"}</button>
        <div className="mt-4 min-h-6 text-sm" aria-live="polite">{message}</div>
      </form>
    );
  }

  if (resolutionCode !== "duplicate_suppressed") {
    return (
      <div className="border border-neutral-300 bg-neutral-50 p-6">
        <h2 className="text-2xl">Automatic compensation is closed</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Only a durable <strong>duplicate suppressed</strong> resolution can enter the bounded Stripe test refund workflow. This resolution requires manual follow-up or a separate verified state transition.</p>
      </div>
    );
  }

  return (
    <div className="border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-2xl">Compensate the captured Stripe test payment</h2>
      <p className="mt-2 text-sm leading-6 text-amber-950">This calls only the idempotent Stripe test refund workflow. It cannot dispatch or retry a Duffel order.</p>
      <label className="mt-5 flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
        <span>I reviewed the durable provider evidence and confirmed that no provider order or ticket exists.</span>
      </label>
      <button type="button" className="btn-primary mt-6" disabled={!reviewed || busy !== null} onClick={compensate}>{busy === "compensate" ? "Reconciling…" : "Run Stripe test compensation"}</button>
      <div className="mt-4 min-h-6 text-sm" aria-live="polite">{message}</div>
    </div>
  );
}
