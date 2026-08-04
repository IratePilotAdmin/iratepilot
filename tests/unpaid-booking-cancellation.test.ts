import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/202608020025_cancel_unpaid_confirmed_bookings.sql", import.meta.url), "utf8");
const customerRoute = readFileSync(new URL("../app/api/bookings/[id]/cancellation/route.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/cancellations/[id]/route.ts", import.meta.url), "utf8");
const trips = readFileSync(new URL("../components/bookings/customer-trips.tsx", import.meta.url), "utf8");

describe("unpaid confirmed booking cancellation", () => {
  it("separates unpaid cancellation from paid refund review", () => {
    expect(customerRoute).toContain('!booking.stripe_payment_intent_id');
    expect(customerRoute).toContain('supabase.rpc("cancel_unpaid_confirmed_booking"');
    expect(customerRoute).toContain('mode: "unpaid_cancellation"');
    expect(customerRoute).toContain('mode: "paid_refund_review"');
  });

  it("atomically restores every provisional effect without creating a refund", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("available_units = available_units + 1");
    expect(migration).toContain("status = 'awaiting_payment'");
    expect(migration).toContain("-v_points");
    expect(migration).toContain("set status = 'cancelled'");
    expect(migration).toContain("refund_amount = 0");
    expect(migration).not.toContain("stripe_refund_id =");
  });

  it("refuses paid bookings and enforces customer or privileged ownership", () => {
    expect(migration).toContain("stripe_payment_intent_id is not null");
    expect(migration).toContain("Paid bookings require the refund workflow");
    expect(migration).toContain("v_booking.customer_id <> auth.uid()");
    expect(migration).toContain("auth.role() <> 'service_role'");
  });

  it("lets admins resolve legacy unpaid refund requests without Stripe", () => {
    const noPaymentBlock = adminRoute.slice(adminRoute.indexOf("if (!booking.stripe_payment_intent_id)"), adminRoute.indexOf("const stripe = getStripe()"));
    expect(noPaymentBlock).toContain('admin.rpc(\n        "cancel_unpaid_confirmed_booking"');
    expect(noPaymentBlock).not.toContain("refunds.create");
    expect(noPaymentBlock).toContain("no refund was required");
  });

  it("updates the trip immediately so it no longer appears confirmed", () => {
    expect(trips).toContain('body.mode === "unpaid_cancellation"');
    expect(trips).toContain('status: "cancelled"');
    expect(trips).toContain("Unpaid reservation cancelled; no refund required.");
  });
});
