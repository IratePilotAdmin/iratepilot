import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationReviewAuthorizationDesign,
  FLIGHT_EVALUATION_REVIEW_AUTHORIZATION_MODE,
  flightEvaluationReviewAuthorizationArtifacts,
  flightEvaluationReviewAuthorizationGates,
  flightEvaluationReviewAuthorizationSafeguards,
} from "../lib/flights/evaluation-review-authorization";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evidence review authorization design phase 15", () => {
  it("recognizes Phase 14 software acceptance without treating it as closeout or evidence-review authority", () => {
    expect(buildFlightEvaluationReviewAuthorizationDesign()).toMatchObject({
      mode: "supplier_evidence_review_authorization_design_only",
      planState: "design_only",
      reviewAuthorizationState: "blocked",
      phase14CloseoutPrerequisiteState: "not_satisfied",
      phase14SoftwareAcceptanceState: "accepted_in_preview",
      closeoutReferenceState: "not_recorded",
      evaluationReviewState: "closed",
      reviewDecisionState: "not_recorded",
      reviewWindowState: "not_opened",
      supplierContactState: "not_started",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      submissionChannelState: "not_created",
      evidenceCount: 0,
      evidenceInventoryState: "not_created",
      evidenceLineageState: "not_recorded",
      admissibilityReviewState: "not_started",
      rubricState: "not_approved",
      rubricVersionState: "not_recorded",
      reviewerState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      accessState: "not_granted",
      scoreState: "not_calculated",
      scorecardState: "not_created",
      varianceReviewState: "not_started",
      dissentState: "not_recorded",
      exceptionState: "not_recorded",
      findingCount: 0,
      recommendationState: "not_issued",
      shortlistState: "not_created",
      commercialDiligenceState: "not_started",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      authorizationDesignComplete: false,
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

  it("never converts completed design gates into closeout, evidence use, scoring, decisions, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationReviewAuthorizationGates.map((gate) => [gate.id, true]));
    const authorization = buildFlightEvaluationReviewAuthorizationDesign(allEvidence);
    expect(authorization.authorizationDesignComplete).toBe(true);
    expect(authorization.completedCount).toBe(authorization.totalCount);
    expect(authorization.phase14CloseoutPrerequisiteState).toBe("not_satisfied");
    expect(authorization.closeoutReferenceState).toBe("not_recorded");
    expect(authorization.evaluationReviewState).toBe("closed");
    expect(authorization.reviewDecisionState).toBe("not_recorded");
    expect(authorization.reviewWindowState).toBe("not_opened");
    expect(authorization.supplierContactState).toBe("not_started");
    expect(authorization.submissionChannelState).toBe("not_created");
    expect(authorization.evidenceCount).toBe(0);
    expect(authorization.evidenceInventoryState).toBe("not_created");
    expect(authorization.admissibilityReviewState).toBe("not_started");
    expect(authorization.rubricState).toBe("not_approved");
    expect(authorization.reviewerState).toBe("not_assigned");
    expect(authorization.accessState).toBe("not_granted");
    expect(authorization.scoreState).toBe("not_calculated");
    expect(authorization.scorecardState).toBe("not_created");
    expect(authorization.recommendationState).toBe("not_issued");
    expect(authorization.shortlistState).toBe("not_created");
    expect(authorization.contractState).toBe("not_received");
    expect(authorization.selectionState).toBe("not_selected");
    expect(authorization.externalNetworkAccess).toBe(false);
    expect(authorization.externalSideEffects).toBe(false);
    expect(authorization.sandboxTrafficAuthorized).toBe(false);
    expect(authorization.productionTrafficAuthorized).toBe(false);
    expect(authorization.ticketingAuthorized).toBe(false);
    expect(authorization.paymentAuthorized).toBe(false);
  });

  it("defines seven unique review-authorization artifacts with explicit non-review boundaries", () => {
    expect(FLIGHT_EVALUATION_REVIEW_AUTHORIZATION_MODE).toBe("supplier_evidence_review_authorization_design_only");
    expect(flightEvaluationReviewAuthorizationArtifacts).toHaveLength(7);
    expect(new Set(flightEvaluationReviewAuthorizationArtifacts.map((artifact) => artifact.id)).size).toBe(7);
    expect(flightEvaluationReviewAuthorizationArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewAuthorizationArtifacts.every((artifact) => artifact.nonReviewBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique review-integrity safeguards", () => {
    expect(flightEvaluationReviewAuthorizationSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationReviewAuthorizationSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationReviewAuthorizationSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationReviewAuthorizationSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten evidence-review authorization gates unique and separately owned", () => {
    expect(flightEvaluationReviewAuthorizationGates).toHaveLength(10);
    expect(new Set(flightEvaluationReviewAuthorizationGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationReviewAuthorizationGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 15 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-review-authorization.ts");
    expect(page).toContain("Flights · Phase 15 · Evidence-review authorization design only");
    expect(page).toContain("Supplier-evidence review authorization is blocked");
    expect(page).toContain("Evidence-review authorization artifacts");
    expect(page).toContain("Review-integrity safeguards");
    expect(page).toContain("Ten separately owned evidence-review authorization gates");
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
