import { describe, expect, it } from "vitest";
import { evaluateHotelMarketplaceLaunchAuthorization } from "../lib/hotels/marketplace-launch-authorization";

const liveEnvironment = {
  HOTEL_PUBLICATION_ENABLED: "true",
  EMAIL_WORKER_ENABLED: "true",
  PILOT_MODE: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "true",
  ENABLE_TEST_CHECKOUT: "false",
  NEXT_PUBLIC_ENABLE_TEST_CHECKOUT: "false",
  ENABLE_LIVE_BOOKING_PAYMENTS: "true",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "true",
  ENABLE_LIVE_PARTNER_PAYOUTS: "true",
  STRIPE_SECRET_KEY: "sk_live_example",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  BOOKING_PAYMENT_MODE: "live",
  STRIPE_WEBHOOK_MODE: "live",
  CRS_SYNXIS_BASE_URL: "https://example.test",
  CRS_SYNXIS_USERNAME: "user",
  CRS_SYNXIS_PASSWORD: "password",
  CRS_SYNXIS_HOTEL_ID: "hotel",
  CRS_SYNXIS_RATE_SOAP_ACTION: "rate",
  CRS_SYNXIS_INVENTORY_SOAP_ACTION: "inventory",
};

const liveEvidence = {
  paymentAuthorizationValid: true,
  supplierStateAvailable: true,
  priorityPmsEvidence: {},
  synxisEvidence: {
    vendorApproved: true,
    certificationEnvironmentApproved: true,
    propertyMapped: true,
    sandboxValidated: true,
    productionSmokeValidated: true,
    liveEnabled: true,
  },
  operationsStateAvailable: true,
  emailBacklog: 0,
  emailDeadLetters: 0,
  deliveryFailures: 0,
  payoutExceptions: 0,
};

describe("hotel marketplace launch authorization", () => {
  it("requires every global production gate", () => {
    expect(evaluateHotelMarketplaceLaunchAuthorization(liveEnvironment, liveEvidence)).toBe(true);
  });

  it("fails closed for a flag-only release", () => {
    expect(evaluateHotelMarketplaceLaunchAuthorization(liveEnvironment, {
      ...liveEvidence,
      paymentAuthorizationValid: false,
    })).toBe(false);
  });

  it("fails closed for supplier or operations evidence errors", () => {
    expect(evaluateHotelMarketplaceLaunchAuthorization(liveEnvironment, {
      ...liveEvidence,
      supplierStateAvailable: false,
    })).toBe(false);
    expect(evaluateHotelMarketplaceLaunchAuthorization(liveEnvironment, {
      ...liveEvidence,
      emailBacklog: 1,
    })).toBe(false);
  });
});
