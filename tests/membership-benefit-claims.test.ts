import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memberships } from "../config/memberships";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const rewards = readFileSync(new URL("../app/rewards/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/account/membership-center.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../components/checkout/checkout-form.tsx", import.meta.url), "utf8");
const bookingRoute = readFileSync(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
const checkoutRoute = readFileSync(new URL("../app/api/stripe/checkout/route.ts", import.meta.url), "utf8");

describe("truthful membership benefits", () => {
  it("defines only benefits enforced by booking and reward finalization", () => {
    expect(memberships.basic.benefits).toContain("0% traveler service fees");
    expect(memberships.business.benefits).toContain("2× reward points on eligible confirmed stays");
    expect(JSON.stringify(memberships)).not.toMatch(/5.?10%|extra 5%|member-only offers/i);
  });

  it("uses the shared benefit configuration in public and account plan cards", () => {
    expect(rewards).toContain("plan.benefits.map");
    expect(center).toContain("plan.benefits.map");
    expect(rewards).not.toContain("extra 5% discount");
    expect(rewards).not.toContain("Priority support");
    expect(home).not.toContain("eligible 5%–10% savings");
  });

  it("keeps the fee waiver tied to active membership in both booking paths", () => {
    expect(bookingRoute).toContain("memberFeeExempt ? 0 : fees.serviceFeeRate");
    expect(checkoutRoute).toContain("memberFeeExempt ? 0 : fees.serviceFeeRate");
    expect(checkout).toContain('breakdown.serviceFee === 0 ? " (member benefit)"');
    expect(checkout).not.toContain("Service fee (5%)");
  });
});
