import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checkout = read("components/checkout/approved-booking-checkout.tsx");
const intentRoute = read("app/api/bookings/[id]/payment-intent/route.ts");

describe("approved booking wallet checkout", () => {
  it("offers eligible Apple Pay and Google Pay wallets without replacing the fallback payment form", () => {
    expect(checkout).toContain("ExpressCheckoutElement");
    expect(checkout).toContain('applePay: "auto"');
    expect(checkout).toContain('googlePay: "auto"');
    expect(checkout).toContain("availablePaymentMethods?.applePay");
    expect(checkout).toContain("paymentMethods?.googlePay?.available");
    expect(checkout).toContain("<PaymentElement />");
  });

  it("keeps wallet authorization on the existing approved-booking finalization path", () => {
    expect(checkout).toContain("await elements.submit()");
    expect(checkout).toContain("stripe.confirmPayment");
    expect(checkout).toContain("/complete-payment");
    expect(intentRoute).toContain('payment_method_types: ["card"]');
  });

  it("limits express checkout to Apple Pay and Google Pay", () => {
    expect(checkout).toContain('link: "never"');
    expect(checkout).toContain('paypal: "never"');
    expect(checkout).toContain('amazonPay: "never"');
    expect(checkout).toContain('klarna: "never"');
  });
});
