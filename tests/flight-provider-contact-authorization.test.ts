import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightProviderContactAuthorizationDesign,
  FLIGHT_PROVIDER_CONTACT_AUTHORIZATION_MODE,
  flightProviderContactAuthorizationArtifacts,
  flightProviderContactAuthorizationGates,
  flightProviderContactAuthorizationSafeguards,
} from "../lib/flights/provider-contact-authorization";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Flights Phase 18 Duffel provider-contact authorization design", () => {
  it("records the staged provider path without creating contact or downstream authority", () => {
    expect(buildFlightProviderContactAuthorizationDesign()).toMatchObject({
      mode: "duffel_contact_authorization_design_only",
      planState: "design_only",
      providerPathPreferenceState: "recorded",
      primaryProviderPath: "duffel",
      secondaryProviderPath: "sabre",
      parallelLaunchState: "not_authorized",
      contactAuthorizationState: "blocked",
      actionTimeDecisionState: "not_recorded",
      contactPurposeState: "not_bound",
      senderState: "not_assigned",
      approverState: "not_assigned",
      messageState: "not_created",
      disclosureState: "not_approved",
      recipientState: "not_recorded",
      channelState: "not_approved",
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
      authorizationDesignComplete: false,
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

  it("never converts completed design gates into contact, intake, commitment, or activation authority", () => {
    const allEvidence = Object.fromEntries(flightProviderContactAuthorizationGates.map((gate) => [gate.id, true]));
    const design = buildFlightProviderContactAuthorizationDesign(allEvidence);
    expect(design.authorizationDesignComplete).toBe(true);
    expect(design.completedCount).toBe(design.totalCount);
    expect(design.contactAuthorizationState).toBe("blocked");
    expect(design.actionTimeDecisionState).toBe("not_recorded");
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

  it("defines six unique artifacts with explicit non-contact boundaries", () => {
    expect(FLIGHT_PROVIDER_CONTACT_AUTHORIZATION_MODE).toBe("duffel_contact_authorization_design_only");
    expect(flightProviderContactAuthorizationArtifacts).toHaveLength(6);
    expect(new Set(flightProviderContactAuthorizationArtifacts.map((artifact) => artifact.id)).size).toBe(6);
    expect(flightProviderContactAuthorizationArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightProviderContactAuthorizationArtifacts.every((artifact) => artifact.nonContactBoundary.startsWith("Design cannot"))).toBe(true);
  });

  it("defines five unique immediate-stop safeguards and ten separately owned gates", () => {
    expect(flightProviderContactAuthorizationSafeguards).toHaveLength(5);
    expect(new Set(flightProviderContactAuthorizationSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightProviderContactAuthorizationSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightProviderContactAuthorizationSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
    expect(flightProviderContactAuthorizationGates).toHaveLength(10);
    expect(new Set(flightProviderContactAuthorizationGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightProviderContactAuthorizationGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 18 workspace server-rendered, read-only, network-free, and unable to contact a provider", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/provider-contact-authorization.ts");
    const phase = read("docs/FLIGHTS_PHASE_18.md");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Flights · Phase 18 · Duffel contact-authorization design only");
    expect(page).toContain("Duffel provider contact is blocked");
    expect(page).toContain("Six provider-contact authorization artifacts");
    expect(page).toContain("Five immediate-stop contact safeguards");
    expect(page).toContain("Ten separately owned provider-contact authorization gates");
    expect(page).toContain("Flights · Phase 17 · Evidence-review execution-control design only");
    expect(phase).toContain("No-operation boundary");
    expect(roadmap).toContain("Phase 18 Duffel provider-contact authorization design software gates");
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
