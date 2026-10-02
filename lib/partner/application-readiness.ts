import { HOTEL_PARTNER_DISCLOSURE_VERSION } from "@/lib/partner/acquisition";

export type HotelApplicationCompletenessRecord = {
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

export function hasCompleteHotelApplication(application: HotelApplicationCompletenessRecord) {
  return Boolean(
    application.star_rating
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
