/**
 * Conservative, explainable demand-forecast foundation.
 *
 * Callers must provide a complete property-scoped set of historical final
 * outcomes and snapshots captured at the same booking lead time. This module
 * never changes rates or treats missing history as zero demand.
 */
export type DemandPaceComparable = {
  tenantId: string;
  propertyId: string;
  stayDate: string;
  roomTypeId: string;
  currency: string;
  leadDays: number;
  bookedUnitsAtLead: number;
  effectiveCapacity: number;
  finalOccupiedUnits: number;
  finalAccommodationMinor: number | null;
};

export type DemandForecastInput = {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  currency: string;
  stayDate: string;
  asOfDate: string;
  leadDays: number;
  bookedUnits: number;
  effectiveCapacity: number;
  bookedAccommodationMinor: number | null;
  comparables: DemandPaceComparable[];
  events?: DemandForecastAdjustment[] | null;
  seasonality?: DemandForecastAdjustment[] | null;
};

/** Manager-entered context. It is not imported event or market data. */
export type DemandForecastAdjustment = {
  label: string;
  startDate: string;
  endDate: string;
  adjustmentBasisPoints: number;
};

export type DemandForecast =
  | { available: false; reason: string }
  | {
      available: true;
      tenantId: string;
      propertyId: string;
      roomTypeId: string;
      currency: string;
      stayDate: string;
      asOfDate: string;
      leadDays: number;
      bookedUnits: number;
      effectiveCapacity: number;
      forecastOccupiedUnits: number;
      forecastOccupancyPercent: number;
      forecastAdrMinor: number | null;
      forecastAccommodationMinor: number | null;
      comparableCount: number;
      confidence: 'low' | 'medium' | 'high';
      method: 'same-weekday-same-lead-pace-v2';
      appliedDemandAdjustments: Array<{
        kind: 'event' | 'seasonality';
        label: string;
        startDate: string;
        endDate: string;
        adjustmentBasisPoints: number;
      }>;
      explanations: string[];
      limitations: string[];
    };

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const isCount = (value: unknown, max = 100_000): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const validMinor = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER);
const hasControlText = (value: string) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
};
function validAdjustment(value: DemandForecastAdjustment, stayDate: string): boolean {
  return typeof value === 'object' &&
    typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 120 && !hasControlText(value.label) &&
    isDate(value.startDate) && isDate(value.endDate) && value.startDate <= value.endDate &&
    value.startDate <= stayDate && stayDate <= value.endDate &&
    Number.isSafeInteger(value.adjustmentBasisPoints) && value.adjustmentBasisPoints >= -5_000 && value.adjustmentBasisPoints <= 10_000;
}
const day = (value: string) => new Date(`${value}T00:00:00Z`).getUTCDay();
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const round = (value: number) => Math.round(value);

function validContext(input: DemandForecastInput): boolean {
  return [input.tenantId, input.propertyId, input.roomTypeId].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200) &&
    /^[A-Z]{3}$/.test(input.currency) && isDate(input.stayDate) && isDate(input.asOfDate) &&
    input.stayDate > input.asOfDate && isCount(input.leadDays, 365) &&
    input.leadDays === Math.round((Date.parse(input.stayDate) - Date.parse(input.asOfDate)) / 86_400_000) &&
    isCount(input.bookedUnits) && isCount(input.effectiveCapacity, 100_000) && input.effectiveCapacity > 0 &&
    input.bookedUnits <= input.effectiveCapacity && validMinor(input.bookedAccommodationMinor) &&
    (input.events == null || Array.isArray(input.events) && input.events.length <= 25 && input.events.every(value => validAdjustment(value, input.stayDate))) &&
    (input.seasonality == null || Array.isArray(input.seasonality) && input.seasonality.length <= 12 && input.seasonality.every(value => validAdjustment(value, input.stayDate))) &&
    Array.isArray(input.comparables) && input.comparables.length <= 366;
}

function validComparable(row: DemandPaceComparable, input: DemandForecastInput): boolean {
  return !!row && row.tenantId === input.tenantId && row.propertyId === input.propertyId &&
    isDate(row.stayDate) && row.stayDate < input.asOfDate && day(row.stayDate) === day(input.stayDate) &&
    row.roomTypeId === input.roomTypeId && row.currency === input.currency &&
    isCount(row.leadDays, 365) && row.leadDays === input.leadDays &&
    isCount(row.bookedUnitsAtLead) && isCount(row.effectiveCapacity, 100_000) && row.effectiveCapacity > 0 &&
    row.bookedUnitsAtLead <= row.effectiveCapacity && isCount(row.finalOccupiedUnits) &&
    row.finalOccupiedUnits <= row.effectiveCapacity && validMinor(row.finalAccommodationMinor);
}

/**
 * Projects final occupied units from the historical same-weekday pickup curve:
 * current on-books occupancy plus the median comparable pickup after the same
 * lead day, scaled by current pace versus the comparable median pace.
 */
