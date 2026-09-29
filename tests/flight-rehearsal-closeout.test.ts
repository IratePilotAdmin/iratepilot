import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightRehearsalCloseoutDesign,
  FLIGHT_REHEARSAL_CLOSEOUT_MODE,
  flightRehearsalCloseoutArtifacts,
  flightRehearsalCloseoutGates,
  flightRehearsalCloseoutSafeguards,
} from "../lib/flights/rehearsal-closeout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight synthetic rehearsal closeout design phase 10", () => {
  it("starts without an execution record and keeps closeout and every external capability blocked", () => {
    expect(buildFlightRehearsalCloseoutDesign()).toMatchObject({
      mode: "synthetic_rehearsal_closeout_design_only",
      planState: "design_only",
      closeoutControlState: "blocked",
      authorizationPrerequisiteState: "not_satisfied",
      preflightPrerequisiteState: "not_satisfied",
      executionRecordState: "not_created",
      executionWindowState: "not_opened",
      scopeBindingState: "not_recorded",
      fixtureManifestState: "not_created",
      syntheticFixtureState: "not_created",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      rehearsalState: "not_run",
      releasedScenarioCount: 0,
      scenarioResultCount: 0,
      observationCount: 0,
      receiptState: "not_created",
      findingCount: 0,
      findingDispositionState: "not_started",
      contaminationReviewState: "not_started",
      teardownState: "not_started",
      fixtureDeletionState: "not_confirmed",
      observerCloseoutState: "not_recorded",
      authorizationExpirationState: "not_recorded",
      closeoutDecisionState: "not_recorded",
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
      closeoutPlanComplete: false,
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

  it("never converts completed design gates into execution, teardown, findings, closeout, or external effects", () => {
    const allEvidence = Object.fromEntries(flightRehearsalCloseoutGates.map((gate) => [gate.id, true]));
    const closeout = buildFlightRehearsalCloseoutDesign(allEvidence);
    expect(closeout.closeoutPlanComplete).toBe(true);
    expect(closeout.completedCount).toBe(closeout.totalCount);
    expect(closeout.executionRecordState).toBe("not_created");
    expect(closeout.executionWindowState).toBe("not_opened");
    expect(closeout.syntheticFixtureState).toBe("not_created");
    expect(closeout.rehearsalState).toBe("not_run");
    expect(closeout.releasedScenarioCount).toBe(0);
    expect(closeout.scenarioResultCount).toBe(0);
    expect(closeout.observationCount).toBe(0);
    expect(closeout.receiptState).toBe("not_created");
    expect(closeout.findingCount).toBe(0);
    expect(closeout.findingDispositionState).toBe("not_started");
    expect(closeout.teardownState).toBe("not_started");
    expect(closeout.fixtureDeletionState).toBe("not_confirmed");
    expect(closeout.closeoutState).toBe("not_created");
    expect(closeout.evaluationIntakeState).toBe("closed");
    expect(closeout.externalNetworkAccess).toBe(false);
    expect(closeout.externalSideEffects).toBe(false);
    expect(closeout.sandboxTrafficAuthorized).toBe(false);
    expect(closeout.productionTrafficAuthorized).toBe(false);
    expect(closeout.ticketingAuthorized).toBe(false);
    expect(closeout.paymentAuthorized).toBe(false);
  });

  it("defines six unique closeout artifacts with explicit non-record boundaries", () => {
    expect(FLIGHT_REHEARSAL_CLOSEOUT_MODE).toBe("synthetic_rehearsal_closeout_design_only");
    expect(flightRehearsalCloseoutArtifacts).toHaveLength(6);
    expect(new Set(flightRehearsalCloseoutArtifacts.map((artifact) => artifact.id)).size).toBe(6);
    expect(flightRehearsalCloseoutArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightRehearsalCloseoutArtifacts.every((artifact) => artifact.nonRecordBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique findings-disposition safeguards", () => {
    expect(flightRehearsalCloseoutSafeguards).toHaveLength(5);
    expect(new Set(flightRehearsalCloseoutSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightRehearsalCloseoutSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightRehearsalCloseoutSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten closeout-control gates unique and separately owned", () => {
    expect(flightRehearsalCloseoutGates).toHaveLength(10);
    expect(new Set(flightRehearsalCloseoutGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightRehearsalCloseoutGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 10 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/rehearsal-closeout.ts");
    expect(page).toContain("Flights · Phase 10 · Rehearsal closeout design only");
    expect(page).toContain("Rehearsal closeout is blocked");
    expect(page).toContain("Closeout evidence artifacts");
    expect(page).toContain("Findings-disposition safeguards");
    expect(page).toContain("Ten separately owned closeout-control gates");
    expect(page).toContain("Flights · Phase 9 · Rehearsal execution-control design only");
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
