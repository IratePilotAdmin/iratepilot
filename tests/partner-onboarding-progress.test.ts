import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPartnerOnboarding, type OnboardingProperty } from "../lib/partner/onboarding";
import { mergePendingOwnerHotelAccess, type PartnerHotelAccessResult } from "../lib/partner/hotel-access";

const route = readFileSync(new URL("../app/api/partner/onboarding/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/partner/onboarding/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const publicPartnerPage = readFileSync(new URL("../app/partner/page.tsx", import.meta.url), "utf8");

const property = (overrides: Partial<OnboardingProperty> = {}): OnboardingProperty => ({
  id: "property-1", name: "Pilot Hotel", active: false,
  readiness: { ready: true, missing: [], requirements: { primaryPhoto: true, amenities: true, activeRoom: true, futureInventory: true } },
  ...overrides,
});

describe("live partner onboarding progress", () => {
  it("builds launch progress without treating optional software as a marketplace requirement", () => {
    const progress = buildPartnerOnboarding(
      { status: "approved", stripe_connect_status: "ready", software_plan: "none", subscription_status: "inactive" },
      [property({ active: true })],
    );
    expect(progress.ready).toBe(true);
    expect(progress.completed).toBe(7);
    expect(progress.percent).toBe(100);
    expect(progress.software).toMatchObject({ plan: "none", active: false });
  });

  it("uses one strongest property for content, room, inventory, and publication steps", () => {
    const incomplete = property({ id: "p1", name: "Incomplete", readiness: { ready: false, missing: ["future sellable inventory"], requirements: { primaryPhoto: true, amenities: true, activeRoom: true, futureInventory: false } } });
    const stronger = property({ id: "p2", name: "Stronger" });
    const progress = buildPartnerOnboarding({ status: "approved", stripe_connect_status: "pending", software_plan: "starter", subscription_status: "active" }, [incomplete, stronger]);
    expect(progress.primaryProperty?.id).toBe("p2");
    expect(progress.steps.find((step) => step.key === "inventory")?.complete).toBe(true);
    expect(progress.steps.find((step) => step.key === "payouts")?.complete).toBe(false);
    expect(progress.ready).toBe(false);
  });

  it("omits owner-only commercial steps and software data for delegated managers", () => {
    const progress = buildPartnerOnboarding(
      { status: "approved", stripe_connect_status: "pending", software_plan: "starter", subscription_status: "active" },
      [property({ active: true })],
      "revenue_manager",
    );
    expect(progress.ready).toBe(true);
    expect(progress.total).toBe(5);
    expect(progress.steps.map((step) => step.key)).toEqual(["property", "content", "rooms", "inventory", "published"]);
    expect(progress.steps.some((step) => step.href === "/partner/payouts")).toBe(false);
    expect(progress).not.toHaveProperty("software");
  });

  it("scopes the endpoint to resolved owner or manager hotel access", () => {
    expect(route).toContain('requireRole(["partner", "admin"])');
    expect(route).toContain("resolvePartnerHotelAccess(auth, requestedPartnerId)");
    expect(route).toContain("hotelAccess.access.partnerId");
    expect(route).toContain('.eq("partner_id", partner.id)');
    expect(route.indexOf("resolvePartnerHotelAccess(auth, requestedPartnerId)"))
      .toBeLessThan(route.indexOf('.from("properties")'));
  });

  it("uses the already authorized partner scope when reading pending-owner draft properties", () => {
    expect(route).toContain('await admin.from("properties")');
    expect(route).toContain('.eq("partner_id", partner.id)');
    expect(route.indexOf("if (!partner)"))
      .toBeLessThan(route.indexOf('await admin.from("properties")'));
  });

  it("keeps pending ownership selectable without overriding requested managed access", () => {
    expect(route).toContain('.select("id,business_name,status")');
    expect(route).toContain('.eq("owner_id", auth.user.id)');
    expect(route).toContain('owner.data.status !== "approved"');
    expect(route).toContain("pendingOwnerAccess");
    expect(route).toContain("mergePendingOwnerHotelAccess(resolved, pendingOwnerAccess, requestedPartnerId)");
    expect(route.indexOf("resolvePartnerHotelAccess(auth, requestedPartnerId)"))
      .toBeLessThan(route.indexOf("mergePendingOwnerHotelAccess(resolved, pendingOwnerAccess, requestedPartnerId)"));
  });

  it("honors requested managed access before pending ownership and otherwise requires a selection", () => {
    const managed = { partnerId: "managed-partner", partnerName: "Managed Hotel", role: "revenue_manager" as const };
    const pendingOwner = { partnerId: "pending-owner", partnerName: "Pending Hotel", role: "owner" as const };
    const resolved = {
      access: managed,
      options: [managed],
      selectionRequired: false,
      migrationRequired: false,
    } satisfies PartnerHotelAccessResult;

    expect(mergePendingOwnerHotelAccess(resolved, pendingOwner, managed.partnerId).access).toEqual(managed);
    expect(mergePendingOwnerHotelAccess({ ...resolved, access: null }, pendingOwner, pendingOwner.partnerId).access).toEqual(pendingOwner);
    expect(mergePendingOwnerHotelAccess({ ...resolved, access: null }, pendingOwner, null)).toMatchObject({
      access: null,
      options: [pendingOwner, managed],
      selectionRequired: true,
    });
  });

  it("replaces the application form in the protected route and adds onboarding navigation", () => {
    expect(page).toContain("<PartnerOnboarding />");
    expect(page).not.toContain("PartnerApplicationForm");
    expect(navigation).toContain('{ href: "/partner/onboarding", label: "Onboarding" }');
    expect(home).not.toContain('href="/partner/onboarding"');
    expect(home).toContain('href="/partner#application"');
    expect(publicPartnerPage).toContain('id="application"');
    expect(publicPartnerPage).not.toContain('href="/partner/onboarding"');
  });
});
