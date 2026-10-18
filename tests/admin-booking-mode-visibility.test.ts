import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("admin booking payment-mode visibility", () => {
  it("returns the stored payment mode to booking and cancellation administration", () => {
    expect(read("app/api/admin/bookings/route.ts")).toContain("stripe_payment_mode");
    expect(read("app/api/admin/cancellations/route.ts")).toContain("stripe_payment_mode");
  });

  it("labels test, live, and unpaid records for administrators", () => {
    const surfaces = [
      read("components/bookings/admin-bookings.tsx"),
      read("components/bookings/admin-cancellations.tsx"),
    ].join("\n");

    for (const label of ["Test payment", "Live payment", "No payment"]) {
      expect(surfaces).toContain(label);
    }
  });
});
