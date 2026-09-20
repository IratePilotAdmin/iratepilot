import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightRehearsalPreflightDesign,
  FLIGHT_REHEARSAL_PREFLIGHT_MODE,
  flightRehearsalPreflightControls,
  flightRehearsalPreflightGates,
  flightRehearsalPreflightSafeguards,
} from "../lib/flights/rehearsal-preflight";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight synthetic rehearsal preflight design phase 8", () => {
  it("starts with authorization unsatisfied and all preflight and runtime capabilities blocked", () => {
    expect(buildFlightRehearsalPreflightDesign()).toMatchObject({
      mode: "synthetic_rehearsal_preflight_design_only",
      planState: "design_only",
      preflightState: "blocked",
      authorizationPrerequisiteState: "not_satisfied",
      authorizationReferenceState: "not_recorded",
      scopeBindingState: "not_recorded",
      fixtureManifestState: "not_created",
      isolationProofState: "not_recorded",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      rehearsalState: "not_run",
      syntheticFixtureState: "not_created",
      scenarioResultCount: 0,
      receiptState: "not_created",
      findingCount: 0,
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
      preflightPlanComplete: false,
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

  it("never converts completed design gates into authorization, fixture creation, execution, or external effects", () => {
    const allEvidence = Object.fromEntries(flightRehearsalPreflightGates.map((gate) => [gate.id, true]));
    const preflight = buildFlightRehearsalPreflightDesign(allEvidence);
    expect(preflight.preflightPlanComplete).toBe(true);
    expect(preflight.completedCount).toBe(preflight.totalCount);
    expect(preflight.authorizationPrerequisiteState).toBe("not_satisfied");
    expect(preflight.authorizationReferenceState).toBe("not_recorded");
    expect(preflight.preflightState).toBe("blocked");
    expect(preflight.syntheticFixtureState).toBe("not_created");
    expect(preflight.roleAssignmentState).toBe("not_assigned");
    expect(preflight.rehearsalState).toBe("not_run");
    expect(preflight.scenarioResultCount).toBe(0);
    expect(preflight.receiptState).toBe("not_created");
    expect(preflight.evaluationIntakeState).toBe("closed");
    expect(preflight.realSupplierDataAccepted).toBe(false);
    expect(preflight.passengerDataAccepted).toBe(false);
    expect(preflight.credentialsAccepted).toBe(false);
    expect(preflight.externalNetworkAccess).toBe(false);
    expect(preflight.externalSideEffects).toBe(false);
    expect(preflight.sandboxTrafficAuthorized).toBe(false);
    expect(preflight.productionTrafficAuthorized).toBe(false);
    expect(preflight.ticketingAuthorized).toBe(false);
    expect(preflight.paymentAuthorized).toBe(false);
  });

  it("defines seven unique preflight controls with explicit non-execution boundaries", () => {
    expect(FLIGHT_REHEARSAL_PREFLIGHT_MODE).toBe("synthetic_rehearsal_preflight_design_only");
    expect(flightRehearsalPreflightControls).toHaveLength(7);
    expect(new Set(flightRehearsalPreflightControls.map((control) => control.id)).size).toBe(7);
    expect(flightRehearsalPreflightControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightRehearsalPreflightControls.every((control) => control.nonExecutionBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop safeguards", () => {
    expect(flightRehearsalPreflightSafeguards).toHaveLength(5);
    expect(new Set(flightRehearsalPreflightSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightRehearsalPreflightSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightRehearsalPreflightSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten preflight-readiness gates unique and separately owned", () => {
    expect(flightRehearsalPreflightGates).toHaveLength(10);
    expect(new Set(flightRehearsalPreflightGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightRehearsalPreflightGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 8 administrator workspace server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Flights · Phase 8 · Rehearsal preflight design only");
    expect(page).toContain("Rehearsal preflight is blocked");
    expect(page).toContain("Preflight control artifacts");
    expect(page).toContain("Immediate-stop safeguards");
    expect(page).toContain("Ten separately owned preflight-readiness gates");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
  });

  it("preserves Phase 7 through Phase 2 references without adding sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/rehearsal-preflight.ts");
    expect(page).toContain("Flights · Phase 7 · Rehearsal authorization readiness only");
    expect(page).toContain("Flights · Phase 6 · Synthetic rehearsal design only");
    expect(page).toContain("Flights · Phase 5 · Evaluation governance only");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Phase 3 planning reference");
    expect(page).toContain("Phase 2 activation reference");
    expect(model).not.toContain("candidateName");
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
    expect(model).not.toContain("participantName");
  });
});
