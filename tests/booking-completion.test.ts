import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { isCompletableBookingIntent } from "../lib/bookings/complete-paid-test-booking";

function paymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}) {
  return {
    id: "pi_test_booking",
    status: "succeeded",
    amount_received: 41900,
    metadata: {
      mode: "booking_test",
      userId: "9c43c49c-e38c-4335-8765-d533b97027f8",
      propertyId: "ff28403e-489a-47e5-b644-cbfa2acbb4d0",
      roomId: "3e303693-5095-486a-b36f-d13e40c664da",
      checkIn: "2026-08-10",
      checkOut: "2026-08-12",
      guests: "2",
      confirmationCode: "IRP-TEST"
    },
    ...overrides
  } as Stripe.PaymentIntent;
}

describe("paid test booking completion", () => {
  it("accepts a succeeded booking intent for the expected traveler", () => {
    const intent = paymentIntent();
    expect(isCompletableBookingIntent(intent, intent.metadata.userId)).toBe(true);
  });

  it("rejects incomplete, unpaid, and cross-customer intents", () => {
    expect(isCompletableBookingIntent(paymentIntent({ status: "requires_payment_method" }))).toBe(false);
    expect(isCompletableBookingIntent(paymentIntent({ amount_received: 0 }))).toBe(false);
    expect(isCompletableBookingIntent(paymentIntent(), "another-user")).toBe(false);
    expect(isCompletableBookingIntent(paymentIntent({ metadata: { mode: "booking_test" } }))).toBe(false);
  });
});
