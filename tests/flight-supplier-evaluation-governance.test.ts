import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationGovernance,
  FLIGHT_SUPPLIER_EVALUATION_GOVERNANCE_MODE,
  flightEvaluationControls,
  flightEvaluationDecisionSafeguards,
  flightEvaluationGovernanceGates,
} from "../lib/flights/evaluation-governance";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier evaluation governance phase 5", () => {
  it("starts with intake closed and no candidate, evidence, score, recommendation, supplier, or runtime authorization", () => {
    expect(buildFlightEvaluationGovernance()).toMatchObject({
      mode: "evaluation_governance_only",
      intakeState: "closed",
      candidateState: "not_recorded",
      candidateCount: 0,
      evaluationCaseState: "not_created",
      evidenceItemCount: 0,
      scoreState: "not_calculated",
      recommendationState: "not_issued",
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 10,
      governanceComplete: false,
      credentialsAccepted: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed governance gates into evaluation or runtime authorization", () => {
    const allEvidence = Object.fromEntries(flightEvaluationGovernanceGates.map((gate) => [gate.id, true]));
    const governance = buildFlightEvaluationGovernance(allEvidence);
    expect(governance.governanceComplete).toBe(true);
    expect(governance.completedCount).toBe(governance.totalCount);
    expect(governance.intakeState).toBe("closed");
    expect(governance.candidateState).toBe("not_recorded");
    expect(governance.evaluationCaseState).toBe("not_created");
    expect(governance.scoreState).toBe("not_calculated");
    expect(governance.recommendationState).toBe("not_issued");
    expect(governance.selectionState).toBe("not_selected");
    expect(governance.credentialsAccepted).toBe(false);
    expect(governance.sandboxAdapterImplemented).toBe(false);
    expect(governance.sandboxTrafficAuthorized).toBe(false);
    expect(governance.productionTrafficAuthorized).toBe(false);
    expect(governance.ticketingAuthorized).toBe(false);
    expect(governance.paymentAuthorized).toBe(false);
  });

  it("defines six unique evidence controls with explicit fail-closed boundaries", () => {
    expect(FLIGHT_SUPPLIER_EVALUATION_GOVERNANCE_MODE).toBe("evaluation_governance_only");
    expect(flightEvaluationControls).toHaveLength(6);
    expect(new Set(flightEvaluationControls.map((control) => control.id)).size).toBe(6);
    expect(flightEvaluationControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightEvaluationControls.every((control) => control.safetyBoundary.startsWith("Control only"))).toBe(true);
  });

  it("defines five decision-record safeguards that cannot authorize capabilities", () => {
    expect(flightEvaluationDecisionSafeguards).toHaveLength(5);
    expect(new Set(flightEvaluationDecisionSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightEvaluationDecisionSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightEvaluationDecisionSafeguards.every((safeguard) => safeguard.activationBoundary.startsWith("Record design cannot"))).toBe(true);
  });

  it("keeps all ten governance gates unique and separately owned", () => {
    expect(flightEvaluationGovernanceGates).toHaveLength(10);
    expect(new Set(flightEvaluationGovernanceGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationGovernanceGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 5 administrator workspace server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Flights · Phase 5 · Evaluation governance only");
    expect(page).toContain("Evaluation intake remains closed");
    expect(page).toContain("Evidence admissibility controls");
    expect(page).toContain("Decision-record safeguards");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
  });

  it("preserves Phase 4, Phase 3, and Phase 2 references without sensitive evaluation storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-governance.ts");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Phase 3 planning reference");
    expect(page).toContain("Phase 2 activation reference");
    expect(model).not.toContain("candidateName");
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
  });
});
