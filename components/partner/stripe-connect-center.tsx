"use client";

import { useEffect, useState } from "react";

type ConnectPartner = {
  business_name: string;
  stripe_connect_account_id: string | null;
  stripe_connect_status: "not_started" | "pending" | "restricted" | "ready";
  stripe_connect_details_submitted: boolean;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
  stripe_connect_requirements_due: string[];
};

export function StripeConnectCenter() {
  const [partner, setPartner] = useState<ConnectPartner | null>(null);\n  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [message, setMessage] = useState("Checking Stripe payout status…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/partner/connect", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setPartner(body.partner);\n    setMode(body.mode || null);
    setMessage(body.partner ? "" : "Create your partner account before connecting payouts.");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function open(path: "onboarding" | "dashboard") {
    setBusy(true);
    setMessage(path === "onboarding" ? "Opening secure Stripe onboarding…" : "Opening Stripe Express…");
    const response = await fetch(`/api/partner/connect/${path}`, { method: "POST" });
    const body = await response.json();
    if (response.ok && body.url) window.location.assign(body.url);
    else {
      setMessage(body.error || "Stripe Connect is unavailable.");
      setBusy(false);
    }
  }

  const ready = partner?.stripe_connect_status === "ready";
  return <section className="card overflow-hidden">
    <div className="border-b p-6">
      <span className="section-kicker">Stripe Connect · {mode === "live" ? "live payouts" : "test mode"}</span>
      <h2 className="mt-3 text-2xl font-semibold">Hotel payout account</h2>
      <p className="mt-2 text-sm text-slate-600">Stripe verifies the business and bank information. iRatePilot never stores bank credentials.</p>
    </div>
    {partner && <div className="grid gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><span className="text-xs uppercase tracking-wider text-slate-500">Onboarding</span><strong className="mt-2 block capitalize">{partner.stripe_connect_status.replaceAll("_", " ")}</strong></div>
        <div><span className="text-xs uppercase tracking-wider text-slate-500">Payments</span><strong className="mt-2 block">{partner.stripe_connect_charges_enabled ? "Enabled" : "Not enabled"}</strong></div>
        <div><span className="text-xs uppercase tracking-wider text-slate-500">Payouts</span><strong className="mt-2 block">{partner.stripe_connect_payouts_enabled ? "Enabled" : "Not enabled"}</strong></div>
      </div>
      {!!partner.stripe_connect_requirements_due?.length && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Stripe needs more information</strong><p className="mt-1">{partner.stripe_connect_requirements_due.length} requirement(s) remain.</p></div>}
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => open("onboarding")}>{partner.stripe_connect_details_submitted ? "Continue Stripe verification" : "Connect payout account"}</button>
        {partner.stripe_connect_details_submitted && <button className="btn-secondary" disabled={busy} onClick={() => open("dashboard")}>Open Stripe Express</button>}
        <button className="btn-secondary" disabled={busy} onClick={() => { setMessage("Refreshing Stripe status…"); load().catch((error: Error) => setMessage(error.message)); }}>Refresh status</button>
      </div>
      {ready && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{mode === "live" ? "This payout account is verified and ready to receive eligible booking proceeds." : "This test payout account is ready for marketplace transfer testing."}</p>}
    </div>}
    {message && <p role="status" className="border-t p-6 text-sm text-slate-600">{message}</p>}
  </section>;
}
