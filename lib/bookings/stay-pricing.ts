import { calculateBookingQuote } from "../booking-quote";
import { inventoryLimits } from "../inventory-limits";

type InventoryDay = {
  stay_date: string;
  available_units: number;
  rate: number;
  direct_tax_amount?: number | null;
  direct_mandatory_fee_amount?: number | null;
};

export type StayPricingResult =
  | { ok: false; reason: "availability" | "pricing" }
  | { ok: true; baseSubtotal: number; memberDiscount: number; subtotal: number; taxes: number; mandatoryFees: number; serviceFee: number; amountDueNow: number; total: number };

export function calculateVerifiedStayPricing(
  inventory: InventoryDay[],
  nights: number,
  serviceFeeRate: number,
  memberDiscountRate = 0,
): StayPricingResult {
  const uniqueDates = new Set(inventory.map((day) => day.stay_date));
  if (inventory.length !== nights || uniqueDates.size !== nights) {
    return { ok: false, reason: "availability" };
  }
  if (inventory.some((day) => {
    const units = Number(day.available_units);
    return !Number.isFinite(units) || units < 1 || units > inventoryLimits.maxAvailableUnits;
  })) {
    return { ok: false, reason: "availability" };
  }

  const rates = inventory.map((day) => Number(day.rate));
  if (rates.some((rate) =>
    !Number.isFinite(rate)
    || rate < inventoryLimits.minNightlyRate
    || rate > inventoryLimits.maxNightlyRate
  )) {
    return { ok: false, reason: "pricing" };
  }

  const quote = calculateBookingQuote(
    rates.reduce((sum, rate) => sum + rate, 0),
    serviceFeeRate,
    memberDiscountRate,
  );
  const taxes = Math.round(inventory.reduce((sum, day) => sum + Number(day.direct_tax_amount ?? 0), 0) * 100) / 100;
  const mandatoryFees = Math.round(inventory.reduce((sum, day) => sum + Number(day.direct_mandatory_fee_amount ?? 0), 0) * 100) / 100;
  if (![taxes, mandatoryFees].every((amount) => Number.isFinite(amount) && amount >= 0)) {
    return { ok: false, reason: "pricing" };
  }
  return {
    ok: true,
    ...quote,
    taxes,
    mandatoryFees,
    amountDueNow: Math.round((quote.total + taxes) * 100) / 100,
    total: Math.round((quote.total + taxes + mandatoryFees) * 100) / 100,
  };
}
