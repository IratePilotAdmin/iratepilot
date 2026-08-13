import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const serverCheckoutRoutes = [
  "app/api/stripe/checkout/route.ts",
  "app/api/bookings/complete-payment/route.ts",
  "app/api/memberships/checkout/route.ts",
  "app/api/memberships/portal/route.ts",
  "app/api/partner/subscription/checkout/route.ts",
  "app/api/partner/subscription/portal/route.ts",
];

describe("production test-checkout gates", () => {
  it.each(serverCheckoutRoutes)("blocks %s unless the server flag is explicitly true", (path) => {
    expect(read(path)).toContain('process.env.ENABLE_TEST_CHECKOUT !== "true"');
  });

  it("keeps the checkout page disabled unless the server flag is explicitly true", () => {
    expect(read("app/checkout/page.tsx")).toContain(
      'const enabled = process.env.ENABLE_TEST_CHECKOUT === "true"',
    );
  });

  it("delegates approved-reservation payment gating to the fail-closed mode resolver", () => {
    expect(read("app/account/trips/[id]/pay/page.tsx")).toContain(
      "getApprovedBookingPaymentMode()",
    );
    expect(read("app/api/bookings/[id]/payment-intent/route.ts")).toContain("getApprovedBookingPaymentMode()");
    expect(read("app/api/bookings/[id]/complete-payment/route.ts")).toContain("getApprovedBookingPaymentMode()");
  });

  it("keeps hotel booking requests out of checkout unless the server flag is explicitly true", () => {
    expect(read("app/hotels/[slug]/page.tsx")).toContain(
      'process.env.ENABLE_TEST_CHECKOUT === "true"',
    );
  });
});
