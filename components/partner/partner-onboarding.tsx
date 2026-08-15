"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HotelAccessSelector } from "@/components/partner/hotel-access-selector";
import type { PartnerHotelAccess } from "@/lib/partner/hotel-access";

type Onboarding = {
  businessName: string;
  accessRole: "owner" | "general_manager" | "revenue_manager" | "sales_manager";
  completed: number;
  total: number;
  percent: number;
  ready: boolean;
  steps: Array<{ key: string; label: string; detail: string; complete: boolean; href: string }>;
  primaryProperty: { id: string; name: string; active: boolean; readiness: { ready: boolean; missing: string[] } } | null;
  portfolio: { properties: number; published: number };
  software: { plan: string; status: string; active: boolean };
  hotelAccess: {
    options: PartnerHotelAccess[];
    selectedPartnerId: string | null;
    selectionRequired: boolean;
  } | null;
};

export function PartnerOnboarding() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [message, setMessage] = useState("Checking onboarding progress…");
  const [accessOptions, setAccessOptions] = useState<PartnerHotelAccess[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  useEffect(() => {
    const query = selectedPartnerId ? `?partnerId=${encodeURIComponent(selectedPartnerId)}` : "";
    fetch(`/api/partner/onboarding${query}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (body.hotelAccess) {
        setAccessOptions(body.hotelAccess.options ?? []);
        if (!selectedPartnerId && body.hotelAccess.selectedPartnerId) {
          setSelectedPartnerId(body.hotelAccess.selectedPartnerId);
        }
        if (body.hotelAccess.selectionRequired) {
          setData(null);
          setMessage("");
          return;
        }
      }
      setData(body);
      setMessage("");
    }).catch((error: Error) => setMessage(error.message));
  }, [selectedPartnerId]);

  const accessSelector = <HotelAccessSelector
    onChange={(partnerId) => {
      setSelectedPartnerId(partnerId);
      setData(null);
      setMessage(partnerId ? "Checking onboarding progress…" : "");
    }}
    options={accessOptions}
    value={selectedPartnerId}
  />;

  if (message) return <div className="mt-8 grid gap-6">{accessSelector}<p role="status" className="card p-6 text-sm text-slate-600">{message}</p></div>;
  if (!data) return <div className="mt-8 grid gap-6">{accessSelector}<p className="card p-6 text-sm text-slate-600">Select a hotel organization to view its onboarding progress.</p></div>;
  const nextStep = data.steps.find((step) => !step.complete);
  return <>
    <div className="mt-8">{accessSelector}</div>
    <section className="card mt-8 overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div><span className="text-sm text-slate-500">{data.businessName} launch progress</span><strong className="mt-2 block text-4xl">{data.percent}%</strong><p className="mt-2 text-sm text-slate-600">{data.completed} of {data.total} marketplace requirements complete · Signed in as {data.accessRole.replaceAll("_", " ")}</p></div>
        {nextStep ? <Link href={nextStep.href} className="btn-primary">Next: {nextStep.label}</Link> : <span className="badge bg-emerald-50 text-emerald-800">Marketplace ready</span>}
      </div>
      <div className="h-2 bg-slate-100"><div className="h-2 bg-brand-500" style={{ width: `${data.percent}%` }} /></div>
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <article className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="font-semibold">Launch checklist</h2><p className="mt-1 text-sm text-slate-500">Complete these steps for the first publishable property.</p></div>
        <ol className="divide-y">{data.steps.map((step, index) => <li className="grid gap-4 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={step.key}>
          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${step.complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{step.complete ? "✓" : index + 1}</span>
          <div><strong>{step.label}</strong><p className="mt-1 text-sm text-slate-500">{step.detail}</p></div>
          <Link href={step.href} className="text-sm font-semibold text-brand-700">{step.complete ? "Review" : "Continue"}</Link>
        </li>)}</ol>
      </article>

      <div className="space-y-6">
        <article className="card p-6"><h2 className="font-semibold">Primary listing</h2>{data.primaryProperty ? <><strong className="mt-4 block text-xl">{data.primaryProperty.name}</strong><p className="mt-2 text-sm text-slate-600">{data.primaryProperty.active ? "Published in traveler search" : data.primaryProperty.readiness.ready ? "Ready for administrator review" : `Still needed: ${data.primaryProperty.readiness.missing.join(", ")}`}</p></> : <p className="mt-4 text-sm text-slate-500">No property has been created yet.</p>}<dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-5 text-sm"><div><dt className="text-slate-500">Properties</dt><dd className="mt-1 text-xl font-bold">{data.portfolio.properties}</dd></div><div><dt className="text-slate-500">Published</dt><dd className="mt-1 text-xl font-bold">{data.portfolio.published}</dd></div></dl></article>
        <article className="card p-6"><h2 className="font-semibold">Management software</h2><p className="mt-2 text-sm text-slate-500">Optional and separate from marketplace listing approval.</p><div className="mt-5 flex items-center justify-between"><div><span className="text-xs uppercase tracking-wider text-slate-500">Plan</span><strong className="mt-1 block capitalize">{data.software.plan}</strong></div><span className="badge capitalize">{data.software.status}</span></div><Link href="/partner/settings" className="btn-secondary mt-5 w-full text-center">Manage software plan</Link></article>
      </div>
    </section>
  </>;
}
