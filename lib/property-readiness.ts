import { isSafePropertyImageUrl } from "./property-image";

export type PropertyReadinessInput = {
  image_url?: string | null;
  amenities?: unknown;
  rooms?: Array<{
    active?: boolean | null;
    base_rate?: number | null;
    max_guests?: number | null;
    direct_rate_plan_code?: string | null;
    direct_rate_plan_name?: string | null;
    direct_currency_code?: string | null;
    direct_cancellation_policy?: string | null;
    direct_cancellation_policy_version?: string | null;
    inventory?: Array<{
      stay_date?: string | null;
      available_units?: number | null;
      rate?: number | null;
      direct_tax_amount?: number | null;
      direct_mandatory_fee_amount?: number | null;
    }> | null;
  }> | null;
};

export type PropertyReadiness = {
  ready: boolean;
  requirements: {
    primaryPhoto: boolean;
    amenities: boolean;
    activeRoom: boolean;
    roomTerms: boolean;
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
  const hasRoomTerms = (room: NonNullable<PropertyReadinessInput["rooms"]>[number]) =>
    Number(room.base_rate) >= 25 &&
    Number(room.base_rate) <= 25000 &&
    Number(room.max_guests) >= 1 &&
    Number(room.max_guests) <= 30 &&
    Boolean(room.direct_rate_plan_code?.trim()) &&
    Boolean(room.direct_rate_plan_name?.trim()) &&
    room.direct_currency_code === "USD" &&
    (room.direct_cancellation_policy?.trim().length ?? 0) >= 10 &&
    Boolean(room.direct_cancellation_policy_version?.trim());
  const hasFutureInventory = (room: NonNullable<PropertyReadinessInput["rooms"]>[number]) =>
    (room.inventory ?? []).some(
      (inventory) =>
        Boolean(inventory.stay_date) &&
        inventory.stay_date! >= today &&
        Number(inventory.available_units) >= 1 &&
        Number(inventory.available_units) <= 500 &&
        Number(inventory.rate) >= 25 &&
        Number(inventory.rate) <= 25000 &&
        inventory.direct_tax_amount != null &&
        Number(inventory.direct_tax_amount) >= 0 &&
        Number(inventory.direct_tax_amount) <= 25000 &&
        inventory.direct_mandatory_fee_amount != null &&
        Number(inventory.direct_mandatory_fee_amount) >= 0 &&
        Number(inventory.direct_mandatory_fee_amount) <= 25000
    );
  const requirements = {
    primaryPhoto: isSafePropertyImageUrl(property.image_url),
    amenities: Array.isArray(property.amenities) && property.amenities.length > 0,
    activeRoom: activeRooms.length > 0,
    roomTerms: activeRooms.length > 0 && activeRooms.every(hasRoomTerms),
    futureInventory: activeRooms.length > 0 && activeRooms.every(hasFutureInventory),
  };

  const labels: Record<keyof typeof requirements, string> = {
    primaryPhoto: "primary photo",
    amenities: "amenities",
    activeRoom: "active room type",
    roomTerms: "room rate-plan and cancellation terms",
    futureInventory: "future sellable inventory with taxes and mandatory fees"
  };
  const missing = (Object.keys(requirements) as Array<keyof typeof requirements>)
    .filter((requirement) => !requirements[requirement])
    .map((requirement) => labels[requirement]);

  return { ready: missing.length === 0, requirements, missing };
}
