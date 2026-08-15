import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getApprovedBookingMetadataMode,
  getApprovedBookingPaymentMode,
  getStripeWebhookMode,
} from "../lib/stripe/booking-payment-mode";

const testKeys = {
  STRIPE_SECRET_KEY: "sk_test_secret",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_public",
};
const liveKeys = {
  STRIPE_SECRET_KEY: "sk_live_secret",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_public",
};
const bookingRoute = readFileSync(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
const cancellationRoute = readFileSync(new URL("../app/api/admin/cancellations/[id]/route.ts", import.meta.url), "utf8");
const refundReconciliation = readFileSync(new URL("../lib/bookings/stripe-refund-reconciliation.ts", import.meta.url), "utf8");
const paymentMigration = readFileSync(new URL("../supabase/migrations/202608060028_live_booking_payment_modes.sql", import.meta.url), "utf8");

describe("live booking payment gates", () => {
  it("keeps the existing test flow available only with a matching test key pair", () => {
    expect(getApprovedBookingPaymentMode({ ...testKeys, ENABLE_TEST_CHECKOUT: "true", PILOT_MODE: "true" })).toBe("test");
    expect(getApprovedBookingPaymentMode({ ...testKeys, ENABLE_TEST_CHECKOUT: "true", PILOT_MODE: "false" })).toBeNull();
    expect(getApprovedBookingPaymentMode({ ...liveKeys, ENABLE_TEST_CHECKOUT: "true", PILOT_MODE: "true" })).toBeNull();
  });

  it("requires every commercial launch gate before returning live mode", () => {
    const ready = {
      ...liveKeys,
      ENABLE_LIVE_BOOKING_PAYMENTS: "true",
      NEXT_PUBLIC_PUBLIC_BOOKING: "true",
      PILOT_MODE: "false",
    };
    expect(getApprovedBookingPaymentMode(ready)).toBe("live");
    expect(getApprovedBookingPaymentMode({ ...ready, PILOT_MODE: "true" })).toBeNull();
    expect(getApprovedBookingPaymentMode({ ...ready, NEXT_PUBLIC_PUBLIC_BOOKING: "false" })).toBeNull();
    expect(getApprovedBookingPaymentMode({ ...ready, ENABLE_LIVE_BOOKING_PAYMENTS: "false" })).toBeNull();
  });

  it("fails closed when test and live checkout flags conflict", () => {
    expect(getApprovedBookingPaymentMode({
      ...liveKeys,
      ENABLE_TEST_CHECKOUT: "true",
      ENABLE_LIVE_BOOKING_PAYMENTS: "true",
      NEXT_PUBLIC_PUBLIC_BOOKING: "true",
      PILOT_MODE: "false",
    })).toBeNull();
  });

  it("keeps live webhook processing independently controllable for delayed events", () => {
    expect(getStripeWebhookMode({ ...testKeys, PILOT_MODE: "true" })).toBe("test");
    expect(getStripeWebhookMode({ ...liveKeys, PILOT_MODE: "false", ENABLE_LIVE_STRIPE_WEBHOOKS: "true" })).toBe("live");
    expect(getStripeWebhookMode({ ...liveKeys, PILOT_MODE: "false", ENABLE_LIVE_STRIPE_WEBHOOKS: "false" })).toBeNull();
  });

  it("uses distinct Stripe metadata namespaces", () => {
    expect(getApprovedBookingMetadataMode("test")).toBe("approved_booking_test");
    expect(getApprovedBookingMetadataMode("live")).toBe("approved_booking_live");
  });

  it("allows booking requests in either private-pilot or fully gated commercial mode", () => {
    expect(bookingRoute).toContain('process.env.PILOT_MODE === "true"');
    expect(bookingRoute).toContain('approvedPaymentMode === "live"');
    expect(bookingRoute).toContain('"commercial_request"');
  });

  it("matches refunds to the recorded Stripe environment and uses the generic atomic finalizer", () => {
    expect(cancellationRoute).toContain("booking.stripe_payment_mode !== refundMode");
    expect(cancellationRoute).toContain('intent.livemode !== (refundMode === "live")');
    expect(cancellationRoute).toContain("reconcileStripeBookingRefund");
    expect(refundReconciliation).toContain('rpc("finalize_booking_refund"');
    expect(paymentMigration).toContain("create or replace function public.finalize_booking_refund");
    expect(paymentMigration).toContain("v_booking.stripe_payment_mode not in ('test', 'live')");
    expect(paymentMigration).toContain("Partner transfer must be reversed before refund finalization");
  });
});
