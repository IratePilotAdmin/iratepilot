import { describe, expect, it } from "vitest";
import { isApprovedRevenueOwner } from "./revenue-access";

describe("Revenue property ownership", () => {
  it("accepts approved owned partner relations in object and array shapes", () => {
    const partner = { owner_id: "owner", status: "approved" };
    expect(isApprovedRevenueOwner(partner, "owner")).toBe(true);
    expect(isApprovedRevenueOwner([partner], "owner")).toBe(true);
  });

  it("rejects unrelated, pending, and absent partners", () => {
    expect(isApprovedRevenueOwner({ owner_id: "other", status: "approved" }, "owner")).toBe(false);
    expect(isApprovedRevenueOwner({ owner_id: "owner", status: "pending" }, "owner")).toBe(false);
    expect(isApprovedRevenueOwner(null, "owner")).toBe(false);
  });
});
