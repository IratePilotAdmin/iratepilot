import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLIGHT_SUPPLIER_MODE, parseFlightSearch } from "../lib/flights/search";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-08-18T12:00:00Z");

describe("flight planning phase 1", () => {
  it("normalizes and validates a round-trip planning request", () => {
    expect(parseFlightSearch({
      tripType: "roundtrip",
      origin: "ord",
      destination: "mia",
      departureDate: "2026-09-10",
      returnDate: "2026-09-14",
      travelers: "2",
      cabin: "business",
    }, now)).toMatchObject({
      submitted: true,
      errors: [],
      query: {
        tripType: "roundtrip",
        origin: "ORD",
        destination: "MIA",
        departureDate: "2026-09-10",
        returnDate: "2026-09-14",
        travelers: 2,
        cabin: "business",
      },
    });
  });

  it("rejects unsafe or incomplete planning details", () => {
    const result = parseFlightSearch({
      tripType: "roundtrip",
      origin: "ORD",
      destination: "ORD",
      departureDate: "2026-08-17",
      returnDate: "2026-08-16",
      travelers: "10",
      cabin: "private_jet",
    }, now);
    expect(result.query).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      "Departure and arrival airports must be different.",
      "Departure date cannot be in the past.",
      "Return date must be after departure.",
      "Choose between 1 and 9 travelers.",
      "Choose a supported cabin.",
    ]));
  });

  it("accepts a one-way request without a return date", () => {
    expect(parseFlightSearch({
      tripType: "oneway",
      origin: "JFK",
      destination: "LAX",
      departureDate: "2026-09-10",
      travelers: "1",
      cabin: "economy",
    }, now).query?.returnDate).toBeNull();
  });

  it("keeps the consumer surface supplier-offline and clearly disclosed", () => {
    const page = read("app/flights/page.tsx");
    const navigation = read("data/navigation.ts");
    const footer = read("components/layout/site-footer.tsx");
    const sitemap = read("app/sitemap.ts");
    expect(FLIGHT_SUPPLIER_MODE).toBe("offline_planning");
    expect(page).toContain("No airline API request or payment is made");
    expect(page).toContain("Live fares are unavailable");
    expect(page).not.toContain("fetch(");
    expect(navigation).toContain('{ href: "/flights", label: "Flights" }');
    expect(footer).toContain('["Flights", "/flights"]');
    expect(sitemap).toContain('"/flights"');
  });
});
