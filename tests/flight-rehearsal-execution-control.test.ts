import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightRehearsalExecutionControlDesign,
  FLIGHT_REHEARSAL_EXECUTION_CONTROL_MODE,
  flightRehearsalExecutionGates,
  flightRehearsalExecutionSafeguards,
  flightRehearsalExecutionStages,
} from "../lib/flights/rehearsal-execution-control";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight synthetic rehearsal execution-control design phase 9", () => {
  it("starts with both prerequisites unsatisfied and every execution and external capability blocked", () => {
    expect(buildFlightRehearsalExecutionControlDesign()).toMatchObject({
      mode: "synthetic_rehearsal_execution_control_design_only",
      planState: "design_only",
      executionControlState: "blocked",
      authorizationPrerequisiteState: "not_satisfied",
      preflightPrerequisiteState: "not_satisfied",
      executionDecisionState: "not_recorded",
      executionWindowState: "not_opened",
      scopeBindingState: "not_recorded",
      fixtureManifestState: "not_created",
      syntheticFixtureState: "not_created",
      isolationProofState: "not_recorded",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      rehearsalState: "not_run",
      releasedScenarioCount: 0,
      scenarioResultCount: 0,
      observationCount: 0,
      receiptState: "not_created",
      findingCount: 0,
      teardownState: "not_started",
      closeoutState: "not_created",
      evaluationIntakeState: "closed",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      executionControlPlanComplete: false,
      realSupplierDataAccepted: false,
      passengerDataAccepted: false,
      credentialsAccepted: false,
      externalNetworkAccess: false,
      externalSideEffects: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed design gates into prerequisites, execution, observations, or external effects", () => {
    const allEvidence = Object.fromEntries(flightRehearsalExecutionGates.map((gate) => [gate.id, true]));
    const control = buildFlightRehearsalExecutionControlDesign(allEvidence);
    expect(control.executionControlPlanComplete).toBe(true);
    expect(control.completedCount).toBe(control.totalCount);
    expect(control.authorizationPrerequisiteState).toBe("not_satisfied");
    expect(control.preflightPrerequisiteState).toBe("not_satisfied");
    expect(control.executionDecisionState).toBe("not_recorded");
    expect(control.executionWindowState).toBe("not_opened");
    expect(control.syntheticFixtureState).toBe("not_created");
    expect(control.roleAssignmentState).toBe("not_assigned");
    expect(control.rehearsalState).toBe("not_run");
    expect(control.releasedScenarioCount).toBe(0);
    expect(control.scenarioResultCount).toBe(0);
    expect(control.observationCount).toBe(0);
    expect(control.receiptState).toBe("not_created");
    expect(control.findingCount).toBe(0);
    expect(control.evaluationIntakeState).toBe("closed");
    expect(control.externalNetworkAccess).toBe(false);
    expect(control.externalSideEffects).toBe(false);
    expect(control.sandboxTrafficAuthorized).toBe(false);
    expect(control.productionTrafficAuthorized).toBe(false);
    expect(control.ticketingAuthorized).toBe(false);
    expect(control.paymentAuthorized).toBe(false);
  });

  it("defines six unique run-control stages with explicit non-execution boundaries", () => {
    expect(FLIGHT_REHEARSAL_EXECUTION_CONTROL_MODE).toBe("synthetic_rehearsal_execution_control_design_only");
    expect(flightRehearsalExecutionStages).toHaveLength(6);
    expect(new Set(flightRehearsalExecutionStages.map((stage) => stage.id)).size).toBe(6);
    expect(flightRehearsalExecutionStages.every((stage) => stage.owner.length > 0)).toBe(true);
    expect(flightRehearsalExecutionStages.every((stage) => stage.nonExecutionBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique pause-and-abort safeguards", () => {
    expect(flightRehearsalExecutionSafeguards).toHaveLength(5);
    expect(new Set(flightRehearsalExecutionSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightRehearsalExecutionSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightRehearsalExecutionSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten execution-control gates unique and separately owned", () => {
    expect(flightRehearsalExecutionGates).toHaveLength(10);
    expect(new Set(flightRehearsalExecutionGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightRehearsalExecutionGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 9 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/rehearsal-execution-control.ts");
    expect(page).toContain("Flights · Phase 9 · Rehearsal execution-control design only");
    expect(page).toContain("Rehearsal execution control is blocked");
    expect(page).toContain("Controlled rehearsal stages");
    expect(page).toContain("Pause-and-abort safeguards");
    expect(page).toContain("Ten separately owned execution-control gates");
    expect(page).toContain("Flights · Phase 8 · Rehearsal preflight design only");
    expect(page).toContain("Flights · Phase 7 · Rehearsal authorization readiness only");
    expect(page).toContain("Flights · Phase 6 · Synthetic rehearsal design only");
    expect(page).toContain("Flights · Phase 5 · Evaluation governance only");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Phase 3 planning reference");
    expect(page).toContain("Phase 2 activation reference");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
    expect(model).not.toContain("candidateName");
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
    expect(model).not.toContain("participantName");
  });
});
