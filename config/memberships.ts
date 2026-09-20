export const memberships = {
  basic: {
    name: "iRatePilot Basic",
    annualPrice: 70,
    billingPeriod: "year",
    serviceFeeRate: 0,
    discountRate: 0.05,
    rewardMultiplier: 2,
    benefits: [
      "Extra 5% member discount on eligible stays",
      "2× iRate Rewards points on eligible confirmed stays",
      "Access to verified future rate offers"
    ]
  },
  business: {
    name: "iRatePilot Business",
    annualPrice: 120,
    billingPeriod: "year",
    serviceFeeRate: 0,
    discountRate: 0.10,
    rewardMultiplier: 3,
    benefits: [
      "Extra 10% member discount on eligible stays",
      "3× iRate Rewards points on eligible confirmed stays",
      "Access to verified future rate offers"
    ]
  }
} as const;

export type MembershipTier = keyof typeof memberships;
