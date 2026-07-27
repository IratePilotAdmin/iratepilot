import { describe, expect, it } from "vitest";
import { calculatePartnerFinancials } from "./finance";

describe("partner marketplace accounting", () => {
  it("records a 10% commission", () => {
    expect(calculatePartnerFinancials(1000)).toEqual({
      gross: 1000,
      commission: 100,
      partnerNet: 900
    });
  });

  it("rounds currency to cents", () => {
    expect(calculatePartnerFinancials(389.99)).toEqual({
      gross: 389.99,
      commission: 39,
      partnerNet: 350.99
    });
  });
});
