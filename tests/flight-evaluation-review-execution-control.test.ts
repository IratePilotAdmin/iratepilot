import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationReviewExecutionControlDesign,
  FLIGHT_EVALUATION_REVIEW_EXECUTION_CONTROL_MODE,
  flightEvaluationReviewExecutionGates,
  flightEvaluationReviewExecutionSafeguards,
  flightEvaluationReviewExecutionStages,
} from "../lib/flights/evaluation-review-execution-control";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evidence review execution-control design phase 17", () => {
  it("recognizes Phase 16 software acceptance without treating it as preflight or review authority", () => {
    expect(buildFlightEvaluationReviewExecutionControlDesign()).toMatchObject({
      mode: "supplier_evidence_review_execution_control_design_only",
      planState: "design_only",
      executionControlState: "blocked",
      phase15AuthorizationPrerequisiteState: "not_satisfied",
      phase16PreflightPrerequisiteState: "not_satisfied",
      phase16SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      preflightReceiptState: "not_created",
      executionDecisionState: "not_recorded",
      reviewScopeBindingState: "not_recorded",
      evaluationReviewState: "closed",
      reviewWindowState: "not_opened",
      supplierContactState: "not_started",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      submissionChannelState: "not_created",
      evidenceCount: 0,
      evidenceInventoryState: "not_created",
      evidenceInventoryHashState: "not_recorded",
      evidenceLineageState: "not_recorded",
      admissibilityReviewState: "not_started",
      rubricState: "not_approved",
      rubricVersionState: "not_recorded",
      rubricFreezeState: "not_confirmed",
      reviewerState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      accessState: "not_granted",
      reviewSessionState: "not_created",
      releasedCriterionCount: 0,
      reviewedEvidenceCount: 0,
      observationCount: 0,
      calculationCount: 0,
      privacySecurityReviewState: "not_started",
      workProductState: "not_created",
      varianceReviewState: "not_started",
      dissentState: "not_recorded",
      exceptionState: "not_recorded",
      findingCount: 0,
      stopRecordState: "not_created",
      closeoutState: "not_created",
      scoreState: "not_calculated",
      scorecardState: "not_created",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      commercialDiligenceState: "not_started",
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

  it("never converts completed design gates into authorization, review, scoring, decisions, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationReviewExecutionGates.map((gate) => [gate.id, true]));
    const execution = buildFlightEvaluationReviewExecutionControlDesign(allEvidence);
    expect(execution.executionControlDesignComplete).toBe(true);
    expect(execution.completedCount).toBe(execution.totalCount);
    expect(execution.phase15AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(execution.phase16PreflightPrerequisiteState).toBe("not_satisfied");
    expect(execution.authorizationReferenceState).toBe("not_recorded");
    expect(execution.preflightReceiptState).toBe("not_created");
    expect(execution.executionControlState).toBe("blocked");
    expect(execution.evaluationReviewState).toBe("closed");
    expect(execution.executionDecisionState).toBe("not_recorded");
    expect(execution.reviewWindowState).toBe("not_opened");
    expect(execution.reviewSessionState).toBe("not_created");
    expect(execution.releasedCriterionCount).toBe(0);
    expect(execution.reviewedEvidenceCount).toBe(0);
    expect(execution.calculationCount).toBe(0);
    expect(execution.scoreState).toBe("not_calculated");
    expect(execution.scorecardState).toBe("not_created");
    expect(execution.recommendationState).toBe("not_issued");
    expect(execution.shortlistState).toBe("not_created");
    expect(execution.contractState).toBe("not_received");
    expect(execution.selectionState).toBe("not_selected");
    expect(execution.externalNetworkAccess).toBe(false);
    expect(execution.externalSideEffects).toBe(false);
    expect(execution.sandboxTrafficAuthorized).toBe(false);
    expect(execution.productionTrafficAuthorized).toBe(false);
    expect(execution.ticketingAuthorized).toBe(false);
    expect(execution.paymentAuthorized).toBe(false);
  });

  it("defines seven unique execution stages with explicit non-execution boundaries", () => {
    expect(FLIGHT_EVALUATION_REVIEW_EXECUTION_CONTROL_MODE).toBe("supplier_evidence_review_execution_control_design_only");
    expect(flightEvaluationReviewExecutionStages).toHaveLength(7);
    expect(new Set(flightEvaluationReviewExecutionStages.map((stage) => stage.id)).size).toBe(7);
    expect(flightEvaluationReviewExecutionStages.every((stage) => stage.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewExecutionStages.every((stage) => stage.nonExecutionBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop execution safeguards", () => {
    expect(flightEvaluationReviewExecutionSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationReviewExecutionSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationReviewExecutionSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewExecutionSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten evidence-review execution-control gates unique and separately owned", () => {
    expect(flightEvaluationReviewExecutionGates).toHaveLength(10);
    expect(new Set(flightEvaluationReviewExecutionGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationReviewExecutionGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 17 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-review-execution-control.ts");
    expect(page).toContain("Flights · Phase 17 · Evidence-review execution-control design only");
    expect(page).toContain("Supplier-evidence review execution is blocked");
    expect(page).toContain("Controlled evidence-review stages");
    expect(page).toContain("Immediate-stop execution safeguards");
    expect(page).toContain("Ten separately owned evidence-review execution-control gates");
    expect(page).toContain("Flights · Phase 16 · Evidence-review preflight design only");
    expect(page).toContain("Flights · Phase 15 · Evidence-review authorization design only");
    expect(page).toContain("Flights · Phase 14 · Evaluation-intake closeout design only");
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
