import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightSupplierSelectionPlan,
  FLIGHT_SUPPLIER_SELECTION_MODE,
  flightSandboxAdapterOperations,
  flightSupplierDecisionGates,
  flightSupplierSelectionCriteria,
} from "../lib/flights/supplier-selection";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier selection phase 3", () => {
  it("starts without a supplier, credentials, adapter, traffic, ticketing, or payment authorization", () => {
    expect(buildFlightSupplierSelectionPlan()).toMatchObject({
      mode: "planning_only",
      selectionState: "not_selected",
      candidateCount: 0,
      completedCount: 0,
      totalCount: 8,
      planningComplete: false,
      credentialsAccepted: false,
      sandboxAdapterImplemented: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
  });

  it("never converts completed planning gates into runtime authorization", () => {
    const allEvidence = Object.fromEntries(flightSupplierDecisionGates.map((gate) => [gate.id, true]));
    const plan = buildFlightSupplierSelectionPlan(allEvidence);
    expect(plan.planningComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.selectionState).toBe("not_selected");
    expect(plan.credentialsAccepted).toBe(false);
    expect(plan.sandboxAdapterImplemented).toBe(false);
    expect(plan.sandboxTrafficAuthorized).toBe(false);
    expect(plan.productionTrafficAuthorized).toBe(false);
    expect(plan.ticketingAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("defines a complete, unique, one-hundred-point selection rubric", () => {
    expect(FLIGHT_SUPPLIER_SELECTION_MODE).toBe("planning_only");
    expect(flightSupplierSelectionCriteria.reduce((sum, criterion) => sum + criterion.weight, 0)).toBe(100);
    expect(new Set(flightSupplierSelectionCriteria.map((criterion) => criterion.id)).size).toBe(flightSupplierSelectionCriteria.length);
    expect(flightSupplierSelectionCriteria.every((criterion) => criterion.questions.length === 3)).toBe(true);
  });

  it("limits the adapter contract to four inert design operations", () => {
    expect(flightSandboxAdapterOperations.map((operation) => operation.id)).toEqual([
      "shopping",
      "price_confirmation",
      "order_draft",
      "servicing_quote",
    ]);
    expect(flightSandboxAdapterOperations.every((operation) => operation.safetyBoundary.startsWith("Design only"))).toBe(true);
  });

  it("keeps every decision gate separately owned", () => {
    expect(new Set(flightSupplierDecisionGates.map((gate) => gate.id)).size).toBe(8);
    expect(flightSupplierDecisionGates.every((gate) => gate.owner.length > 0)).toBe(true);
  });

  it("keeps the administrator workspace server-rendered, read-only, and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Flights · Phase 3 · Planning only");
    expect(page).toContain("No supplier selected");
    expect(page).toContain("Adapter design only");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain("<form");
  });
});
