import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Hotel } from "lucide-react";
import { getPartnerLaunchProgress, type PartnerLaunchProperty } from "@/lib/partner-launch";

export function PartnerLaunchDashboard({
  businessName,
  properties
}: {
  businessName?: string | null;
  properties: PartnerLaunchProperty[];
}) {
  const progress = getPartnerLaunchProgress(properties);
  const heading = businessName ? `Welcome, ${businessName}` : "Welcome to Partner Center";

  return (
    <div className="grid gap-8">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Listing launch</span>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{heading}</h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">Complete the steps below to make your first premium property eligible for traveler search and booking.</p>
          </div>
          {progress.nextStep ? (
            <Link href={progress.nextStep.href} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-slate-950">
              {progress.nextStep.label} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link href="/partner/reservations" className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-slate-950">
              View reservations <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <article className="card p-6"><span className="text-sm text-slate-500">Setup progress</span><strong className="mt-2 block text-3xl">{progress.percent}%</strong><p className="mt-2 text-sm text-slate-500">{progress.completed} of {progress.total} listing steps complete</p></article>
        <article className="card p-6"><span className="text-sm text-slate-500">Properties</span><strong className="mt-2 block text-3xl">{properties.length}</strong><p className="mt-2 text-sm text-slate-500">Draft and published listings</p></article>
        <article className="card p-6"><span className="text-sm text-slate-500">Published</span><strong className="mt-2 block text-3xl">{progress.publishedCount}</strong><p className="mt-2 text-sm text-slate-500">Visible in traveler search</p></article>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center gap-3"><Hotel className="h-6 w-6 text-violet-700" /><h2 className="text-xl font-bold">Launch your first listing</h2></div>
          <p className="mt-2 text-sm text-slate-500">Your property stays private until every requirement is complete and an administrator approves publication.</p>
        </div>
        <ol className="divide-y divide-slate-200">
          {progress.steps.map((step) => (
            <li key={step.key} className="grid gap-4 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              {step.complete ? <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-label="Complete" /> : <Circle className="h-6 w-6 text-slate-300" aria-label="Not complete" />}
              <div><strong>{step.label}</strong><p className="mt-1 text-sm text-slate-500">{step.description}</p></div>
              <Link href={step.href} className="text-sm font-bold text-violet-700">{step.complete ? "Review" : "Continue"}</Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
