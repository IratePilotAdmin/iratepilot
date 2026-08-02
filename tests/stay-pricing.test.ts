import { describe, expect, it } from "vitest";
import { calculateVerifiedStayPricing } from "../lib/bookings/stay-pricing";

const available = [
  { stay_date: "2026-08-10", available_units: 1, rate: 300 },
  { stay_date: "2026-08-11", available_units: 2, rate: 400 },
];

describe("authoritative stay pricing", () => {
  it("calculates the same rounded subtotal and fee used by booking routes", () => {
    expect(calculateVerifiedStayPricing(available, 2, 0.05)).toEqual({
      ok: true,
      subtotal: 700,
      serviceFee: 35,
      total: 735,
    });
    expect(calculateVerifiedStayPricing(available, 2, 0)).toEqual({
      ok: true,
      subtotal: 700,
      serviceFee: 0,
      total: 700,
    });
  });

  it("rejects missing, duplicate, and sold-out inventory", () => {
    expect(calculateVerifiedStayPricing(available.slice(0, 1), 2, 0.05)).toEqual({ ok: false, reason: "availability" });
    expect(calculateVerifiedStayPricing([available[0], available[0]], 2, 0.05)).toEqual({ ok: false, reason: "availability" });
    expect(calculateVerifiedStayPricing([{ ...available[0], available_units: 0 }, available[1]], 2, 0.05)).toEqual({ ok: false, reason: "availability" });
  });

  it("rejects invalid authoritative nightly rates", () => {
    expect(calculateVerifiedStayPricing([{ ...available[0], rate: 0 }, available[1]], 2, 0.05)).toEqual({ ok: false, reason: "pricing" });
    expect(calculateVerifiedStayPricing([{ ...available[0], rate: Number.NaN }, available[1]], 2, 0.05)).toEqual({ ok: false, reason: "pricing" });
  });
});
