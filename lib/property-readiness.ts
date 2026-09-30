import { isSafePropertyImageUrl } from "./property-image";

export type PropertyReadinessInput = {
  image_url?: string | null;
  amenities?: unknown;
  rooms?: Array<{
    active?: boolean | null;
    base_rate?: number | string | null;
    max_guests?: number | null;
    direct_rate_plan_code?: string | null;
    direct_rate_plan_name?: string | null;
    direct_currency_code?: string | null;
    direct_cancellation_policy?: string | null;
    direct_cancellation_policy_version?: string | null;
    inventory?: Array<{
      stay_date?: string | null;
      available_units?: number | null;
      rate?: number | string | null;
      direct_tax_amount?: number | string | null;
      direct_mandatory_fee_amount?: number | string | null;
    }> | null;
  }> | null;
};

export type PropertyReadiness = {
  ready: boolean;
  requirements: {
    primaryPhoto: boolean;
    amenities: boolean;
    activeRoom: boolean;
    roomCommercialTerms: boolean;
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
  const roomCommercialTerms = activeRooms.length > 0 && activeRooms.every((room) => {
    const baseRate = Number(room.base_rate);
    return Number.isFinite(baseRate) && baseRate >= 25 && baseRate <= 25_000
      && Number.isInteger(room.max_guests) && room.max_guests! >= 1 && room.max_guests! <= 30
      && Boolean(room.direct_rate_plan_code?.trim())
      && Boolean(room.direct_rate_plan_name?.trim())
      && room.direct_currency_code === "USD"
      && (room.direct_cancellation_policy?.trim().length ?? 0) >= 10
      && Boolean(room.direct_cancellation_policy_version?.trim());
  });
  const requirements = {
    primaryPhoto: isSafePropertyImageUrl(property.image_url),
    amenities: Array.isArray(property.amenities) && property.amenities.length > 0,
    activeRoom: activeRooms.length > 0,
    roomCommercialTerms,
    futureInventory: activeRooms.length > 0 && activeRooms.every((room) =>
      (room.inventory ?? []).some(
        (inventory) => {
          const rate = Number(inventory.rate);
          const taxes = Number(inventory.direct_tax_amount);
          const fees = Number(inventory.direct_mandatory_fee_amount);
          return Boolean(inventory.stay_date)
            && inventory.stay_date! >= today
            && Number.isInteger(inventory.available_units)
            && inventory.available_units! >= 1 && inventory.available_units! <= 500
            && Number.isFinite(rate) && rate >= 25 && rate <= 25_000
            && inventory.direct_tax_amount !== null && inventory.direct_tax_amount !== undefined
            && Number.isFinite(taxes) && taxes >= 0 && taxes <= 25_000
            && inventory.direct_mandatory_fee_amount !== null && inventory.direct_mandatory_fee_amount !== undefined
            && Number.isFinite(fees) && fees >= 0 && fees <= 25_000;
        }
      )
    )
  };

  const labels: Record<keyof typeof requirements, string> = {
    primaryPhoto: "primary photo",
    amenities: "amenities",
    activeRoom: "active room type",
    roomCommercialTerms: "rate plans, currency, and cancellation terms for every active room",
    futureInventory: "future sellable inventory with rates, taxes, and mandatory fees for every active room"
  };
  const missing = (Object.keys(requirements) as Array<keyof typeof requirements>)
    .filter((requirement) => !requirements[requirement])
    .map((requirement) => labels[requirement]);

  return { ready: missing.length === 0, requirements, missing };
}
