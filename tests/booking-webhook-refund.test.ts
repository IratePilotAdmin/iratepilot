import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);
const completion = readFileSync(
  new URL("../lib/bookings/complete-paid-test-booking.ts", import.meta.url),
  "utf8",
);

describe("booking payment webhook refunds", () => {
  it("shares one idempotent refund operation across client and webhook completion", () => {
    expect(completion).toContain("export function refundUnfinalizedBookingPayment");
    expect(completion).toContain("getBookingFinalizationRefundKey(paymentIntentId)");
  });

  it("refunds a paid webhook booking only when finalization confirms no booking", () => {
    expect(webhook).toContain('event.type === "payment_intent.succeeded"');
    expect(webhook).toContain("error instanceof PaidBookingFinalizationError");
    expect(webhook).toContain("refundUnfinalizedBookingPayment(intent.id)");
    expect(webhook).toContain("...(bookingRefund ? { bookingRefund } : {})");
  });
});
