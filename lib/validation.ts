import { z } from "zod";
import { inventoryLimits } from "./inventory-limits";
import { isSafePropertyImageUrl } from "./property-image";

export const staySchema = z.object({
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20)
});

export const searchSchema = staySchema.extend({
  destination: z.string().trim().min(2).max(160)
});

export const bookingSchema = z.object({
  hotelSlug: z.string().min(1),
  roomId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20)
});

export const partnerApplicationSchema = z.object({
  propertyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  propertyType: z.enum(["hotel", "resort", "vacation_home"])
});

export const checkoutSchema = z.object({
  hotelSlug: z.string().min(1),
  roomId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20)
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  message: z.string().trim().min(10).max(3000)
});

export const bookingMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export const reservationReviewSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    decision: z.literal("reject"),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export const propertyContentSchema = z.object({
  description: z.string().trim().min(120).max(4000),
  imageUrl: z.string().url().max(2000).refine(isSafePropertyImageUrl, "Use an HTTPS image URL without embedded credentials."),
  amenities: z.array(z.string().trim().min(2).max(80)).min(1).max(20)
});

export const propertySchema = z.object({
  name: z.string().trim().min(3).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  type: z.enum(["hotel", "resort", "vacation_home"]),
  starRating: z.coerce.number().int().refine((value) => value === 4 || value === 5, "Only 4- and 5-star properties are accepted."),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().min(2).max(100)
}).merge(propertyContentSchema);

const pmsMappingSchema = z.string().trim().max(4000).refine((value) => {
  if (!value) return true;
  const normalized = value.toLowerCase().replace(/[’']/g, "'");
  return ![
    "hotelkey's applicable codes",
    "your policy name mapped to its hotelkey code",
  ].includes(normalized);
}, "Replace example or placeholder text with verified PMS mapping codes.");

export const pmsConnectionSchema = z.object({
  propertyId: z.string().uuid(),
  providerId: z.enum([
    "oracle-opera", "hilton-pep", "hilton-onq", "marriott-fosse",
    "marriott-fs-pms", "hotelkey", "oracle-opera-5", "infor-hms",
    "agilysys-pms", "planet-protel", "mews", "stayntouch", "cloudbeds",
    "sihot", "rms-cloud", "maestro-pms", "apaleo", "shiji-pms",
    "guestline", "ezee-absolute", "clock-pms-plus", "hotelogix",
  ]),
  externalPropertyCode: z.string().trim().min(1).max(120),
  hotelAuthorized: z.boolean(),
  roomTypeMapping: pmsMappingSchema,
  ratePlanMapping: pmsMappingSchema,
  taxFeeMapping: pmsMappingSchema,
  cancellationPolicyMapping: pmsMappingSchema,
});

export const synxisOnboardingRequestSchema = z.object({
  propertyId: z.string().uuid(),
  synxisHotelId: z.string().trim().min(1).max(120)
    .regex(/^[A-Za-z0-9._:/-]+$/, "Use the non-secret Hotel ID assigned by Sabre."),
  requesterRole: z.enum([
    "hotel_owner",
    "general_manager",
    "revenue_manager",
    "sales_manager",
  ]),
  hotelAuthorized: z.boolean().refine(
    (authorized) => authorized,
    "Hotel authorization is required before requesting SynXis onboarding.",
  ),
});

const roomFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  maxGuests: z.coerce.number().int().min(inventoryLimits.minGuests).max(inventoryLimits.maxGuests),
  baseRate: z.coerce.number().min(inventoryLimits.minNightlyRate).max(inventoryLimits.maxNightlyRate)
});

export const roomSchema = roomFieldsSchema.extend({
  propertyId: z.string().uuid(),
});

export const roomUpdateSchema = roomFieldsSchema.extend({
  roomId: z.string().uuid(),
  active: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean(),
  ),
});

export const inventorySchema = z.object({
  roomId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  availableUnits: z.coerce.number().int().min(inventoryLimits.minAvailableUnits).max(inventoryLimits.maxAvailableUnits),
  rate: z.coerce.number().min(inventoryLimits.minNightlyRate).max(inventoryLimits.maxNightlyRate)
});

