import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const intentRoute = read("app/api/bookings/[id]/payment-intent/route.ts");
const completionRoute = read("app/api/bookings/[id]/complete-payment/route.ts");
const finalizer = read("lib/bookings/complete-approved-booking-test-payment.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const migration = read("supabase/migrations/202608060028_live_booking_payment_modes.sql");
const paymentFinalizerMigration = migration.slice(0, migration.indexOf("create or replace function public.finalize_booking_refund"));
const trips = read("components/bookings/customer-trips.tsx");
const historyRoute = read("app/api/account/payments/route.ts");

describe("approved reservation test payments", () => {
  it("creates only test-mode intents for the authenticated booking owner", () => {
    expect(intentRoute).toContain("getApprovedBookingPaymentMode()");
    expect(intentRoute).toContain('.eq("customer_id", user.id)');
    expect(intentRoute).toContain('booking.status !== "confirmed"');
    expect(intentRoute).toContain('booking.stripe_payment_intent_id');
    expect(intentRoute).toContain('idempotencyKey: `approved-booking-${paymentMode}-payment-${booking.id}`');
    expect(intentRoute).toContain("getApprovedBookingMetadataMode(paymentMode)");
  });

  it("verifies successful Stripe metadata before finalizing", () => {
    expect(completionRoute).toContain("isApprovedBookingPaymentIntent(intent, user.id, paymentMode)");
    expect(completionRoute).toContain("intent.metadata.bookingId !== id");
    expect(finalizer).toContain('intent.status === "succeeded"');
    expect(finalizer).toContain("getApprovedBookingIntentPaymentMode(intent)");
    expect(finalizer).toContain("p_amount_total_cents: intent.amount_received");
  });

  it("finalizes succeeded approved-booking payments from the Stripe webhook and refunds failures", () => {
    expect(webhook).toContain("intent.metadata?.mode === getApprovedBookingMetadataMode(webhookMode)");
    expect(webhook).toContain("isApprovedBookingPaymentIntent(intent, undefined, webhookMode)");
    expect(webhook).toContain("await completeApprovedBookingPayment(intent)");
    expect(webhook).toContain("error instanceof ApprovedBookingPaymentFinalizationError");
    expect(webhook).toContain("refundUnfinalizedBookingPayment(intent.id)");
  });

  it("atomically prevents duplicate or mismatched payments without changing inventory", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("v_booking.customer_id <> p_customer_id");
    expect(migration).toContain("v_booking.status <> 'confirmed'");
    expect(migration).toContain("round(v_booking.total * 100)::integer <> p_amount_total_cents");
    expect(migration).toContain("v_booking.stripe_payment_intent_id = p_payment_intent_id");
    expect(migration).toContain("v_booking.stripe_payment_mode = p_payment_mode");
    expect(paymentFinalizerMigration).not.toContain("update public.inventory");
    expect(migration).toContain("set status = 'eligible'");
    expect(migration).toContain("grant execute on function public.complete_approved_booking_payment");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("exposes a payment action and keeps payment history owner-scoped for every signed-in role", () => {
    expect(trips).toContain('paymentMode === "test" ? " (test)" : ""');
    expect(trips).toContain("!trip.payment_collected");
    expect(historyRoute).toContain("supabase.auth.getUser()");
    expect(historyRoute).toContain('.eq("customer_id", user.id)');
    expect(historyRoute).not.toContain('requireRole(["customer"])');
  });
});
