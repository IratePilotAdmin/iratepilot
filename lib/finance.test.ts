import { describe, expect, it } from "vitest";
import { calculatePartnerFinancials } from "./finance";

describe("partner marketplace accounting", () => {
  it("records a 14% commission", () => {
    expect(calculatePartnerFinancials(1000)).toEqual({
      gross: 1000,
      commission: 140,
      partnerNet: 860
    });
  });

  it("rounds currency to cents", () => {
    expect(calculatePartnerFinancials(389.99)).toEqual({
      gross: 389.99,
      commission: 54.6,
      partnerNet: 335.39
    });
  });
});
