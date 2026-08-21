import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalSupplierReadiness,
  CAR_RENTAL_SUPPLIER_READINESS_MODE,
  carRentalActivationGates,
  carRentalCapabilityGroups,
  carRentalSupplierPaths,
} from "../lib/cars/supplier-readiness";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("car-rental supplier readiness phase 2", () => {
  it("starts with every activation gate incomplete and every external capability disabled", () => {
    const readiness = buildCarRentalSupplierReadiness();
    expect(readiness).toMatchObject({
      mode: "evaluation_only",
      completedCount: 0,
      totalCount: 11,
      evaluationComplete: false,
      supplierContactAuthorized: false,
      accountCreationAuthorized: false,
      credentialAcceptanceAuthorized: false,
      sandboxTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      reservationAuthorized: false,
      paymentAuthorized: false,
    });
    expect(readiness.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts checklist completion into supplier or transaction authority", () => {
    const allEvidence = Object.fromEntries(carRentalActivationGates.map((gate) => [gate.id, true]));
    const readiness = buildCarRentalSupplierReadiness(allEvidence);
    expect(readiness.evaluationComplete).toBe(true);
    expect(readiness.completedCount).toBe(readiness.totalCount);
    expect(readiness.supplierContactAuthorized).toBe(false);
    expect(readiness.accountCreationAuthorized).toBe(false);
    expect(readiness.credentialAcceptanceAuthorized).toBe(false);
    expect(readiness.sandboxTrafficAuthorized).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.reservationAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
  });

  it("defines neutral supply paths and complete capability categories without provider claims", () => {
    expect(CAR_RENTAL_SUPPLIER_READINESS_MODE).toBe("evaluation_only");
    expect(carRentalSupplierPaths.map((path) => path.id)).toEqual(["direct_rental_company", "broker", "aggregator", "gds"]);
    expect(carRentalCapabilityGroups.map((group) => group.id)).toEqual(["inventory", "pricing", "reservations", "operations"]);
    expect(new Set(carRentalActivationGates.map((gate) => gate.id)).size).toBe(carRentalActivationGates.length);
  });

  it("keeps the administrator workspace read-only, provider-neutral, and network-free", () => {
    const page = read("app/admin/cars/page.tsx");
    expect(page).toContain("Phase 2 activation reference");
    expect(page).toContain("Every gate starts incomplete");
    expect(page).toContain("No car-rental supplier has been commercially selected, contacted, provisioned, certified, or connected");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("use server");
    expect(page).not.toContain('href="http');
  });

  it("adds the protected workspace to administrator navigation only", () => {
    const navigation = read("data/navigation.ts");
    const customerSection = navigation.slice(0, navigation.indexOf("export const partnerNavigation"));
    expect(navigation).toContain('{ href: "/admin/cars", label: "Car rentals" }');
    expect(customerSection).not.toContain("/admin/cars");
  });
});
