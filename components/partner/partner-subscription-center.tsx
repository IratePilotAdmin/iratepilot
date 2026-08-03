"use client";

import { useEffect, useState } from "react";
import { partnerEnterprisePlan, partnerPlans, type PartnerPlan } from "@/config/partner-plans";

type Subscription = {
  business_name: string;
  software_plan: "none" | PartnerPlan | "enterprise";
  subscription_status: string;
  subscription_renews_at: string | null;
  can_manage_billing: boolean;
};

const renewalDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))
  : "Not scheduled";

export function PartnerSubscriptionCenter() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [message, setMessage] = useState("Loading subscription…");
  const [busy, setBusy] = useState("");
  const [checkoutAttemptIds] = useState<Record<PartnerPlan, string>>(() => ({
    starter: crypto.randomUUID(),
    professional: crypto.randomUUID(),
    premium: crypto.randomUUID(),
  }));

  useEffect(() => {
    fetch("/api/partner/subscription").then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSubscription(body.data);
      const query = new URLSearchParams(window.location.search);
      setMessage(query.get("subscription") === "success"
        ? "Test checkout completed. Subscription status updates after the signed Stripe webhook arrives."
        : query.get("subscription") === "cancelled"
          ? "Test checkout was cancelled. Your plan was not changed."
          : query.get("billing") === "returned"
            ? "Returned from the Stripe test billing portal."
            : body.data ? "" : "Create your partner account before selecting software.");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function checkout(plan: PartnerPlan) {
    setBusy(plan);
    const response = await fetch("/api/partner/subscription/checkout", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutAttemptIds[plan] }, body: JSON.stringify({ plan })
    });
    const body = await response.json();
    if (response.ok && body.url) window.location.assign(body.url);
    else { setMessage(body.error); setBusy(""); }
  }

  async function manageBilling() {
    setBusy("portal");
    const response = await fetch("/api/partner/subscription/portal", { method: "POST" });
    const body = await response.json();
    if (response.ok && body.url) window.location.assign(body.url);
    else { setMessage(body.error); setBusy(""); }
  }

  return <div className="mt-8 grid gap-8">
    {subscription && <section className="card grid gap-6 p-6 sm:grid-cols-3">
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Business</span><strong className="mt-2 block text-xl">{subscription.business_name}</strong></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Software plan</span><strong className="mt-2 block text-xl capitalize">{subscription.software_plan}</strong></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Status</span><strong className="mt-2 block text-xl capitalize">{subscription.subscription_status.replace("_", " ")}</strong><small className="mt-1 block text-slate-500">Renews: {renewalDate(subscription.subscription_renews_at)}</small></div>
      {subscription.can_manage_billing && <div className="sm:col-span-3"><button className="btn-secondary" disabled={!!busy} onClick={manageBilling}>{busy === "portal" ? "Opening test billing…" : "Manage test billing"}</button><p className="mt-2 text-xs text-slate-500">Update payment details, review invoices, or cancel through Stripe test mode.</p></div>}
    </section>}
    <section className="grid gap-6 lg:grid-cols-3">
      {(Object.entries(partnerPlans) as [PartnerPlan, (typeof partnerPlans)[PartnerPlan]][]).map(([key, plan]) => {
        const isCurrent = subscription?.software_plan === key && subscription.subscription_status === "active";
        return <article key={key} className="card p-7">
          <span className="section-kicker">{plan.name}</span>
          <h2 className="mt-4 text-4xl">${plan.monthlyPrice}<small className="text-base">/month</small></h2>
          <p className="mt-5 min-h-12 text-sm text-slate-600">{plan.audience}</p>
          <button className="btn-primary mt-7" disabled={!!busy || isCurrent} onClick={() => checkout(key)}>
            {isCurrent ? "Current active plan" : busy === key ? "Opening test checkout…" : subscription?.software_plan === key ? "Reactivate in test mode" : "Choose in Stripe test mode"}
          </button>
        </article>;})}
    </section>
    <section className="card p-6 text-sm text-slate-600"><strong className="text-slate-900">{partnerEnterprisePlan.name}: {partnerEnterprisePlan.monthlyPriceLabel}/month</strong><p className="mt-2">{partnerEnterprisePlan.audience} Enterprise subscriptions are arranged manually and remain separate from the 10% commission on completed iRatePilot Travel marketplace bookings.</p></section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
    <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">Software subscriptions and the billing portal run in Stripe test mode during the private pilot. No live subscription charge is created.</p>
  </div>;
}
