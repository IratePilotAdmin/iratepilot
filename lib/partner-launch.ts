export type PartnerLaunchProperty = {
  active: boolean;
  readiness: {
    requirements: {
      primaryPhoto: boolean;
      amenities: boolean;
      activeRoom: boolean;
      futureInventory: boolean;
    };
  };
};

export type PartnerLaunchStep = {
  key: "property" | "content" | "room" | "inventory" | "published";
  label: string;
  description: string;
  complete: boolean;
  href: string;
};

export function getPartnerLaunchProgress(properties: PartnerLaunchProperty[]) {
  const hasProperty = properties.length > 0;
  const hasContent = properties.some(({ readiness }) =>
    readiness.requirements.primaryPhoto && readiness.requirements.amenities
  );
  const hasRoom = properties.some(({ readiness }) => readiness.requirements.activeRoom);
  const hasInventory = properties.some(({ readiness }) => readiness.requirements.futureInventory);
  const hasPublishedProperty = properties.some(({ active }) => active);
  const steps: PartnerLaunchStep[] = [
    {
      key: "property",
      label: "Add your property",
      description: "Enter the hotel, resort, or vacation-home details.",
      complete: hasProperty,
      href: "/partner/properties"
    },
    {
      key: "content",
      label: "Add a photo and amenities",
      description: "Give travelers the information they need to evaluate the stay.",
      complete: hasContent,
      href: "/partner/properties"
    },
    {
      key: "room",
      label: "Create a room type",
      description: "Set guest capacity and the base nightly rate.",
      complete: hasRoom,
      href: "/partner/rates"
    },
    {
      key: "inventory",
      label: "Load future inventory",
      description: "Add sellable dates, available units, and nightly pricing.",
      complete: hasInventory,
      href: "/partner/rates"
    },
    {
      key: "published",
      label: "Complete administrator review",
      description: "A complete listing remains private until iRatePilot publishes it.",
      complete: hasPublishedProperty,
      href: "/partner/properties"
    }
  ];
  const completed = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete) ?? null;

  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    nextStep,
    publishedCount: properties.filter((property) => property.active).length
  };
}
