import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const subscriptionRoute = readFileSync(new URL("../app/api/partner/subscription/route.ts", import.meta.url), "utf8");
const checkoutRoute = readFileSync(new URL("../app/api/partner/subscription/checkout/route.ts", import.meta.url), "utf8");
const portalRoute = readFileSync(new URL("../app/api/partner/subscription/portal/route.ts", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/partner/partner-subscription-center.tsx", import.meta.url), "utf8");

describe("partner subscription management", () => {
  it("uses the API response contract and shows renewal state", () => {
    expect(subscriptionRoute).toContain("can_manage_billing: Boolean(data.stripe_customer_id)");
    expect(subscriptionRoute).toContain('"Cache-Control": "no-store"');
    expect(center).toContain("setSubscription(body.data)");
    expect(center).not.toContain("setSubscription(body.partner)");
    expect(center).toContain("subscription_renews_at");
  });

  it("prevents a second checkout for an active subscription", () => {
    expect(checkoutRoute).toContain('partner.subscription_status === "active" && partner.stripe_subscription_id');
    expect(checkoutRoute).toContain("Manage your active subscription through the test billing portal.");
    expect(checkoutRoute).toContain('{ customer: partner.stripe_customer_id }');
  });

  it("opens billing only for the authenticated approved partner customer", () => {
    expect(portalRoute).toContain('requireRole(["partner"])');
    expect(portalRoute).toContain('.eq("owner_id", auth.user.id)');
    expect(portalRoute).toContain('partner.status !== "approved"');
    expect(portalRoute).toContain("billingPortal.sessions.create");
    expect(portalRoute).not.toContain("createAdminClient");
  });

  it("does not expose provider identifiers to the settings UI", () => {
    expect(center).not.toContain("stripe_customer_id");
    expect(center).not.toContain("stripe_subscription_id");
    expect(center).toContain("Manage test billing");
    expect(center).toContain("No live subscription charge is created.");
  });
});
