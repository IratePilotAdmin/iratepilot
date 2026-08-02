import { describe, expect, it } from "vitest";
import { propertySchema } from "../lib/validation";

const validProperty = {
  name: "  Harbor Grand Hotel  ",
  slug: "Harbor-Grand-Hotel",
  type: "hotel",
  starRating: "5",
  description: "A premium waterfront hotel with full-service guest amenities.",
  city: " Chicago ",
  region: " Illinois ",
  country: " United States "
};

describe("partner property validation", () => {
  it("normalizes editable listing details", () => {
    const parsed = propertySchema.parse(validProperty);

    expect(parsed).toMatchObject({
      name: "Harbor Grand Hotel",
      slug: "harbor-grand-hotel",
      starRating: 5,
      city: "Chicago",
      region: "Illinois",
      country: "United States"
    });
  });

  it("rejects ineligible ratings and unsafe URL slugs", () => {
    expect(propertySchema.safeParse({ ...validProperty, starRating: 3 }).success).toBe(false);
    expect(propertySchema.safeParse({ ...validProperty, slug: "harbor grand/hotel" }).success).toBe(false);
  });
});
