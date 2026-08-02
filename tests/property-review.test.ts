import { describe, expect, it } from "vitest";
import { getLatestPropertyReview } from "../lib/property-review";
import { propertyReviewSchema } from "../lib/validation";

describe("property review", () => {
  it("selects the newest review regardless of response order", () => {
    expect(getLatestPropertyReview([
      { active: false, note: "Update the property photo.", created_at: "2026-08-02T12:00:00Z" },
      { active: true, note: "Verified for publication.", created_at: "2026-08-02T13:00:00Z" },
    ])?.note).toBe("Verified for publication.");
  });

  it("requires an actionable review note", () => {
    expect(propertyReviewSchema.safeParse({ active: false, note: "Fix" }).success).toBe(false);
    expect(propertyReviewSchema.safeParse({ active: false, note: "Replace the primary photo." }).success).toBe(true);
  });
});
