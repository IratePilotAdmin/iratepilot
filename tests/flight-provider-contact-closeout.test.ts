import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightProviderContactCloseoutDesign,
  FLIGHT_PROVIDER_CONTACT_CLOSEOUT_MODE,
  flightProviderContactCloseoutArtifacts,
  flightProviderContactCloseoutGates,
  flightProviderContactCloseoutSafeguards,
} from "../lib/flights/provider-contact-closeout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Flights Phase 21 Duffel provider-contact closeout design", () => {
  it("recognizes Phase 20 software acceptance without treating it as execution or closeout evidence", () => {
    expect(buildFlightProviderContactCloseoutDesign()).toMatchObject({
      mode: "duffel_contact_closeout_design_only",
      planState: "design_only",
      closeoutControlState: "blocked",
      phase18AuthorizationPrerequisiteState: "not_satisfied",
      phase19PreflightPrerequisiteState: "not_satisfied",
      phase20ExecutionRecordPrerequisiteState: "not_satisfied",
      phase20SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      preflightReceiptState: "not_created",
      executionRecordState: "not_created",
      scopeReconciliationState: "not_started",
      messageState: "not_created",
      recipientRoleState: "not_recorded",
      channelState: "not_approved",
      contactWindowState: "not_opened",
      supplierContactState: "not_started",
      contactAttemptCount: 0,
      deliveryState: "not_attempted",
      receiptState: "not_created",
      responseState: "not_received",
      responseQuarantineState: "not_created",
      responseDispositionState: "not_started",
      incidentState: "not_created",
      stopRecordState: "not_created",
      accessRemovalState: "not_confirmed",
      retentionState: "not_confirmed",
      deletionState: "not_confirmed",
      auditRecordState: "not_created",
      roleAcknowledgmentState: "not_recorded",
      conflictReviewState: "not_started",
      dissentState: "not_recorded",
      exceptionState: "not_recorded",
      findingCount: 0,
      findingDispositionState: "not_started",
      authorizationExpiryState: "not_recorded",
      closeoutDecisionState: "not_recorded",
      closeoutState: "not_created",
      evidenceIntakeState: "closed",
      evaluationCaseState: "not_created",
      recommendationState: "not_issued",
      selectionState: "not_selected",
      contractState: "not_received",
      accountState: "not_created",
      completedCount: 0,
      totalCount: 10,
      closeoutDesignComplete: false,
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

  it("never converts completed design gates into contact, closeout, intake, or activation authority", () => {
    const allEvidence = Object.fromEntries(flightProviderContactCloseoutGates.map((gate) => [gate.id, true]));
    const closeout = buildFlightProviderContactCloseoutDesign(allEvidence);

    expect(closeout.closeoutDesignComplete).toBe(true);
    expect(closeout.completedCount).toBe(closeout.totalCount);
    expect(closeout.phase18AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(closeout.phase19PreflightPrerequisiteState).toBe("not_satisfied");
    expect(closeout.phase20ExecutionRecordPrerequisiteState).toBe("not_satisfied");
    expect(closeout.executionRecordState).toBe("not_created");
    expect(closeout.closeoutControlState).toBe("blocked");
    expect(closeout.supplierContactState).toBe("not_started");
    expect(closeout.contactAttemptCount).toBe(0);
    expect(closeout.deliveryState).toBe("not_attempted");
    expect(closeout.receiptState).toBe("not_created");
    expect(closeout.responseState).toBe("not_received");
    expect(closeout.responseQuarantineState).toBe("not_created");
    expect(closeout.closeoutState).toBe("not_created");
    expect(closeout.evidenceIntakeState).toBe("closed");
    expect(closeout.recommendationState).toBe("not_issued");
    expect(closeout.selectionState).toBe("not_selected");
    expect(closeout.contractState).toBe("not_received");
    expect(closeout.accountState).toBe("not_created");
    expect(closeout.externalNetworkAccess).toBe(false);
    expect(closeout.externalSideEffects).toBe(false);
    expect(closeout.sandboxTrafficAuthorized).toBe(false);
    expect(closeout.productionTrafficAuthorized).toBe(false);
    expect(closeout.ticketingAuthorized).toBe(false);
    expect(closeout.paymentAuthorized).toBe(false);
  });

  it("defines seven unique closeout artifacts with explicit non-record boundaries", () => {
    expect(FLIGHT_PROVIDER_CONTACT_CLOSEOUT_MODE).toBe("duffel_contact_closeout_design_only");
    expect(flightProviderContactCloseoutArtifacts).toHaveLength(7);
    expect(new Set(flightProviderContactCloseoutArtifacts.map((artifact) => artifact.id)).size).toBe(7);
    expect(flightProviderContactCloseoutArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightProviderContactCloseoutArtifacts.every((artifact) => artifact.nonRecordBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique fail-closed reconciliation safeguards", () => {
    expect(flightProviderContactCloseoutSafeguards).toHaveLength(5);
    expect(new Set(flightProviderContactCloseoutSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightProviderContactCloseoutSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightProviderContactCloseoutSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("defines ten unique separately owned closeout gates", () => {
    expect(flightProviderContactCloseoutGates).toHaveLength(10);
    expect(new Set(flightProviderContactCloseoutGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightProviderContactCloseoutGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 21 workspace server-rendered, read-only, network-free, and unable to contact Duffel", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/provider-contact-closeout.ts");
    const phase = read("docs/FLIGHTS_PHASE_21.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Flights · Phase 21 · Duffel contact closeout design only");
    expect(page).toContain("Duffel provider-contact closeout is blocked");
    expect(page).toContain("Seven provider-contact closeout evidence artifacts");
    expect(page).toContain("Five closeout reconciliation safeguards");
    expect(page).toContain("Ten separately owned provider-contact closeout gates");
    expect(page).toContain("Flights · Phase 20 · Duffel contact execution-control design only");
    expect(page).toContain("Actual provider-contact execution remains unsatisfied.");
    expect(phase).toContain("No-operation boundary");
    expect(roadmap).toContain("Phase 21 Duffel provider-contact closeout design software gates");
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
