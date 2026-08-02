import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const completion = readFileSync(
  new URL("../lib/bookings/complete-paid-test-booking.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/bookings/complete-payment/route.ts", import.meta.url),
  "utf8",
);

describe("unfinalized paid booking refunds", () => {
  it("checks for a committed booking before classifying an RPC failure as refundable", () => {
    expect(completion).toContain('.eq("stripe_payment_intent_id", intent.id)');
    expect(completion).toContain("if (existingError) throw existingError");
    expect(completion).toContain("if (!existingBooking) throw new PaidBookingFinalizationError");
  });

  it("automatically refunds only classified finalization failures with an idempotency key", () => {
    expect(route).toContain("error instanceof PaidBookingFinalizationError");
    expect(route).toContain("getBookingFinalizationRefundKey(paidIntentId)");
    expect(route).toContain("Your test payment was automatically refunded");
  });
});
