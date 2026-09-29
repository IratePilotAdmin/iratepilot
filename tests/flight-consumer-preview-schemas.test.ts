import { describe, expect, it } from "vitest";

import {
  flightConsumerPreviewCheckoutRequestSchema,
  flightConsumerPreviewPassengerSchema,
  flightConsumerPreviewSearchRequestSchema,
} from "../lib/flights/consumer-preview/schemas";

const passenger = {
  title: "ms",
  gender: "f",
  givenName: "Synthetic",
  familyName: "Traveler",
  bornOn: "1990-01-01",
  email: "flight.preview.synthetic@example.test",
  phoneNumber: "+13125550123",
} as const;

describe("Flight Consumer Preview request schemas", () => {
  it("accepts the narrow adult-only search and rejects unknown or unsupported inputs", () => {
    const valid = {
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-01",
      returnDate: null,
      cabin: "economy",
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    };
    expect(flightConsumerPreviewSearchRequestSchema.parse(valid)).toEqual(valid);
    for (const invalid of [
      { ...valid, destination: "ORD" },
      { ...valid, departureDate: "2026-02-30" },
      { ...valid, returnDate: "2026-10-01" },
      { ...valid, passengers: { ...valid.passengers, children: 1 } },
      { ...valid, hidden: "unexpected" },
    ]) expect(flightConsumerPreviewSearchRequestSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts only the exact traveler fields supported by the current provider contract", () => {
    expect(flightConsumerPreviewPassengerSchema.parse(passenger)).toEqual(passenger);
    for (const invalid of [
      { ...passenger, passportNumber: "not-accepted" },
      { ...passenger, givenName: " Synthetic" },
      { ...passenger, phoneNumber: "312-555-0123" },
      { ...passenger, bornOn: "1990-13-01" },
    ]) expect(flightConsumerPreviewPassengerSchema.safeParse(invalid).success).toBe(false);
  });

  it("never accepts client-controlled amount, currency, card, or provider fields at checkout", () => {
    const valid = {
      repriceReceiptId: "11111111-1111-4111-8111-111111111111",
      customerAcceptanceSha256: "a".repeat(64),
      passengers: [passenger],
    };
    expect(flightConsumerPreviewCheckoutRequestSchema.parse(valid)).toEqual(valid);
    for (const forbidden of [
      { totalCents: 1 },
      { currency: "USD" },
      { cardNumber: "4242424242424242" },
      { paymentIntentId: "pi_client_controlled" },
      { providerOfferId: "off_client_controlled" },
    ]) {
      expect(flightConsumerPreviewCheckoutRequestSchema.safeParse({ ...valid, ...forbidden }).success)
        .toBe(false);
    }
  });
});
