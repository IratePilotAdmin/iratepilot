import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationReviewPreflightDesign,
  FLIGHT_EVALUATION_REVIEW_PREFLIGHT_MODE,
  flightEvaluationReviewPreflightControls,
  flightEvaluationReviewPreflightGates,
  flightEvaluationReviewPreflightSafeguards,
} from "../lib/flights/evaluation-review-preflight";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evidence review preflight design phase 16", () => {
  it("recognizes Phase 15 software acceptance without treating it as authorization or review authority", () => {
    expect(buildFlightEvaluationReviewPreflightDesign()).toMatchObject({
      mode: "supplier_evidence_review_preflight_design_only",
      planState: "design_only",
      preflightState: "blocked",
      phase15AuthorizationPrerequisiteState: "not_satisfied",
      phase15SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      evaluationReviewState: "closed",
      preflightDecisionState: "not_recorded",
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
      privacySecurityReviewState: "not_started",
      retentionState: "not_confirmed",
      deletionState: "not_confirmed",
      workProductPlanState: "not_approved",
      varianceReviewState: "not_started",
      dissentState: "not_recorded",
      exceptionState: "not_recorded",
      stopPlanState: "not_approved",
      closeoutPlanState: "not_approved",
      scoreState: "not_calculated",
      scorecardState: "not_created",
      findingCount: 0,
      recommendationState: "not_issued",
      shortlistState: "not_created",
      commercialDiligenceState: "not_started",
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

  it("never converts completed design gates into authorization, evidence use, review, decisions, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationReviewPreflightGates.map((gate) => [gate.id, true]));
    const preflight = buildFlightEvaluationReviewPreflightDesign(allEvidence);
    expect(preflight.preflightDesignComplete).toBe(true);
    expect(preflight.completedCount).toBe(preflight.totalCount);
    expect(preflight.phase15AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(preflight.authorizationReferenceState).toBe("not_recorded");
    expect(preflight.preflightState).toBe("blocked");
    expect(preflight.evaluationReviewState).toBe("closed");
    expect(preflight.preflightDecisionState).toBe("not_recorded");
    expect(preflight.reviewWindowState).toBe("not_opened");
    expect(preflight.supplierContactState).toBe("not_started");
    expect(preflight.submissionChannelState).toBe("not_created");
    expect(preflight.evidenceCount).toBe(0);
    expect(preflight.evidenceInventoryState).toBe("not_created");
    expect(preflight.evidenceInventoryHashState).toBe("not_recorded");
    expect(preflight.admissibilityReviewState).toBe("not_started");
    expect(preflight.rubricState).toBe("not_approved");
    expect(preflight.rubricFreezeState).toBe("not_confirmed");
    expect(preflight.reviewerState).toBe("not_assigned");
    expect(preflight.accessState).toBe("not_granted");
    expect(preflight.scoreState).toBe("not_calculated");
    expect(preflight.scorecardState).toBe("not_created");
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

  it("defines seven unique review-preflight controls with explicit non-opening boundaries", () => {
    expect(FLIGHT_EVALUATION_REVIEW_PREFLIGHT_MODE).toBe("supplier_evidence_review_preflight_design_only");
    expect(flightEvaluationReviewPreflightControls).toHaveLength(7);
    expect(new Set(flightEvaluationReviewPreflightControls.map((control) => control.id)).size).toBe(7);
    expect(flightEvaluationReviewPreflightControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewPreflightControls.every((control) => control.nonOpeningBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop review safeguards", () => {
    expect(flightEvaluationReviewPreflightSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationReviewPreflightSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationReviewPreflightSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewPreflightSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten evidence-review preflight gates unique and separately owned", () => {
    expect(flightEvaluationReviewPreflightGates).toHaveLength(10);
    expect(new Set(flightEvaluationReviewPreflightGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationReviewPreflightGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 16 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-review-preflight.ts");
    expect(page).toContain("Flights · Phase 16 · Evidence-review preflight design only");
    expect(page).toContain("Supplier-evidence review preflight is blocked");
    expect(page).toContain("Evidence-review preflight controls");
    expect(page).toContain("Immediate-stop review safeguards");
    expect(page).toContain("Ten separately owned evidence-review preflight gates");
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
