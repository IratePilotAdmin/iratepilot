"use client";

import { useEffect, useState } from "react";
import { memberships, type MembershipTier } from "@/config/memberships";

type Ledger = { id: string; points: number; description: string; created_at: string };
type Profile = {
  membership_tier: "none" | MembershipTier;
  membership_status: string;
  membership_renews_at: string | null;
  reward_points: number;
  can_manage_billing: boolean;
};

const renewalDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))
  : "Not scheduled";

export function MembershipCenter() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [message, setMessage] = useState("Loading membership…");
  const [busy, setBusy] = useState("");
  const [checkoutAttemptIds] = useState<Record<MembershipTier, string>>(() => ({ basic: crypto.randomUUID(), business: crypto.randomUUID() }));

  useEffect(() => {
    fetch("/api/memberships", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setProfile(body.profile);
      setLedger(body.ledger);
      const query = new URLSearchParams(window.location.search);
      setMessage(query.get("membership") === "success"
        ? "Test checkout completed. Membership updates after the signed Stripe webhook arrives."
        : query.get("membership") === "cancelled"
          ? "Test checkout was cancelled. Your membership was not changed."
          : query.get("billing") === "returned"
            ? "Returned from the Stripe test billing portal."
            : "");
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function checkout(plan: MembershipTier) {
    setBusy(plan);
    const response = await fetch("/api/memberships/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutAttemptIds[plan] },
      body: JSON.stringify({ plan }),
    });
    const body = await response.json();
    if (response.ok && body.url) window.location.assign(body.url);
    else { setMessage(body.error); setBusy(""); }
  }

  async function manageBilling() {
    setBusy("portal");
    const response = await fetch("/api/memberships/portal", { method: "POST" });
    const body = await response.json();
    if (response.ok && body.url) window.location.assign(body.url);
    else { setMessage(body.error); setBusy(""); }
  }

  return <div className="mt-8 grid gap-8">
    {profile && <section className="card grid gap-6 p-6 sm:grid-cols-3">
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Membership</span><strong className="mt-2 block text-2xl capitalize">{profile.membership_tier}</strong></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Status</span><strong className="mt-2 block text-2xl capitalize">{profile.membership_status.replace("_", " ")}</strong><small className="mt-1 block text-slate-500">Renews: {renewalDate(profile.membership_renews_at)}</small></div>
      <div><span className="text-xs uppercase tracking-wider text-slate-500">Reward points</span><strong className="mt-2 block text-2xl">{profile.reward_points.toLocaleString()}</strong></div>
      {profile.can_manage_billing && <div className="sm:col-span-3"><button className="btn-secondary" disabled={!!busy} onClick={manageBilling}>{busy === "portal" ? "Opening test billing…" : "Manage test membership billing"}</button><p className="mt-2 text-xs text-slate-500">Update payment details, review invoices, or cancel through Stripe test mode.</p></div>}
    </section>}
    <section className="grid gap-6 md:grid-cols-2">{(Object.entries(memberships) as [MembershipTier, (typeof memberships)[MembershipTier]][]).map(([key, plan]) => {
      const isCurrent = profile?.membership_tier === key && profile.membership_status === "active";
      return <article key={key} className="card p-7"><span className="section-kicker">{plan.name}</span><h2 className="mt-4 text-4xl">${plan.annualPrice}<small className="text-base">/year</small></h2><ul className="mt-6 grid gap-3 text-sm text-slate-600"><li>✓ One annual membership payment</li>{plan.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}</ul><button onClick={() => checkout(key)} disabled={!!busy || isCurrent} className="btn-primary mt-7">{isCurrent ? "Current active plan" : busy === key ? "Opening test checkout…" : profile?.membership_tier === key ? "Reactivate in Stripe test mode" : "Choose in Stripe test mode"}</button></article>;
    })}</section>
    {message && <p role="status" className="card p-5 text-sm">{message}</p>}
    <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">Membership checkout and billing management run in Stripe test mode during the private pilot. No live membership charge is created.</p>
    <section className="card overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Reward activity</h2></div><div className="divide-y">{ledger.map((entry) => <article key={entry.id} className="flex justify-between gap-4 p-6"><div><strong>{entry.description}</strong><time className="mt-1 block text-xs text-slate-500">{new Date(entry.created_at).toLocaleDateString()}</time></div><strong className={entry.points >= 0 ? "text-emerald-700" : "text-red-700"}>{entry.points >= 0 ? "+" : ""}{entry.points}</strong></article>)}</div>{!ledger.length && <p className="p-6 text-sm text-slate-500">No reward activity yet.</p>}</section>
  </div>;
}