export function forecastDemand(input: DemandForecastInput): DemandForecast {
  const unavailable = (reason: string): DemandForecast => ({ available: false, reason });
  if (!validContext(input)) throw Error('Demand-forecast inputs are invalid or incomplete.');
  if (new Set(input.comparables.map(row => row?.stayDate)).size !== input.comparables.length) {
    throw Error('Demand-forecast comparables contain duplicate stay dates.');
  }
  if (input.comparables.some(row => !validComparable(row, input))) {
    throw Error('Demand-forecast comparables do not match the property, room type, weekday, currency, and lead time.');
  }
  if (input.comparables.length < 3) return unavailable('At least 3 complete same-weekday, same-room-type historical comparables at the same booking lead time are required.');

  const currentPace = input.bookedUnits / input.effectiveCapacity;
  const historicalPaces = input.comparables.map(row => row.bookedUnitsAtLead / row.effectiveCapacity);
  const historicalFinals = input.comparables.map(row => row.finalOccupiedUnits / row.effectiveCapacity);
  const historicalPickup = median(input.comparables.map((row, index) => Math.max(0, historicalFinals[index]! - historicalPaces[index]!)));
  const referencePace = median(historicalPaces);
  // When the reference pace is zero, do not invent a multiplier for new pickup.
  const paceFactor = referencePace > 0 ? Math.min(3, currentPace / referencePace) : currentPace === 0 ? 1 : null;
  if (paceFactor === null) return unavailable('Comparable bookings were zero at this lead time, so current pickup cannot be projected reliably.');

  const adjustments = [
    ...(input.events ?? []).map(adjustment => ({ kind: 'event' as const, ...adjustment })),
    ...(input.seasonality ?? []).map(adjustment => ({ kind: 'seasonality' as const, ...adjustment })),
  ];
  const uncappedAdjustmentMultiplier = adjustments.reduce((factor, adjustment) => factor * (1 + adjustment.adjustmentBasisPoints / 10_000), 1);
  const adjustmentMultiplier = Math.min(3, Math.max(0.25, uncappedAdjustmentMultiplier));
  const adjustedPickup = historicalPickup * paceFactor * adjustmentMultiplier;
  const projectedOccupancy = Math.min(1, currentPace + adjustedPickup);
  const forecastOccupiedUnits = Math.min(input.effectiveCapacity, Math.max(input.bookedUnits, round(projectedOccupancy * input.effectiveCapacity)));
  const knownHistoricalRates = input.comparables.flatMap(row => row.finalOccupiedUnits > 0 && row.finalAccommodationMinor !== null
    ? [row.finalAccommodationMinor / row.finalOccupiedUnits] : []);
  const bookedAdr = input.bookedUnits > 0 && input.bookedAccommodationMinor !== null
    ? input.bookedAccommodationMinor / input.bookedUnits : null;
  const forecastAdrMinor = bookedAdr ?? (knownHistoricalRates.length ? median(knownHistoricalRates) : null);
  const forecastAccommodationMinor = forecastAdrMinor === null ? null : round(forecastAdrMinor * forecastOccupiedUnits);
  const confidence = input.comparables.length >= 10 ? 'high' : input.comparables.length >= 5 ? 'medium' : 'low';

  return {
    available: true,
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    roomTypeId: input.roomTypeId,
    currency: input.currency,
    stayDate: input.stayDate,
    asOfDate: input.asOfDate,
    leadDays: input.leadDays,
    bookedUnits: input.bookedUnits,
    effectiveCapacity: input.effectiveCapacity,
    forecastOccupiedUnits,
    forecastOccupancyPercent: round(forecastOccupiedUnits * 10_000 / input.effectiveCapacity) / 100,
    forecastAdrMinor: forecastAdrMinor === null ? null : round(forecastAdrMinor),
    forecastAccommodationMinor,
    comparableCount: input.comparables.length,
    confidence,
    method: 'same-weekday-same-lead-pace-v2',
    appliedDemandAdjustments: adjustments,
    explanations: [
      `Current pace is ${(currentPace * 100).toFixed(1)}% booked at ${input.leadDays} days before arrival.`,
      `Comparable historical pickup after this lead time is ${(historicalPickup * 100).toFixed(1)} percentage points; the pace factor is ${paceFactor.toFixed(2)}×, capped at 3.00×.`,
      adjustments.length
        ? `Projected future pickup also applies manager-entered ${adjustments.map(item => `${item.kind} “${item.label}” ${item.adjustmentBasisPoints >= 0 ? '+' : ''}${(item.adjustmentBasisPoints / 100).toFixed(1)}%`).join(' and ')}; combined pickup multiplier is ${adjustmentMultiplier.toFixed(2)}× after a 0.25×–3.00× safety bound.`
        : 'No event or seasonal adjustment was supplied; the forecast uses the historical pickup baseline.',
      `Projected occupied rooms are capped at the ${input.effectiveCapacity} currently sellable rooms.`,
      forecastAdrMinor === null ? 'Accommodation value is unavailable because neither current booked value nor comparable ADR is complete.' : `ADR uses ${bookedAdr === null ? 'the median known comparable final ADR' : 'current known on-books accommodation ADR'}; accommodation value is a forecast, not earned revenue or collected cash.`,
    ],
    limitations: [
      'This is a deterministic baseline, not an AI-trained model. It uses same-weekday historical pickup at one matching lead time. Event and seasonality adjustments are explicit manager-entered factors, not imported calendars or verified market data; competitor prices, cancellations, stay length, and broader market demand are not modeled.',
      'Comparables must be complete and property-scoped. Review forecast error against closed actuals before operational or pricing use.',
      'This forecast never changes a rate, inventory, or reservation.',
    ],
  };
}
