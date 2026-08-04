export const partnerPlans = {
  starter: { name: "Starter", monthlyPrice: 59, audience: "Vacation homes and boutique hotels up to approximately 25 rooms.", featured: false },
  professional: { name: "Professional", monthlyPrice: 199, audience: "4-star and independent hotels.", featured: true },
  premium: { name: "Premium", monthlyPrice: 399, audience: "5-star hotels and resorts.", featured: false }
} as const;

export const partnerEnterprisePlan = {
  name: "Enterprise",
  monthlyPriceLabel: "$799+",
  audience: "Custom plans for hotel groups and property management companies.",
} as const;

export type PartnerPlan = keyof typeof partnerPlans;
