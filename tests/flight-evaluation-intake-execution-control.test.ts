import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationIntakeExecutionControlDesign,
  FLIGHT_EVALUATION_INTAKE_EXECUTION_CONTROL_MODE,
  flightEvaluationIntakeExecutionControls,
  flightEvaluationIntakeExecutionGates,
  flightEvaluationIntakeExecutionSafeguards,
} from "../lib/flights/evaluation-intake-execution-control";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evaluation intake execution-control design phase 13", () => {
  it("recognizes Phase 12 software acceptance without treating it as authorization, preflight, or intake authority", () => {
    expect(buildFlightEvaluationIntakeExecutionControlDesign()).toMatchObject({
      mode: "supplier_evaluation_intake_execution_control_design_only",
      planState: "design_only",
      executionControlState: "blocked",
      phase11AuthorizationPrerequisiteState: "not_satisfied",
      phase12PreflightPrerequisiteState: "not_satisfied",
      phase12SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      preflightReceiptState: "not_created",
      executionDecisionState: "not_recorded",
      scopeBindingState: "not_recorded",
      intakeWindowState: "not_opened",
      candidateNeutralityCheckState: "not_started",
      contactHandoffState: "not_created",
      submissionChannelState: "not_created",
      isolationProofState: "not_recorded",
      evidenceTaxonomyState: "not_approved",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      supplierContactState: "not_started",
      evaluationIntakeState: "closed",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      evidenceCount: 0,
      sanitationState: "not_started",
      quarantineState: "not_started",
      incidentState: "not_created",
      stopRecordState: "not_created",
      teardownState: "not_started",
      closeoutState: "not_created",
      authorizationExpiryState: "not_recorded",
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      executionControlDesignComplete: false,
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

  it("never converts completed design gates into prerequisites, intake execution, evidence, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationIntakeExecutionGates.map((gate) => [gate.id, true]));
    const control = buildFlightEvaluationIntakeExecutionControlDesign(allEvidence);
    expect(control.executionControlDesignComplete).toBe(true);
    expect(control.completedCount).toBe(control.totalCount);
    expect(control.phase11AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(control.phase12PreflightPrerequisiteState).toBe("not_satisfied");
    expect(control.authorizationReferenceState).toBe("not_recorded");
    expect(control.preflightReceiptState).toBe("not_created");
    expect(control.executionDecisionState).toBe("not_recorded");
    expect(control.intakeWindowState).toBe("not_opened");
    expect(control.contactHandoffState).toBe("not_created");
    expect(control.submissionChannelState).toBe("not_created");
    expect(control.supplierContactState).toBe("not_started");
    expect(control.evaluationIntakeState).toBe("closed");
    expect(control.candidateState).toBe("not_recorded");
    expect(control.evaluationCaseState).toBe("not_created");
    expect(control.evidenceCount).toBe(0);
    expect(control.sanitationState).toBe("not_started");
    expect(control.quarantineState).toBe("not_started");
    expect(control.incidentState).toBe("not_created");
    expect(control.stopRecordState).toBe("not_created");
    expect(control.scoreState).toBe("not_calculated");
    expect(control.selectionState).toBe("not_selected");
    expect(control.externalNetworkAccess).toBe(false);
    expect(control.externalSideEffects).toBe(false);
    expect(control.sandboxTrafficAuthorized).toBe(false);
    expect(control.productionTrafficAuthorized).toBe(false);
    expect(control.ticketingAuthorized).toBe(false);
    expect(control.paymentAuthorized).toBe(false);
  });

  it("defines seven unique intake execution controls with explicit non-execution boundaries", () => {
    expect(FLIGHT_EVALUATION_INTAKE_EXECUTION_CONTROL_MODE).toBe("supplier_evaluation_intake_execution_control_design_only");
    expect(flightEvaluationIntakeExecutionControls).toHaveLength(7);
    expect(new Set(flightEvaluationIntakeExecutionControls.map((control) => control.id)).size).toBe(7);
    expect(flightEvaluationIntakeExecutionControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeExecutionControls.every((control) => control.nonExecutionBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop execution safeguards", () => {
    expect(flightEvaluationIntakeExecutionSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationIntakeExecutionSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationIntakeExecutionSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeExecutionSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten intake-execution gates unique and separately owned", () => {
    expect(flightEvaluationIntakeExecutionGates).toHaveLength(10);
    expect(new Set(flightEvaluationIntakeExecutionGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationIntakeExecutionGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 13 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-intake-execution-control.ts");
    expect(page).toContain("Flights · Phase 13 · Evaluation-intake execution-control design only");
    expect(page).toContain("Evaluation-intake execution control is blocked");
    expect(page).toContain("Intake execution-control artifacts");
    expect(page).toContain("Immediate-stop execution safeguards");
    expect(page).toContain("Ten separately owned intake-execution gates");
    expect(page).toContain("Flights · Phase 12 · Evaluation-intake preflight design only");
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
    expect(model).not.toContain("observerName");
  });
});
