import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHotelLaunchReadiness, type HotelLaunchReadinessInput } from "../lib/admin/hotel-launch-readiness";

const empty: HotelLaunchReadinessInput = {
  approvedHotelCount: 0,
  approvedHotelStateAvailable: true,
  hotelApplicationCount: 2,
  pendingHotelApplicationCount: 1,
  declinedHotelApplicationCount: 1,
  verifiedHotelApprovalCount: 0,
  inventoryReadyHotelCount: 0,
  listingStateAvailable: true,
  listingCandidateAvailable: false,
  listingChecks: [
    { label: "Safe primary photo", passed: false },
    { label: "Property amenities", passed: false },
  ],
  commerciallyReadyHotelCount: 0,
  commercialStateAvailable: true,
  liveSupplierCount: 0,
  supplierStateAvailable: true,
  paymentConfigurationReady: false,
  paymentAuthorizationValid: false,
  paymentAuthorizationStateAvailable: true,
  paymentChecks: [
    { label: "Live booking payments are enabled", passed: false },
    { label: "Stripe live key pair is staged or active", passed: true },
  ],
  operationsReady: false,
  operationsStateAvailable: true,
  emailWorkerEnabled: false,
  emailBacklogCount: 2,
  emailDeadLetterCount: 1,
  deliveryFailureCount: 3,
  payoutExceptionCount: 1,
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
      verifiedHotelApprovalCount: 1,
      inventoryReadyHotelCount: 1,
      listingCandidateAvailable: true,
      listingChecks: empty.listingChecks.map((item) => ({ ...item, passed: true })),
      commerciallyReadyHotelCount: 1,
    });
    expect(result).toMatchObject({ complete: 3, total: 7, percent: 43, launchReady: false });
  });

  it("shows safe listing requirements for the closest approved hotel candidate", () => {
    const listing = buildHotelLaunchReadiness(empty).gates.find(({ id }) => id === "listing_inventory");
    expect(listing?.checks).toEqual([
      { label: "Approved linked hotel available", ready: false, value: "Required" },
      { label: "Safe primary photo", ready: false, value: "Required" },
      { label: "Property amenities", ready: false, value: "Required" },
    ]);
    expect(JSON.stringify(listing)).not.toMatch(/property_name|address|email|phone/i);
  });

  it("shows aggregate hotel application funnel counts without applicant details", () => {
    const intake = buildHotelLaunchReadiness(empty).gates.find(({ id }) => id === "approved_hotel");
    expect(intake?.checks).toEqual([
      { label: "Applications received", ready: true, value: "2" },
      { label: "Pending administrator review", ready: false, value: "1" },
      { label: "Verified approval decisions", ready: false, value: "0" },
      { label: "Approved hotels linked to a property", ready: false, value: "0" },
      { label: "Declined applications", ready: true, value: "1" },
    ]);
    expect(JSON.stringify(intake)).not.toMatch(/email|phone|contact/i);
  });

  it("requires all seven gates for launch readiness", () => {
    const result = buildHotelLaunchReadiness({
      ...empty,
      approvedHotelCount: 1,
      verifiedHotelApprovalCount: 1,
      inventoryReadyHotelCount: 1,
      listingCandidateAvailable: true,
      listingChecks: empty.listingChecks.map((item) => ({ ...item, passed: true })),
      commerciallyReadyHotelCount: 1,
      liveSupplierCount: 1,
      paymentConfigurationReady: true,
      paymentAuthorizationValid: true,
      paymentChecks: empty.paymentChecks.map((item) => ({ ...item, passed: true })),
      operationsReady: true,
      emailWorkerEnabled: true,
      emailBacklogCount: 0,
      emailDeadLetterCount: 0,
      deliveryFailureCount: 0,
      payoutExceptionCount: 0,
      publicationEnabled: true,
    });
    expect(result).toMatchObject({ complete: 7, total: 7, percent: 100, launchReady: true });
    expect(result.gates.every(({ status }) => status === "ready")).toBe(true);
  });

  it("shows safe payment configuration and approval blockers", () => {
    const payments = buildHotelLaunchReadiness(empty).gates.find(({ id }) => id === "production_payments");
    expect(payments?.checks).toEqual([
      { label: "Live booking payments are enabled", ready: false, value: "Required" },
      { label: "Stripe live key pair is staged or active", ready: true, value: "Complete" },
      { label: "Current production payment approval", ready: false, value: "Required" },
    ]);
    expect(JSON.stringify(payments)).not.toMatch(/sk_live_|pk_live_|whsec_/);
  });

  it("shows actionable aggregate operations checks without exposing queue records", () => {
    const operations = buildHotelLaunchReadiness(empty).gates.find(({ id }) => id === "support_operations");
    expect(operations?.checks).toEqual([
      { label: "Email worker", ready: false, value: "Disabled" },
      { label: "Queued email work", ready: false, value: "2" },
      { label: "Email dead letters", ready: false, value: "1" },
      { label: "Delivery failures", ready: false, value: "3" },
      { label: "Payout exceptions", ready: false, value: "1" },
    ]);
    expect(JSON.stringify(operations)).not.toContain("recipient");
    expect(JSON.stringify(operations)).not.toContain("message");
    expect(routeSource).toContain('typeof emailBacklog.count === "number"');
    expect(routeSource).toContain('typeof emailDeadLetters.count === "number"');
    expect(routeSource).toContain('typeof deliveryFailures.count === "number"');
    expect(routeSource).toContain('typeof payoutExceptions.count === "number"');
  });

  it("marks unavailable evidence checks as fail-closed", () => {
    const result = buildHotelLaunchReadiness({
      ...empty,
      approvedHotelStateAvailable: false,
      listingStateAvailable: false,
      commercialStateAvailable: false,
      supplierStateAvailable: false,
      paymentAuthorizationStateAvailable: false,
      operationsStateAvailable: false,
    });
    expect(result.gates.filter(({ status }) => status === "unavailable").map(({ id }) => id)).toEqual([
      "approved_hotel", "listing_inventory", "commercial_release", "supplier_connection", "production_payments", "support_operations",
    ]);
  });

  it("requires append-only administrator approval evidence before counting a hotel", () => {
    expect(routeSource).toContain('from("partner_application_review_evidence")');
    expect(routeSource).toContain('evidence.decision === "approved"');
    expect(routeSource).toContain("verifiedApprovalApplicationIds.has(application.id)");
    expect(routeSource).toContain('select("id", { count: "exact", head: true })');
    expect(routeSource).toContain('partner_applications!inner(id)');
    expect(routeSource).toContain('typeof verifiedLinkedApprovals.count === "number"');
    expect(routeSource).toContain("approvedHotelCount: verifiedLinkedApprovals.count ?? 0");
  });

  it("counts SynXis only when its persisted evidence and production configuration are live", () => {
    expect(routeSource).toContain('from("synxis_crs_launch_evidence")');
    expect(routeSource).toContain('eq("provider_id", "sabre-synxis")');
    expect(routeSource).toContain("!supplierEvidence.error && !synxisEvidence.error");
    expect(routeSource).toContain("buildSynxisReadiness(process.env, synxisActivationEvidence).status === \"live\"");
    expect(routeSource).toContain("priorityPmsLiveCount + synxisLiveCount");
  });

  it("exposes an admin-only read path with no mutation handler", () => {
    expect(routeSource).toContain('requireRole(["admin"])');
    expect(routeSource).toContain("paymentReadiness.productionConfiguration.checks.map");
    expect(routeSource).toContain("export async function GET()");
    expect(routeSource).toContain("!commercialControls.error && !commercialStates.error");
    expect(routeSource).not.toContain("export async function POST");
    expect(routeSource).not.toContain("export async function PATCH");
    expect(uiSource).toContain("This page is read-only.");
    expect(uiSource).toContain("item.checks.map");
    expect(navigationSource).toContain('{ href: "/admin/launch-readiness", label: "Launch readiness" }');
  });
});
