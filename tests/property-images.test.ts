import { describe, expect, it } from "vitest";
import {
  FALLBACK_PROPERTY_IMAGE,
  getSafePropertyImageUrl,
  isSafeRemoteImageUrl
} from "../lib/property-images";
import { propertyContentSchema } from "../lib/validation";

describe("property image safety", () => {
  it("accepts public HTTPS image hosts", () => {
    const imageUrl = "https://cdn.example.com/hotels/harbor-grand.jpg";

    expect(isSafeRemoteImageUrl(imageUrl)).toBe(true);
    expect(getSafePropertyImageUrl(imageUrl)).toBe(imageUrl);
    expect(propertyContentSchema.safeParse({
      imageUrl,
      amenities: ["Pool"]
    }).success).toBe(true);
  });

  it("rejects local, credentialed, IP, port, and insecure URLs", () => {
    const rejected = [
      "http://cdn.example.com/hotel.jpg",
      "https://localhost/hotel.jpg",
      "https://127.0.0.1/hotel.jpg",
      "https://user:secret@cdn.example.com/hotel.jpg",
      "https://cdn.example.com:8443/hotel.jpg"
    ];

    for (const value of rejected) {
      expect(isSafeRemoteImageUrl(value)).toBe(false);
      expect(getSafePropertyImageUrl(value)).toBe(FALLBACK_PROPERTY_IMAGE);
    }
  });
});
