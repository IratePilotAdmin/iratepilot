"use client";

import { useEffect, useState } from "react";
import { partnerPlans, type PartnerPlan } from "@/config/partner-plans";

type Subscription = {
  business_name: string;
  software_plan: "none" | PartnerPlan | "enterprise";
  subscription_status: string;
  subscription_renews_at: string | null;
};

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
      setSubscription(body.partner);
      setMessage(body.partner ? "" : "Create your partner account before selecting software.");
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

  return <div className="mt-8 grid gap-8">
    {subscription && <section className="card grid gap-6 p-6 sm:grid-cols-3">
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Business</span><strong className="mt-2 block text-xl">{subscription.business_name}</strong></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Software plan</span><strong className="mt-2 block text-xl capitalize">{subscription.software_plan}</strong></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Status</span><strong className="mt-2 block text-xl capitalize">{subscription.subscription_status}</strong></div>
    </section>}
    <section className="grid gap-6 lg:grid-cols-3">
      {(Object.entries(partnerPlans) as [PartnerPlan, (typeof partnerPlans)[PartnerPlan]][]).map(([key, plan]) =>
        <article key={key} className="card p-7">
          <span className="section-kicker">{plan.name}</span>
          <h2 className="mt-4 text-4xl">${plan.monthlyPrice}<small className="text-base">/month</small></h2>
          <p className="mt-5 min-h-12 text-sm text-slate-600">{plan.audience}</p>
          <button className="btn-primary mt-7" disabled={!!busy || subscription?.software_plan === key} onClick={() => checkout(key)}>
            {subscription?.software_plan === key ? "Current plan" : busy === key ? "Opening test checkout…" : "Choose in Stripe test mode"}
          </button>
        </article>)}
    </section>
    <section className="card p-6 text-sm text-slate-600"><strong className="text-slate-900">Enterprise: $799+/month</strong><p className="mt-2">Custom plans for hotel groups and management companies are arranged manually. Software subscriptions are separate from the 10% commission on completed iRatePilot Travel marketplace bookings.</p></section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
  </div>;
}
