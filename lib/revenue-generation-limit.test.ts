import { describe, expect, it } from "vitest";
import { assertSupportedRecommendationCount } from "./revenue-generation-limit";

describe("revenue generation limit", () => {
  it("accepts a run of 500 rows", () => expect(() => assertSupportedRecommendationCount(500)).not.toThrow());
  it("rejects an oversized run before any rows are superseded", () => {
    expect(() => assertSupportedRecommendationCount(501)).toThrow(/500 recommendations/);
  });
});
