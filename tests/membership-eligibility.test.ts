import { describe, expect, it } from "vitest";
import { hasActiveMembership } from "../lib/memberships/eligibility";

describe("membership benefit eligibility", () => {
  it("grants benefits only to active paid tiers", () => {
    expect(hasActiveMembership({ membership_tier: "basic", membership_status: "active" })).toBe(true);
    expect(hasActiveMembership({ membership_tier: "business", membership_status: "active" })).toBe(true);
  });

  it("rejects inactive, past-due, cancelled, and free profiles", () => {
    expect(hasActiveMembership({ membership_tier: "basic", membership_status: "inactive" })).toBe(false);
    expect(hasActiveMembership({ membership_tier: "business", membership_status: "past_due" })).toBe(false);
    expect(hasActiveMembership({ membership_tier: "basic", membership_status: "cancelled" })).toBe(false);
    expect(hasActiveMembership({ membership_tier: "none", membership_status: "active" })).toBe(false);
  });
});
