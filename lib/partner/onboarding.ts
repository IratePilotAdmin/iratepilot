import type { PropertyReadiness } from "@/lib/property-readiness";
import type { PartnerHotelRole } from "@/lib/partner/hotel-access";

export type OnboardingPartner = {
  status: string;
  stripe_connect_status: string;
  software_plan: string;
  subscription_status: string;
};

export type OnboardingProperty = {
  id: string;
  name: string;
  active: boolean;
  readiness: PropertyReadiness;
};

export type PartnerOnboardingStep = {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  href: string;
};

const summarizeSteps = (steps: PartnerOnboardingStep[]) => {
  const completed = steps.filter((step) => step.complete).length;
  return {
    completed,
    total: steps.length,
    percent: Math.round(completed / steps.length * 100),
    ready: completed === steps.length,
    steps,
  };
};

const readinessScore = (property: OnboardingProperty) =>
  Object.values(property.readiness.requirements).filter(Boolean).length;

export function buildPartnerOnboarding(
  partner: OnboardingPartner,
  properties: OnboardingProperty[],
  accessRole: PartnerHotelRole = "owner",
) {
  const primaryProperty = [...properties].sort((left, right) =>
    Number(right.active) - Number(left.active) || readinessScore(right) - readinessScore(left)
  )[0] || null;
  const requirements = primaryProperty?.readiness.requirements;
  const hotelSteps = [
    { key: "property", label: "Add your first property", detail: "Create the hotel, resort, or vacation-home listing.", complete: Boolean(primaryProperty), href: "/partner/properties" },
    { key: "content", label: "Complete listing content", detail: "Add a safe primary photo and at least one amenity.", complete: Boolean(requirements?.primaryPhoto && requirements.amenities), href: "/partner/properties" },
    { key: "rooms", label: "Configure a room type", detail: "Add and activate at least one bookable room type.", complete: Boolean(requirements?.activeRoom), href: "/partner/rates" },
    { key: "inventory", label: "Load future rates and inventory", detail: "Make at least one future night available for booking.", complete: Boolean(requirements?.futureInventory), href: "/partner/rates" },
    { key: "published", label: "Pass listing review", detail: "An administrator publishes the listing after all property requirements are complete.", complete: Boolean(primaryProperty?.active), href: "/partner/properties" },
  ];
  const ownerSteps = [
    { key: "approval", label: "Partner account approved", detail: "Your business must pass iRatePilot partner review.", complete: partner.status === "approved", href: "/partner/dashboard" },
    { key: "payouts", label: "Connect your payout account", detail: "Complete Stripe verification so eligible proceeds can be paid out.", complete: partner.stripe_connect_status === "ready", href: "/partner/payouts" },
  ];
  const pilotSteps = accessRole === "owner"
    ? [ownerSteps[0], ...hotelSteps.slice(0, -1)]
    : hotelSteps.slice(0, -1);
  const activationSteps = accessRole === "owner"
    ? [ownerSteps[1], hotelSteps.at(-1)!]
    : [hotelSteps.at(-1)!];
  const steps = [...pilotSteps, ...activationSteps];
  const overall = summarizeSteps(steps);
  return {
    completed: overall.completed,
    total: overall.total,
    percent: overall.percent,
    ready: overall.ready,
    steps,
    pilotPreparation: summarizeSteps(pilotSteps),
    commercialActivation: summarizeSteps(activationSteps),
    primaryProperty,
    portfolio: { properties: properties.length, published: properties.filter((property) => property.active).length },
    ...(accessRole === "owner" ? {
      software: {
        plan: partner.software_plan,
        status: partner.subscription_status,
        active: partner.subscription_status === "active",
      },
    } : {}),
  };
}
