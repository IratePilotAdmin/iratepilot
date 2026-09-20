"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HotelAccessSelector } from "@/components/partner/hotel-access-selector";
import type { PartnerHotelAccess } from "@/lib/partner/hotel-access";

type Onboarding = {
  businessName: string;
  accessRole: "owner" | "general_manager" | "revenue_manager" | "sales_manager";
  completed: number;
  total: number;
  percent: number;
  ready: boolean;
  steps: OnboardingStep[];
  pilotPreparation: OnboardingProgress;
  commercialActivation: OnboardingProgress;
  primaryProperty: { id: string; name: string; active: boolean; readiness: { ready: boolean; missing: string[] } } | null;
  portfolio: { properties: number; published: number };
  software?: { plan: string; status: string; active: boolean };
  hotelAccess: {
    options: PartnerHotelAccess[];
    selectedPartnerId: string | null;
    selectionRequired: boolean;
  } | null;
};

type OnboardingStep = { key: string; label: string; detail: string; complete: boolean; href: string };
type OnboardingProgress = { completed: number; total: number; percent: number; ready: boolean; steps: OnboardingStep[] };

function OnboardingSteps({ steps }: { steps: OnboardingStep[] }) {
  return (
    <ol className="divide-y">
      {steps.map((step, index) => (
        <li className="grid gap-4 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={step.key}>
          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${step.complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {step.complete ? "✓" : index + 1}
          </span>
          <div><strong>{step.label}</strong><p className="mt-1 text-sm text-slate-500">{step.detail}</p></div>
          <Link href={step.href} className="text-sm font-semibold text-brand-700">{step.complete ? "Review" : "Continue"}</Link>
        </li>
      ))}
    </ol>
  );
}

export function PartnerOnboarding() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [message, setMessage] = useState("Checking onboarding progress…");
  const [accessOptions, setAccessOptions] = useState<PartnerHotelAccess[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const loadRequestId = useRef(0);
  useEffect(() => {
    const requestId = ++loadRequestId.current;
    const requestedPartnerId = selectedPartnerId;
    const query = requestedPartnerId ? `?partnerId=${encodeURIComponent(requestedPartnerId)}` : "";
    fetch(`/api/partner/onboarding${query}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) throw new Error(body.error);
      if (body.hotelAccess) {
        setAccessOptions(body.hotelAccess.options ?? []);
        if (!requestedPartnerId && body.hotelAccess.selectedPartnerId) {
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
    }).catch((error: Error) => {
      if (requestId === loadRequestId.current) setMessage(error.message);
    });
    return () => {
      if (requestId === loadRequestId.current) loadRequestId.current += 1;
    };
  }, [selectedPartnerId]);

  const accessSelector = <HotelAccessSelector
    onChange={(partnerId) => {
      loadRequestId.current += 1;
      setSelectedPartnerId(partnerId);
      setData(null);
      setMessage(partnerId ? "Checking onboarding progress…" : "");
    }}
    options={accessOptions}
    value={selectedPartnerId}
  />;

  if (message) return <div className="mt-8 grid gap-6">{accessSelector}<p role="status" className="card p-6 text-sm text-slate-600">{message}</p></div>;
  if (!data) return <div className="mt-8 grid gap-6">{accessSelector}<p className="card p-6 text-sm text-slate-600">Select a hotel organization to view its onboarding progress.</p></div>;
  const nextStep = data.pilotPreparation.steps.find((step) => !step.complete);
  return <>
    <div className="mt-8">{accessSelector}</div>
    <section className="card mt-8 overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div><span className="text-sm text-slate-500">{data.businessName} private-pilot preparation</span><strong className="mt-2 block text-4xl">{data.pilotPreparation.percent}%</strong><p className="mt-2 text-sm text-slate-600">{data.pilotPreparation.completed} of {data.pilotPreparation.total} private-pilot requirements complete · Signed in as {data.accessRole.replaceAll("_", " ")}</p></div>
        {nextStep ? <Link href={nextStep.href} className="btn-primary">Next: {nextStep.label}</Link> : <span className="badge bg-emerald-50 text-emerald-800">Private-pilot ready</span>}
      </div>
      <div className="h-2 bg-slate-100">
        <div
          aria-label="Private-pilot preparation progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={data.pilotPreparation.percent}
          className="h-2 bg-brand-500"
          role="progressbar"
          style={{ width: `${data.pilotPreparation.percent}%` }}
        />
      </div>
    </section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <article className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="font-semibold">Private-pilot checklist</h2><p className="mt-1 text-sm text-slate-500">Prepare one complete inactive property without publishing it or enabling money movement.</p></div>
        <OnboardingSteps steps={data.pilotPreparation.steps} />
        <div className="border-t bg-slate-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">Commercial activation gates</h3><p className="mt-1 text-sm text-slate-500">Publication and payouts require separate operator, provider, and production approvals.</p></div>
            <span className="text-sm font-semibold text-amber-700">{data.commercialActivation.completed}/{data.commercialActivation.total} complete</span>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50">
            <OnboardingSteps steps={data.commercialActivation.steps} />
          </div>
        </div>
      </article>

      <div className="space-y-6">
        <article className="card p-6"><h2 className="font-semibold">Primary listing</h2>{data.primaryProperty ? <><strong className="mt-4 block text-xl">{data.primaryProperty.name}</strong><p className="mt-2 text-sm text-slate-600">{data.primaryProperty.active ? "Published in traveler search" : data.primaryProperty.readiness.ready ? "Ready for administrator review" : `Still needed: ${data.primaryProperty.readiness.missing.join(", ")}`}</p></> : <p className="mt-4 text-sm text-slate-500">No property has been created yet.</p>}<dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-5 text-sm"><div><dt className="text-slate-500">Properties</dt><dd className="mt-1 text-xl font-bold">{data.portfolio.properties}</dd></div><div><dt className="text-slate-500">Published</dt><dd className="mt-1 text-xl font-bold">{data.portfolio.published}</dd></div></dl></article>
        {data.software ? <article className="card p-6"><h2 className="font-semibold">Management software</h2><p className="mt-2 text-sm text-slate-500">Optional and separate from marketplace listing approval.</p><div className="mt-5 flex items-center justify-between"><div><span className="text-xs uppercase tracking-wider text-slate-500">Plan</span><strong className="mt-1 block capitalize">{data.software.plan}</strong></div><span className="badge capitalize">{data.software.status}</span></div><Link href="/partner/settings" className="btn-secondary mt-5 w-full text-center">Manage software plan</Link></article> : null}
      </div>
    </section>
  </>;
}
