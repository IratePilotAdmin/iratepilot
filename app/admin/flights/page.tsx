import type { Metadata } from "next";
import { Circle, CircleSlash2, ClipboardCheck, Network, Plane, Route, Scale, ShieldCheck, TicketCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { buildFlightEvaluationGovernance, flightEvaluationControls, flightEvaluationDecisionSafeguards } from "@/lib/flights/evaluation-governance";
import { buildFlightEvaluationRehearsal, flightEvaluationRehearsalReceipts, flightEvaluationRehearsalScenarios } from "@/lib/flights/evaluation-rehearsal";
import { buildFlightRehearsalAuthorizationReadiness, flightRehearsalAuthorizationArtifacts, flightRehearsalAuthorizationSafeguards } from "@/lib/flights/rehearsal-authorization";
import { buildFlightRehearsalExecutionControlDesign, flightRehearsalExecutionSafeguards, flightRehearsalExecutionStages } from "@/lib/flights/rehearsal-execution-control";
import { buildFlightRehearsalPreflightDesign, flightRehearsalPreflightControls, flightRehearsalPreflightSafeguards } from "@/lib/flights/rehearsal-preflight";
import { buildFlightSupplierDueDiligence, flightSupplierContractLanes, flightSupplierEvidenceWorkstreams } from "@/lib/flights/supplier-due-diligence";
import { buildFlightSupplierReadiness, flightCapabilityGroups, flightSupplierPaths } from "@/lib/flights/supplier-readiness";
import { buildFlightSupplierSelectionPlan, flightSandboxAdapterOperations, flightSupplierSelectionCriteria } from "@/lib/flights/supplier-selection";

export const metadata: Metadata = {
  title: "Flight rehearsal execution-control design",
  description: "Review the supplier-free synthetic rehearsal execution controls while authorization and preflight remain unsatisfied and fixtures, roles, scenarios, observations, candidates, credentials, traffic, ticketing, payments, and Production remain disabled.",
};

export default function Page() {
  const readiness = buildFlightSupplierReadiness();
  const selection = buildFlightSupplierSelectionPlan();
  const diligence = buildFlightSupplierDueDiligence();
  const governance = buildFlightEvaluationGovernance();
  const rehearsal = buildFlightEvaluationRehearsal();
  const authorization = buildFlightRehearsalAuthorizationReadiness();
  const preflight = buildFlightRehearsalPreflightDesign();
  const executionControl = buildFlightRehearsalExecutionControlDesign();
  const locks = [
    ["Authorization prerequisite", executionControl.authorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Preflight prerequisite", executionControl.preflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Execution decision", executionControl.executionDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Execution control", executionControl.executionControlState === "blocked" ? "Blocked" : "Ready"],
    ["Execution window", executionControl.executionWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Scope binding", executionControl.scopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Fixture manifest", executionControl.fixtureManifestState === "not_created" ? "Not created" : "Created"],
    ["Synthetic fixture", executionControl.syntheticFixtureState === "not_created" ? "Not created" : "Created"],
    ["Isolation proof", executionControl.isolationProofState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Roles", executionControl.roleAssignmentState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", executionControl.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Rehearsal", executionControl.rehearsalState === "not_run" ? "Not run" : "Run"],
    ["Released scenarios", `${executionControl.releasedScenarioCount}`],
    ["Scenario results", `${executionControl.scenarioResultCount}`],
    ["Observations", `${executionControl.observationCount}`],
    ["Rehearsal receipts", executionControl.receiptState === "not_created" ? "Not created" : "Created"],
    ["Findings", `${executionControl.findingCount}`],
    ["Teardown", executionControl.teardownState === "not_started" ? "Not started" : "Started"],
    ["Closeout", executionControl.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Evaluation intake", executionControl.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Candidate", executionControl.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", executionControl.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Score", executionControl.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", executionControl.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", executionControl.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", executionControl.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", executionControl.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", executionControl.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", executionControl.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", executionControl.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", executionControl.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", executionControl.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", executionControl.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", executionControl.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 9 · Rehearsal execution-control design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight synthetic rehearsal execution-control plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the entry, one-scenario-at-a-time release, observer checkpoints, immediate-stop response, sanitized observation boundary, and teardown controls that a future fictional rehearsal would require after separate authorization and preflight decisions. This page cannot satisfy either prerequisite, open an execution window, create a fixture, assign anyone, release or run a scenario, record an observation, or open supplier evaluation intake.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Rehearsal execution control is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">Neither the Phase 7 authorization nor Phase 8 preflight prerequisite is satisfied. No execution decision, window, scope binding, fixture, participant, released scenario, result, observation, receipt, finding, candidate, or supplier evidence exists. Completing this design cannot start or imply a rehearsal, contact a supplier, open intake, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>
          <div className="mt-6 text-4xl font-bold">{executionControl.completedCount}/{executionControl.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 9 gates recorded complete</p>
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
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Runbook blueprint only</p><h2 className="mt-2 text-2xl font-bold">Controlled rehearsal stages</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six static stages define future entry, scenario release, observation, stop, evidence, teardown, and closeout controls. They create no record, authorization, preflight approval, fixture, assignment, execution path, observation, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalExecutionStages.map((stage) => (
            <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{stage.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{stage.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{stage.controlRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {stage.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pause before every transition</p><h2 className="mt-2 text-2xl font-bold">Pause-and-abort safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep start authority, fictional scenario sequencing, observer veto, evidence quarantine, abort handling, restart, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalExecutionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 9 execution-control sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned execution-control gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy authorization or preflight, open an execution window, create a fixture, assign roles, release a scenario, run a rehearsal, record an observation, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {executionControl.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 8 · Rehearsal preflight design only</p>
        <h2 className="mt-2 text-2xl font-bold">Rehearsal preflight design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Rehearsal preflight is blocked.</strong> Phase 8 remains separately controlled and unsatisfied and is a static reference for isolation, fictional-fixture, role, scenario, evidence, stop, and teardown requirements. It cannot satisfy either prerequisite, open an execution window, create a fixture, assign a participant, or run a rehearsal.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preflight blueprint only</p><h2 className="mt-2 text-2xl font-bold">Preflight control artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define the future authorization scope, fictional fixture, isolation, roles, scenario checks, evidence, and teardown proof. They create no record, fixture, assignment, authorization, execution path, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalPreflightControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.readinessRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stop before any action</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep authorization prerequisites, real-data contamination, external connectivity, role conflicts, evidence handling, teardown, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalPreflightSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 8 preflight sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned preflight-readiness gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy the Phase 7 authorization prerequisite, create a fixture, assign roles, start preflight, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {preflight.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 7 · Rehearsal authorization readiness only</p>
        <h2 className="mt-2 text-2xl font-bold">Rehearsal authorization design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>No rehearsal authorization is recorded.</strong> Phase 7 remains a static reference for the approval packet and fail-closed decision boundary. It cannot satisfy the Phase 8 prerequisite, create a fixture, assign a participant, or run a rehearsal.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision packet design only</p><h2 className="mt-2 text-2xl font-bold">Authorization packet artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six artifacts define what accountable owners would need to approve before a one-time fictional rehearsal decision could be considered. They are static requirements and create no record, assignment, fixture, authorization, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalAuthorizationArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.requiredDecision}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorization cannot self-activate</p><h2 className="mt-2 text-2xl font-bold">Fail-closed authorization safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep fictional data, external connectivity, participant independence, one-time scope, findings, and downstream release decisions separately controlled.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalAuthorizationSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 7 decision sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned authorization-readiness gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed packet cannot record authorization, satisfy the Phase 8 prerequisite, create a fixture, assign roles, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {authorization.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 6 · Synthetic rehearsal design only</p>
        <h2 className="mt-2 text-2xl font-bold">Synthetic rehearsal design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Synthetic rehearsal has not run.</strong> Phase 6 remains a static reference for fictional scenarios and sanitized receipt safeguards. It cannot create a fixture, assign a reviewer, record a result, or authorize Phase 7.</p>
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
