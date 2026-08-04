import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const membershipRoute = readFileSync(new URL("../app/api/memberships/route.ts", import.meta.url), "utf8");
const checkoutRoute = readFileSync(new URL("../app/api/memberships/checkout/route.ts", import.meta.url), "utf8");
const portalRoute = readFileSync(new URL("../app/api/memberships/portal/route.ts", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/account/membership-center.tsx", import.meta.url), "utf8");

describe("customer membership billing management", () => {
  it("returns renewal and billing availability without provider IDs", () => {
    expect(membershipRoute).toContain("can_manage_billing: Boolean(profile.stripe_customer_id)");
    expect(membershipRoute).toContain('"Cache-Control": "no-store"');
    expect(center).toContain("profile.membership_renews_at");
    expect(center).not.toContain("stripe_customer_id");
    expect(center).not.toContain("stripe_subscription_id");
  });

  it("prevents duplicate active membership checkout and reuses the customer", () => {
    expect(checkoutRoute).toContain('profile.membership_status === "active" && profile.stripe_subscription_id');
    expect(checkoutRoute).toContain("Manage your active membership through the test billing portal.");
    expect(checkoutRoute).toContain('{ customer: profile.stripe_customer_id }');
  });

  it("opens the portal only for the authenticated customer profile", () => {
    expect(portalRoute).toContain('requireRole(["customer"])');
    expect(portalRoute).toContain('.eq("id", auth.user.id)');
    expect(portalRoute).toContain("billingPortal.sessions.create");
    expect(portalRoute).not.toContain("createAdminClient");
  });

  it("shows billing controls and clear private-pilot state", () => {
    expect(center).toContain("Manage test membership billing");
    expect(center).toContain("Current active plan");
    expect(center).toContain("No live membership charge is created.");
    expect(center).toContain("signed Stripe webhook");
  });
});
