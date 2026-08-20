import type { Metadata } from "next";
import { Accessibility, Building2, Calculator, Car, CheckCircle2, Circle, ClipboardCheck, Fuel, GitCompareArrows, KeyRound, Network, ReceiptText, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import {
  buildCarRentalInventoryNormalizationPlan,
  carRentalAccessibilityStates,
  carRentalInventoryContracts,
  carRentalPowertrains,
  carRentalTransmissions,
} from "@/lib/cars/inventory-normalization";
import {
  buildCarRentalPricingPolicyPlan,
  carRentalDepositStates,
  carRentalFuelChargingPolicyKinds,
  carRentalMileagePolicyKinds,
  carRentalPriceLineItemKinds,
  carRentalPricingPolicyContracts,
  carRentalProtectionSelections,
} from "@/lib/cars/pricing-policy";
import {
  buildCarRentalSupplierReadiness,
  carRentalCapabilityGroups,
  carRentalSupplierPaths,
} from "@/lib/cars/supplier-readiness";

export const metadata: Metadata = {
  title: "Car Rentals pricing and policy | iRatePilot Admin",
  description: "Read-only, provider-neutral car-rental total-price, policy, and inventory-normalization contracts.",
};

export default function AdminCarsPage() {
  const pricingPolicy = buildCarRentalPricingPolicyPlan();
  const normalization = buildCarRentalInventoryNormalizationPlan();
  const readiness = buildCarRentalSupplierReadiness();

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Car Rentals · Phase 4</p>
        <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">Total-price and rental-policy workspace</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">Review provider-neutral contracts for complete price composition, mileage, fuel or charging, deposits, protection products, and exclusions. This read-only workspace validates contract design with sanitized fixtures only and never ingests a supplier quote or exposes a live price.</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-center gap-3 text-amber-950"><ShieldAlert className="h-5 w-5" /><strong>Pricing contract only</strong></div>
            <p className="mt-2 text-sm leading-6 text-amber-900">{pricingPolicy.completedCount} of {pricingPolicy.totalCount} gates recorded. No supplier quote is ingested, and every runtime authority remains disabled.</p>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 4 pricing and policy reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Provider-neutral total-price contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract makes an amount or policy state explicit, preserves unknowns, and records what remains outside the displayed total. A valid synthetic record proves arithmetic and policy consistency only; it is not a supplier quote, reprice, reservation, protection decision, or payment authorization.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalPricingPolicyContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.normalizationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Calculator className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled price and policy states</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Exact arithmetic and explicit unknowns</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">All amounts use non-negative integer minor units. The advertised total must exactly equal included line items; deposits remain outside the rental total, and optional or declined protection products cannot be priced as selected.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Price lines</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPriceLineItemKinds.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Mileage</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalMileagePolicyKinds.join(" · ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Fuel or charging</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalFuelChargingPolicyKinds.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Deposit and protection</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">Deposit: {carRentalDepositStates.join(" · ")}<br />Protection: {carRentalProtectionSelections.join(" · ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 4 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned pricing and policy gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Even a completed review cannot ingest a supplier quote, accept policy terms, enable credentials or traffic, display a live total, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {pricingPolicy.gates.map((gate, index) => (
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

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><GitCompareArrows className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 3 normalization reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Provider-neutral inventory contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract preserves source facts, explicit unknown states, and a consumer-safety boundary. A normalized record is a design artifact, not availability, a quote, or a reservable vehicle.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalInventoryContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.normalizationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Fuel className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled vocabulary</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit values, including unknown states</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Transmission</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalTransmissions.join(" · ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Fuel or powertrain</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPowertrains.join(" · ").replace("plug_in_hybrid", "plug-in hybrid")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">Accessibility state</h3></div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAccessibilityStates.join(" · ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 3 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Ten separately owned normalization gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Even a completed contract review cannot create a provider mapping, ingest data, accept credentials, enable traffic, show live inventory, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {normalization.gates.map((gate, index) => (
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

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Supply model</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Phase 2 readiness reference</h2>
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
          <p className="mt-3 max-w-4xl text-sm leading-6 text-red-900">No supplier has been contacted or connected. No supplier inventory is ingested, no supplier quote is ingested, no provider mapping exists, and no live total price or policy acceptance is available. Supplier research or contact, accounts, credentials, external traffic, live inventory, rates, policies, repricing, reservations, payments, database migrations, deployment, and Production changes remain outside Phase 4 and require separate approval.</p>
        </section>
      </div>
    </DashboardShell>
  );
}
