import { z } from "zod";
import { isSafePropertyImageUrl } from "../property-image";

export const HOTEL_PARTNER_DISCLOSURE_VERSION = "hotel_partner_fee_disclosure_13_3_2026-08-22_v1";

export type HotelPartnerApplicationCompleteness = {
  star_rating: number | null;
  contact_role: string | null;
  phone: string | null;
  website_url: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  description: string | null;
  amenities: string[] | null;
  photo_source_url: string | null;
  hotel_authorized: boolean;
  content_rights_confirmed: boolean;
  information_accurate: boolean;
  commercial_terms_acknowledged: boolean;
  commercial_terms_version_acknowledged: string | null;
};

/** Excludes incomplete legacy records from the real hotel acquisition funnel. */
export function isCompleteHotelPartnerApplication(
  application: HotelPartnerApplicationCompleteness,
) {
  return Boolean(
    (application.star_rating === 4 || application.star_rating === 5)
    && application.contact_role
    && application.phone
    && application.website_url
    && application.address_line1
    && application.city
    && application.postal_code
    && application.country
    && application.description
    && application.amenities?.length
    && application.photo_source_url
    && application.hotel_authorized
    && application.content_rights_confirmed
    && application.information_accurate
    && application.commercial_terms_acknowledged
    && application.commercial_terms_version_acknowledged === HOTEL_PARTNER_DISCLOSURE_VERSION,
  );
}

const campaignLabel = (max: number) => z.string().trim().min(1).max(max)
  .regex(/^[^\u0000-\u001f\u007f]*$/, "Campaign labels cannot contain control characters.");

export const partnerAcquisitionAttributionSchema = z.object({
  source: campaignLabel(64).optional(),
  medium: campaignLabel(64).optional(),
  campaign: campaignLabel(128).optional(),
  content: campaignLabel(128).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one campaign label is required.");

export function readPartnerAcquisitionAttribution(search: string) {
  const query = new URLSearchParams(search);
  const candidate = Object.fromEntries([
    ["source", query.get("utm_source")],
    ["medium", query.get("utm_medium")],
    ["campaign", query.get("utm_campaign")],
    ["content", query.get("utm_content")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])));
  const parsed = partnerAcquisitionAttributionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function partnerRegistrationNextPath(attribution?: PartnerAcquisitionAttribution) {
  const query = new URLSearchParams({ setup: "1" });
  if (attribution?.source) query.set("utm_source", attribution.source);
  if (attribution?.medium) query.set("utm_medium", attribution.medium);
  if (attribution?.campaign) query.set("utm_campaign", attribution.campaign);
  if (attribution?.content) query.set("utm_content", attribution.content);
  return `/partner/dashboard?${query.toString()}`;
}

// Authentication owns email and passwords. Neither belongs in the saved setup.
export const partnerRegistrationSchema = z.object({
  propertyName: z.string().trim().min(2).max(160),
  firstName: z.string().trim().min(2).max(50),
  lastName: z.string().trim().min(2).max(50),
  phone: z.string().trim().min(7).max(30),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().trim().max(100),
  propertyType: z.enum(["hotel", "resort", "vacation_home"]),
  roomCount: z.number().int().min(1).max(10_000),
  continueOnboarding: z.literal(true),
  attribution: partnerAcquisitionAttributionSchema.optional(),
}).strict();

const contactRole = z.enum([
  "owner", "authorized_representative", "general_manager", "revenue_manager", "sales_manager",
]);
const safeHttpsUrl = z.string().trim().max(2000).refine(isSafePropertyImageUrl, {
  message: "Enter an HTTPS URL without embedded credentials.",
});

// Partial text is intentionally saveable. Submission applies the complete rubric.
export const partnerDraftDetailsSchema = z.object({
  legalBusinessName: z.string().max(200),
  starRating: z.union([z.literal(4), z.literal(5)]),
  contactRole,
  websiteUrl: z.string().max(2000),
  addressLine1: z.string().max(200),
  city: z.string().max(100),
  postalCode: z.string().max(20),
  description: z.string().max(4000),
  amenities: z.array(z.string().max(80)).max(20),
  primaryImageUrl: z.string().max(2000),
  supportContactEmail: z.string().max(254),
  representativeAuthorityConfirmed: z.boolean(),
  contentRightsConfirmed: z.boolean(),
  informationAccurate: z.boolean(),
  commercialTermsAcknowledged: z.boolean(),
}).partial().strict();

export const partnerDraftSubmissionSchema = z.object({
  legalBusinessName: z.string().trim().min(2).max(200),
  starRating: z.union([z.literal(4), z.literal(5)]),
  contactRole,
  websiteUrl: safeHttpsUrl,
  addressLine1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(2).max(20),
  description: z.string().trim().min(120).max(4000),
  amenities: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  primaryImageUrl: safeHttpsUrl,
  supportContactEmail: z.string().trim().toLowerCase().email().max(254),
  representativeAuthorityConfirmed: z.literal(true),
  contentRightsConfirmed: z.literal(true),
  informationAccurate: z.literal(true),
  commercialTermsAcknowledged: z.literal(true),
}).strict();

export const partnerRegistrationRequestSchema = z.object({
  registrationKey: z.string().uuid(),
  registration: partnerRegistrationSchema,
}).strict();
export const partnerDraftSaveRequestSchema = z.object({
  revision: z.number().int().min(1),
  details: partnerDraftDetailsSchema,
}).strict();
export const partnerDraftSubmitRequestSchema = z.object({
  revision: z.number().int().min(1),
}).strict();

export const partnerOnboardingDraftSchema = z.object({
  id: z.string().uuid(),
  registration_key: z.string().uuid(),
  registration: partnerRegistrationSchema,
  details: partnerDraftDetailsSchema,
  revision: z.number().int().min(1),
  status: z.enum(["draft", "submitted"]),
  application_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  submitted_at: z.string().nullable(),
});

export type PartnerRegistration = z.infer<typeof partnerRegistrationSchema>;
export type PartnerAcquisitionAttribution = z.infer<typeof partnerAcquisitionAttributionSchema>;
export type PartnerDraftDetails = z.infer<typeof partnerDraftDetailsSchema>;
export type PartnerOnboardingDraft = z.infer<typeof partnerOnboardingDraftSchema>;

/** Initial application progress only; never a publication or full-onboarding grant. */
export function getPartnerDraftProgress(details: PartnerDraftDetails) {
  const fields = Object.entries(partnerDraftSubmissionSchema.shape);
  const completed = fields.filter(([key, schema]) => schema.safeParse(
    details[key as keyof PartnerDraftDetails],
  ).success).length;
  return { completed, total: fields.length, percent: Math.floor(completed / fields.length * 100) };
}
