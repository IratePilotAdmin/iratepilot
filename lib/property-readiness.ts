import { isSafeRemoteImageUrl } from "./property-images";

export type PropertyReadinessInput = {
  image_url?: string | null;
  amenities?: unknown;
  rooms?: Array<{
    active?: boolean | null;
    inventory?: Array<{
      stay_date?: string | null;
      available_units?: number | null;
    }> | null;
  }> | null;
};

export type PropertyReadiness = {
  ready: boolean;
  requirements: {
    primaryPhoto: boolean;
    amenities: boolean;
    activeRoom: boolean;
    futureInventory: boolean;
  };
  missing: string[];
};

export function getPropertyReadiness(
  property: PropertyReadinessInput,
  today = new Date().toISOString().slice(0, 10)
): PropertyReadiness {
  const rooms = property.rooms ?? [];
  const activeRooms = rooms.filter((room) => room.active === true);
  const requirements = {
    primaryPhoto: isSafeRemoteImageUrl(property.image_url),
    amenities: Array.isArray(property.amenities) && property.amenities.length > 0,
    activeRoom: activeRooms.length > 0,
    futureInventory: activeRooms.some((room) =>
      (room.inventory ?? []).some(
        (inventory) =>
          Boolean(inventory.stay_date) &&
          inventory.stay_date! >= today &&
          Number(inventory.available_units) > 0
      )
    )
  };

  const labels: Record<keyof typeof requirements, string> = {
    primaryPhoto: "primary photo",
    amenities: "amenities",
    activeRoom: "active room type",
    futureInventory: "future sellable inventory"
  };
  const missing = (Object.keys(requirements) as Array<keyof typeof requirements>)
    .filter((requirement) => !requirements[requirement])
    .map((requirement) => labels[requirement]);

  return { ready: missing.length === 0, requirements, missing };
}
