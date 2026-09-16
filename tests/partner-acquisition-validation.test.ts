import { describe, expect, it } from "vitest";
import { isPartnerSelfServiceEnabled } from "../config/partner-acquisition";
import {
  getPartnerDraftProgress, partnerDraftDetailsSchema, partnerDraftSubmissionSchema,
  partnerRegistrationRequestSchema, partnerRegistrationSchema,
} from "../lib/partner/acquisition";

const registration = {
  propertyName: "Example Grand", firstName: "Test", lastName: "Owner", phone: "+15555550100",
  countryCode: "US", region: "FL", propertyType: "hotel", roomCount: 30, continueOnboarding: true,
};
const complete = {
  legalBusinessName: "Example Hotel LLC", starRating: 4, contactRole: "owner",
  websiteUrl: "https://hotel.example", addressLine1: "123 Example Avenue", city: "Navarre",
  postalCode: "32566", description: "A hotel description with verified property information. ".repeat(3),
  amenities: ["Parking", "Wi-Fi"], primaryImageUrl: "https://hotel.example/lobby.jpg",
  supportContactEmail: "owner@example.com", representativeAuthorityConfirmed: true,
  contentRightsConfirmed: true, informationAccurate: true, commercialTermsAcknowledged: true,
};

describe("partner acquisition registration and initial application", () => {
  it("is closed by default and requires an explicit launch setting", () => {
    for (const value of [undefined, "false", "1", "TRUE", " true "]) {
      expect(isPartnerSelfServiceEnabled({ PARTNER_SELF_SERVICE_ONBOARDING_ENABLED: value })).toBe(false);
    }
    expect(isPartnerSelfServiceEnabled({ PARTNER_SELF_SERVICE_ONBOARDING_ENABLED: "true" })).toBe(true);
  });

  it("accepts short registration without asking for the full property listing", () => {
    expect(partnerRegistrationSchema.safeParse(registration).success).toBe(true);
    expect(partnerRegistrationRequestSchema.safeParse({
      registrationKey: "30000000-0000-4000-8000-000000000001", registration,
    }).success).toBe(true);
  });

  it("rejects passwords, email copies, ownership and privileged state in saved registration", () => {
    for (const extra of [
      { password: "must-never-be-saved" }, { email: "different@example.com" }, { role: "partner" },
      { owner_id: "someone-else" }, { status: "approved" }, { commercialAgreementExecuted: true },
    ]) expect(partnerRegistrationSchema.safeParse({ ...registration, ...extra }).success).toBe(false);
    expect(partnerRegistrationSchema.safeParse({ ...registration, roomCount: "30" }).success).toBe(false);
    expect(partnerRegistrationSchema.safeParse({ ...registration, roomCount: 0 }).success).toBe(false);
    expect(partnerRegistrationSchema.safeParse({ ...registration, propertyType: "motel" }).success).toBe(false);
    expect(partnerRegistrationSchema.safeParse({ ...registration, continueOnboarding: false }).success).toBe(false);
  });

  it("saves incomplete typing without confusing it with a complete application", () => {
    const draft = { description: "Not finished", websiteUrl: "https://", amenities: [""] };
    expect(partnerDraftDetailsSchema.safeParse(draft).success).toBe(true);
    expect(partnerDraftSubmissionSchema.safeParse(draft).success).toBe(false);
    expect(getPartnerDraftProgress(draft).percent).toBe(0);
    expect(partnerDraftDetailsSchema.safeParse({ ...draft, description: "x".repeat(4001) }).success).toBe(false);
  });

  it("requires eligible stars, HTTPS sources and every confirmation for submission", () => {
    expect(partnerDraftSubmissionSchema.safeParse(complete).success).toBe(true);
    expect(getPartnerDraftProgress(partnerDraftSubmissionSchema.parse(complete)).percent).toBe(100);
    for (const starRating of [0, 3, 6, "4", null]) {
      expect(partnerDraftSubmissionSchema.safeParse({ ...complete, starRating }).success).toBe(false);
    }
    for (const primaryImageUrl of ["http://hotel.example/photo", "https://user:password@hotel.example/photo", "javascript:alert(1)"]) {
      expect(partnerDraftSubmissionSchema.safeParse({ ...complete, primaryImageUrl }).success).toBe(false);
    }
    for (const key of ["representativeAuthorityConfirmed", "contentRightsConfirmed", "informationAccurate", "commercialTermsAcknowledged"]) {
      expect(partnerDraftSubmissionSchema.safeParse({ ...complete, [key]: false }).success).toBe(false);
    }
    expect(partnerDraftSubmissionSchema.safeParse({ ...complete, active: true }).success).toBe(false);
  });
});
