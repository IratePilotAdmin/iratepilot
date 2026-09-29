import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightSupplierDueDiligence,
  FLIGHT_SUPPLIER_DUE_DILIGENCE_MODE,
  flightSupplierContractLanes,
  flightSupplierDiligenceGates,
  flightSupplierEvidenceWorkstreams,
} from "../lib/flights/supplier-due-diligence";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier due diligence phase 4", () => {
  it("starts without a candidate, shortlist, contract, supplier, credentials, or runtime authorization", () => {
    expect(buildFlightSupplierDueDiligence()).toMatchObject({
      mode: "due_diligence_only",
      candidateState: "not_recorded",
      candidateCount: 0,
      shortlistState: "not_created",
      contractState: "not_received",
      selectionState: "not_selected",
      completedCount: 0,
      totalCount: 9,
      diligenceComplete: false,
      credentialsAccepted: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed diligence into supplier or runtime authorization", () => {
    const allEvidence = Object.fromEntries(flightSupplierDiligenceGates.map((gate) => [gate.id, true]));
    const diligence = buildFlightSupplierDueDiligence(allEvidence);
    expect(diligence.diligenceComplete).toBe(true);
    expect(diligence.completedCount).toBe(diligence.totalCount);
    expect(diligence.candidateState).toBe("not_recorded");
    expect(diligence.shortlistState).toBe("not_created");
    expect(diligence.contractState).toBe("not_received");
    expect(diligence.selectionState).toBe("not_selected");
    expect(diligence.credentialsAccepted).toBe(false);
    expect(diligence.sandboxAdapterImplemented).toBe(false);
    expect(diligence.sandboxTrafficAuthorized).toBe(false);
    expect(diligence.productionTrafficAuthorized).toBe(false);
    expect(diligence.ticketingAuthorized).toBe(false);
    expect(diligence.paymentAuthorized).toBe(false);
  });

  it("defines seven unique evidence workstreams with bounded requirements", () => {
    expect(FLIGHT_SUPPLIER_DUE_DILIGENCE_MODE).toBe("due_diligence_only");
    expect(flightSupplierEvidenceWorkstreams).toHaveLength(7);
    expect(new Set(flightSupplierEvidenceWorkstreams.map((workstream) => workstream.id)).size).toBe(7);
    expect(flightSupplierEvidenceWorkstreams.every((workstream) => workstream.requiredEvidence.length === 3)).toBe(true);
    expect(flightSupplierEvidenceWorkstreams.every((workstream) => workstream.safetyBoundary.startsWith("Requirement only"))).toBe(true);
  });

  it("defines six unique contract lanes that cannot activate capabilities", () => {
    expect(flightSupplierContractLanes).toHaveLength(6);
    expect(new Set(flightSupplierContractLanes.map((lane) => lane.id)).size).toBe(6);
    expect(flightSupplierContractLanes.every((lane) => lane.owner.length > 0)).toBe(true);
    expect(flightSupplierContractLanes.every((lane) => lane.activationBoundary.startsWith("Review cannot"))).toBe(true);
  });

  it("keeps every diligence gate unique and separately owned", () => {
    expect(flightSupplierDiligenceGates).toHaveLength(9);
    expect(new Set(flightSupplierDiligenceGates.map((gate) => gate.id)).size).toBe(9);
    expect(flightSupplierDiligenceGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the Phase 4 reference server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Candidate evidence packet");
    expect(page).toContain("Contract review matrix");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("use client");
    expect(page).not.toContain("<form");
  });

  it("preserves the earlier planning and activation references without adding sensitive storage", () => {
    const page = read("app/admin/flights/page.tsx");
    const model = read("lib/flights/supplier-due-diligence.ts");
    expect(page).toContain("Phase 4 diligence reference");
    expect(page).toContain("Phase 3 planning reference");
    expect(page).toContain("Phase 2 activation reference");
    expect(model).not.toContain("candidateName");
    expect(model).not.toContain("credentialValue");
    expect(model).not.toContain("passengerName");
  });
});
