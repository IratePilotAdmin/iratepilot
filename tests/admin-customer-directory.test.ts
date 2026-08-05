import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCustomerDirectory, type CustomerBooking, type CustomerProfile } from "../lib/admin/customer-directory";

const route = readFileSync(new URL("../app/api/admin/customers/route.ts", import.meta.url), "utf8");

const profile: CustomerProfile = {
  id: "customer-1",
  full_name: "Avery Guest",
  phone: null,
  membership_tier: "basic",
  membership_status: "active",
  reward_points: 120,
  created_at: "2026-07-01T00:00:00.000Z",
};

describe("admin customer directory", () => {
  it("requires admin access before using the service-role client", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    expect(route).not.toContain("stripe_customer_id");
    expect(route).not.toContain("stripe_subscription_id");
  });

  it("aggregates booking activity without counting cancelled or refunded value", () => {
    const bookings: CustomerBooking[] = [
      { customer_id: profile.id, status: "confirmed", total: "450.00", created_at: "2026-07-20T00:00:00.000Z" },
      { customer_id: profile.id, status: "pending", total: 300, created_at: "2026-07-21T00:00:00.000Z" },
      { customer_id: profile.id, status: "refunded", total: 200, created_at: "2026-07-22T00:00:00.000Z" },
    ];

    const [customer] = buildCustomerDirectory([profile], bookings, new Map([[profile.id, "avery@example.com"]]));
    expect(customer.email).toBe("avery@example.com");
    expect(customer.booking_count).toBe(3);
    expect(customer.pending_booking_count).toBe(1);
    expect(customer.confirmed_value).toBe(450);
    expect(customer.last_booking_at).toBe("2026-07-22T00:00:00.000Z");
  });

  it("returns empty booking totals for new customers", () => {
    const [customer] = buildCustomerDirectory([profile], [], new Map());
    expect(customer.email).toBeNull();
    expect(customer.booking_count).toBe(0);
    expect(customer.confirmed_value).toBe(0);
    expect(customer.last_booking_at).toBeNull();
  });
});
