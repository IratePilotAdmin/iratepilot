import { z } from "zod";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const iataSchema = z.string().regex(/^[A-Z]{3}$/);
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRealLocalDate(value: string) {
  if (!localDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const localDateSchema = z.string().refine(isRealLocalDate, "Use a valid YYYY-MM-DD date.");
const exactTravelerNameSchema = z.string().min(1).max(20).refine(
  (value) => value.trim() === value
    && !/[ÆæÞð]/u.test(value)
    && /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/u.test(value),
  "Use a supported traveler name.",
);

/** Narrow, adult-only traveler profile currently supported by the Duffel test contract. */
export const flightConsumerPreviewPassengerSchema = z.object({
  title: z.enum(["mr", "mrs", "ms", "miss", "dr"]),
  gender: z.enum(["m", "f"]),
  givenName: exactTravelerNameSchema,
  familyName: exactTravelerNameSchema,
  bornOn: localDateSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
}).strict();

export type FlightConsumerPreviewPassenger = z.infer<typeof flightConsumerPreviewPassengerSchema>;

export const flightConsumerPreviewSearchRequestSchema = z.object({
  origin: iataSchema,
  destination: iataSchema,
  departureDate: localDateSchema,
  returnDate: localDateSchema.nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  passengers: z.object({
    adults: z.number().int().min(1).max(9),
    children: z.literal(0),
    infantsInSeat: z.literal(0),
    infantsOnLap: z.literal(0),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.origin === value.destination) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "Origin and destination must differ." });
  }
  if (value.returnDate !== null && value.returnDate <= value.departureDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["returnDate"], message: "Return date must follow departure date." });
  }
});

export type FlightConsumerPreviewSearchRequest = z.infer<typeof flightConsumerPreviewSearchRequestSchema>;

/**
 * The client identifies the accepted durable reprice receipt but never supplies
 * an amount, currency, processor reference, card field, or provider credential.
 */
export const flightConsumerPreviewCheckoutRequestSchema = z.object({
  repriceReceiptId: uuidSchema,
  customerAcceptanceSha256: sha256Schema,
  passengers: z.array(flightConsumerPreviewPassengerSchema).min(1).max(9),
}).strict();

export type FlightConsumerPreviewCheckoutRequest = z.infer<typeof flightConsumerPreviewCheckoutRequestSchema>;
