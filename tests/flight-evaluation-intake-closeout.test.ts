import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationIntakeCloseoutDesign,
  FLIGHT_EVALUATION_INTAKE_CLOSEOUT_MODE,
  flightEvaluationIntakeCloseoutArtifacts,
  flightEvaluationIntakeCloseoutGates,
  flightEvaluationIntakeCloseoutSafeguards,
} from "../lib/flights/evaluation-intake-closeout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evaluation intake closeout design phase 14", () => {
  it("recognizes Phase 13 software acceptance without treating it as authorization, preflight, execution, or closeout evidence", () => {
    expect(buildFlightEvaluationIntakeCloseoutDesign()).toMatchObject({
      mode: "supplier_evaluation_intake_closeout_design_only",
      planState: "design_only",
      closeoutControlState: "blocked",
      phase11AuthorizationPrerequisiteState: "not_satisfied",
      phase12PreflightPrerequisiteState: "not_satisfied",
      phase13ExecutionRecordPrerequisiteState: "not_satisfied",
      phase13SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      preflightReceiptState: "not_created",
      executionRecordState: "not_created",
      scopeReconciliationState: "not_started",
      intakeWindowState: "not_opened",
      supplierContactState: "not_started",
      contactHandoffState: "not_created",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      submissionChannelState: "not_created",
      evidenceCount: 0,
      evidenceInventoryState: "not_created",
      sanitationState: "not_started",
      quarantineState: "not_started",
      incidentState: "not_created",
      stopRecordState: "not_created",
      contaminationReviewState: "not_started",
      retentionState: "not_confirmed",
      deletionState: "not_confirmed",
      accessRemovalState: "not_confirmed",
      reviewerState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      dissentState: "not_recorded",
      exceptionState: "not_recorded",
      findingCount: 0,
      findingDispositionState: "not_started",
      teardownState: "not_started",
      authorizationExpiryState: "not_recorded",
      closeoutDecisionState: "not_recorded",
      closeoutState: "not_created",
      evaluationIntakeState: "closed",
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      closeoutDesignComplete: false,
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

  it("never converts completed design gates into prerequisites, execution, reconciliation, deletion, closeout, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationIntakeCloseoutGates.map((gate) => [gate.id, true]));
    const closeout = buildFlightEvaluationIntakeCloseoutDesign(allEvidence);
    expect(closeout.closeoutDesignComplete).toBe(true);
    expect(closeout.completedCount).toBe(closeout.totalCount);
    expect(closeout.phase11AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(closeout.phase12PreflightPrerequisiteState).toBe("not_satisfied");
    expect(closeout.phase13ExecutionRecordPrerequisiteState).toBe("not_satisfied");
    expect(closeout.executionRecordState).toBe("not_created");
    expect(closeout.scopeReconciliationState).toBe("not_started");
    expect(closeout.supplierContactState).toBe("not_started");
    expect(closeout.submissionChannelState).toBe("not_created");
    expect(closeout.evidenceCount).toBe(0);
    expect(closeout.evidenceInventoryState).toBe("not_created");
    expect(closeout.sanitationState).toBe("not_started");
    expect(closeout.quarantineState).toBe("not_started");
    expect(closeout.incidentState).toBe("not_created");
    expect(closeout.deletionState).toBe("not_confirmed");
    expect(closeout.findingCount).toBe(0);
    expect(closeout.findingDispositionState).toBe("not_started");
    expect(closeout.teardownState).toBe("not_started");
    expect(closeout.closeoutDecisionState).toBe("not_recorded");
    expect(closeout.closeoutState).toBe("not_created");
    expect(closeout.scoreState).toBe("not_calculated");
    expect(closeout.selectionState).toBe("not_selected");
    expect(closeout.externalNetworkAccess).toBe(false);
    expect(closeout.externalSideEffects).toBe(false);
    expect(closeout.sandboxTrafficAuthorized).toBe(false);
    expect(closeout.productionTrafficAuthorized).toBe(false);
    expect(closeout.ticketingAuthorized).toBe(false);
    expect(closeout.paymentAuthorized).toBe(false);
  });

  it("defines seven unique closeout evidence artifacts with explicit non-record boundaries", () => {
    expect(FLIGHT_EVALUATION_INTAKE_CLOSEOUT_MODE).toBe("supplier_evaluation_intake_closeout_design_only");
    expect(flightEvaluationIntakeCloseoutArtifacts).toHaveLength(7);
    expect(new Set(flightEvaluationIntakeCloseoutArtifacts.map((artifact) => artifact.id)).size).toBe(7);
    expect(flightEvaluationIntakeCloseoutArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeCloseoutArtifacts.every((artifact) => artifact.nonRecordBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique findings-disposition safeguards", () => {
    expect(flightEvaluationIntakeCloseoutSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationIntakeCloseoutSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationIntakeCloseoutSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeCloseoutSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten intake-closeout gates unique and separately owned", () => {
    expect(flightEvaluationIntakeCloseoutGates).toHaveLength(10);
    expect(new Set(flightEvaluationIntakeCloseoutGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationIntakeCloseoutGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 14 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-intake-closeout.ts");
    expect(page).toContain("Flights · Phase 14 · Evaluation-intake closeout design only");
    expect(page).toContain("Evaluation-intake closeout is blocked");
    expect(page).toContain("Intake closeout evidence artifacts");
    expect(page).toContain("Findings-disposition safeguards");
    expect(page).toContain("Ten separately owned intake-closeout gates");
    expect(page).toContain("Flights · Phase 13 · Evaluation-intake execution-control design only");
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
