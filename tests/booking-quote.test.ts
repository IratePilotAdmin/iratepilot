import { describe, expect, it } from "vitest";
import { calculateBookingQuote } from "../lib/booking-quote";

describe("booking quote", () => {
  it("charges no traveler service fee", () => {
    expect(calculateBookingQuote(700, 0)).toEqual({
      baseSubtotal: 700,
      memberDiscount: 0,
      subtotal: 700,
      serviceFee: 0,
      total: 700,
    });
  });

  it("applies Basic and Business discounts with currency rounding", () => {
    expect(calculateBookingQuote(700, 0, 0.05)).toEqual({
      baseSubtotal: 700,
      memberDiscount: 35,
      subtotal: 665,
      serviceFee: 0,
      total: 665,
    });
    expect(calculateBookingQuote(333.33, 0, 0.10)).toEqual({
      baseSubtotal: 333.33,
      memberDiscount: 33.33,
      subtotal: 300,
      serviceFee: 0,
      total: 300,
    });
  });
});
