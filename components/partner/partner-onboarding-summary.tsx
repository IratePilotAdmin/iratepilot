"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OnboardingStep = {
  label: string;
  complete: boolean;
  href: string;
};

type OnboardingSummary = {
  businessName: string;
  pilotPreparation: {
    completed: number;
    total: number;
    percent: number;
    ready: boolean;
    steps: OnboardingStep[];
  };
  commercialActivation: {
    completed: number;
    total: number;
    ready: boolean;
  };
  hotelAccess: { selectionRequired: boolean } | null;
};

export function PartnerOnboardingSummary() {
  const [data, setData] = useState<OnboardingSummary | null>(null);
  const [message, setMessage] = useState("Checking onboarding progress…");

  useEffect(() => {
    let active = true;
    fetch("/api/partner/onboarding", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Onboarding progress is unavailable.");
      if (active) {
        setData(body);
        setMessage("");
      }
    }).catch((error: Error) => {
      if (active) setMessage(error.message);
    });
    return () => { active = false; };
  }, []);

  if (message) {
    return <p className="card mt-8 p-6 text-sm text-slate-600" role="status">{message}</p>;
  }
  if (!data) return null;

  if (data.hotelAccess?.selectionRequired) {
    return <section className="card mt-8 p-6">
      <h2 className="text-xl font-semibold">Choose a hotel to continue</h2>
      <p className="mt-2 text-sm text-slate-600">Select the hotel organization you want to prepare, then continue its onboarding checklist.</p>
      <Link className="btn-primary mt-5 inline-flex" href="/partner/onboarding">Choose a hotel</Link>
    </section>;
  }

  const nextStep = data.pilotPreparation.steps.find((step) => !step.complete);
  const pilotReady = data.pilotPreparation.ready;
  return <section className="card mt-8 overflow-hidden" aria-labelledby="dashboard-onboarding-title">
    <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm text-slate-500">{data.businessName} onboarding</p>
        <h2 className="mt-1 text-xl font-semibold" id="dashboard-onboarding-title">
          {pilotReady ? "Private-pilot preparation is complete" : `${data.pilotPreparation.percent}% ready for a private pilot`}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {data.pilotPreparation.completed} of {data.pilotPreparation.total} preparation steps complete
          {pilotReady ? ` · ${data.commercialActivation.completed} of ${data.commercialActivation.total} commercial activation gates complete` : ""}
        </p>
      </div>
      {nextStep
        ? <Link className="btn-primary text-center" href={nextStep.href}>Next: {nextStep.label}</Link>
        : <Link className="btn-secondary text-center" href="/partner/onboarding">Review activation gates</Link>}
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
  </section>;
}
