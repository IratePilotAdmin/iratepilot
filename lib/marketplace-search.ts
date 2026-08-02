import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { searchSchema } from "./validation";

export type MarketplaceDestinationCriteria = {
  destination: string;
};

export type MarketplaceStayCriteria = MarketplaceDestinationCriteria & {
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type MarketplaceSearchCriteria = MarketplaceDestinationCriteria | MarketplaceStayCriteria;

export type SearchFormValues = {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: string;
};

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type SearchableRoom = {
  active: boolean;
  base_rate: number;
  max_guests: number;
  inventory: Array<{
    stay_date: string;
    available_units: number;
    rate: number;
  }> | null;
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export function parseMarketplaceSearch(
  query: SearchParamsRecord,
  today = new Date(),
): { criteria: MarketplaceSearchCriteria | null; error: string | null; values: SearchFormValues } {
  const values = {
    destination: singleValue(query.destination).trim(),
    checkIn: singleValue(query.checkIn),
    checkOut: singleValue(query.checkOut),
    guests: singleValue(query.guests),
  };
  const attempted = Object.values(values).some(Boolean);
  if (!attempted) return { criteria: null, error: null, values };

  const stayValues = [values.checkIn, values.checkOut, values.guests];
  if (values.destination.length >= 2 && stayValues.every((value) => !value)) {
    return { criteria: { destination: values.destination }, error: null, values };
  }

  const parsed = searchSchema.safeParse(values);
  if (!parsed.success) {
    return { criteria: null, error: "Enter a destination, valid stay dates, and a guest count.", values };
  }

  const nights = differenceInCalendarDays(parseISO(parsed.data.checkOut), parseISO(parsed.data.checkIn));
  if (parsed.data.checkIn < format(startOfDay(today), "yyyy-MM-dd")) {
    return { criteria: null, error: "Check-in cannot be in the past.", values };
  }
  if (nights < 1 || nights > 30) {
    return { criteria: null, error: "Choose a stay between 1 and 30 nights.", values };
  }

  return { criteria: parsed.data, error: null, values };
}

export function hasStayCriteria(
  criteria: MarketplaceSearchCriteria | null,
): criteria is MarketplaceStayCriteria {
  return Boolean(criteria && "checkIn" in criteria);
}

export function matchesMarketplaceDestination(
  property: { name: string; city: string; country: string },
  destination: string,
) {
  const needle = destination.trim().toLocaleLowerCase();
  return [property.name, property.city, property.country]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

export function getAvailableRoomRates(
  rooms: SearchableRoom[] | null,
  criteria: MarketplaceStayCriteria,
) {
  const nights = differenceInCalendarDays(parseISO(criteria.checkOut), parseISO(criteria.checkIn));
  const requiredDates = Array.from({ length: nights }, (_, index) =>
    format(addDays(parseISO(criteria.checkIn), index), "yyyy-MM-dd"),
  );

  return (rooms ?? []).flatMap((room) => {
    if (!room.active || room.max_guests < criteria.guests) return [];
    const inventoryByDate = new Map((room.inventory ?? []).map((day) => [day.stay_date, day]));
    const stayInventory = requiredDates.map((date) => inventoryByDate.get(date));
    if (stayInventory.some((day) => !day || day.available_units < 1 || Number(day.rate) <= 0)) return [];

    const total = stayInventory.reduce((sum, day) => sum + Number(day!.rate), 0);
    return [Math.round((total / nights) * 100) / 100];
  });
}

export function getHotelSearchHref(slug: string, criteria: MarketplaceSearchCriteria | null) {
  if (!hasStayCriteria(criteria)) return `/hotels/${slug}`;
  const params = new URLSearchParams({
    checkIn: criteria.checkIn,
    checkOut: criteria.checkOut,
    guests: String(criteria.guests),
  });
  return `/hotels/${slug}?${params.toString()}`;
}
