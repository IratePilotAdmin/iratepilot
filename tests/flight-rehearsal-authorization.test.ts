import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightRehearsalAuthorizationReadiness,
  FLIGHT_REHEARSAL_AUTHORIZATION_MODE,
  flightRehearsalAuthorizationArtifacts,
  flightRehearsalAuthorizationGates,
  flightRehearsalAuthorizationSafeguards,
} from "../lib/flights/rehearsal-authorization";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight synthetic rehearsal authorization readiness phase 7", () => {
  it("starts without policy, authorization, roles, a fixture, a rehearsal, or runtime capability", () => {
    expect(buildFlightRehearsalAuthorizationReadiness()).toMatchObject({
      mode: "rehearsal_authorization_readiness_only",
      packetState: "design_only",
      authorizationState: "not_recorded",
      policyState: "not_recorded",
      fixtureStandardState: "not_recorded",
      attestationState: "not_recorded",
      roleAssignmentState: "not_assigned",
      observerState: "not_assigned",
      rehearsalState: "not_run",
      syntheticFixtureState: "not_created",
      scenarioResultCount: 0,
      receiptState: "not_created",
      findingCount: 0,
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
      authorizationPacketComplete: false,
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

  it("never converts completed design gates into authorization, execution, data acceptance, or external effects", () => {
    const allEvidence = Object.fromEntries(flightRehearsalAuthorizationGates.map((gate) => [gate.id, true]));
    const readiness = buildFlightRehearsalAuthorizationReadiness(allEvidence);
    expect(readiness.authorizationPacketComplete).toBe(true);
    expect(readiness.completedCount).toBe(readiness.totalCount);
    expect(readiness.authorizationState).toBe("not_recorded");
    expect(readiness.syntheticFixtureState).toBe("not_created");
    expect(readiness.roleAssignmentState).toBe("not_assigned");
    expect(readiness.rehearsalState).toBe("not_run");
    expect(readiness.scenarioResultCount).toBe(0);
    expect(readiness.receiptState).toBe("not_created");
    expect(readiness.evaluationIntakeState).toBe("closed");
    expect(readiness.realSupplierDataAccepted).toBe(false);
    expect(readiness.passengerDataAccepted).toBe(false);
    expect(readiness.credentialsAccepted).toBe(false);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.externalSideEffects).toBe(false);
    expect(readiness.sandboxTrafficAuthorized).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.ticketingAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
  });

  it("defines six unique authorization artifacts with explicit non-activation boundaries", () => {
    expect(FLIGHT_REHEARSAL_AUTHORIZATION_MODE).toBe("rehearsal_authorization_readiness_only");
    expect(flightRehearsalAuthorizationArtifacts).toHaveLength(6);
    expect(new Set(flightRehearsalAuthorizationArtifacts.map((artifact) => artifact.id)).size).toBe(6);
    expect(flightRehearsalAuthorizationArtifacts.every((artifact) => artifact.owner.length > 0)).toBe(true);
    expect(flightRehearsalAuthorizationArtifacts.every((artifact) => artifact.activationBoundary.includes("cannot"))).toBe(true);
  });

  it("defines five unique fail-closed authorization safeguards", () => {
    expect(flightRehearsalAuthorizationSafeguards).toHaveLength(5);
    expect(new Set(flightRehearsalAuthorizationSafeguards.map((safeguard) => safeguard.id)).size).toBe(5);
    expect(flightRehearsalAuthorizationSafeguards.every((safeguard) => safeguard.owner.length > 0)).toBe(true);
    expect(flightRehearsalAuthorizationSafeguards.every((safeguard) => safeguard.failClosedBoundary.length > 0)).toBe(true);
  });

  it("keeps all ten authorization-readiness gates unique and separately owned", () => {
    expect(flightRehearsalAuthorizationGates).toHaveLength(10);
    expect(new Set(flightRehearsalAuthorizationGates.map((gate) => gate.id)).size).toBe(10);
    expect(flightRehearsalAuthorizationGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 7 administrator workspace server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Flights · Phase 7 · Rehearsal authorization readiness only");
    expect(page).toContain("No rehearsal authorization is recorded");
    expect(page).toContain("Authorization packet artifacts");
    expect(page).toContain("Fail-closed authorization safeguards");
    expect(page).toContain("Ten separately owned authorization-readiness gates");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
  });

  it("preserves Phase 6 and earlier references without adding supplier, passenger, or credential storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/rehearsal-authorization.ts");
    expect(page).toContain("Flights · Phase 6 · Synthetic rehearsal design only");
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
