import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightProviderContactExecutionControlDesign,
  FLIGHT_PROVIDER_CONTACT_EXECUTION_CONTROL_MODE,
  flightProviderContactExecutionGates,
  flightProviderContactExecutionSafeguards,
  flightProviderContactExecutionStages,
} from "../lib/flights/provider-contact-execution-control";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Flights Phase 20 Duffel provider-contact execution-control design", () => {
  it("recognizes Phase 19 software acceptance without treating it as preflight or contact authority", () => {
    expect(buildFlightProviderContactExecutionControlDesign()).toMatchObject({
      mode: "duffel_contact_execution_control_design_only",
      planState: "design_only",
      executionControlState: "blocked",
      phase18AuthorizationPrerequisiteState: "not_satisfied",
      phase19PreflightPrerequisiteState: "not_satisfied",
      phase19SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      preflightReceiptState: "not_created",
      executionDecisionState: "not_recorded",
      contactScopeBindingState: "not_recorded",
      senderState: "not_assigned",
      approverState: "not_assigned",
      conflictReviewState: "not_started",
      accessState: "not_granted",
      messageState: "not_created",
      messageFreezeState: "not_confirmed",
      disclosureState: "not_approved",
      recipientRoleState: "not_recorded",
      channelState: "not_approved",
      channelAuthenticityState: "not_verified",
      recordkeepingPlanState: "not_approved",
      contactWindowState: "not_opened",
      supplierContactState: "not_started",
      contactAttemptCount: 0,
      receiptState: "not_created",
      responseState: "not_received",
      responseDispositionState: "not_started",
      responseQuarantineState: "not_created",
      incidentState: "not_recorded",
      stopRecordState: "not_created",
      closeoutState: "not_created",
      evidenceIntakeState: "closed",
      evaluationCaseState: "not_created",
      recommendationState: "not_issued",
      selectionState: "not_selected",
      contractState: "not_received",
      accountState: "not_created",
      completedCount: 0,
      totalCount: 10,
      executionControlDesignComplete: false,
      realSupplierDataAccepted: false,
      passengerDataAccepted: false,
      credentialsAccepted: false,
      externalNetworkAccess: false,
      externalSideEffects: false,
      providerAccountCreated: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed design gates into contact, response, intake, or activation authority", () => {
    const allEvidence = Object.fromEntries(flightProviderContactExecutionGates.map((gate) => [gate.id, true]));
    const execution = buildFlightProviderContactExecutionControlDesign(allEvidence);
    expect(execution.executionControlDesignComplete).toBe(true);
    expect(execution.completedCount).toBe(execution.totalCount);
    expect(execution.phase18AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(execution.phase19PreflightPrerequisiteState).toBe("not_satisfied");
    expect(execution.authorizationReferenceState).toBe("not_recorded");
    expect(execution.preflightReceiptState).toBe("not_created");
    expect(execution.executionControlState).toBe("blocked");
    expect(execution.executionDecisionState).toBe("not_recorded");
    expect(execution.supplierContactState).toBe("not_started");
    expect(execution.contactAttemptCount).toBe(0);
    expect(execution.receiptState).toBe("not_created");
    expect(execution.responseState).toBe("not_received");
    expect(execution.responseQuarantineState).toBe("not_created");
    expect(execution.evidenceIntakeState).toBe("closed");
    expect(execution.recommendationState).toBe("not_issued");
    expect(execution.selectionState).toBe("not_selected");
    expect(execution.contractState).toBe("not_received");
    expect(execution.accountState).toBe("not_created");
    expect(execution.externalNetworkAccess).toBe(false);
    expect(execution.externalSideEffects).toBe(false);
    expect(execution.sandboxTrafficAuthorized).toBe(false);
    expect(execution.productionTrafficAuthorized).toBe(false);
    expect(execution.ticketingAuthorized).toBe(false);
    expect(execution.paymentAuthorized).toBe(false);
  });

  it("defines seven unique controlled stages with explicit non-execution boundaries", () => {
    expect(FLIGHT_PROVIDER_CONTACT_EXECUTION_CONTROL_MODE).toBe("duffel_contact_execution_control_design_only");
    expect(flightProviderContactExecutionStages).toHaveLength(7);
    expect(new Set(flightProviderContactExecutionStages.map((stage) => stage.id)).size).toBe(7);
    expect(flightProviderContactExecutionStages.every((stage) => stage.owner.length > 0)).toBe(true);
    expect(flightProviderContactExecutionStages.every((stage) => stage.nonExecutionBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop safeguards and ten separately owned gates", () => {
    expect(flightProviderContactExecutionSafeguards).toHaveLength(5);
    expect(new Set(flightProviderContactExecutionSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightProviderContactExecutionSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightProviderContactExecutionSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
    expect(flightProviderContactExecutionGates).toHaveLength(10);
    expect(new Set(flightProviderContactExecutionGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightProviderContactExecutionGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 20 workspace server-rendered, read-only, network-free, and unable to contact Duffel", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/provider-contact-execution-control.ts");
    const phase = read("docs/FLIGHTS_PHASE_20.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Flights · Phase 20 · Duffel contact execution-control design only");
    expect(page).toContain("Duffel provider-contact execution is blocked");
    expect(page).toContain("Seven controlled provider-contact stages");
    expect(page).toContain("Five immediate-stop contact safeguards");
    expect(page).toContain("Ten separately owned provider-contact execution gates");
    expect(page).toContain("Flights · Phase 19 · Duffel contact preflight design only");
    expect(page).toContain("Actual provider-contact preflight remains unsatisfied.");
    expect(phase).toContain("No-operation boundary");
    expect(roadmap).toContain("Phase 20 Duffel provider-contact execution-control design software gates");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
    expect(page).not.toContain("mailto:");
    expect(page).not.toContain("tel:");
    expect(model).not.toContain("recipientEmail");
    expect(model).not.toContain("senderEmail");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
  });
});
