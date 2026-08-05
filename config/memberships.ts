export const memberships = {
  basic: {
    name: "iRatePilot Basic",
    annualPrice: 70,
    billingPeriod: "year",
    serviceFeeRate: 0,
    rewardMultiplier: 1,
    benefits: [
      "0% traveler service fees",
      "1× reward points on eligible confirmed stays",
      "Access to verified future rate offers"
    ]
  },
  business: {
    name: "iRatePilot Business",
    annualPrice: 120,
    billingPeriod: "year",
    serviceFeeRate: 0,
    rewardMultiplier: 2,
    benefits: [
      "0% traveler service fees",
      "2× reward points on eligible confirmed stays",
      "Access to verified future rate offers"
    ]
  }
} as const;

export type MembershipTier = keyof typeof memberships;
