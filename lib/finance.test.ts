import { describe, expect, it } from "vitest";
import { calculatePartnerFinancials } from "./finance";

describe("partner marketplace accounting", () => {
  it("deducts $130 commission and $30 rewards contribution from a $1,000 booking", () => {
    expect(calculatePartnerFinancials(1000)).toMatchObject({
      gross: 1000,
      commission: 130,
      rewardProgramFee: 30,
      partnerNet: 840,
    });
  });

  it("records the versioned 13% commission and separate 3% Reward Program fee", () => {
    expect(calculatePartnerFinancials(100)).toEqual({
      feeScheduleVersion: "hotel_partner_commission_13_reward_fee_3_v1",
      partnerCommissionRateBps: 1300,
      rewardProgramFeeRateBps: 300,
      gross: 100,
      commission: 13,
      rewardProgramFee: 3,
      partnerNet: 84,
    });
  });

  it("rounds each hotel-side fee independently and reconciles exactly to cents", () => {
    expect(calculatePartnerFinancials(389.99)).toEqual({
      feeScheduleVersion: "hotel_partner_commission_13_reward_fee_3_v1",
      partnerCommissionRateBps: 1300,
      rewardProgramFeeRateBps: 300,
      gross: 389.99,
      commission: 50.7,
      rewardProgramFee: 11.7,
      partnerNet: 327.59,
    });

    expect(calculatePartnerFinancials(1_234_567_890.12)).toMatchObject({
      gross: 1_234_567_890.12,
      commission: 160_493_825.72,
      rewardProgramFee: 37_037_036.7,
      partnerNet: 1_037_037_027.7,
    });

    for (const subtotal of [0, 0.01, 0.05, 12.34, 333.33, 389.99, 25_000]) {
      const result = calculatePartnerFinancials(subtotal);
      expect(Math.round(result.gross * 100)).toBe(
        Math.round(result.commission * 100)
          + Math.round(result.rewardProgramFee * 100)
          + Math.round(result.partnerNet * 100),
      );
    }
  });

  it("fails closed for invalid currency inputs", () => {
    for (const subtotal of [-0.01, 1.005, 10_000_000_000, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(() => calculatePartnerFinancials(subtotal)).toThrow(RangeError);
    }
  });
});
