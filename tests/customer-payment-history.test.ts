import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCustomerPaymentHistory } from "../lib/account/payment-history";

const route = readFileSync(new URL("../app/api/account/payments/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/account/customer-payment-history.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/account/payments/page.tsx", import.meta.url), "utf8");

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: "booking-1", confirmation_code: "IRP-TEST", check_in: "2026-09-01", check_out: "2026-09-03",
  subtotal: 200, taxes: 0, fees: 20, total: 220, status: "confirmed", created_at: "2026-08-02T12:00:00Z",
  stripe_payment_intent_id: "pi_private", properties: { name: "Pilot Hotel" }, rooms: { name: "King" },
  booking_cancellation_requests: [], ...overrides,
});

describe("customer payment history", () => {
  it("separates paid, refunded, and uncollected bookings", () => {
    const history = buildCustomerPaymentHistory([
      booking(),
      booking({ id: "booking-2", total: 150, status: "refunded", booking_cancellation_requests: [{ status: "refunded", refund_amount: 150 }] }),
      booking({ id: "booking-3", total: 90, status: "pending", stripe_payment_intent_id: null }),
    ]);
    expect(history.entries.map((entry) => entry.state)).toEqual(["paid", "refunded", "not_collected"]);
    expect(history.summary).toEqual({ testPayments: 2, collected: 370, refunded: 150, net: 220, unpaidRequests: 1 });
  });

  it("shows an in-flight cancellation as a refund under review", () => {
    const history = buildCustomerPaymentHistory([booking({ booking_cancellation_requests: [{ status: "processing", refund_amount: null }] })]);
    expect(history.entries[0].state).toBe("refund_pending");
    expect(history.entries[0].refundedAmount).toBe(0);
  });

  it("keeps the endpoint customer scoped and strips payment provider identifiers", () => {
    expect(route).toContain('requireRole(["customer"])');
    expect(route).toContain('.eq("customer_id", auth.user.id)');
    expect(route).toContain("PAYMENT_HISTORY_LIMIT = 200");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(component).not.toContain("stripe_payment_intent_id");
    expect(component).not.toContain("stripe_refund_id");
  });

  it("replaces the starter payment-method module with a test-mode ledger", () => {
    expect(page).toContain("<CustomerPaymentHistory />");
    expect(page).not.toContain("Starter account module");
    expect(component).toContain("This private pilot uses Stripe test mode.");
    expect(component).toContain("No payment collected");
  });
});
