import type { Metadata } from "next";
import { Building2, Car, CheckCircle2, Circle, ClipboardCheck, KeyRound, Network, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import {
  buildCarRentalSupplierReadiness,
  carRentalCapabilityGroups,
  carRentalSupplierPaths,
} from "@/lib/cars/supplier-readiness";

export const metadata: Metadata = {
  title: "Car Rentals supplier readiness | iRatePilot Admin",
  description: "Read-only car-rental supplier-path evaluation and activation controls.",
};

export default function AdminCarsPage() {
  const readiness = buildCarRentalSupplierReadiness();

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Car Rentals · Phase 2</p>
        <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">Supplier-readiness workspace</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">Evaluate neutral supply paths, required capabilities, and separately owned activation gates. This read-only workspace does not select or contact a supplier, create an account, accept credentials, make an external request, reserve a vehicle, or authorize payment.</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-center gap-3 text-amber-950"><ShieldAlert className="h-5 w-5" /><strong>Evaluation only</strong></div>
            <p className="mt-2 text-sm leading-6 text-amber-900">{readiness.completedCount} of {readiness.totalCount} gates recorded. Every runtime authority remains disabled.</p>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Supply model</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Paths to evaluate</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These are distribution categories, not named providers, recommendations, partnerships, or contact authorizations.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalSupplierPaths.map((path) => (
              <article key={path.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3"><Network className="h-5 w-5 text-slate-500" /><h3 className="font-semibold text-slate-950">{path.label}</h3></div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{path.fit}</p>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Diligence:</strong> {path.diligence}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Car className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Certification scope</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Required capabilities</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {carRentalCapabilityGroups.map((group) => (
              <article key={group.id} className="rounded-2xl bg-slate-950 p-6 text-white">
                <h3 className="font-semibold">{group.label}</h3>
                <ul className="mt-5 space-y-3 text-sm leading-5 text-slate-300">
                  {group.capabilities.map((capability) => <li key={capability} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{capability}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 2 activation reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Eleven separately owned activation gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Recording all eleven would complete an evaluation checklist only; it would not authorize supplier contact, accounts, credentials, sandbox or Production traffic, reservations, or payments.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {readiness.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-red-300 bg-red-50 p-6">
          <div className="flex items-center gap-3 text-red-950"><KeyRound className="h-5 w-5" /><h2 className="text-lg font-bold">Runtime hard stop</h2></div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-red-900">No supplier has been contacted or connected. Supplier accounts, credentials, external traffic, live inventory, rates, reservations, payments, database migrations, deployment, and Production changes remain outside Phase 2 and require separate approval.</p>
        </section>
      </div>
    </DashboardShell>
  );
}
