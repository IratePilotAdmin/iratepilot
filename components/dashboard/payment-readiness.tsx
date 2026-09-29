"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PaymentReadinessCheck } from "@/lib/admin/payment-readiness";

type ReadinessGroup = {
  passed: number;
  total: number;
  ready: boolean;
  checks: PaymentReadinessCheck[];
};

type PaymentReadinessResponse = {
  testMode: ReadinessGroup;
  productionConfiguration: ReadinessGroup & {
    launchAuthorized: boolean;
    launchReady: boolean;
    authorization: {
      id: string;
      approvalReference: string;
      stripeAccountReference: string;
      approvedAt: string;
      expiresAt: string;
    } | null;
    authorizationDetail: string;
  };
  activePaymentMode: "test" | "live" | null;
  activeWebhookMode: "test" | "live" | null;
};

type ApiResponse = {
  data: PaymentReadinessResponse;
  evidenceAvailable: boolean;
};

function ReadinessChecklist({ group }: { group: ReadinessGroup }) {
  return (
    <ul className="mt-4 grid gap-2 text-sm">
      {group.checks.map((item) => (
        <li className={item.passed ? "text-emerald-800" : "text-amber-800"} key={item.id}>
          <span aria-hidden="true">{item.passed ? "✓" : "○"}</span>{" "}
          <strong>{item.label}</strong>
          <span className="block pl-5 text-xs leading-5 text-slate-500">{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function PaymentReadiness() {
  const [responseData, setResponseData] = useState<ApiResponse | null>(null);
  const [message, setMessage] = useState("Checking payment safety gates…");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");

  const load = () => fetch("/api/admin/payment-readiness", { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Payment readiness could not be loaded.");
      setResponseData(body);
      setMessage("");
    });

  useEffect(() => {
    load()
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function recordApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setApprovalBusy(true);
    setApprovalMessage("");
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    const payload = {
      ...body,
      action: "record",
      stripeAccountVerified: form.get("stripeAccountVerified") === "on",
      liveChargesCapabilityVerified: form.get("liveChargesCapabilityVerified") === "on",
      livePayoutsCapabilityVerified: form.get("livePayoutsCapabilityVerified") === "on",
      webhookEndpointVerified: form.get("webhookEndpointVerified") === "on",
      refundDisputeProcessVerified: form.get("refundDisputeProcessVerified") === "on",
      supportEscalationVerified: form.get("supportEscalationVerified") === "on",
      financeSettlementVerified: form.get("financeSettlementVerified") === "on",
      approvedAt: new Date(String(body.approvedAt)).toISOString(),
      expiresAt: new Date(String(body.expiresAt)).toISOString(),
    };
    try {
      const response = await fetch("/api/admin/payment-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Approval evidence could not be recorded.");
      setApprovalMessage(result.message);
      formElement.reset();
      await load();
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : "Approval evidence could not be recorded.");
    } finally {
      setApprovalBusy(false);
    }
  }

  async function revokeApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.productionConfiguration.authorization) return;
    setApprovalBusy(true);
    setApprovalMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/payment-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          authorizationId: data.productionConfiguration.authorization.id,
          revocationReference: form.get("revocationReference"),
          reasonSummary: form.get("reasonSummary"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Approval could not be revoked.");
      setApprovalMessage(result.message);
      await load();
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : "Approval could not be revoked.");
    } finally {
      setApprovalBusy(false);
    }
  }

  const data = responseData?.data ?? null;

  if (!data) {
    return <p className="card mt-6 p-6 text-sm text-slate-600" role="status">{message}</p>;
  }

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-slate-200 p-6">
        <span className="text-xs uppercase tracking-wider text-slate-500">Read-only safety audit</span>
        <h2 className="mt-2 text-xl font-semibold">Booking and payment readiness</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This audit reports configuration state only. It never creates a PaymentIntent, charge, refund, transfer, payout, subscription, or webhook event.
        </p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-600">
          <span>Payment mode: <strong>{data.activePaymentMode || "disabled"}</strong></span>
          <span>Webhook mode: <strong>{data.activeWebhookMode || "disabled"}</strong></span>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        <article className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Stripe test-mode validation</h3>
            <span className={data.testMode.ready ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
              {data.testMode.passed}/{data.testMode.total} gates
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {data.testMode.ready ? "Ready for separately approved Stripe sandbox scenarios." : "Test payments remain blocked until every sandbox safety gate passes."}
          </p>
          <ReadinessChecklist group={data.testMode} />
        </article>

        <article className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Production configuration</h3>
            <span className={data.productionConfiguration.ready ? "text-sm font-semibold text-blue-700" : "text-sm font-semibold text-amber-700"}>
              {data.productionConfiguration.passed}/{data.productionConfiguration.total} gates
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {data.productionConfiguration.ready ? "Configuration checks pass, but launch remains unauthorized." : "Production payments and payouts remain blocked."}
          </p>
          <ReadinessChecklist group={data.productionConfiguration} />
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            {data.productionConfiguration.authorizationDetail}
          </p>
        </article>
      </div>
      <div className="border-t border-slate-200 p-6">
        <h3 className="font-semibold">Production payment approval evidence</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Record this only after Stripe account review, live capabilities, webhooks, refunds and disputes, support escalation, and settlement operations have been verified. This receipt does not enable live payment flags.
        </p>
        {!responseData?.evidenceAvailable ? (
          <p className="mt-4 text-sm text-amber-800">The approval evidence ledger is unavailable. Apply its database migration before recording evidence.</p>
        ) : data.productionConfiguration.launchAuthorized ? (
          <>
            <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div><dt className="font-semibold">Approval reference</dt><dd>{data.productionConfiguration.authorization?.approvalReference}</dd></div>
              <div><dt className="font-semibold">Stripe account</dt><dd>{data.productionConfiguration.authorization?.stripeAccountReference}</dd></div>
              <div><dt className="font-semibold">Approved</dt><dd>{data.productionConfiguration.authorization?.approvedAt}</dd></div>
              <div><dt className="font-semibold">Expires</dt><dd>{data.productionConfiguration.authorization?.expiresAt}</dd></div>
            </dl>
            <form className="mt-5 grid max-w-3xl gap-3 border-t border-slate-200 pt-4" onSubmit={revokeApproval}>
              <h4 className="font-semibold">Revoke this approval</h4>
              <label className="text-sm font-medium">Revocation reference<input className="input mt-1" name="revocationReference" required minLength={8} maxLength={160} /></label>
              <label className="text-sm font-medium">Reason<textarea className="input mt-1 min-h-20" name="reasonSummary" required minLength={20} maxLength={2000} /></label>
              <button className="btn-secondary w-fit" disabled={approvalBusy} type="submit">{approvalBusy ? "Revoking…" : "Revoke approval"}</button>
            </form>
          </>
        ) : (
          <form className="mt-5 grid max-w-3xl gap-4" onSubmit={recordApproval}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Approval reference<input className="input mt-1" name="approvalReference" required minLength={8} maxLength={160} /></label>
              <label className="text-sm font-medium">Stripe account reference<input className="input mt-1" name="stripeAccountReference" placeholder="acct_…" required /></label>
              <label className="text-sm font-medium">Approved at<input className="input mt-1" name="approvedAt" type="datetime-local" required /></label>
              <label className="text-sm font-medium">Expires at<input className="input mt-1" name="expiresAt" type="datetime-local" required /></label>
            </div>
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-2 font-semibold">Required verification</legend>
              {[
                ["stripeAccountVerified", "Stripe business account and ownership verified"],
                ["liveChargesCapabilityVerified", "Live charges capability verified"],
                ["livePayoutsCapabilityVerified", "Live payouts capability verified"],
                ["webhookEndpointVerified", "Signed live webhook endpoint verified"],
                ["refundDisputeProcessVerified", "Refund and dispute process verified"],
                ["supportEscalationVerified", "Payment support escalation verified"],
                ["financeSettlementVerified", "Finance settlement and reconciliation verified"],
              ].map(([name, label]) => <label className="flex gap-2" key={name}><input name={name} type="checkbox" required />{label}</label>)}
            </fieldset>
            <label className="text-sm font-medium">Review notes<textarea className="input mt-1 min-h-24" name="reviewNotes" required minLength={20} maxLength={2000} /></label>
            <button className="btn-primary w-fit" disabled={approvalBusy} type="submit">{approvalBusy ? "Recording…" : "Record approval evidence"}</button>
          </form>
        )}
        {approvalMessage && <p className="mt-3 text-sm" role="status">{approvalMessage}</p>}
      </div>
    </section>
  );
}
