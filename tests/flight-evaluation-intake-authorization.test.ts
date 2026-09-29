import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationIntakeAuthorizationDesign,
  FLIGHT_EVALUATION_INTAKE_AUTHORIZATION_MODE,
  flightEvaluationIntakeAuthorizationArtifacts,
  flightEvaluationIntakeAuthorizationGates,
  flightEvaluationIntakeAuthorizationSafeguards,
} from "../lib/flights/evaluation-intake-authorization";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier-evaluation intake authorization design phase 11", () => {
  it("starts without a Phase 10 closeout and keeps intake and every external capability blocked", () => {
    expect(buildFlightEvaluationIntakeAuthorizationDesign()).toMatchObject({
      mode: "supplier_evaluation_intake_authorization_design_only",
      planState: "design_only",
      intakeAuthorizationState: "blocked",
      phase10CloseoutPrerequisiteState: "not_satisfied",
      phase10PreviewAcceptanceState: "pending",
      closeoutState: "not_created",
      evaluationIntakeState: "closed",
      supplierContactState: "not_started",
      candidateState: "not_recorded",
      evaluationCaseState: "not_created",
      submissionChannelState: "not_created",
      evidenceCount: 0,
      reviewerState: "not_assigned",
      observerState: "not_assigned",
      conflictReviewState: "not_started",
      authorizationDecisionState: "not_recorded",
      authorizationWindowState: "not_opened",
      revocationState: "not_applicable",
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
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

  it("never converts completed design gates into intake, contact, evidence, decisions, or external effects", () => {
    const allEvidence = Object.fromEntries(flightEvaluationIntakeAuthorizationGates.map((gate) => [gate.id, true]));
    const authorization = buildFlightEvaluationIntakeAuthorizationDesign(allEvidence);
    expect(authorization.authorizationDesignComplete).toBe(true);
    expect(authorization.completedCount).toBe(authorization.totalCount);
    expect(authorization.phase10CloseoutPrerequisiteState).toBe("not_satisfied");
    expect(authorization.closeoutState).toBe("not_created");
    expect(authorization.evaluationIntakeState).toBe("closed");
    expect(authorization.supplierContactState).toBe("not_started");
    expect(authorization.candidateState).toBe("not_recorded");
    expect(authorization.evaluationCaseState).toBe("not_created");
    expect(authorization.submissionChannelState).toBe("not_created");
    expect(authorization.evidenceCount).toBe(0);
    expect(authorization.reviewerState).toBe("not_assigned");
    expect(authorization.authorizationDecisionState).toBe("not_recorded");
    expect(authorization.authorizationWindowState).toBe("not_opened");
    expect(authorization.scoreState).toBe("not_calculated");
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

  it("defines six unique intake-authorization artifacts with explicit non-opening boundaries", () => {
    expect(FLIGHT_EVALUATION_INTAKE_AUTHORIZATION_MODE).toBe("supplier_evaluation_intake_authorization_design_only");
    expect(flightEvaluationIntakeAuthorizationArtifacts).toHaveLength(6);
    expect(new Set(flightEvaluationIntakeAuthorizationArtifacts.map((artifact) => artifact.id)).size).toBe(6);
    expect(flightEvaluationIntakeAuthorizationArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeAuthorizationArtifacts.every((artifact) => artifact.nonOpeningBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique intake-opening safeguards", () => {
    expect(flightEvaluationIntakeAuthorizationSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationIntakeAuthorizationSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationIntakeAuthorizationSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationIntakeAuthorizationSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten intake-authorization gates unique and separately owned", () => {
    expect(flightEvaluationIntakeAuthorizationGates).toHaveLength(10);
    expect(new Set(flightEvaluationIntakeAuthorizationGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationIntakeAuthorizationGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 11 administrator workspace server-rendered, read-only, network-free, and free of sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-intake-authorization.ts");
    expect(page).toContain("Flights · Phase 11 · Evaluation-intake authorization design only");
    expect(page).toContain("Evaluation-intake authorization is blocked");
    expect(page).toContain("Intake authorization artifacts");
    expect(page).toContain("Intake-opening safeguards");
    expect(page).toContain("Ten separately owned intake-authorization gates");
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
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
    expect(model).not.toContain("reviewerName");
  });
});
