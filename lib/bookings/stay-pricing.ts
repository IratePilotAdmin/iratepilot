import { calculateBookingQuote } from "../booking-quote";

type InventoryDay = {
  stay_date: string;
  available_units: number;
  rate: number;
};

export type StayPricingResult =
  | { ok: false; reason: "availability" | "pricing" }
  | { ok: true; subtotal: number; serviceFee: number; total: number };

export function calculateVerifiedStayPricing(
  inventory: InventoryDay[],
  nights: number,
  serviceFeeRate: number,
): StayPricingResult {
  const uniqueDates = new Set(inventory.map((day) => day.stay_date));
  if (inventory.length !== nights || uniqueDates.size !== nights) {
    return { ok: false, reason: "availability" };
  }
  if (inventory.some((day) => !Number.isFinite(Number(day.available_units)) || Number(day.available_units) < 1)) {
    return { ok: false, reason: "availability" };
  }

  const rates = inventory.map((day) => Number(day.rate));
  if (rates.some((rate) => !Number.isFinite(rate) || rate <= 0)) {
    return { ok: false, reason: "pricing" };
  }

  const quote = calculateBookingQuote(rates.reduce((sum, rate) => sum + rate, 0), serviceFeeRate);
  return { ok: true, ...quote };
}
