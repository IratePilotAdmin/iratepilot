import { getPropertyReadiness, type PropertyReadinessInput } from "../property-readiness";

export type ContentQualityProperty = PropertyReadinessInput & {
  id: string;
  name: string;
  slug: string;
  type: string;
  star_rating: number;
  description: string | null;
  image_url: string | null;
  amenities: string[] | null;
  city: string;
  country: string;
  active: boolean;
  partners: { business_name?: string; status?: string } | null;
};

export function buildContentQuality(properties: ContentQualityProperty[], today?: string) {
  const items = properties.map((property) => {
    const readiness = getPropertyReadiness(property, today);
    const requirements = {
      approvedPartner: property.partners?.status === "approved",
      primaryPhoto: readiness.requirements.primaryPhoto,
      editorialDescription: (property.description?.trim().length || 0) >= 120,
      amenityCoverage: Array.isArray(property.amenities) && property.amenities.length >= 3,
      completeLocation: property.city.trim().length >= 2 && property.country.trim().length >= 2,
      activeRoom: readiness.requirements.activeRoom,
      futureInventory: readiness.requirements.futureInventory,
    };
    const labels: Record<keyof typeof requirements, string> = {
      approvedPartner: "approved partner",
      primaryPhoto: "safe primary photo",
      editorialDescription: "description of at least 120 characters",
      amenityCoverage: "at least 3 amenities",
      completeLocation: "complete location",
      activeRoom: "active room type",
      futureInventory: "future sellable inventory",
    };
    const missing = (Object.keys(requirements) as Array<keyof typeof requirements>)
      .filter((key) => !requirements[key])
      .map((key) => labels[key]);
    const completed = Object.values(requirements).filter(Boolean).length;
    return {
      id: property.id,
      name: property.name,
      slug: property.slug,
      type: property.type,
      starRating: property.star_rating,
      city: property.city,
      country: property.country,
      active: property.active,
      businessName: property.partners?.business_name || "Partner",
      score: Math.round(completed / Object.keys(requirements).length * 100),
      complete: missing.length === 0,
      missing,
      requirements,
    };
  }).sort((left, right) => Number(right.active && !right.complete) - Number(left.active && !left.complete) || left.score - right.score || left.name.localeCompare(right.name));

  return {
    summary: {
      total: items.length,
      published: items.filter((item) => item.active).length,
      highQuality: items.filter((item) => item.complete).length,
      publishedWithIssues: items.filter((item) => item.active && !item.complete).length,
    },
    items,
  };
}
