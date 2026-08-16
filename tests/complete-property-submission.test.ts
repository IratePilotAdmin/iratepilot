import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propertySchema } from "../lib/validation";

const route = readFileSync(new URL("../app/api/partner/properties/route.ts", import.meta.url), "utf8");
const form = readFileSync(new URL("../components/dashboard/partner-properties.tsx", import.meta.url), "utf8");

const completeProperty = {
  name: "Pilot Grand Hotel",
  slug: "pilot-grand-hotel",
  type: "hotel",
  starRating: 5,
  description: "A complete hotel description with enough detail about the location, rooms, atmosphere, service, nearby attractions, and distinctive guest experience for marketplace review.",
  city: "Chicago",
  region: "Illinois",
  country: "United States",
  imageUrl: "https://media.example-hotel.com/pilot-grand.jpg",
  amenities: ["Pool", "Free Wi-Fi"],
};

describe("complete partner property submissions", () => {
  it("requires safe marketplace content in the initial property payload", () => {
    expect(propertySchema.safeParse(completeProperty).success).toBe(true);
    expect(propertySchema.safeParse({ ...completeProperty, imageUrl: "http://example.com/hotel.jpg" }).success).toBe(false);
    expect(propertySchema.safeParse({ ...completeProperty, amenities: [] }).success).toBe(false);
    expect(propertySchema.safeParse({ ...completeProperty, description: "Too short" }).success).toBe(false);
  });

  it("persists photo and amenities when approved hotel access creates the draft", () => {
    expect(route).toContain("image_url: parsed.data.imageUrl");
    expect(route).toContain("amenities: parsed.data.amenities");
    expect(route).toContain("resolvePartnerHotelAccess(auth, requestedPartnerId)");
    expect(route).toContain("resolved.access.partnerId");
    expect(route).toContain("Add an active room and future inventory");
  });

  it("collects the complete content once and sets the correct next-step expectation", () => {
    expect(form).toContain('name="imageUrl"');
    expect(form).toContain('name="amenities"');
    expect(form).toContain("minLength={120}");
    expect(form).toContain("Create property draft");
    expect(form).not.toContain("Submit for review");
  });
});
