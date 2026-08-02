import { differenceInCalendarDays, parseISO } from "date-fns";

export type DatedInventory = { stay_date: string };

export function getTodayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function getInventoryDateRangeError(
  startDate: string,
  endDate: string,
  today = getTodayIsoDate(),
) {
  if (startDate < today) return "Inventory start date cannot be in the past.";
  const days = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
  if (days < 0 || days > 365) return "Inventory ranges must be between 1 and 366 days.";
  return null;
}

export function getUpcomingInventory<T extends DatedInventory>(
  inventory: T[] | null | undefined,
  today = getTodayIsoDate(),
) {
  return (inventory ?? [])
    .filter((row) => row.stay_date >= today)
    .slice()
    .sort((a, b) => a.stay_date.localeCompare(b.stay_date));
}
