import type { Metadata } from "next";
import { Circle, CircleSlash2, ClipboardCheck, Network, Plane, Route, Scale, ShieldCheck, TicketCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { buildFlightEvaluationGovernance, flightEvaluationControls, flightEvaluationDecisionSafeguards } from "@/lib/flights/evaluation-governance";
import { buildFlightEvaluationRehearsal, flightEvaluationRehearsalReceipts, flightEvaluationRehearsalScenarios } from "@/lib/flights/evaluation-rehearsal";
import { buildFlightSupplierDueDiligence, flightSupplierContractLanes, flightSupplierEvidenceWorkstreams } from "@/lib/flights/supplier-due-diligence";
import { buildFlightSupplierReadiness, flightCapabilityGroups, flightSupplierPaths } from "@/lib/flights/supplier-readiness";
import { buildFlightSupplierSelectionPlan, flightSandboxAdapterOperations, flightSupplierSelectionCriteria } from "@/lib/flights/supplier-selection";

export const metadata: Metadata = {
  title: "Flight supplier evaluation rehearsal plan",
  description: "Review the supplier-free synthetic evaluation rehearsal design while fixtures, scenarios, candidates, evidence, scoring, credentials, traffic, ticketing, payments, and Production remain disabled.",
};

export default function Page() {
  const readiness = buildFlightSupplierReadiness();
  const selection = buildFlightSupplierSelectionPlan();
  const diligence = buildFlightSupplierDueDiligence();
  const governance = buildFlightEvaluationGovernance();
  const rehearsal = buildFlightEvaluationRehearsal();
  const locks = [
    ["Rehearsal", rehearsal.rehearsalState === "not_run" ? "Not run" : "Run"],
    ["Synthetic fixture", rehearsal.syntheticFixtureState === "not_created" ? "Not created" : "Created"],
    ["Scenario results", `${rehearsal.scenarioResultCount}`],
    ["Rehearsal receipts", rehearsal.receiptState === "not_created" ? "Not created" : "Created"],
    ["Observer", rehearsal.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Evaluation intake", rehearsal.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Candidate", rehearsal.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", rehearsal.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Score", rehearsal.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", rehearsal.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", rehearsal.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", rehearsal.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", rehearsal.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", rehearsal.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["Sandbox adapter", rehearsal.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", rehearsal.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", rehearsal.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", rehearsal.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", rehearsal.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 6 · Synthetic rehearsal design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier evaluation rehearsal plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Design how internal reviewers would rehearse evidence rejection, recusal, exception, and recommendation boundaries with fictional data before any named supplier evaluation is considered. No fixture, scenario result, receipt, candidate, supplier material, credential, or external contact is recorded.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Synthetic rehearsal has not run</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No fictional fixture, scenario result, receipt, candidate, or supplier evidence exists. Rehearsal-plan completion cannot start a rehearsal, open intake, calculate a score, issue a recommendation, create a shortlist, select a supplier, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>
          <div className="mt-6 text-4xl font-bold">{rehearsal.completedCount}/{rehearsal.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 6 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {locks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className="mt-1 block text-sm font-medium text-rose-700">{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fictional tabletop only</p><h2 className="mt-2 text-2xl font-bold">Synthetic evaluation scenarios</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six scenarios define the fail-closed control responses a future internal rehearsal must prove. They contain no supplier identity, supplier evidence, passenger data, credentials, endpoints, schedules, fares, availability, or external communication.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationRehearsalScenarios.map((scenario) => (
            <article key={scenario.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{scenario.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{scenario.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{scenario.rehearsalObjective}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {scenario.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Future sanitized evidence design</p><h2 className="mt-2 text-2xl font-bold">Rehearsal receipt safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five receipt designs keep fictional fixtures, role separation, scenario outcomes, exceptions, dissent, and release boundaries distinct. This phase creates no receipt or storage path.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationRehearsalReceipts.map((receipt) => (
            <article key={receipt.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{receipt.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{receipt.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{receipt.receiptRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {receipt.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 6 release sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned rehearsal-design gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed plan cannot create a fictional fixture, assign reviewers, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {rehearsal.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 5 · Evaluation governance only</p><h2 className="mt-2 text-2xl font-bold">Evidence admissibility controls</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six controls define how future evidence would be attributed, compared, protected, independently reviewed, and escalated. They do not open an intake channel or receive any supplier material.</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation intake remains closed.</strong> Phase 5 governance remains a reference only and cannot create an evaluation case or accept supplier evidence.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.requiredRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision separation</p><h2 className="mt-2 text-2xl font-bold">Decision-record safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep admissibility, scoring, conflicts, exceptions, recommendations, shortlist approval, contracting, supplier selection, and release as separate future records.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationDecisionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.recordRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {safeguard.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 5 evaluation governance reference</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned evaluation-governance gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed governance record cannot open evidence intake, create an evaluation case, or authorize a named supplier review.</p></div>
        <div className="divide-y divide-slate-100">
          {governance.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 4 diligence reference</p><h2 className="mt-2 text-2xl font-bold">Candidate evidence packet</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven workstreams define what attributable, current evidence would be required from a future candidate. This page stores no supplier identity, response, document, score, quote, or representation.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightSupplierEvidenceWorkstreams.map((workstream) => (
            <article key={workstream.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{workstream.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{workstream.owner}</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {workstream.requiredEvidence.map((item) => <li key={item} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{item}</li>)}
              </ul>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {workstream.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Negotiation boundary</p><h2 className="mt-2 text-2xl font-bold">Contract review matrix</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six separately owned lanes define future review scope. They do not receive, negotiate, approve, sign, or activate an agreement.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightSupplierContractLanes.map((lane) => (
            <article key={lane.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{lane.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{lane.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{lane.reviewScope}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {lane.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 4 release sequence</p><h2 className="mt-2 text-2xl font-bold">Nine separately owned diligence gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed diligence record cannot create a candidate, accept a contract, select a supplier, or authorize implementation.</p></div>
        <div className="divide-y divide-slate-100">
          {diligence.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 3 planning reference</p><h2 className="mt-2 text-2xl font-bold">One-hundred-point selection rubric</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Weights define how comparable evidence should be reviewed later. This page stores no candidate, score, evidence, shortlist, or selection.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightSupplierSelectionCriteria.map((criterion) => (
            <article key={criterion.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4"><h3 className="font-bold">{criterion.label}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{criterion.weight}%</span></div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{criterion.owner}</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {criterion.questions.map((question) => <li key={question} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{question}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adapter design only</p><h2 className="mt-2 text-2xl font-bold">Provider-neutral sandbox contract</h2></div><Network className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These four shapes define a future integration boundary. There is no adapter, endpoint, secret, provider SDK, database state, request, response, or network access in Phase 3.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightSandboxAdapterOperations.map((operation) => (
            <article key={operation.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <ClipboardCheck className="h-6 w-6 text-brand-700" />
              <h3 className="mt-4 font-bold">{operation.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{operation.contract}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {operation.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 3 release sequence</p><h2 className="mt-2 text-2xl font-bold">Eight separately owned decision gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. A completed planning record still cannot choose a supplier or authorize an adapter build.</p></div>
        <div className="divide-y divide-slate-100">
          {selection.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Supply model</p><h2 className="mt-2 text-2xl font-bold">Paths to evaluate</h2></div><Route className="h-7 w-7 text-slate-400" /></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {flightSupplierPaths.map((path) => (
            <article key={path.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <Plane className="h-6 w-6 text-brand-700" />
              <h3 className="mt-5 text-lg font-bold">{path.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{path.fit}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Diligence:</strong> {path.diligence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Certification scope</p><h2 className="mt-2 text-2xl font-bold">Required capabilities</h2></div><TicketCheck className="h-7 w-7 text-slate-400" /></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightCapabilityGroups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{group.label}</h3>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {group.capabilities.map((capability) => <li key={capability} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{capability}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 2 activation reference</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned activation gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Evidence entry and approval controls are intentionally deferred until a supplier path and storage model receive separate approval.</p></div>
        <div className="divide-y divide-slate-100">
          {readiness.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
