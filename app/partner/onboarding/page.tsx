import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PartnerApplicationForm } from "@/components/forms/partner-application-form";
import { partnerNavigation } from "@/data/navigation";

export default function Page() {
  return (
    <DashboardShell title="Partner Center" items={partnerNavigation}>
      <div className="mx-auto max-w-5xl">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
          Partner application
        </span>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Property onboarding</h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Start with your primary property details. iRatePilot currently accepts
          verified 4- and 5-star hotels, resorts, and premium vacation homes.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="card h-fit p-6">
            <h2 className="text-lg font-bold">What happens next</h2>
            <ol className="mt-5 grid gap-5 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">1</span>
                <div><strong className="block text-slate-950">Submit your application</strong>Tell us about the property and your primary contact.</div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">2</span>
                <div><strong className="block text-slate-950">Complete verification</strong>Our team confirms property quality, ownership, and eligibility.</div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">3</span>
                <div><strong className="block text-slate-950">Build your listing</strong>Add rooms, amenities, policies, rates, inventory, and photos.</div>
              </li>
            </ol>
            <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
              Submission does not publish a property. Every listing remains
              inactive until iRatePilot approval.
            </p>
          </aside>

          <PartnerApplicationForm />
        </div>
      </div>
    </DashboardShell>
  );
}
