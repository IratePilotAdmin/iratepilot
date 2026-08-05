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

export type PricedInventory = DatedInventory & {
  available_units: number;
  rate: number;
};

export function summarizeSellableInventory<T extends PricedInventory>(
  inventory: T[] | null | undefined,
  today = getTodayIsoDate(),
) {
  const sellable = getUpcomingInventory(inventory, today)
    .filter((row) => Number(row.available_units) > 0);
  const rates = sellable.map((row) => Number(row.rate));

  return {
    sellableDates: sellable.length,
    totalUnits: sellable.reduce((total, row) => total + Number(row.available_units), 0),
    startDate: sellable[0]?.stay_date ?? null,
    endDate: sellable.at(-1)?.stay_date ?? null,
    minRate: rates.length ? Math.min(...rates) : null,
    maxRate: rates.length ? Math.max(...rates) : null,
  };
}
