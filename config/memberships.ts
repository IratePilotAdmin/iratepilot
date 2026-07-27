export const memberships = {
  basic: {
    name: "iRatePilot Basic",
    annualPrice: 70,
    billingPeriod: "year",
    serviceFeeRate: 0,
    rewardMultiplier: 1,
    discountLabel: "Member-only offers"
  },
  business: {
    name: "iRatePilot Business",
    annualPrice: 120,
    billingPeriod: "year",
    serviceFeeRate: 0,
    rewardMultiplier: 2,
    discountLabel: "5–10% eligible business-travel discounts"
  }
} as const;

export type MembershipTier = keyof typeof memberships;
