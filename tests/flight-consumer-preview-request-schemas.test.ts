import { describe, expect, it } from "vitest";

import { discloseFlightConsumerPreviewFictionalTravelers } from "../lib/flights/consumer-preview/fictional-travelers";
import {
  flightConsumerPreviewCompleteOrderRequestSchema,
  flightConsumerPreviewPreparePaymentRequestSchema,
  flightConsumerPreviewSearchUiRequestSchema,
  validateFlightConsumerPreviewTravelWindow,
} from "../lib/flights/consumer-preview/request-schemas";

describe("Flight Consumer Preview request schemas", () => {
  it("converts the narrow UI search into an adult-only provider-neutral request", () => {
    expect(flightConsumerPreviewSearchUiRequestSchema.parse({
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-05",
      returnDate: null,
      cabin: "economy",
      travelerCount: 2,
    })).toEqual({
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-05",
      returnDate: null,
      cabin: "economy",
      passengers: { adults: 2, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    });
  });

  it("rejects extra search fields and altered traveler disclosures", () => {
    expect(flightConsumerPreviewSearchUiRequestSchema.safeParse({
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-05",
      returnDate: null,
      cabin: "economy",
      travelerCount: 1,
      liveMode: true,
    }).success).toBe(false);
    const travelers = discloseFlightConsumerPreviewFictionalTravelers(1);
    expect(flightConsumerPreviewPreparePaymentRequestSchema.safeParse({
      travelers: [{ ...travelers[0], phoneNumber: "+13125550000" }],
    }).success).toBe(false);
  });

  it("accepts only stable PaymentIntent identifiers", () => {
    expect(flightConsumerPreviewCompleteOrderRequestSchema.safeParse({ paymentIntentId: "pi_preview12345678" }).success).toBe(true);
    expect(flightConsumerPreviewCompleteOrderRequestSchema.safeParse({ paymentIntentId: "seti_preview12345678" }).success).toBe(false);
  });

  it("requires travel after today and within the bounded Preview window", () => {
    const now = new Date("2026-08-25T15:00:00.000Z");
    expect(validateFlightConsumerPreviewTravelWindow("2026-08-26", null, now)).toBe(true);
    expect(validateFlightConsumerPreviewTravelWindow("2026-08-25", null, now)).toBe(false);
    expect(validateFlightConsumerPreviewTravelWindow("2027-08-01", null, now)).toBe(false);
    expect(validateFlightConsumerPreviewTravelWindow("2026-09-01", "2026-08-31", now)).toBe(false);
  });
});
