import { describe, expect, it } from "vitest";
import { calculateBookingQuote } from "../lib/booking-quote";

describe("booking quote", () => {
  it("shows the standard traveler fee without trusting client totals", () => {
    expect(calculateBookingQuote(700, 0.05)).toEqual({
      subtotal: 700,
      serviceFee: 35,
      total: 735,
    });
  });

  it("applies the member fee waiver and rounds currency values", () => {
    expect(calculateBookingQuote(389.999, 0)).toEqual({
      subtotal: 390,
      serviceFee: 0,
      total: 390,
    });
    expect(calculateBookingQuote(333.33, 0.05)).toEqual({
      subtotal: 333.33,
      serviceFee: 16.67,
      total: 350,
    });
  });
});
