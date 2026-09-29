export const HOTEL_PARTNER_FEE_SCHEDULE_VERSION = "hotel_partner_commission_13_reward_fee_3_v1";

export const hotelPartnerFeeSchedule = {
  version: HOTEL_PARTNER_FEE_SCHEDULE_VERSION,
  partnerCommissionRateBps: 1_300,
  rewardProgramFeeRateBps: 300,
} as const;

export const fees = {
  defaultCommissionRate: hotelPartnerFeeSchedule.partnerCommissionRateBps / 10_000,
  rewardProgramFeeRate: hotelPartnerFeeSchedule.rewardProgramFeeRateBps / 10_000,
  serviceFeeRate: 0
};
