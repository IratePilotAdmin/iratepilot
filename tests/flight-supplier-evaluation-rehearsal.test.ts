import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightEvaluationRehearsal,
  FLIGHT_SUPPLIER_EVALUATION_REHEARSAL_MODE,
  flightEvaluationRehearsalGates,
  flightEvaluationRehearsalReceipts,
  flightEvaluationRehearsalScenarios,
} from "../lib/flights/evaluation-rehearsal";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier synthetic evaluation rehearsal phase 6", () => {
  it("starts without a fixture, rehearsal, result, receipt, candidate, or runtime authorization", () => {
    expect(buildFlightEvaluationRehearsal()).toMatchObject({
      mode: "synthetic_rehearsal_design_only",
      planState: "design_only",
      rehearsalState: "not_run",
      syntheticFixtureState: "not_created",
      scenarioResultCount: 0,
      receiptState: "not_created",
      receiptCount: 0,
      observerState: "not_assigned",
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
      rehearsalPlanComplete: false,
      realSupplierDataAccepted: false,
      credentialsAccepted: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed design gates into rehearsal execution or runtime authorization", () => {
    const allEvidence = Object.fromEntries(flightEvaluationRehearsalGates.map((gate) => [gate.id, true]));
    const rehearsal = buildFlightEvaluationRehearsal(allEvidence);
    expect(rehearsal.rehearsalPlanComplete).toBe(true);
    expect(rehearsal.completedCount).toBe(rehearsal.totalCount);
    expect(rehearsal.rehearsalState).toBe("not_run");
    expect(rehearsal.syntheticFixtureState).toBe("not_created");
    expect(rehearsal.scenarioResultCount).toBe(0);
    expect(rehearsal.receiptState).toBe("not_created");
    expect(rehearsal.evaluationIntakeState).toBe("closed");
    expect(rehearsal.candidateState).toBe("not_recorded");
    expect(rehearsal.evaluationCaseState).toBe("not_created");
    expect(rehearsal.scoreState).toBe("not_calculated");
    expect(rehearsal.recommendationState).toBe("not_issued");
    expect(rehearsal.selectionState).toBe("not_selected");
    expect(rehearsal.realSupplierDataAccepted).toBe(false);
    expect(rehearsal.credentialsAccepted).toBe(false);
    expect(rehearsal.sandboxAdapterImplemented).toBe(false);
    expect(rehearsal.sandboxTrafficAuthorized).toBe(false);
    expect(rehearsal.productionTrafficAuthorized).toBe(false);
    expect(rehearsal.ticketingAuthorized).toBe(false);
    expect(rehearsal.paymentAuthorized).toBe(false);
  });

  it("defines six unique synthetic scenarios with explicit non-execution boundaries", () => {
    expect(FLIGHT_SUPPLIER_EVALUATION_REHEARSAL_MODE).toBe("synthetic_rehearsal_design_only");
    expect(flightEvaluationRehearsalScenarios).toHaveLength(6);
    expect(new Set(flightEvaluationRehearsalScenarios.map((scenario) => scenario.id)).size).toBe(6);
    expect(flightEvaluationRehearsalScenarios.every((scenario) => scenario.owner.length > 0)).toBe(true);
    expect(flightEvaluationRehearsalScenarios.every((scenario) => scenario.safetyBoundary.startsWith("Synthetic rehearsal only"))).toBe(true);
  });

  it("defines five receipt safeguards that cannot create records or authorize capabilities", () => {
    expect(flightEvaluationRehearsalReceipts).toHaveLength(5);
    expect(new Set(flightEvaluationRehearsalReceipts.map((receipt) => receipt.id)).size).toBe(5);
    expect(flightEvaluationRehearsalReceipts.every((receipt) => receipt.owner.length > 0)).toBe(true);
    expect(flightEvaluationRehearsalReceipts.every((receipt) => receipt.activationBoundary.startsWith("Receipt design cannot"))).toBe(true);
  });

  it("keeps all ten rehearsal-design gates unique and separately owned", () => {
    expect(flightEvaluationRehearsalGates).toHaveLength(10);
    expect(new Set(flightEvaluationRehearsalGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightEvaluationRehearsalGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 6 administrator workspace server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Flights · Phase 6 · Synthetic rehearsal design only");
    expect(page).toContain("Synthetic rehearsal has not run");
    expect(page).toContain("Synthetic evaluation scenarios");
    expect(page).toContain("Rehearsal receipt safeguards");
    expect(page).toContain("Ten separately owned rehearsal-design gates");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
  });

  it("preserves Phases 5 through 2 without adding supplier, passenger, or credential storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/evaluation-rehearsal.ts");
    expect(page).toContain("Flights · Phase 5 · Evaluation governance only");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Phase 3 planning reference");
    expect(page).toContain("Phase 2 activation reference");
    expect(model).not.toContain("candidateName");
    expect(model).not.toContain("supplierDocument");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
  });
});
