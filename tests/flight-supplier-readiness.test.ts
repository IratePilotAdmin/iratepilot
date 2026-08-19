import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFlightSupplierReadiness,
  FLIGHT_SUPPLIER_READINESS_MODE,
  flightActivationGates,
  flightCapabilityGroups,
  flightSupplierPaths,
} from "../lib/flights/supplier-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight supplier readiness phase 2", () => {
  it("starts with every activation gate incomplete and every runtime capability disabled", () => {
    const readiness = buildFlightSupplierReadiness();
    expect(readiness).toMatchObject({
      mode: "evaluation_only",
      completedCount: 0,
      totalCount: 10,
      evaluationComplete: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      ticketingAuthorized: false,
      paymentAuthorized: false,
    });
    expect(readiness.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts checklist completion into supplier or payment authorization", () => {
    const allEvidence = Object.fromEntries(flightActivationGates.map((gate) => [gate.id, true]));
    const readiness = buildFlightSupplierReadiness(allEvidence);
    expect(readiness.evaluationComplete).toBe(true);
    expect(readiness.completedCount).toBe(readiness.totalCount);
    expect(readiness.sandboxTrafficAuthorized).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.ticketingAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
  });

  it("defines neutral supply paths and complete capability categories without provider claims", () => {
    expect(FLIGHT_SUPPLIER_READINESS_MODE).toBe("evaluation_only");
    expect(flightSupplierPaths.map((path) => path.id)).toEqual(["ndc_aggregator", "gds", "consolidator"]);
    expect(flightCapabilityGroups.map((group) => group.id)).toEqual(["shopping", "orders", "servicing", "operations"]);
    expect(new Set(flightActivationGates.map((gate) => gate.id)).size).toBe(flightActivationGates.length);
  });

  it("keeps the administrator workspace read-only and network-free", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("Activation remains locked");
    expect(page).toContain("Every gate starts incomplete");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
  });

  it("adds the protected workspace to administrator navigation only", () => {
    const navigation = read("data/navigation.ts");
    const customerSection = navigation.slice(0, navigation.indexOf("export const partnerNavigation"));
    expect(navigation).toContain('{ href: "/admin/flights", label: "Flights" }');
    expect(customerSection).not.toContain("/admin/flights");
  });
});
