import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hotelManagerIntakeSchema } from "../lib/validation";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = read("components/forms/partner-application-form.tsx");
const intakePage = read("app/hotel-intake/page.tsx");
const submissionRoute = read("app/api/partners/apply/route.ts");
const adminReview = read("components/dashboard/admin-partner-applications.tsx");
const migration = read("supabase/migrations/202608170062_hotel_manager_intake_drafts.sql");

const validIntake = {
  propertyName: "  Harbor House Hotel  ",
  propertyType: "hotel",
  starRating: "4",
  contactName: "  Alex Rivera  ",
  contactRole: "general_manager",
  email: "  MANAGER@HARBOR.EXAMPLE  ",
  phone: "+1 312 555 0142",
  websiteUrl: "https://harbor.example",
  addressLine1: "100 Lake Street",
  city: "Chicago",
  region: "Illinois",
  postalCode: "60601",
  country: "United States",
  description: "Harbor House Hotel is a verified waterfront property offering premium guest rooms, attentive service, meeting space, dining, and convenient access to the city center.",
  amenities: "Pool, Fitness center, Complimentary Wi-Fi, Restaurant",
  photoSourceUrl: "https://harbor.example/media",
  additionalNotes: "Call after 10 a.m.",
  hotelAuthorized: "true",
  contentRightsConfirmed: "true",
  informationAccurate: "true",
  companyFax: "",
};

describe("hotel manager intake", () => {
  it("normalizes complete manager submissions and verified amenities", () => {
    const parsed = hotelManagerIntakeSchema.safeParse(validIntake);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.propertyName).toBe("Harbor House Hotel");
    expect(parsed.data.email).toBe("manager@harbor.example");
    expect(parsed.data.starRating).toBe(4);
    expect(parsed.data.amenities).toEqual([
      "Pool",
      "Fitness center",
      "Complimentary Wi-Fi",
      "Restaurant",
    ]);
  });

  it("requires authorization, content rights, secure URLs, and a premium rating", () => {
    expect(hotelManagerIntakeSchema.safeParse({ ...validIntake, hotelAuthorized: false }).success).toBe(false);
    expect(hotelManagerIntakeSchema.safeParse({ ...validIntake, contentRightsConfirmed: false }).success).toBe(false);
    expect(hotelManagerIntakeSchema.safeParse({ ...validIntake, websiteUrl: "http://harbor.example" }).success).toBe(false);
    expect(hotelManagerIntakeSchema.safeParse({ ...validIntake, starRating: "3" }).success).toBe(false);
    expect(hotelManagerIntakeSchema.safeParse({ ...validIntake, companyFax: "bot" }).success).toBe(false);
  });

  it("provides a dedicated shareable form without requesting sensitive hotel data", () => {
    expect(intakePage).toContain("Private hotel onboarding");
    expect(form).toContain("Submit hotel for verification");
    expect(form).toContain("submission does not publish the property");
    expect(form).toContain("Do not enter passwords");
    expect(form).not.toContain('name="password"');
    expect(form).not.toContain('name="bank');
  });

  it("stores only pending intake data and keeps approval behind an explicit admin verification", () => {
    expect(submissionRoute).toContain('status: "pending"');
    expect(submissionRoute).toContain("hotel_authorized: parsed.data.hotelAuthorized");
    expect(adminReview).toContain("verificationConfirmed");
    expect(adminReview).toContain("Create an inactive draft only");
  });

  it("creates one inactive property draft transactionally and leaves publication separate", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("Complete and verify the hotel intake before approval");
    expect(migration).toContain("insert into public.properties");
    expect(migration).toContain("false\n      ) returning id into v_property_id");
    expect(migration).toContain("if v_application.property_id is null");
    expect(migration).toContain("partner_applications_property_id_key");
  });
});
