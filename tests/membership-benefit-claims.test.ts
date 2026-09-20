import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memberships } from "../config/memberships";
import { fees } from "../config/fees";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const rewards = readFileSync(new URL("../app/rewards/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/account/membership-center.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../components/checkout/checkout-form.tsx", import.meta.url), "utf8");
const bookingRoute = readFileSync(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
const checkoutRoute = readFileSync(new URL("../app/api/stripe/checkout/route.ts", import.meta.url), "utf8");

describe("truthful membership benefits", () => {
  it("defines only benefits enforced by booking and reward finalization", () => {
    expect(fees.serviceFeeRate).toBe(0);
    expect(memberships.basic.benefits).toContain("Extra 5% member discount on eligible stays");
    expect(memberships.basic.benefits).toContain("2× iRate Rewards points on eligible confirmed stays");
    expect(memberships.business.benefits).toContain("Extra 10% member discount on eligible stays");
    expect(memberships.business.benefits).toContain("3× iRate Rewards points on eligible confirmed stays");
  });

  it("uses the shared benefit configuration in public and account plan cards", () => {
    expect(rewards).toContain("plan.benefits.map");
    expect(center).toContain("plan.benefits.map");
    expect(rewards).not.toContain("Priority support");
    expect(home).not.toContain("Transparent economics");
    expect(home).not.toContain("5% traveler fee");
    expect(home).toContain("0% traveler service fee");
  });

  it("applies active-member discounts and no traveler fee in both booking paths", () => {
    expect(bookingRoute).toContain("memberDiscountRate");
    expect(checkoutRoute).toContain("memberDiscountRate");
    expect(checkout).toContain("Traveler service fee (0% for everyone)");
    expect(checkout).toContain("memberDiscount");
  });
});
