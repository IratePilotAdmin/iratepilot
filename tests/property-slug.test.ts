import { describe, expect, it } from "vitest";
import { toPropertySlug } from "../lib/property-slug";

describe("property URL slug generation", () => {
  it("turns a hotel name into a valid URL segment", () => {
    expect(toPropertySlug("Marriott Marquis Chicago")).toBe("marriott-marquis-chicago");
    expect(toPropertySlug("Hôtel Plaza & Spa")).toBe("hotel-plaza-spa");
  });

  it("removes leading and trailing separators", () => {
    expect(toPropertySlug("  IHG - Downtown  ")).toBe("ihg-downtown");
  });

  it("stays within the server validation limit", () => {
    expect(toPropertySlug("A".repeat(250))).toHaveLength(180);
  });
});
