import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  getStripeRefundLifecycleStatus,
  getStripeRefundPaymentIntentId,
  stripeRefundMatchesMode,
} from "../lib/bookings/stripe-refund-reconciliation";
import { getBookingStatusLabel } from "../lib/bookings/status-history";

const webhook = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const decisionRoute = readFileSync(new URL("../app/api/admin/cancellations/[id]/route.ts", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("../lib/bookings/stripe-refund-reconciliation.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202608140052_stripe_refund_lifecycle.sql", import.meta.url), "utf8");

function refund(overrides: Partial<Stripe.Refund> = {}) {
  return {
    id: "re_test",
    amount: 10_500,
    payment_intent: "pi_test",
    status: "pending",
    failure_reason: null,
    ...overrides,
  } as Stripe.Refund;
}

describe("Stripe refund lifecycle reconciliation", () => {
  it("normalizes supported lifecycle states and PaymentIntent references", () => {
    expect(getStripeRefundLifecycleStatus(refund({ status: "pending" }))).toBe("pending");
    expect(getStripeRefundLifecycleStatus(refund({ status: "requires_action" }))).toBe("requires_action");
    expect(getStripeRefundLifecycleStatus(refund({ status: "succeeded" }))).toBe("succeeded");
    expect(getStripeRefundLifecycleStatus(refund({ status: "failed" }))).toBe("failed");
    expect(getStripeRefundLifecycleStatus(refund({ status: "canceled" }))).toBe("canceled");
    expect(getStripeRefundPaymentIntentId(refund())).toBe("pi_test");
    expect(getStripeRefundPaymentIntentId(refund({ payment_intent: null }))).toBeNull();
  });

  it("rejects unsupported statuses and payment-mode mismatches", () => {
    expect(() => getStripeRefundLifecycleStatus(refund({ status: null }))).toThrow("Unsupported Stripe refund status");
    expect(stripeRefundMatchesMode(false, "test")).toBe(true);
    expect(stripeRefundMatchesMode(true, "live")).toBe(true);
    expect(stripeRefundMatchesMode(true, "test")).toBe(false);
  });

  it("handles all Stripe refund events through the durable webhook ledger", () => {
    expect(webhook).toContain('event.type === "refund.created"');
    expect(webhook).toContain('event.type === "refund.updated"');
    expect(webhook).toContain('event.type === "refund.failed"');
    expect(webhook).toContain("reconcileStripeBookingRefund");
    expect(webhook).toContain('refundReconciliation.outcome === "ignored" ? "ignored" : "processed"');
  });

  it("records lifecycle state before finalizing only successful refunds", () => {
    const lifecycleIndex = reconciliation.indexOf('rpc("record_booking_refund_lifecycle"');
    const finalizationIndex = reconciliation.indexOf('rpc("finalize_booking_refund"');
    expect(lifecycleIndex).toBeGreaterThan(0);
    expect(finalizationIndex).toBeGreaterThan(lifecycleIndex);
    expect(reconciliation).toContain('lifecycleStatus === "succeeded"');
    expect(reconciliation).toContain('outcome: "awaiting_confirmation"');
    expect(reconciliation).toContain('outcome: "failed"');
  });

  it("keeps pending refunds unfinalized and failed refunds retryable", () => {
    expect(decisionRoute).toContain('reconciliation.outcome === "awaiting_confirmation"');
    expect(decisionRoute).toContain("status: 202");
    expect(decisionRoute).toContain('reconciliation.outcome === "failed"');
    expect(decisionRoute).toContain('cancellation.status !== "refund_failed"');
    expect(decisionRoute).toContain("-after-${cancellation.stripe_refund_id}");
    expect(getBookingStatusLabel("refund_failed")).toBe("Refund needs retry");
  });

  it("orders lifecycle writes, prevents refund substitution, and restricts the RPC", () => {
    expect(migration).toContain("stripe_refund_status_updated_at > p_event_created_at");
    expect(migration).toContain("Cancellation request is linked to a different Stripe refund");
    expect(migration).toContain("booking_cancellation_requests_stripe_refund_id_uidx");
    expect(migration).toContain("'pending','processing','approved','rejected','refunded','refund_failed'");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
