export const partnerPlans = {
  starter: { name: "Starter", monthlyPrice: 59, audience: "Vacation homes and boutique hotels up to approximately 25 rooms." },
  professional: { name: "Professional", monthlyPrice: 199, audience: "4-star and independent hotels." },
  premium: { name: "Premium", monthlyPrice: 399, audience: "5-star hotels and resorts." }
} as const;
export type PartnerPlan = keyof typeof partnerPlans;
