import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightProviderContactPreflightDesign,
  FLIGHT_PROVIDER_CONTACT_PREFLIGHT_MODE,
  flightProviderContactPreflightControls,
  flightProviderContactPreflightGates,
  flightProviderContactPreflightSafeguards,
} from "../lib/flights/provider-contact-preflight";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Flights Phase 19 Duffel provider-contact preflight design", () => {
  it("records Phase 18 software acceptance while actual authorization and contact stay blocked", () => {
    expect(buildFlightProviderContactPreflightDesign()).toMatchObject({
      mode: "duffel_contact_preflight_design_only",
      planState: "design_only",
      phase18AuthorizationPrerequisiteState: "not_satisfied",
      phase18SoftwareAcceptanceState: "accepted_in_preview",
      authorizationReferenceState: "not_recorded",
      providerPathPreferenceState: "recorded",
      primaryProviderPath: "duffel",
      secondaryProviderPath: "sabre",
      parallelLaunchState: "not_authorized",
      preflightState: "blocked",
      preflightDecisionState: "not_recorded",
      contactAuthorizationState: "blocked",
      contactPurposeState: "not_bound",
      senderState: "not_assigned",
      approverState: "not_assigned",
      messageState: "not_created",
      messageFreezeState: "not_confirmed",
      disclosureState: "not_approved",
      recipientRoleState: "not_recorded",
      channelState: "not_approved",
      channelAuthenticityState: "not_verified",
      conflictReviewState: "not_started",
      privacySecurityReviewState: "not_started",
      recordkeepingPlanState: "not_approved",
      stopPlanState: "not_approved",
      responseDispositionPlanState: "not_approved",
      closeoutPlanState: "not_approved",
      contactWindowState: "not_opened",
      supplierContactState: "not_started",
      contactAttemptCount: 0,
      receiptState: "not_created",
      responseState: "not_received",
      evidenceIntakeState: "closed",
      evaluationCaseState: "not_created",
      recommendationState: "not_issued",
      selectionState: "not_selected",
      contractState: "not_received",
      accountState: "not_created",
      completedCount: 0,
      totalCount: 10,
      preflightDesignComplete: false,
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

  it("never converts completed design gates into authorization, contact, intake, or activation authority", () => {
    const allEvidence = Object.fromEntries(flightProviderContactPreflightGates.map((gate) => [gate.id, true]));
    const design = buildFlightProviderContactPreflightDesign(allEvidence);
    expect(design.preflightDesignComplete).toBe(true);
    expect(design.completedCount).toBe(design.totalCount);
    expect(design.phase18AuthorizationPrerequisiteState).toBe("not_satisfied");
    expect(design.authorizationReferenceState).toBe("not_recorded");
    expect(design.preflightState).toBe("blocked");
    expect(design.preflightDecisionState).toBe("not_recorded");
    expect(design.contactAuthorizationState).toBe("blocked");
    expect(design.supplierContactState).toBe("not_started");
    expect(design.contactAttemptCount).toBe(0);
    expect(design.receiptState).toBe("not_created");
    expect(design.responseState).toBe("not_received");
    expect(design.evidenceIntakeState).toBe("closed");
    expect(design.recommendationState).toBe("not_issued");
    expect(design.selectionState).toBe("not_selected");
    expect(design.contractState).toBe("not_received");
    expect(design.accountState).toBe("not_created");
    expect(design.externalNetworkAccess).toBe(false);
    expect(design.externalSideEffects).toBe(false);
    expect(design.sandboxTrafficAuthorized).toBe(false);
    expect(design.productionTrafficAuthorized).toBe(false);
    expect(design.ticketingAuthorized).toBe(false);
    expect(design.paymentAuthorized).toBe(false);
  });

  it("defines seven unique controls with explicit non-preflight boundaries", () => {
    expect(FLIGHT_PROVIDER_CONTACT_PREFLIGHT_MODE).toBe("duffel_contact_preflight_design_only");
    expect(flightProviderContactPreflightControls).toHaveLength(7);
    expect(new Set(flightProviderContactPreflightControls.map((control) => control.id)).size).toBe(7);
    expect(flightProviderContactPreflightControls.every((control) => control.owner.length > 0)).toBe(true);
    expect(flightProviderContactPreflightControls.every((control) => control.nonPreflightBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop safeguards and ten separately owned gates", () => {
    expect(flightProviderContactPreflightSafeguards).toHaveLength(5);
    expect(new Set(flightProviderContactPreflightSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightProviderContactPreflightSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightProviderContactPreflightSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
    expect(flightProviderContactPreflightGates).toHaveLength(10);
    expect(new Set(flightProviderContactPreflightGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightProviderContactPreflightGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 19 workspace server-rendered, read-only, network-free, and unable to contact a provider", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/provider-contact-preflight.ts");
    const phase = read("docs/FLIGHTS_PHASE_19.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Flights · Phase 19 · Duffel contact preflight design only");
    expect(page).toContain("Duffel provider-contact preflight is blocked");
    expect(page).toContain("Seven provider-contact preflight controls");
    expect(page).toContain("Five immediate-stop preflight safeguards");
    expect(page).toContain("Ten separately owned provider-contact preflight gates");
    expect(page).toContain("Flights · Phase 18 · Duffel contact-authorization design only");
    expect(page).toContain("Actual provider-contact authorization remains unsatisfied.");
    expect(phase).toContain("No-operation boundary");
    expect(roadmap).toContain("Phase 19 Duffel provider-contact preflight design software gates");
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
