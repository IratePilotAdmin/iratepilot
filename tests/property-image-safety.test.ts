import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSafePropertyImageUrl } from "../lib/property-image";
import { propertyContentSchema } from "../lib/validation";

describe("partner property images", () => {
  it("accepts public HTTPS-style URLs from hotel media hosts", () => {
    expect(isSafePropertyImageUrl("https://media.example-hotel.com/rooms/suite.jpg")).toBe(true);
    expect(propertyContentSchema.safeParse({
      description: "A detailed property description with enough information about the location, rooms, atmosphere, amenities, and overall guest experience to support marketplace review.",
      imageUrl: "https://media.example-hotel.com/rooms/suite.jpg",
      amenities: ["Pool"],
    }).success).toBe(true);
  });

  it("rejects insecure, credentialed, and non-web URLs", () => {
    for (const imageUrl of [
      "http://media.example.com/hotel.jpg",
      "https://user:password@media.example.com/hotel.jpg",
      "javascript:alert(1)",
      "not-a-url",
    ]) {
      expect(isSafePropertyImageUrl(imageUrl)).toBe(false);
      expect(propertyContentSchema.safeParse({ description: "A detailed property description with enough information about the location, rooms, atmosphere, amenities, and overall guest experience to support marketplace review.", imageUrl, amenities: ["Pool"] }).success).toBe(false);
    }
  });

  it("serves dynamic hotel URLs directly instead of through a restricted optimizer host list", () => {
    const sources = [
      "../components/hotels/hotel-card.tsx",
      "../app/hotels/[slug]/page.tsx",
      "../app/page.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

    for (const source of sources) expect(source).toContain("unoptimized");
  });
});
