import { describe, expect, it } from "vitest";
import { hotels } from "../data/hotels";
import { searchSchema } from "../lib/validation";

describe("curated inventory", () => {
  it("contains only four- and five-star stays", () => {
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels.every((hotel) => hotel.stars === 4 || hotel.stars === 5)).toBe(true);
  });

  it("validates search input", () => {
    expect(searchSchema.safeParse({ destination: "Miami", checkIn: "2026-08-10", checkOut: "2026-08-13", guests: 2 }).success).toBe(true);
    expect(searchSchema.safeParse({ destination: "", checkIn: "", checkOut: "", guests: 0 }).success).toBe(false);
  });
});
