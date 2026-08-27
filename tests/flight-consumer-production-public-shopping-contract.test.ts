import { describe, expect, it } from "vitest";

import {
  canonicalFlightConsumerProductionPublicShoppingSearchJson,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
  flightConsumerProductionPublicShoppingSearchSchema,
  validateFlightConsumerProductionPublicShoppingTravelWindow,
} from "../lib/flights/consumer-production/public-shopping-contract";

const validSearch = Object.freeze({
  origin: "ORD",
  destination: "LHR",
  departureDate: "2026-09-01",
  returnDate: "2026-09-08",
  cabin: "economy" as const,
  adults: 2,
});

describe("Flight Consumer Production public-shopping contract", () => {
  it("accepts only the bounded normalized no-PII search shape", () => {
    expect(flightConsumerProductionPublicShoppingSearchSchema.parse(validSearch))
      .toEqual(validSearch);
    for (const invalid of [
      { ...validSearch, origin: "ord" },
      { ...validSearch, destination: "ORD" },
      { ...validSearch, returnDate: "2026-09-01" },
      { ...validSearch, adults: 0 },
      { ...validSearch, adults: 5 },
      { ...validSearch, children: 1 },
      { ...validSearch, email: "traveler@example.com" },
      { ...validSearch, passengerName: "Example Traveler" },
    ]) {
      expect(
        flightConsumerProductionPublicShoppingSearchSchema.safeParse(invalid)
          .success,
      ).toBe(false);
    }
  });

  it("allows departure tomorrow through day 330 and no later return", () => {
    const now = new Date("2026-08-27T18:30:00.000Z");
    expect(validateFlightConsumerProductionPublicShoppingTravelWindow({
      ...validSearch,
      departureDate: "2026-08-28",
      returnDate: null,
    }, now)).toBe(true);
    expect(validateFlightConsumerProductionPublicShoppingTravelWindow({
      ...validSearch,
      departureDate: "2027-07-23",
      returnDate: null,
    }, now)).toBe(true);
    expect(validateFlightConsumerProductionPublicShoppingTravelWindow({
      ...validSearch,
      departureDate: "2026-08-27",
      returnDate: null,
    }, now)).toBe(false);
    expect(validateFlightConsumerProductionPublicShoppingTravelWindow({
      ...validSearch,
      departureDate: "2027-07-23",
      returnDate: "2027-07-24",
    }, now)).toBe(false);
  });

  it("uses a deterministic fixed-key canonical request and fixed low budgets", () => {
    expect(canonicalFlightConsumerProductionPublicShoppingSearchJson(validSearch))
      .toBe(
        '{"adults":2,"cabin":"economy","departureDate":"2026-09-01",'
        + '"destination":"LHR","origin":"ORD","returnDate":"2026-09-08"}',
      );
    expect(FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET).toEqual({
      subjectMinute: 2,
      subjectDay: 10,
      cohortMinute: 10,
      cohortDay: 100,
      globalMinute: 20,
      globalDay: 250,
      claimTtlSeconds: 60,
    });
  });
});
