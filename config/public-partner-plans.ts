import { partnerEnterprisePlan, partnerPlans } from "./partner-plans";

// Public offers are separate from existing Stripe pilot prices and subscription lifecycle validation.
export const publicPartnerPlans = {
  starter: { ...partnerPlans.starter, monthlyPrice: 79 },
  professional: { ...partnerPlans.professional, monthlyPrice: 399 },
  premium: { ...partnerPlans.premium, monthlyPrice: 599 },
} as const;

export const publicPartnerEnterprisePlan = {
  ...partnerEnterprisePlan,
  monthlyPriceLabel: "$999+",
} as const;

export type PublicPartnerPlan = keyof typeof publicPartnerPlans;
