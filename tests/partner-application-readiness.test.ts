import { describe, expect, it } from "vitest";
import { HOTEL_PARTNER_DISCLOSURE_VERSION } from "../lib/partner/acquisition";
import { hasCompleteHotelApplication } from "../lib/partner/application-readiness";

const completeApplication = {
  star_rating: 4,
  contact_role: "general_manager",
  phone: "+1 555 010 1000",
  website_url: "https://hotel.example",
  address_line1: "100 Hotel Way",
  city: "Pensacola",
  postal_code: "32501",
  country: "US",
  description: "A complete hotel description supplied by its authorized manager.",
  amenities: ["Pool"],
  photo_source_url: "https://hotel.example/photo.jpg",
  hotel_authorized: true,
  content_rights_confirmed: true,
  information_accurate: true,
  commercial_terms_acknowledged: true,
  commercial_terms_version_acknowledged: HOTEL_PARTNER_DISCLOSURE_VERSION,
};

describe("hotel application readiness", () => {
  it("accepts a complete current hotel application", () => {
    expect(hasCompleteHotelApplication(completeApplication)).toBe(true);
  });

  it("excludes incomplete legacy records and obsolete fee disclosures", () => {
    expect(hasCompleteHotelApplication({ ...completeApplication, star_rating: null })).toBe(false);
    expect(hasCompleteHotelApplication({
      ...completeApplication,
      commercial_terms_version_acknowledged: "legacy_14_percent",
    })).toBe(false);
  });
});
