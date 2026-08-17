"use client";

import { useEffect, useState } from "react";
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
    launchAuthorized: false;
    authorizationDetail: string;
  };
  activePaymentMode: "test" | "live" | null;
  activeWebhookMode: "test" | "live" | null;
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
  const [data, setData] = useState<PaymentReadinessResponse | null>(null);
  const [message, setMessage] = useState("Checking payment safety gates…");

  useEffect(() => {
    fetch("/api/admin/payment-readiness", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Payment readiness could not be loaded.");
        setData(body.data);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

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
    </section>
  );
}
