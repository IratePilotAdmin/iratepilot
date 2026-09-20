import { describe, expect, it } from "vitest";

import {
  flightConsumerProductionPublicOfferProjectionBatchSchema,
} from "../lib/flights/consumer-production/public-offer-projection-contract";

const digest = "a".repeat(64);

describe("Flight Consumer Production public-offer projection contract", () => {
  it("accepts an empty fully-accounted no-authority safe batch", () => {
    expect(flightConsumerProductionPublicOfferProjectionBatchSchema.parse({
      version: "flight-consumer-production-public-offer-projection-batch-v1",
      admissionId: "00000000-0000-4000-8000-000000000001",
      projectionBatchSha256: digest,
      offers: [],
      sourceOfferCount: 0,
      refusedOfferCount: 0,
      observedAt: "2026-08-27T12:00:00.000Z",
      rawProviderReferencesExposed: false,
      providerDispatchAuthorized: false,
      consumerExposureAuthorized: false,
      orderAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
    })).toBeTruthy();
  });

  it("refuses omitted authority axes, extra keys, and incomplete source accounting", () => {
    const base = {
      version: "flight-consumer-production-public-offer-projection-batch-v1",
      admissionId: "00000000-0000-4000-8000-000000000001",
      projectionBatchSha256: digest,
      offers: [], sourceOfferCount: 1, refusedOfferCount: 0,
      observedAt: "2026-08-27T12:00:00.000Z",
      rawProviderReferencesExposed: false, providerDispatchAuthorized: false,
      consumerExposureAuthorized: false, orderAuthorized: false,
      stripeDispatchAuthorized: false, bookingAuthorized: false,
      paymentAuthorized: false, settlementAuthorized: false,
      ticketingAuthorized: false, servicingAuthorized: false,
      captureAuthorized: false, refundAuthorized: false,
      consumerReleaseEnabled: false,
    };
    expect(flightConsumerProductionPublicOfferProjectionBatchSchema.safeParse(base).success)
      .toBe(false);
    expect(flightConsumerProductionPublicOfferProjectionBatchSchema.safeParse({
      ...base, sourceOfferCount: 0, blindRetryAuthorized: false, email: "x@y.test",
    }).success).toBe(false);
  });
});
