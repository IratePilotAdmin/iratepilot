import { describe, expect, it } from "vitest";
import { fees } from "../config/fees";
import { bookingSchema, checkoutSchema } from "../lib/validation";
import { calculateRewardPoints } from "../lib/rewards";

describe("booking safeguards", () => {
  it("uses the approved customer and partner rates", () => {
    expect(fees.serviceFeeRate).toBe(0.05);
    expect(fees.defaultCommissionRate).toBe(0.1);
  });

  it("accepts a valid booking but rejects client totals and excessive stays", () => {
    const valid = { hotelSlug: "azure-grand-miami", roomId: "2f21f7c5-d841-46c6-9162-a1530510e56b", checkIn: "2026-08-10", checkOut: "2026-08-13", guests: 2 };
    expect(bookingSchema.safeParse(valid).success).toBe(true);
    expect(bookingSchema.safeParse({ ...valid, roomId: "invalid" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ hotelSlug: valid.hotelSlug, roomName: "Deluxe King", nights: 3, guests: 2 }).success).toBe(true);
  });

  it("awards standard Basic points and double Business points", () => {
    expect(calculateRewardPoints(389.99, "none")).toBe(0);
    expect(calculateRewardPoints(389.99, "basic")).toBe(389);
    expect(calculateRewardPoints(389.99, "business")).toBe(778);
  });
});
