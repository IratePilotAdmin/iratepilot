import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_RENTAL_SUPPLIER_MODE, parseCarRentalSearch } from "../lib/cars/search";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-08-19T12:00:00Z");

describe("car-rental planning phase 1", () => {
  it("normalizes and validates a same-location rental request", () => {
    expect(parseCarRentalSearch({
      pickupLocation: "  Miami   International Airport ",
      returnType: "same",
      pickupDate: "2026-09-10",
      pickupTime: "10:30",
      dropoffDate: "2026-09-14",
      dropoffTime: "10:30",
      driverAge: "25_plus",
      vehicleClass: "suv",
    }, now)).toMatchObject({
      submitted: true,
      errors: [],
      query: {
        pickupLocation: "Miami International Airport",
        dropoffLocation: "Miami International Airport",
        returnType: "same",
        driverAge: "25_plus",
        vehicleClass: "suv",
        durationHours: 96,
      },
    });
  });

  it("accepts a different return location without contacting a supplier", () => {
    expect(parseCarRentalSearch({
      pickupLocation: "Chicago O'Hare (ORD)",
      returnType: "different",
      dropoffLocation: "Milwaukee Airport (MKE)",
      pickupDate: "2026-09-10",
      pickupTime: "09:00",
      dropoffDate: "2026-09-12",
      dropoffTime: "17:00",
      driverAge: "21_24",
      vehicleClass: "compact",
    }, now).query).toMatchObject({
      pickupLocation: "Chicago O'Hare (ORD)",
      dropoffLocation: "Milwaukee Airport (MKE)",
      returnType: "different",
      durationHours: 56,
    });
  });

  it("rejects unsafe, inconsistent, expired, or unsupported planning details", () => {
    const result = parseCarRentalSearch({
      pickupLocation: "<script>",
      returnType: "different",
      dropoffLocation: "<script>",
      pickupDate: "2026-08-18",
      pickupTime: "25:00",
      dropoffDate: "2026-10-30",
      dropoffTime: "09:00",
      driverAge: "unknown",
      vehicleClass: "spaceship",
    }, now);
    expect(result.query).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      "Enter a pickup city, airport, or rental location.",
      "Enter a valid return city, airport, or rental location.",
      "Pickup date cannot be in the past.",
      "Choose a valid pickup time.",
      "Choose a supported driver age range.",
      "Choose a supported vehicle class.",
    ]));
  });

  it("rejects zero-length, backward, and over-thirty-day rentals", () => {
    const base = {
      pickupLocation: "MIA",
      returnType: "same",
      pickupDate: "2026-09-10",
      pickupTime: "10:00",
      driverAge: "25_plus",
      vehicleClass: "economy",
    };
    expect(parseCarRentalSearch({ ...base, dropoffDate: "2026-09-10", dropoffTime: "10:00" }, now).errors)
      .toContain("Return must be at least one hour after pickup.");
    expect(parseCarRentalSearch({ ...base, dropoffDate: "2026-10-11", dropoffTime: "10:01" }, now).errors)
      .toContain("This planning preview supports rentals up to 30 days.");
  });

  it("keeps the consumer surface supplier-offline and clearly disclosed", () => {
    const page = read("app/cars/page.tsx");
    const navigation = read("data/navigation.ts");
    const footer = read("components/layout/site-footer.tsx");
    const sitemap = read("app/sitemap.ts");
    expect(CAR_RENTAL_SUPPLIER_MODE).toBe("offline_planning");
    expect(page).toContain("No rental-company API request or payment is made");
    expect(page).toContain("Live vehicles and rates are unavailable");
    expect(page).not.toContain("fetch(");
    expect(navigation).toContain('{ href: "/cars", label: "Car rentals" }');
    expect(footer).toContain('["Car rentals", "/cars"]');
    expect(sitemap).toContain('"/cars"');
  });
});
