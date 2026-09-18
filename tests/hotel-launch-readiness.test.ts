import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHotelLaunchReadiness, type HotelLaunchReadinessInput } from "../lib/admin/hotel-launch-readiness";

const empty: HotelLaunchReadinessInput = {
  approvedHotelCount: 0,
  inventoryReadyHotelCount: 0,
  commerciallyReadyHotelCount: 0,
  commercialStateAvailable: true,
  liveSupplierCount: 0,
  supplierStateAvailable: true,
  paymentConfigurationReady: false,
  operationsReady: false,
  operationsStateAvailable: true,
  publicationEnabled: false,
};

const routeSource = readFileSync(new URL("../app/api/admin/hotel-launch-readiness/route.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../components/dashboard/admin-hotel-launch-readiness.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

describe("hotel launch readiness", () => {
  it("reports seven fail-closed gates without estimating readiness", () => {
    const result = buildHotelLaunchReadiness(empty);
    expect(result).toMatchObject({ complete: 0, total: 7, percent: 0, launchReady: false, readOnly: true });
    expect(result.gates.map(({ status }) => status)).toEqual([
      "waiting_external", "blocked", "waiting_external", "waiting_external", "blocked", "blocked", "blocked",
    ]);
  });

  it("counts only gates whose current evidence passes", () => {
    const result = buildHotelLaunchReadiness({
      ...empty,
      approvedHotelCount: 1,
      inventoryReadyHotelCount: 1,
      commerciallyReadyHotelCount: 1,
    });
    expect(result).toMatchObject({ complete: 3, total: 7, percent: 43, launchReady: false });
  });

  it("requires all seven gates for launch readiness", () => {
    const result = buildHotelLaunchReadiness({
      ...empty,
      approvedHotelCount: 1,
      inventoryReadyHotelCount: 1,
      commerciallyReadyHotelCount: 1,
      liveSupplierCount: 1,
      paymentConfigurationReady: true,
      operationsReady: true,
      publicationEnabled: true,
    });
    expect(result).toMatchObject({ complete: 7, total: 7, percent: 100, launchReady: true });
    expect(result.gates.every(({ status }) => status === "ready")).toBe(true);
  });

  it("marks unavailable evidence checks as fail-closed", () => {
    const result = buildHotelLaunchReadiness({
      ...empty,
      commercialStateAvailable: false,
      supplierStateAvailable: false,
      operationsStateAvailable: false,
    });
    expect(result.gates.filter(({ status }) => status === "unavailable").map(({ id }) => id)).toEqual([
      "commercial_release", "supplier_connection", "support_operations",
    ]);
  });

  it("exposes an admin-only read path with no mutation handler", () => {
    expect(routeSource).toContain('requireRole(["admin"])');
    expect(routeSource).toContain("export async function GET()");
    expect(routeSource).not.toContain("export async function POST");
    expect(routeSource).not.toContain("export async function PATCH");
    expect(uiSource).toContain("This page is read-only.");
    expect(navigationSource).toContain('{ href: "/admin/launch-readiness", label: "Launch readiness" }');
  });
});
