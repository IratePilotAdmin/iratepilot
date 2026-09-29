import { z } from "zod";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().datetime({ offset: true });
const localInstantSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
);
const timeZoneSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_+.\-/]+$/);
const carrierCodeSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const carrierNameSchema = z.string().min(2).max(120).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
);

export const flightConsumerProductionPublicOfferSegmentSchema = z.object({
  sliceSequence: z.number().int().min(1).max(2),
  segmentSequence: z.number().int().min(1).max(4),
  journeyDirection: z.enum(["outbound", "return"]),
  originIata: z.string().regex(/^[A-Z]{3}$/),
  destinationIata: z.string().regex(/^[A-Z]{3}$/),
  departingAtLocal: localInstantSchema,
  arrivingAtLocal: localInstantSchema,
  originTimeZone: timeZoneSchema,
  destinationTimeZone: timeZoneSchema,
  marketingCarrierName: carrierNameSchema,
  marketingCarrierIataCode: carrierCodeSchema,
  operatingCarrierName: carrierNameSchema,
  operatingCarrierIataCode: carrierCodeSchema,
  marketingFlightNumber: z.string().regex(/^[A-Z0-9]{1,4}$/),
  durationMinutes: z.number().int().min(1).max(2_160),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
}).strict().superRefine((value, context) => {
  if (value.originIata === value.destinationIata) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationIata"],
      message: "A projected segment must change airports.",
    });
  }
  if (
    (value.sliceSequence === 1 && value.journeyDirection !== "outbound")
    || (value.sliceSequence === 2 && value.journeyDirection !== "return")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["journeyDirection"],
      message: "Journey direction must match the slice sequence.",
    });
  }
});

export const flightConsumerProductionPublicOfferTermsSchema = z.object({
  changeable: z.boolean(),
  refundable: z.boolean(),
  changePenaltyAmountMinor: z.number().int().nonnegative().nullable(),
  refundPenaltyAmountMinor: z.number().int().nonnegative().nullable(),
  termsSummarySha256: sha256Schema,
}).strict().superRefine((value, context) => {
  if (value.changeable !== true && value.changePenaltyAmountMinor !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changePenaltyAmountMinor"],
      message: "Only an allowed change may expose an exact penalty.",
    });
  }
  if (value.refundable !== true && value.refundPenaltyAmountMinor !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refundPenaltyAmountMinor"],
      message: "Only an allowed refund may expose an exact penalty.",
    });
  }
});

export const flightConsumerProductionPublicOfferProjectionSchema = z.object({
  localOfferId: uuidSchema,
  displayRank: z.number().int().min(1).max(25),
  providerCode: z.literal("duffel"),
  owner: z.object({
    name: carrierNameSchema,
    iataCode: carrierCodeSchema.nullable(),
  }).strict(),
  price: z.object({
    currency: z.literal("USD"),
    baseAmountMinor: z.number().int().nonnegative().max(99_999_999),
    taxAmountMinor: z.number().int().nonnegative().max(99_999_999),
    totalAmountMinor: z.number().int().positive().max(99_999_999),
  }).strict().superRefine((value, context) => {
    if (value.baseAmountMinor + value.taxAmountMinor !== value.totalAmountMinor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalAmountMinor"],
        message: "The projected total must equal base plus tax.",
      });
    }
  }),
  passengerIdentityDocumentsRequired: z.literal(false),
  requiresInstantPayment: z.literal(true),
  offerExpiresAt: instantSchema,
  presentationExpiresAt: instantSchema,
  terms: flightConsumerProductionPublicOfferTermsSchema,
  segments: z.array(flightConsumerProductionPublicOfferSegmentSchema).min(1).max(4),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.presentationExpiresAt) > Date.parse(value.offerExpiresAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["presentationExpiresAt"],
      message: "Presentation cannot outlive the provider offer.",
    });
  }
  const sequences = value.segments.map((segment) => segment.segmentSequence);
  if (sequences.some((sequence, index) => sequence !== index + 1)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segments"],
      message: "Projected segments must be globally contiguous.",
    });
  }
});

export const flightConsumerProductionPublicOfferProjectionBatchSchema = z.object({
  version: z.literal("flight-consumer-production-public-offer-projection-batch-v1"),
  admissionId: uuidSchema,
  projectionBatchSha256: sha256Schema,
  offers: z.array(flightConsumerProductionPublicOfferProjectionSchema).max(25),
  sourceOfferCount: z.number().int().min(0).max(1_000),
  refusedOfferCount: z.number().int().min(0).max(1_000),
  observedAt: instantSchema,
  rawProviderReferencesExposed: z.literal(false),
  providerDispatchAuthorized: z.literal(false),
  consumerExposureAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  stripeDispatchAuthorized: z.literal(false),
  bookingAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  settlementAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  servicingAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  blindRetryAuthorized: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.offers.length + value.refusedOfferCount !== value.sourceOfferCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceOfferCount"],
      message: "Every source offer must have one disposition.",
    });
  }
});

export type FlightConsumerProductionPublicOfferProjection = z.output<
  typeof flightConsumerProductionPublicOfferProjectionSchema
>;
export type FlightConsumerProductionPublicOfferProjectionBatch = z.output<
  typeof flightConsumerProductionPublicOfferProjectionBatchSchema
>;
