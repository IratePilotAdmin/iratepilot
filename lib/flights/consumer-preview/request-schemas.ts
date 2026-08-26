import { z } from "zod";

import { flightConsumerPreviewFictionalTravelerDisclosuresSchema } from "./fictional-travelers";
import { flightConsumerPreviewSearchRequestSchema } from "./schemas";

const uuidSchema = z.string().uuid();

export const flightConsumerPreviewSearchUiRequestSchema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  travelerCount: z.number().int().min(1).max(4),
}).strict().transform((value, context) => {
  const parsed = flightConsumerPreviewSearchRequestSchema.safeParse({
    origin: value.origin,
    destination: value.destination,
    departureDate: value.departureDate,
    returnDate: value.returnDate,
    cabin: value.cabin,
    passengers: {
      adults: value.travelerCount,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0,
    },
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
    return z.NEVER;
  }
  return parsed.data;
});

export const flightConsumerPreviewAcceptOfferRequestSchema = z.object({
  searchId: uuidSchema,
  confirmedRepriceReceiptId: uuidSchema.optional(),
  confirmChangedPrice: z.literal(true).optional(),
}).strict().superRefine((value, context) => {
  if ((value.confirmedRepriceReceiptId === undefined) !== (value.confirmChangedPrice === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Changed-price confirmation must identify the exact reprice receipt.",
    });
  }
});

export const flightConsumerPreviewPreparePaymentRequestSchema = z.object({
  travelers: flightConsumerPreviewFictionalTravelerDisclosuresSchema,
}).strict();

export const flightConsumerPreviewCompleteOrderRequestSchema = z.object({
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]{8,252}$/),
}).strict();

export function validateFlightConsumerPreviewTravelWindow(
  departureDate: string,
  returnDate: string | null,
  now = new Date(),
) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const departure = Date.parse(`${departureDate}T00:00:00.000Z`);
  const returning = returnDate === null ? null : Date.parse(`${returnDate}T00:00:00.000Z`);
  const earliest = todayUtc + 24 * 60 * 60 * 1_000;
  const latest = todayUtc + 330 * 24 * 60 * 60 * 1_000;
  return Number.isFinite(departure)
    && departure >= earliest
    && departure <= latest
    && (returning === null || (Number.isFinite(returning) && returning > departure && returning <= latest));
}
