import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCustomerAccountOverview } from "../lib/account/overview";

const route = readFileSync(new URL("../app/api/account/overview/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/account/customer-account-overview.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");

describe("customer account overview", () => {
  it("summarizes owned trips and chooses the nearest future stay", () => {
    const result = buildCustomerAccountOverview(
      { full_name: "Avery", membership_tier: "basic", membership_status: "active", reward_points: 420 },
      [
        { id: "later", confirmation_code: "IRP-2", check_in: "2026-09-10", check_out: "2026-09-12", total: 200, status: "confirmed", created_at: "2026-08-02T00:00:00Z" },
        { id: "next", confirmation_code: "IRP-1", check_in: "2026-08-10", check_out: "2026-08-12", total: 100, status: "confirmed", created_at: "2026-08-01T00:00:00Z" },
        { id: "pending", confirmation_code: "IRP-3", check_in: "2026-10-01", check_out: "2026-10-03", total: 150, status: "pending", created_at: "2026-08-03T00:00:00Z" },
      ],
      [{ id: "n1", title: "Update", body: "Body", read_at: null, created_at: "2026-08-03T00:00:00Z" }],
      "2026-08-02",
    );
    expect(result.summary).toEqual({ upcomingTrips: 2, pendingRequests: 1, unreadUpdates: 1 });
    expect(result.nextTrip?.id).toBe("next");
    expect(result.membership).toMatchObject({ active: true, rewardPoints: 420 });
  });

  it("enforces the customer role and owned record scopes", () => {
    expect(route).toContain('requireRole(["customer"])');
    expect(route).toContain('.eq("customer_id", auth.user.id)');
    expect(route).toContain('.eq("user_id", auth.user.id)');
    expect(route).toContain("BOOKING_LIMIT = 200");
    expect(route).toContain("NOTIFICATION_LIMIT = 100");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("replaces the notification-only page with live account actions", () => {
    expect(page).toContain("<CustomerAccountOverview />");
    expect(page).not.toContain("AccountNotifications");
    expect(component).toContain("/account/trips");
    expect(component).toContain("/account/payments");
    expect(component).toContain("/account/rewards");
    expect(component).toContain("/account/profile");
    expect(component).toContain("/account/support");
  });

  it("does not request or render payment-provider identifiers", () => {
    expect(route).not.toContain("stripe_payment_intent_id");
    expect(route).not.toContain("stripe_customer_id");
    expect(component).not.toContain("stripe_");
  });
});
