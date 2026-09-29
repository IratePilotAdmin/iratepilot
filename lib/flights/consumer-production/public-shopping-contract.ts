import { z } from "zod";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime())
      && parsed.toISOString().slice(0, 10) === value;
  },
  "A valid ISO local date is required.",
);

export const flightConsumerProductionPublicShoppingSearchSchema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departureDate: localDateSchema,
  returnDate: localDateSchema.nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  adults: z.number().int().min(1).max(4),
}).strict().superRefine((value, context) => {
  if (value.origin === value.destination) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: "Origin and destination must differ.",
    });
  }
  if (value.returnDate !== null && value.returnDate <= value.departureDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returnDate"],
      message: "Return date must follow departure date.",
    });
  }
});

export type FlightConsumerProductionPublicShoppingSearch = z.output<
  typeof flightConsumerProductionPublicShoppingSearchSchema
>;

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET = Object.freeze({
  subjectMinute: 2,
  subjectDay: 10,
  cohortMinute: 10,
  cohortDay: 100,
  globalMinute: 20,
  globalDay: 250,
  claimTtlSeconds: 60,
} as const);

function utcDateAtOffset(now: Date, offsetDays: number) {
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + offsetDays,
  ));
  return date.toISOString().slice(0, 10);
}

export function validateFlightConsumerProductionPublicShoppingTravelWindow(
  search: FlightConsumerProductionPublicShoppingSearch,
  now: Date = new Date(),
) {
  if (!Number.isFinite(now.getTime())) return false;
  const earliestDeparture = utcDateAtOffset(now, 1);
  const latestTravelDate = utcDateAtOffset(now, 330);
  return search.departureDate >= earliestDeparture
    && search.departureDate <= latestTravelDate
    && (search.returnDate === null || search.returnDate <= latestTravelDate);
}

export function canonicalFlightConsumerProductionPublicShoppingSearchJson(
  search: FlightConsumerProductionPublicShoppingSearch,
) {
  return JSON.stringify({
    adults: search.adults,
    cabin: search.cabin,
    departureDate: search.departureDate,
    destination: search.destination,
    origin: search.origin,
    returnDate: search.returnDate,
  });
}
