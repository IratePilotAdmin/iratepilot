import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { searchSchema, staySchema } from "./validation";

export type MarketplaceDestinationCriteria = {
  destination: string;
};

export type StayCriteria = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type MarketplaceStayCriteria = MarketplaceDestinationCriteria & StayCriteria;

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

function validateStay<T extends StayCriteria>(
  parsed: { success: true; data: T } | { success: false },
  today: Date,
) {
  if (!parsed.success) return { criteria: null, error: "Enter valid stay dates and a guest count." };
  const nights = differenceInCalendarDays(parseISO(parsed.data.checkOut), parseISO(parsed.data.checkIn));
  if (parsed.data.checkIn < format(startOfDay(today), "yyyy-MM-dd")) {
    return { criteria: null, error: "Check-in cannot be in the past." };
  }
  if (nights < 1 || nights > 30) {
    return { criteria: null, error: "Choose a stay between 1 and 30 nights." };
  }
  return { criteria: parsed.data, error: null };
}

export function parseHotelStay(
  query: SearchParamsRecord,
  today = new Date(),
): { criteria: StayCriteria | null; error: string | null } {
  const values = {
    checkIn: singleValue(query.checkIn),
    checkOut: singleValue(query.checkOut),
    guests: singleValue(query.guests),
  };
  if (!Object.values(values).some(Boolean)) return { criteria: null, error: null };
  return validateStay(staySchema.safeParse(values), today);
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

  const stay = validateStay(parsed, today);
  return { ...stay, values };
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
  criteria: StayCriteria,
) {
  return getAvailableRooms(rooms, criteria).map((room) => room.averageNightlyRate);
}

export function getAvailableRooms<T extends SearchableRoom>(
  rooms: T[] | null,
  criteria: StayCriteria,
): Array<T & { averageNightlyRate: number }> {
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
    return [{ ...room, averageNightlyRate: Math.round((total / nights) * 100) / 100 }];
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
