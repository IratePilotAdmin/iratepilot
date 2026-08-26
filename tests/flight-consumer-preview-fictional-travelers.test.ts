import { describe, expect, it } from "vitest";

import {
  buildFlightConsumerPreviewFictionalTravelers,
  discloseFlightConsumerPreviewFictionalTravelers,
  verifyFlightConsumerPreviewFictionalTravelerDisclosure,
} from "../lib/flights/consumer-preview/fictional-travelers";

describe("Flight Consumer Preview fictional travelers", () => {
  it("builds only the fixed adult-only fictional fixtures", () => {
    const travelers = buildFlightConsumerPreviewFictionalTravelers(4);
    expect(travelers).toHaveLength(4);
    expect(travelers[0]).toMatchObject({
      travelerSequence: 1,
      passenger: {
        title: "ms",
        gender: "f",
        givenName: "Synthetic",
        familyName: "Traveler",
        bornOn: "1990-01-01",
        email: "flight-test+1@example.com",
        phoneNumber: "+13125550121",
      },
    });
    expect(travelers.every(({ passenger }) => passenger.email.endsWith("@example.com"))).toBe(true);
  });

  it("accepts only the exact browser disclosure for the expected traveler count", () => {
    const disclosure = discloseFlightConsumerPreviewFictionalTravelers(2);
    expect(verifyFlightConsumerPreviewFictionalTravelerDisclosure(disclosure, 2)).toBe(true);
    expect(verifyFlightConsumerPreviewFictionalTravelerDisclosure(disclosure, 1)).toBe(false);
    expect(verifyFlightConsumerPreviewFictionalTravelerDisclosure([
      { ...disclosure[0], givenName: "A real name" },
      disclosure[1],
    ], 2)).toBe(false);
  });

  it("rejects counts outside the UI and provider test profile", () => {
    expect(() => buildFlightConsumerPreviewFictionalTravelers(0)).toThrow();
    expect(() => buildFlightConsumerPreviewFictionalTravelers(5)).toThrow();
    expect(() => buildFlightConsumerPreviewFictionalTravelers(1.5)).toThrow();
  });
});
