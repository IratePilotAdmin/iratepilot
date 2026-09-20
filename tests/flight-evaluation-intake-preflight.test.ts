import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationIntakePreflightDesign,
  FLIGHT_EVALUATION_INTAKE_PREFLIGHT_MODE,
  flightEvaluationIntakePreflightControls,
  flightEvaluationIntakePreflightGates,
  flightEvaluationIntakePreflightSafeguards,
} from "../lib/flights/evaluation-intake-preflight";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evaluation intake preflight design phase 12", () => {
  it("recognizes Phase 11 software acceptance without treating it as intake authorization", () => {
    expect(buildFlightEvaluationIntakePreflightDesign()).toMatchObject({
      mode: "supplier_evaluation_intake_preflight_design_only",
      planState: "design_only",
      preflightState: "blocked",
      phase11AuthorizationPrerequisiteState: "not_satisfied",
      phase11SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      scopeBindingState: "not_recorded",
      candidateNeutralityCheckState: "not_started",
      contactPlanState: "not_approved",
      submissionChannelState: "not_created",
      isolationProofState: "not_recorded",
      evidenceTaxonomyState: "not_approved",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      evaluationIntakeState: "closed",
      supplierContactState: "not_started",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      evidenceCount: 0,
      authorizationWindowState: "not_opened",
      stopPlanState: "not_approved",
      closeoutPlanState: "not_approved",
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      preflightDesignComplete: false,
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

  it("never converts completed preflight gates into authorization, intake, contact, evidence, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationIntakePreflightGates.map((gate) => [gate.id, true]));
    const preflight = buildFlightEvaluationIntakePreflightDesign(allEvidence);
    expect(preflight.preflightDesignComplete).toBe(true);
    expect(preflight.completedCount).toBe(preflight.totalCount);
    expect(preflight.preflightState).toBe("blocked");
    expect(preflight.phase11AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(preflight.authorizationReferenceState).toBe("not_recorded");
    expect(preflight.evaluationIntakeState).toBe("closed");
    expect(preflight.supplierContactState).toBe("not_started");
    expect(preflight.candidateState).toBe("not_recorded");
    expect(preflight.evaluationCaseState).toBe("not_created");
    expect(preflight.submissionChannelState).toBe("not_created");
    expect(preflight.evidenceCount).toBe(0);
    expect(preflight.roleAssignmentState).toBe("not_assigned");
    expect(preflight.authorizationWindowState).toBe("not_opened");
    expect(preflight.scoreState).toBe("not_calculated");
    expect(preflight.recommendationState).toBe("not_issued");
    expect(preflight.shortlistState).toBe("not_created");
    expect(preflight.contractState).toBe("not_received");
    expect(preflight.selectionState).toBe("not_selected");
    expect(preflight.externalNetworkAccess).toBe(false);
    expect(preflight.externalSideEffects).toBe(false);
    expect(preflight.sandboxTrafficAuthorized).toBe(false);
    expect(preflight.productionTrafficAuthorized).toBe(false);
    expect(preflight.ticketingAuthorized).toBe(false);
    expect(preflight.paymentAuthorized).toBe(false);
  });

  it("defines seven unique preflight controls with explicit non-opening boundaries", () => {
    expect(FLIGHT_EVALUATION_INTAKE_PREFLIGHT_MODE).toBe("supplier_evaluation_intake_preflight_design_only");
    expect(flightEvaluationIntakePreflightControls).toHaveLength(7);
    expect(new Set(flightEvaluationIntakePreflightControls.map((control) => control.id)).size).toBe(7);
    expect(flightEvaluationIntakePreflightControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakePreflightControls.every((control) => control.nonOpeningBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop safeguards", () => {
    expect(flightEvaluationIntakePreflightSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationIntakePreflightSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationIntakePreflightSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakePreflightSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten intake-preflight gates unique and separately owned", () => {
    expect(flightEvaluationIntakePreflightGates).toHaveLength(10);
    expect(new Set(flightEvaluationIntakePreflightGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationIntakePreflightGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 12 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-intake-preflight.ts");
    expect(page).toContain("Flights · Phase 12 · Evaluation-intake preflight design only");
    expect(page).toContain("Evaluation-intake preflight is blocked");
    expect(page).toContain("Intake preflight control artifacts");
    expect(page).toContain("Immediate-stop intake safeguards");
    expect(page).toContain("Ten separately owned intake-preflight gates");
    expect(page).toContain("Flights · Phase 11 · Evaluation-intake authorization design only");
    expect(page).toContain("Flights · Phase 10 · Rehearsal closeout design only");
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
    expect(model).not.toContain("supplierName");
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
    expect(model).not.toContain("reviewerName");
  });
});
