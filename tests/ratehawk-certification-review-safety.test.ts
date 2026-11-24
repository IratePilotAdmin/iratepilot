import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RateHawk certification reviewer safety boundary", () => {
  it("keeps payment and supplier execution in test-only environments", () => {
    const paymentRoute = readFileSync("app/api/certification/ratehawk/payment-intent/route.ts", "utf8");
    const completeRoute = readFileSync("app/api/certification/ratehawk/complete/route.ts", "utf8");
    const access = readFileSync("lib/ratehawk/certification-review-access.ts", "utf8");

    expect(access).toContain('environment.VERCEL_ENV === "preview"');
    expect(access).toContain('startsWith("sk_test_")');
    expect(access).toContain('HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED === "true"');
    expect(paymentRoute).toContain("if (intent.livemode");
    expect(completeRoute).toContain("paymentIntent.livemode");
    expect(completeRoute).toContain('scenarioId: "citizenship"');
    expect(completeRoute).toContain("stripe.refunds.create");
  });
});

